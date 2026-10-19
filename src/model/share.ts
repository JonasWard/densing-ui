import { densing, densingSchema, undensing, undensingSchema, type DenseSchema } from 'densing';

/**
 * A link holds the document's name, the schema packed by `densingSchema` and the preview data
 * packed with that schema, all URL safe: `#n=<name>&s=<schema>&d=<data>`.
 */
// packing a large schema takes a while: do it once per schema, not on every preview edit
const packed = new WeakMap<DenseSchema, string>();
const packSchema = (schema: DenseSchema) => {
  let s = packed.get(schema);
  if (s === undefined) packed.set(schema, (s = densingSchema(schema)));
  return s;
};

export const encodeLink = (name: string, schema: DenseSchema, data: unknown): string => {
  const params = new URLSearchParams();
  params.set('n', name);
  params.set('s', packSchema(schema));
  params.set('d', densing(schema, data));
  return `#${params.toString()}`;
};

export type DecodedLink = { ok: true; name: string; schema: DenseSchema; data: unknown } | { ok: false; error: string };

/** `null` when the hash is not a link at all; an error when it is one that cannot be read */
export const decodeLink = (hash: string): DecodedLink | null => {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const s = params.get('s');
  if (!s) return null;
  try {
    const schema = undensingSchema(s);
    const d = params.get('d');
    const data = d === null ? undefined : undensing(schema, d);
    return { ok: true, name: params.get('n') || 'Shared schema', schema, data };
  } catch (e) {
    const path = (e as { path?: string }).path;
    return { ok: false, error: `${path ? `${path}: ` : ''}${e instanceof Error ? e.message : String(e)}` };
  }
};
