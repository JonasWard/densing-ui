import type { DenseSchema } from 'densing';

/** Accepts `{ fields, definitions? }`, `{ name, fields, ... }` (the old builder's export) or a bare field list */
export const parseImport = (text: string, fallbackName: string): { name: string; schema: DenseSchema } => {
  const json = JSON.parse(text);
  const fields = Array.isArray(json) ? json : json?.fields;
  if (!Array.isArray(fields)) throw new Error('expected a schema: an object with a "fields" array');
  const schema: DenseSchema = Array.isArray(json?.definitions) ? { definitions: json.definitions, fields } : { fields };
  return { name: typeof json?.name === 'string' ? json.name : fallbackName, schema };
};
