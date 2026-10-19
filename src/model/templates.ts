import type { DenseField, DenseSchema, UnionField } from 'densing';
import { fieldTemplate, removeField, removeVariant, setVariantTemplate, uniqueName } from './ops';
import { getAt, isPrefix, isTemplateRoot, listNodes, setAt, type NodePath } from './paths';

export const templatesOf = (schema: DenseSchema): DenseField[] => schema.templates ?? [];

const withTemplates = (schema: DenseSchema, templates: DenseField[]): DenseSchema => {
  const next: DenseSchema = { ...schema, templates };
  if (!templates.length) delete next.templates;
  return next;
};

/**
 * What uses template `i`: the paths of `reference` fields, and of union variants
 * (`[...union, 'variants', key]`), in the fields and in templates
 */
export const templateUses = (schema: DenseSchema, i: number): NodePath[] =>
  listNodes(schema, { templates: true }).flatMap(({ field, path }): NodePath[] => {
    if (field.type === 'reference') return field.ref === i ? [path] : [];
    if (field.type === 'union')
      return Object.entries(field.variants)
        .filter(([, ref]) => ref === i)
        .map(([key]) => [...path, 'variants', key]);
    return [];
  });

/** How many things use each template, counted in one pass */
export const templateUseCounts = (schema: DenseSchema): Map<number, number> => {
  const counts = new Map<number, number>();
  const add = (ref: number) => counts.set(ref, (counts.get(ref) ?? 0) + 1);
  for (const { field } of listNodes(schema, { templates: true })) {
    if (field.type === 'reference') add(field.ref);
    if (field.type === 'union') Object.values(field.variants).forEach(add);
  }
  return counts;
};

/** The template of a union variant, `undefined` when the variant has none */
export const variantTemplate = (schema: DenseSchema, union: UnionField, key: string): DenseField | undefined =>
  templatesOf(schema)[union.variants[key]];

/**
 * The fields of a union variant: its template's fields, following templates that are references to other
 * templates. Empty when the variant's template is missing or not an object (an error `analyze` reports).
 */
export const variantFields = (schema: DenseSchema, union: UnionField, key: string): DenseField[] => {
  let t = variantTemplate(schema, union, key);
  for (let hops = 0; t?.type === 'reference' && hops < 64; hops++) t = templatesOf(schema)[t.ref];
  return t?.type === 'object' ? t.fields : [];
};

/** The template index whose fields `variantFields` returns: the variant's own, or the one it refers to */
export const variantObjectIndex = (schema: DenseSchema, union: UnionField, key: string): number => {
  let i = union.variants[key];
  for (let hops = 0; templatesOf(schema)[i]?.type === 'reference' && hops < 64; hops++)
    i = (templatesOf(schema)[i] as Extract<DenseField, { type: 'reference' }>).ref;
  return i;
};

/** Rewrite every `reference` field's `ref` and every union variant, in the fields and in the templates */
const remapRefs = (schema: DenseSchema, map: (ref: number) => number): DenseSchema => {
  const visit = (f: DenseField): DenseField => {
    switch (f.type) {
      case 'reference': {
        const ref = map(f.ref);
        return ref === f.ref ? f : { ...f, ref };
      }
      case 'union': {
        const variants = Object.fromEntries(Object.entries(f.variants).map(([k, ref]) => [k, map(ref)]));
        return Object.entries(variants).every(([k, ref]) => ref === f.variants[k]) ? f : { ...f, variants };
      }
      case 'object':
        return { ...f, fields: f.fields.map(visit) };
      case 'array':
        return { ...f, items: visit(f.items) };
      case 'optional':
        return { ...f, field: visit(f.field) };
      default:
        return f;
    }
  };
  const next: DenseSchema = { ...schema, fields: schema.fields.map(visit) };
  if (schema.templates) next.templates = schema.templates.map(visit);
  return next;
};

export const templateNames = (schema: DenseSchema) => new Set(templatesOf(schema).map((t) => t.name));

/** A new empty object template for a union variant, named after it (unique among templates) */
export const addVariantTemplate = (schema: DenseSchema, name: string) => {
  const shape: DenseField = { type: 'object', name: uniqueName(templateNames(schema), name), fields: [] };
  const index = templatesOf(schema).length;
  return { schema: withTemplates(schema, [...templatesOf(schema), shape]), index };
};

/** A new template (an object with one field), for when a reference needs something to point at */
export const addTemplate = (schema: DenseSchema) => {
  const name = uniqueName(templateNames(schema), 'shape');
  const shape: DenseField = { type: 'object', name, fields: [fieldTemplate('int', 'value')] };
  const index = templatesOf(schema).length;
  return {
    schema: withTemplates(schema, [...templatesOf(schema), shape]),
    path: ['templates', index] as NodePath,
    index
  };
};

/** A union whose variants have no template yet (-1) gets a new empty object template for each */
export const withVariantTemplates = (
  schema: DenseSchema,
  field: DenseField
): { schema: DenseSchema; field: DenseField } => {
  if (field.type !== 'union') return { schema, field };
  let next = schema;
  const variants: Record<string, number> = {};
  for (const [key, ref] of Object.entries(field.variants)) {
    if (ref >= 0) variants[key] = ref;
    else {
      const added = addVariantTemplate(next, key);
      next = added.schema;
      variants[key] = added.index;
    }
  }
  return { schema: next, field: { ...field, variants } };
};

/** Template `ref` goes when nothing uses it any more (densing rejects unused templates) */
const dropIfUnused = (schema: DenseSchema, ref: number): DenseSchema =>
  ref >= 0 && templatesOf(schema)[ref] && !templateUses(schema, ref).length ? removeTemplate(schema, ref) : schema;

/** Remove a variant; its template goes too when nothing else uses it */
export const removeVariantAt = (schema: DenseSchema, unionPath: NodePath, key: string): DenseSchema => {
  const field: DenseField = getAt(schema, unionPath);
  if (field?.type !== 'union') return schema;
  return dropIfUnused(setAt(schema, unionPath, removeVariant(field, key)), field.variants[key]);
};

/**
 * Point a variant at template `ref`, or at a new empty one (`'new'`, selected afterwards). The template it
 * used before goes when nothing else uses it.
 */
export const setVariantTemplateAt = (
  schema: DenseSchema,
  unionPath: NodePath,
  key: string,
  ref: number | 'new'
): { schema: DenseSchema; select?: NodePath } => {
  const field: DenseField = getAt(schema, unionPath);
  if (field?.type !== 'union' || !(key in field.variants)) return { schema };
  const old = field.variants[key];
  let next = schema;
  let target = ref;
  if (target === 'new') {
    const added = addVariantTemplate(next, key);
    next = added.schema;
    target = added.index;
  }
  if (target === old) return { schema };
  next = setAt(next, unionPath, setVariantTemplate(field, key, target));
  // removing the old template moves later ones up by one
  const cleaned = dropIfUnused(next, old);
  const index = cleaned === next || target < old ? target : target - 1;
  return { schema: cleaned, select: ref === 'new' ? ['templates', index] : undefined };
};

/**
 * The field becomes a template and is replaced by a reference to it under the same name, so the
 * data and the encoding stay the same. The template keeps the field's name (made unique among templates).
 */
export const makeTemplate = (schema: DenseSchema, path: NodePath) => {
  const field: DenseField = getAt(schema, path);
  if (!field || field.type === 'reference' || isTemplateRoot(path)) return null;
  const index = templatesOf(schema).length;
  const template = { ...field, name: uniqueName(templateNames(schema), field.name) };
  const next = withTemplates(schema, [...templatesOf(schema), template]);
  return {
    schema: setAt(next, path, { type: 'reference', name: field.name, ref: index }),
    templatePath: ['templates', index] as NodePath
  };
};

/**
 * Remove template `i`; later templates move up and every ref and variant follows. Refs and variants that
 * used it become -1 (an error).
 */
export const removeTemplate = (schema: DenseSchema, i: number): DenseSchema => {
  const remapped = remapRefs(schema, (ref) => (ref === i ? -1 : ref > i ? ref - 1 : ref));
  return withTemplates(
    remapped,
    templatesOf(remapped).filter((_, j) => j !== i)
  );
};

/** Delete the node at `path`: a template root through `removeTemplate`, anything else from its list */
export const deleteNode = (schema: DenseSchema, path: NodePath): DenseSchema =>
  isTemplateRoot(path) ? removeTemplate(schema, path[1] as number) : removeField(schema, path);

/**
 * Replace a reference with a copy of its template, under the reference's name. The template is
 * removed when nothing outside its own body refers to it any more.
 */
export const inlineReference = (schema: DenseSchema, path: NodePath): DenseSchema => {
  const field: DenseField = getAt(schema, path);
  if (field?.type !== 'reference') return schema;
  const template = templatesOf(schema)[field.ref];
  if (!template) return schema;
  const inlined = setAt(schema, path, { ...template, name: field.name });
  const own: NodePath = ['templates', field.ref];
  const stillUsed = templateUses(inlined, field.ref).some((p) => !isPrefix(own, p));
  return stillUsed ? inlined : removeTemplate(inlined, field.ref);
};

/**
 * Order templates the way `schema()` numbers them: by first use in a depth-first walk of the fields,
 * a template's own references right after it. Unused templates go last. Refs are remapped.
 */
export const canonicalTemplateOrder = (schema: DenseSchema): DenseSchema => {
  const templates = templatesOf(schema);
  if (!templates.length) return schema;
  const order: number[] = [];
  const follow = (ref: number) => {
    if (templates[ref] && !order.includes(ref)) {
      order.push(ref);
      visit(templates[ref]);
    }
  };
  const visit = (f: DenseField) => {
    switch (f.type) {
      case 'reference':
        follow(f.ref);
        break;
      case 'union':
        Object.values(f.variants).forEach(follow);
        break;
      case 'object':
        f.fields.forEach(visit);
        break;
      case 'array':
        visit(f.items);
        break;
      case 'optional':
        visit(f.field);
        break;
    }
  };
  schema.fields.forEach(visit);
  templates.forEach((_, i) => !order.includes(i) && order.push(i));
  if (order.every((old, i) => old === i)) return schema;
  const newIndex = new Map(order.map((old, i) => [old, i]));
  const remapped = remapRefs(schema, (ref) => newIndex.get(ref) ?? ref);
  return { ...remapped, templates: order.map((old) => remapped.templates![old]) };
};
