import { pointersToTemplates, schemaFromJson, type DenseSchema } from 'densing';
import { uniqueName } from './ops';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Schemas saved by densing 0.4 (in local storage, files, examples): pointers and unions with an enum
 * discriminator plus the fields of each variant. densing 0.5 has neither, so they are converted when
 * loaded. The data and the encoded strings stay the same.
 */

const walk = (field: any, visit: (f: any) => any): any => {
  const f = visit(field);
  switch (f?.type) {
    case 'object':
      return { ...f, fields: (f.fields ?? []).map((c: any) => walk(c, visit)) };
    case 'array':
      return { ...f, items: walk(f.items, visit) };
    case 'optional':
      return { ...f, field: walk(f.field, visit) };
    case 'union':
      return isOldUnion(f)
        ? {
            ...f,
            variants: Object.fromEntries(
              Object.entries(f.variants ?? {}).map(([k, fs]) => [
                k,
                Array.isArray(fs) ? fs.map((c) => walk(c, visit)) : fs
              ])
            )
          }
        : f;
    default:
      return f;
  }
};

const isOldUnion = (f: any) => f?.type === 'union' && typeof f.discriminator === 'object' && f.discriminator !== null;

const someField = (json: any, test: (f: any) => boolean): boolean => {
  let found = false;
  const visit = (f: any) => {
    if (test(f)) found = true;
    return f;
  };
  [...(json.fields ?? []), ...(json.templates ?? [])].forEach((f: any) => walk(f, visit));
  return found;
};

/** Every pointer becomes a reference, through densing; one that cannot be resolved points nowhere (-1) */
const withoutPointers = (json: any): any => {
  if (!someField(json, (f) => f?.type === 'pointer')) return json;
  try {
    return pointersToTemplates(json);
  } catch {
    const visit = (f: any) => (f?.type === 'pointer' ? { type: 'reference', name: f.name, ref: -1 } : f);
    return {
      ...json,
      fields: json.fields.map((f: any) => walk(f, visit)),
      templates: json.templates?.map((t: any) => walk(t, visit))
    };
  }
};

/** 0.4 unions to 0.5 by hand: one object template per variant, so that invalid schemas convert too */
export const convertUnions = (json: any): any => {
  const templates: any[] = [...(json.templates ?? [])];
  const names = new Set<string>(templates.map((t) => t?.name));
  const visit = (f: any): any => {
    if (!isOldUnion(f)) return f;
    const disc = f.discriminator;
    const keys: string[] = Array.isArray(disc.options) ? disc.options : Object.keys(f.variants ?? {});
    const variants: Record<string, number> = {};
    for (const key of keys) {
      const name = uniqueName(names, key);
      names.add(name);
      const fields = Array.isArray(f.variants?.[key]) ? f.variants[key] : [];
      variants[key] = templates.length;
      templates.push({ type: 'object', name, fields: fields.map((c: any) => walk(c, visit)) });
    }
    const out: any = { type: 'union', name: f.name, discriminator: disc.name, variants };
    if (disc.defaultValue !== undefined && disc.defaultValue !== keys[0]) out.defaultVariant = disc.defaultValue;
    return out;
  };
  const fields = json.fields.map((f: any) => walk(f, visit));
  // templates added while converting are converted already; the original ones are not
  const original = (json.templates ?? []).length;
  for (let i = 0; i < original; i++) templates[i] = walk(templates[i], visit);
  return { ...json, fields, templates };
};

/** The schema in densing 0.5 form; schemas already in that form come back unchanged */
export const upgradeSchema = (input: DenseSchema): DenseSchema => {
  const json: any = input;
  if (!json || !Array.isArray(json.fields)) return input;
  const hasPointers = someField(json, (f) => f?.type === 'pointer');
  const hasOldUnions = someField(json, isOldUnion);
  if (!hasPointers && !hasOldUnions) return input;
  const noPointers = withoutPointers(json);
  if (!someField(noPointers, isOldUnion)) return noPointers;
  // a valid schema goes through densing, which also lets variants of the same shape share a template
  try {
    return JSON.parse(JSON.stringify(schemaFromJson(noPointers)));
  } catch {
    return convertUnions(noPointers);
  }
};
