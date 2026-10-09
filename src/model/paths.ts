import type { DenseField, DenseSchema } from 'densing';

/**
 * Address of a node inside the schema JSON, e.g. `['fields', 2, 'variants', 'add', 0]`.
 * Lists that hold fields: `fields` (root and object) and `variants.<key>` (union).
 * Single slots: `items` (array) and `field` (optional).
 */
export type NodePath = readonly (string | number)[];

/** Same format `schemaFromJson` uses in its errors: `fields[0].variants.add[1].items` */
export const pathKey = (path: NodePath): string =>
  path.reduce<string>((acc, seg) => (typeof seg === 'number' ? `${acc}[${seg}]` : acc ? `${acc}.${seg}` : seg), '');

export const samePath = (a: NodePath | null | undefined, b: NodePath | null | undefined) =>
  !!a && !!b && a.length === b.length && a.every((s, i) => s === b[i]);

export const isPrefix = (prefix: NodePath, path: NodePath) =>
  prefix.length <= path.length && prefix.every((s, i) => s === path[i]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getAt = (root: any, path: NodePath): any => path.reduce((node, seg) => node?.[seg], root);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setAt = <T>(root: T, path: NodePath, value: any): T => {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const node = root as any;
  if (Array.isArray(node)) {
    const copy = [...node];
    copy[head as number] = setAt(node[head as number], rest, value);
    return copy as T;
  }
  return { ...node, [head]: setAt(node?.[head], rest, value) };
};

export const getField = (schema: DenseSchema, path: NodePath): DenseField | undefined => getAt(schema, path);

/** A field path ends in an index into a list, or in a slot (`items` / `field`) */
export const parentListPath = (path: NodePath): { list: NodePath; index: number } | null => {
  const last = path[path.length - 1];
  return typeof last === 'number' ? { list: path.slice(0, -1), index: last } : null;
};

/** The field path that owns a list or slot path (`[...,'fields']` → `[...]`), `null` for the root list */
export const ownerOf = (path: NodePath): NodePath | null => {
  const p = typeof path[path.length - 1] === 'number' ? path.slice(0, -1) : path;
  if (p.length <= 1) return null;
  const last = p[p.length - 1];
  if (last === 'fields' || last === 'items' || last === 'field') return p.slice(0, -1);
  if (p[p.length - 2] === 'variants') return p.slice(0, -2);
  return null;
};

export interface NodeEntry {
  path: NodePath;
  field: DenseField;
  depth: number;
}

/**
 * Every field in display order (depth first). With `templates`, the template subtrees follow the
 * fields; without, only the fields (which is also what pointers can resolve to).
 */
export const listNodes = (schema: DenseSchema, opts: { templates?: boolean } = {}): NodeEntry[] => {
  const out: NodeEntry[] = [];
  const visit = (field: DenseField, path: NodePath, depth: number) => {
    out.push({ path, field, depth });
    for (const [childPath, child] of childEntries(field, path)) visit(child, childPath, depth + 1);
  };
  schema.fields.forEach((f, i) => visit(f, ['fields', i], 0));
  if (opts.templates) (schema.templates ?? []).forEach((t, i) => visit(t, ['templates', i], 0));
  return out;
};

/** `['templates', i]`: the root of a template */
export const isTemplateRoot = (path: NodePath) => path.length === 2 && path[0] === 'templates';

export const childEntries = (field: DenseField, path: NodePath): [NodePath, DenseField][] => {
  switch (field.type) {
    case 'object':
      return field.fields.map((f, i) => [[...path, 'fields', i], f]);
    case 'union':
      return Object.entries(field.variants).flatMap(([key, fields]) =>
        fields.map((f, i): [NodePath, DenseField] => [[...path, 'variants', key, i], f])
      );
    case 'array':
      return [[[...path, 'items'], field.items]];
    case 'optional':
      return [[[...path, 'field'], field.field]];
    default:
      return [];
  }
};
