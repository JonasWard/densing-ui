import {
  getDefaultData,
  getDenseFieldBitWidthRange,
  validateField,
  type DenseField,
  type DenseSchema,
  type ValidationError
} from 'densing';
import { activePresetName, definitionsOf, findDefinition, PRESETS_KEY, presetAsField } from './definitions';
import type { NodePath } from './paths';

/* eslint-disable @typescript-eslint/no-explicit-any */

type Resolver = (name: string) => DenseField | undefined;

const resolver =
  (schema: DenseSchema, byName: Map<string, NodePath>): Resolver =>
  (name) => {
    const p = byName.get(name);
    return p ? (p.reduce((n: any, s) => n[s], schema) as DenseField) : undefined;
  };

/** Default value for one field (densing's `getDefaultData` only does whole schemas) */
export const defaultFor = (
  field: DenseField,
  schema: DenseSchema,
  byName: Map<string, NodePath>,
  presets?: unknown
): any => {
  const resolve = resolver(schema, byName);
  const smallest = (f: Extract<DenseField, { type: 'union' }>) => {
    const min = (key: string) => f.variants[key].reduce((s, v) => s + getDenseFieldBitWidthRange(v, schema).min, 0);
    return f.discriminator.options.reduce((best, k) => (min(k) < min(best) ? k : best), f.discriminator.defaultValue);
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
        const tag = minimal ? smallest(f) : f.discriminator.defaultValue;
        return Object.fromEntries([
          [f.discriminator.name, tag],
          ...f.variants[tag].map((c) => [c.name, visit(c, inner, minimal)])
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
      case 'pointer': {
        const target = resolve(f.targetName);
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
export const reconcile = (schema: DenseSchema, data: any, byName: Map<string, NodePath>): any => {
  if (!isObj(data)) return getDefaultData(schema);
  const resolve = resolver(schema, byName);
  // the active presets come first: every reference_numeric value is checked against them
  const definitions = definitionsOf(schema);
  const presets = definitions.length
    ? Object.fromEntries(definitions.map((d) => [d.name, activePresetName(d, data[PRESETS_KEY])]))
    : undefined;
  const fresh = (f: DenseField) => defaultFor(f, schema, byName, presets);
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
        const tag = isObj(v) ? v[f.discriminator.name] : undefined;
        if (!f.discriminator.options.includes(tag)) return fresh(f);
        return Object.fromEntries([
          [f.discriminator.name, tag],
          ...f.variants[tag].map((c) => [c.name, c.name in v ? visit(c, v[c.name], depth + 1) : fresh(c)])
        ]);
      }
      case 'reference': {
        const target = schema.templates?.[f.ref];
        return target ? visit(target, v, depth + 1) : null;
      }
      case 'pointer': {
        const target = resolve(f.targetName);
        return target ? visit(target, v, depth + 1) : null;
      }
    }
  };
  const fields = schema.fields.map((f) => [f.name, f.name in data ? visit(f, data[f.name], 0) : fresh(f)]);
  return Object.fromEntries(presets ? [[PRESETS_KEY, presets], ...fields] : fields);
};
