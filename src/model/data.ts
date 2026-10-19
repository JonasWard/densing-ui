import {
  getDefaultData,
  getDenseFieldBitWidthRange,
  validateField,
  type DenseField,
  type DenseSchema,
  type ValidationError
} from 'densing';
import { activePresetName, definitionsOf, findDefinition, PRESETS_KEY, presetAsField } from './definitions';
import { defaultVariantOf, variantNames } from './ops';
import { variantFields, variantTemplate } from './templates';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Default value for one field (densing's `getDefaultData` only does whole schemas) */
export const defaultFor = (field: DenseField, schema: DenseSchema, presets?: unknown): any => {
  const smallest = (f: Extract<DenseField, { type: 'union' }>) => {
    const min = (key: string) => {
      const t = variantTemplate(schema, f, key);
      try {
        return t ? getDenseFieldBitWidthRange(t, schema).min : Infinity;
      } catch {
        return Infinity;
      }
    };
    return variantNames(f).reduce((best, k) => (min(k) < min(best) ? k : best), defaultVariantOf(f));
  };
  const visit = (f: DenseField, expanding: Set<DenseField>, minimal: boolean): any => {
    const inner = new Set(expanding).add(f);
    switch (f.type) {
      case 'bool':
      case 'int':
      case 'fixed':
      case 'enum':
      case 'enum_array':
        return f.defaultValue;
      case 'optional':
        return minimal || f.defaultValue === undefined ? null : f.defaultValue;
      case 'array':
        return Array.from({ length: f.minLength }, () => visit(f.items, inner, minimal));
      case 'object':
        return Object.fromEntries(f.fields.map((c) => [c.name, visit(c, inner, minimal)]));
      case 'union': {
        const tag = minimal ? smallest(f) : defaultVariantOf(f);
        // a variant that leads back to a template being expanded takes its smallest values, like a reference
        const t = variantTemplate(schema, f, tag);
        const min = minimal || (!!t && expanding.has(t));
        const withT = t ? new Set(inner).add(t) : inner;
        return Object.fromEntries([
          [f.discriminator, tag],
          ...variantFields(schema, f, tag).map((c) => [c.name, visit(c, withT, min)])
        ]);
      }
      case 'reference_numeric': {
        const d = findDefinition(schema, f.ref);
        return d ? presetAsField(d, activePresetName(d, presets)).defaultValue : null;
      }
      case 'reference': {
        const target = schema.templates?.[f.ref];
        return target ? visit(target, inner, minimal || expanding.has(target)) : null;
      }
    }
  };
  return visit(field, new Set(), false);
};

const isObj = (v: unknown): v is Record<string, any> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Fit existing preview data to an edited schema: keep every value that is still valid, replace the rest
 * with defaults. Keeps the preview stable while the schema changes under it.
 */
export const reconcile = (schema: DenseSchema, data: any): any => {
  if (!isObj(data)) return getDefaultData(schema);
  // the active presets come first: every reference_numeric value is checked against them
  const definitions = definitionsOf(schema);
  const presets = definitions.length
    ? Object.fromEntries(definitions.map((d) => [d.name, activePresetName(d, data[PRESETS_KEY])]))
    : undefined;
  const fresh = (f: DenseField) => defaultFor(f, schema, presets);
  const visit = (f: DenseField, v: any, depth: number): any => {
    if (depth > 64) return fresh(f);
    switch (f.type) {
      case 'bool':
      case 'int':
      case 'fixed':
      case 'enum': {
        const errors: ValidationError[] = [];
        validateField(f, v, f.name, errors);
        return errors.length ? f.defaultValue : v;
      }
      case 'reference_numeric': {
        const errors: ValidationError[] = [];
        validateField(f, v, f.name, errors, schema, presets);
        return errors.length ? fresh(f) : v;
      }
      case 'enum_array': {
        if (!Array.isArray(v)) return f.defaultValue;
        const kept = v.filter((x) => f.enum.options.includes(x)).slice(0, f.maxLength);
        while (kept.length < f.minLength) kept.push(f.enum.defaultValue);
        return kept;
      }
      case 'optional':
        return v === null || v === undefined ? null : visit(f.field, v, depth + 1);
      case 'array': {
        if (!Array.isArray(v)) return fresh(f);
        const kept = v.slice(0, f.maxLength).map((x) => visit(f.items, x, depth + 1));
        while (kept.length < f.minLength) kept.push(fresh(f.items));
        return kept;
      }
      case 'object': {
        const o = isObj(v) ? v : {};
        return Object.fromEntries(
          f.fields.map((c) => [c.name, c.name in o ? visit(c, o[c.name], depth + 1) : fresh(c)])
        );
      }
      case 'union': {
        const tag = isObj(v) ? v[f.discriminator] : undefined;
        if (typeof tag !== 'string' || !(tag in f.variants)) return fresh(f);
        return Object.fromEntries([
          [f.discriminator, tag],
          ...variantFields(schema, f, tag).map((c) => [c.name, c.name in v ? visit(c, v[c.name], depth + 1) : fresh(c)])
        ]);
      }
      case 'reference': {
        const target = schema.templates?.[f.ref];
        return target ? visit(target, v, depth + 1) : null;
      }
    }
  };
  const fields = schema.fields.map((f) => [f.name, f.name in data ? visit(f, data[f.name], 0) : fresh(f)]);
  return Object.fromEntries(presets ? [[PRESETS_KEY, presets], ...fields] : fields);
};

/**
 * Data paths of every nested value (object, array, array item, union, optional, and references to one of
 * those) in the data, in the grammar the form and the ribbon use.
 */
export const compoundPaths = (schema: DenseSchema, data: any): string[] => {
  const out: string[] = [];
  const visit = (f: DenseField, v: any, path: string, depth: number) => {
    if (depth > 64) return;
    const shape = f.type === 'reference' ? schema.templates?.[f.ref] : f;
    if (!shape) return;
    switch (shape.type) {
      case 'object':
        out.push(path);
        shape.fields.forEach((c) => visit(c, v?.[c.name], `${path}.${c.name}`, depth + 1));
        break;
      case 'array':
        out.push(path);
        (Array.isArray(v) ? v : []).forEach((x, i) => visit(shape.items, x, `${path}[${i}]`, depth + 1));
        break;
      case 'union': {
        out.push(path);
        const tag = v?.[shape.discriminator];
        if (typeof tag === 'string' && tag in shape.variants)
          variantFields(schema, shape, tag).forEach((c) => visit(c, v?.[c.name], `${path}.${c.name}`, depth + 1));
        break;
      }
      case 'optional':
        out.push(path);
        if (v !== null && v !== undefined) visit(shape.field, v, path, depth + 1);
        break;
    }
  };
  const root = isObj(data) ? data : {};
  schema.fields.forEach((f) => visit(f, root[f.name], f.name, 0));
  return [...new Set(out)];
};
