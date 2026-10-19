import {
  analyzeDenseSchemaSize,
  getDenseFieldBitWidthRange,
  schemaFromJson,
  validateSchema,
  type DenseField,
  type DenseSchema
} from 'densing';
import { definitionsOf, headerBits, selectorBits } from './definitions';
import { childEntries, listNodes, pathKey, type NodePath } from './paths';

export interface BitRange {
  min: number;
  max: number;
}

export interface Analysis {
  /** The normalized schema, `null` while any error remains */
  schema: DenseSchema | null;
  /** errors by node path key (`fields[0].items`) */
  errors: Map<string, string[]>;
  /** errors not tied to one node */
  rootErrors: string[];
  /** bit range per node path key; missing when it could not be computed */
  ranges: Map<string, BitRange>;
  total: BitRange | null;
  /** bits the payload header spends on choosing presets (0 without definitions) */
  header: number;
}

const placeholder = (name: string): DenseField => ({ type: 'bool', name, defaultValue: false });

/**
 * The field with its children replaced by placeholders, so only this node's own rules are checked. A union's
 * variants point at placeholder templates: whether its own templates fit is checked against the whole schema.
 */
const shallow = (field: DenseField): DenseSchema => {
  if (field.type === 'union') {
    const keys = Object.keys(field.variants ?? {});
    return {
      templates: keys.map((_, i) => ({ type: 'object', name: `__v${i}`, fields: [] })),
      fields: [{ ...field, variants: Object.fromEntries(keys.map((k, i) => [k, i])) }]
    };
  }
  return { fields: [shallowField(field)] };
};

const shallowField = (field: DenseField): DenseField => {
  switch (field.type) {
    case 'object':
      return { ...field, fields: field.fields.map((_, i) => placeholder(`__c${i}`)) };
    case 'array':
      return { ...field, items: placeholder('__item') };
    case 'optional':
      // the optional's default is checked against its inner field, keep that check out of the shallow pass
      return { ...field, field: placeholder('__inner'), defaultValue: undefined };
    case 'reference_numeric':
    case 'reference':
      // their targets are checked against the whole schema in step 3
      return placeholder(field.name);
    default:
      return field;
  }
};

const stripPrefix = (message: string) =>
  message.replace(/^Invalid schema at [^:]+: /, '').replace(/^Invalid schema: /, '');

/** densing's own name paths (as used by `validateSchema`) → node path keys */
const namePaths = (schema: DenseSchema): Map<string, string[]> => {
  const out = new Map<string, string[]>();
  const add = (name: string, key: string) => out.set(name, [...(out.get(name) ?? []), key]);
  const visit = (field: DenseField, path: NodePath, prefix: string) => {
    const namePath = prefix ? `${prefix}.${field.name}` : field.name;
    add(namePath, pathKey(path));
    const inner = field.type === 'array' ? `${namePath}[]` : namePath;
    for (const [childPath, child] of childEntries(field, path)) visit(child, childPath, inner);
  };
  schema.fields.forEach((f, i) => visit(f, ['fields', i], ''));
  // densing reports template errors as `templates[i]` and `templates[i].<child>`: the template's own
  // name is not part of the path
  (schema.templates ?? []).forEach((t, i) => {
    const root = pathKey(['templates', i]);
    add(root, root);
    const inner = t.type === 'array' ? `${root}[]` : root;
    for (const [childPath, child] of childEntries(t, ['templates', i])) visit(child, childPath, inner);
  });
  return out;
};

const listsOf = (schema: DenseSchema): [NodePath, DenseField[]][] => {
  const lists: [NodePath, DenseField[]][] = [[['fields'], schema.fields]];
  for (const { path, field } of listNodes(schema, { templates: true })) {
    if (field.type === 'object') lists.push([[...path, 'fields'], field.fields]);
  }
  return lists;
};

export const analyze = (schema: DenseSchema): Analysis => {
  const errors = new Map<string, string[]>();
  const rootErrors: string[] = [];
  const push = (key: string, message: string) => errors.set(key, [...(errors.get(key) ?? []), message]);

  const nodes = listNodes(schema, { templates: true });
  const isTemplate = (ref: unknown) =>
    typeof ref === 'number' && Number.isInteger(ref) && ref >= 0 && ref < (schema.templates?.length ?? 0);

  // 1. every node on its own
  for (const { path, field } of nodes) {
    try {
      schemaFromJson(shallow(field));
    } catch (e) {
      push(pathKey(path), stripPrefix(e instanceof Error ? e.message : String(e)));
    }
    if (field.type === 'reference_numeric' && !field.ref) push(pathKey(path), 'choose a definition');
    if (field.type === 'reference' && !isTemplate(field.ref)) push(pathKey(path), 'choose a template');
    if (field.type === 'union')
      for (const [key, ref] of Object.entries(field.variants ?? {}))
        if (!isTemplate(ref)) push(pathKey(path), `choose a template for variant "${key}"`);
  }
  // 1b. every numeric definition on its own
  definitionsOf(schema).forEach((d, i) => {
    try {
      schemaFromJson({ definitions: [d], fields: [placeholder('__x')] });
    } catch (e) {
      push(pathKey(['definitions', i]), stripPrefix(e instanceof Error ? e.message : String(e)));
    }
  });
  // 2. duplicate names within one list
  for (const [list, fields] of listsOf(schema)) {
    const seen = new Set<string>();
    fields.forEach((f, i) => {
      if (seen.has(f.name)) push(pathKey([...list, i]), `duplicate field name "${f.name}"`);
      seen.add(f.name);
    });
  }
  if (schema.fields.length === 0) rootErrors.push('add at least one field');

  // 3. whole-schema rules (templates, unions), only meaningful once the structure is sound
  let valid: DenseSchema | null = null;
  if (errors.size === 0 && rootErrors.length === 0) {
    const names = namePaths(schema);
    for (const { path, message } of validateSchema(schema).errors) {
      if (/^(definitions|templates)\[\d+\]$/.test(path)) {
        push(path, message);
        continue;
      }
      const keys = names.get(path);
      if (keys?.length) keys.forEach((k) => push(k, message));
      else rootErrors.push(`${path}: ${message}`);
    }
    if (errors.size === 0 && rootErrors.length === 0) {
      try {
        valid = schemaFromJson(schema);
      } catch (e) {
        rootErrors.push(stripPrefix(e instanceof Error ? e.message : String(e)));
      }
    }
  }

  // 4. bit ranges, best effort
  const ranges = new Map<string, BitRange>();
  const rangeSchema = valid ?? schema;
  for (const { path, field } of nodes) {
    if (errors.has(pathKey(path))) continue;
    try {
      const r = getDenseFieldBitWidthRange(field, rangeSchema);
      if (!Number.isNaN(r.min)) ranges.set(pathKey(path), r);
    } catch {
      // unresolved template or malformed field
    }
  }
  definitionsOf(schema).forEach((d, i) => {
    const key = pathKey(['definitions', i]);
    if (!errors.has(key)) ranges.set(key, { min: selectorBits(d), max: selectorBits(d) });
  });
  let total: BitRange | null = null;
  if (valid) {
    const { minBits, maxBits } = analyzeDenseSchemaSize(valid).staticRange;
    total = { min: minBits, max: maxBits };
  }

  return {
    schema: valid,
    errors,
    rootErrors,
    ranges,
    total,
    header: valid ? headerBits(valid) : 0
  };
};

/** Characters needed for `bits` bits in a base with `base` symbols (same rule as densing) */
export const charsForBits = (bits: number, base: number): number => {
  if (bits <= 0) return 0;
  if (!Number.isFinite(bits)) return Infinity;
  const k = Math.log2(base);
  if (Number.isInteger(k)) return Math.ceil(bits / k);
  const b = BigInt(base);
  const target = 1n << BigInt(bits);
  let chars = Math.max(1, Math.floor(bits / Math.log2(base)));
  let capacity = b ** BigInt(chars);
  while (capacity < target) {
    capacity *= b;
    chars++;
  }
  return chars;
};

export const formatBits = (r: BitRange | undefined | null): string => {
  if (!r) return '?';
  const f = (n: number) => (n === Infinity ? '∞' : String(n));
  return r.min === r.max ? f(r.min) : `${f(r.min)}–${f(r.max)}`;
};
