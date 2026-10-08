import type { DenseField, DenseSchema, EnumField, UnionField } from 'densing';
import { getAt, isPrefix, listNodes, parentListPath, setAt, type NodePath } from './paths';

export type FieldType = DenseField['type'];

export const FIELD_TYPES: { type: FieldType; label: string; hint: string }[] = [
  { type: 'bool', label: 'Boolean', hint: '1 bit' },
  { type: 'int', label: 'Integer', hint: 'min..max' },
  { type: 'fixed', label: 'Fixed point', hint: 'min..max by precision' },
  { type: 'enum', label: 'Enum', hint: 'one of N options' },
  { type: 'object', label: 'Object', hint: 'group of fields' },
  { type: 'array', label: 'Array', hint: 'list of one field type' },
  { type: 'enum_array', label: 'Enum array', hint: 'packed list of options' },
  { type: 'optional', label: 'Optional', hint: 'presence bit + field' },
  { type: 'union', label: 'Union', hint: 'tagged variants' },
  { type: 'pointer', label: 'Pointer', hint: 'refers to a field, for recursion' },
  { type: 'reference_numeric', label: 'Shared number', hint: 'range from a definition' }
];

export const allNames = (schema: DenseSchema): Set<string> => new Set(listNodes(schema).map((n) => n.field.name));

export const uniqueName = (taken: Set<string>, base: string): string => {
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}${i}`)) i++;
  return `${base}${i}`;
};

const enumTemplate = (name: string, options: string[]): EnumField => ({
  type: 'enum',
  name,
  options,
  defaultValue: options[0]
});

export const fieldTemplate = (type: FieldType, name: string, taken: Set<string> = new Set([name])): DenseField => {
  const child = (base: string) => {
    const n = uniqueName(taken, base);
    taken.add(n);
    return n;
  };
  switch (type) {
    case 'bool':
      return { type, name, defaultValue: false };
    case 'int':
      return { type, name, min: 0, max: 255, defaultValue: 0 };
    case 'fixed':
      return { type, name, min: 0, max: 100, precision: 0.1, defaultValue: 0 };
    case 'enum':
      return enumTemplate(name, ['a', 'b', 'c']);
    case 'object':
      return { type, name, fields: [] };
    case 'array':
      return { type, name, minLength: 0, maxLength: 8, items: fieldTemplate('int', child('item'), taken) };
    case 'enum_array':
      return { type, name, minLength: 0, maxLength: 8, enum: enumTemplate('value', ['a', 'b', 'c']), defaultValue: [] };
    case 'optional':
      return { type, name, field: fieldTemplate('int', child(`${name}Value`), taken) };
    case 'union':
      return { type, name, discriminator: enumTemplate('type', ['a', 'b']), variants: { a: [], b: [] } };
    case 'pointer':
      return { type, name, targetName: '' };
    case 'reference_numeric':
      return { type, name, ref: '' };
  }
};

/** Change a field's type, keeping whatever carries over (name, ranges, options) */
export const changeType = (field: DenseField, type: FieldType, schema: DenseSchema): DenseField => {
  if (field.type === type) return field;
  const next = fieldTemplate(type, field.name, allNames(schema));
  if (next.type === 'reference_numeric') return { ...next, ref: schema.definitions?.[0]?.name ?? '' };
  if ((field.type === 'int' || field.type === 'fixed') && (next.type === 'int' || next.type === 'fixed')) {
    const min = next.type === 'int' ? Math.ceil(field.min) : field.min;
    const max = next.type === 'int' ? Math.floor(field.max) : field.max;
    return { ...next, min, max: Math.max(min, max), defaultValue: min };
  }
  const options = field.type === 'enum' ? field.options : field.type === 'enum_array' ? field.enum.options : null;
  if (options && next.type === 'enum') return enumTemplate(field.name, [...options]);
  if (options && next.type === 'enum_array') return { ...next, enum: enumTemplate('value', [...options]) };
  if (options && next.type === 'union')
    return {
      ...next,
      discriminator: enumTemplate('type', [...options]),
      variants: Object.fromEntries(options.map((o) => [o, []]))
    };
  return next;
};

export const updateField = (schema: DenseSchema, path: NodePath, field: DenseField): DenseSchema =>
  setAt(schema, path, field);

export const insertField = (schema: DenseSchema, list: NodePath, index: number, field: DenseField): DenseSchema => {
  const items: DenseField[] = getAt(schema, list) ?? [];
  return setAt(schema, list, [...items.slice(0, index), field, ...items.slice(index)]);
};

/** Only fields in a list can be removed: slots (array items, optional inner field) always hold one */
export const removeField = (schema: DenseSchema, path: NodePath): DenseSchema => {
  const parent = parentListPath(path);
  if (!parent) return schema;
  const items: DenseField[] = getAt(schema, parent.list);
  return setAt(
    schema,
    parent.list,
    items.filter((_, i) => i !== parent.index)
  );
};

export const canMove = (from: NodePath, toList: NodePath) => !!parentListPath(from) && !isPrefix(from, toList);

/**
 * Move the field at `from` into `toList` at `toIndex` (an index in the list as it is *before* the move).
 * Returns the moved field's new path, or `null` when the move is not possible.
 */
export const moveField = (
  schema: DenseSchema,
  from: NodePath,
  toList: NodePath,
  toIndex: number
): { schema: DenseSchema; path: NodePath } | null => {
  const src = parentListPath(from);
  if (!src || !canMove(from, toList)) return null;
  const field: DenseField = getAt(schema, from);
  const target = [...toList];
  let index = toIndex;
  // removing the source shifts later siblings (and the lists inside them) up by one
  if (isPrefix(src.list, target) && target.length > src.list.length) {
    const seg = target[src.list.length] as number;
    if (seg > src.index) target[src.list.length] = seg - 1;
  } else if (target.length === src.list.length && isPrefix(src.list, target) && index > src.index) {
    index -= 1;
  }
  const removed = removeField(schema, from);
  const items: DenseField[] = getAt(removed, target) ?? [];
  index = Math.max(0, Math.min(index, items.length));
  return { schema: insertField(removed, target, index, field), path: [...target, index] };
};

const renameDeep = (field: DenseField, taken: Set<string>): DenseField => {
  const name = uniqueName(taken, field.name);
  taken.add(name);
  switch (field.type) {
    case 'object':
      return { ...field, name, fields: field.fields.map((f) => renameDeep(f, taken)) };
    case 'array':
      return { ...field, name, items: renameDeep(field.items, taken) };
    case 'optional':
      return { ...field, name, field: renameDeep(field.field, taken) };
    case 'union':
      return {
        ...field,
        name,
        variants: Object.fromEntries(
          Object.entries(field.variants).map(([k, fs]) => [k, fs.map((f) => renameDeep(f, taken))])
        )
      };
    default:
      return { ...field, name };
  }
};

export const duplicateField = (schema: DenseSchema, path: NodePath): { schema: DenseSchema; path: NodePath } | null => {
  const parent = parentListPath(path);
  if (!parent) return null;
  const copy = renameDeep(getAt(schema, path), allNames(schema));
  return { schema: insertField(schema, parent.list, parent.index + 1, copy), path: [...parent.list, parent.index + 1] };
};

export type WrapKind = 'optional' | 'array' | 'object';

/** Wrap a field: the wrapper takes the field's name (so data keys stay put), the field gets a new one */
export const wrapField = (schema: DenseSchema, field: DenseField, kind: WrapKind): DenseField => {
  const taken = allNames(schema);
  const inner = { ...field, name: uniqueName(taken, kind === 'array' ? 'item' : `${field.name}Value`) };
  switch (kind) {
    case 'optional':
      return { type: 'optional', name: field.name, field: inner };
    case 'array':
      return { type: 'array', name: field.name, minLength: 0, maxLength: 8, items: inner };
    case 'object':
      return { type: 'object', name: field.name, fields: [inner] };
  }
};

export const canUnwrap = (field: DenseField) =>
  field.type === 'optional' || field.type === 'array' || (field.type === 'object' && field.fields.length === 1);

export const unwrapField = (field: DenseField): DenseField => {
  const inner =
    field.type === 'optional'
      ? field.field
      : field.type === 'array'
        ? field.items
        : field.type === 'object'
          ? field.fields[0]
          : null;
  return inner ? { ...inner, name: field.name } : field;
};

// --- union variants: discriminator options and variant keys stay in sync ---

const withOptions = (
  field: UnionField,
  options: string[],
  variants: Record<string, DenseField[]>,
  defaultValue: string
): UnionField => ({
  ...field,
  discriminator: {
    ...field.discriminator,
    options,
    defaultValue: options.includes(defaultValue) ? defaultValue : options[0]
  },
  variants
});

export const addVariant = (field: UnionField, key: string): UnionField =>
  withOptions(
    field,
    [...field.discriminator.options, key],
    { ...field.variants, [key]: [] },
    field.discriminator.defaultValue
  );

export const removeVariant = (field: UnionField, key: string): UnionField => {
  const variants = { ...field.variants };
  delete variants[key];
  return withOptions(
    field,
    field.discriminator.options.filter((o) => o !== key),
    variants,
    field.discriminator.defaultValue
  );
};

export const renameVariant = (field: UnionField, from: string, to: string): UnionField => {
  if (from === to || field.discriminator.options.includes(to)) return field;
  const options = field.discriminator.options.map((o) => (o === from ? to : o));
  const variants = Object.fromEntries(options.map((o) => [o, field.variants[o === to ? from : o] ?? []]));
  const def = field.discriminator.defaultValue === from ? to : field.discriminator.defaultValue;
  return withOptions(field, options, variants, def);
};

// --- numeric helpers shared by the inspector ---

export const bitsForStates = (states: number) => (states <= 1 ? 0 : (states - 1).toString(2).length);

export const fixedSteps = (min: number, max: number, precision: number) =>
  Math.round((max - min) * Math.round(1 / precision)) + 1;

/** Clamp `defaultValue` of numeric / enum fields into their current domain */
export const normalizeDefault = (field: DenseField): DenseField => {
  switch (field.type) {
    case 'int':
    case 'fixed': {
      const d = Number.isFinite(field.defaultValue) ? field.defaultValue : field.min;
      return { ...field, defaultValue: Math.min(Math.max(d, field.min), Math.max(field.min, field.max)) };
    }
    case 'enum':
      return field.options.includes(field.defaultValue) ? field : { ...field, defaultValue: field.options[0] };
    case 'enum_array': {
      const values = (field.defaultValue ?? []).filter((v) => field.enum.options.includes(v));
      return { ...field, defaultValue: values.slice(0, field.maxLength) };
    }
    default:
      return field;
  }
};
