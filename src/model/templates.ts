import { pointersToTemplates, type DenseField, type DenseSchema } from 'densing';
import { fieldTemplate, removeField, uniqueName } from './ops';
import { getAt, isPrefix, isTemplateRoot, listNodes, setAt, type NodePath } from './paths';

export const templatesOf = (schema: DenseSchema): DenseField[] => schema.templates ?? [];

const withTemplates = (schema: DenseSchema, templates: DenseField[]): DenseSchema => {
  const next: DenseSchema = { ...schema, templates };
  if (!templates.length) delete next.templates;
  return next;
};

/** Paths of the `reference` fields (in the fields and in templates) that use template `i` */
export const templateUses = (schema: DenseSchema, i: number): NodePath[] =>
  listNodes(schema, { templates: true })
    .filter(({ field }) => field.type === 'reference' && field.ref === i)
    .map((n) => n.path);

/** Rewrite every `reference` field's `ref`, in the fields and in the templates */
const remapRefs = (schema: DenseSchema, map: (ref: number) => number): DenseSchema => {
  const visit = (f: DenseField): DenseField => {
    switch (f.type) {
      case 'reference': {
        const ref = map(f.ref);
        return ref === f.ref ? f : { ...f, ref };
      }
      case 'object':
        return { ...f, fields: f.fields.map(visit) };
      case 'array':
        return { ...f, items: visit(f.items) };
      case 'optional':
        return { ...f, field: visit(f.field) };
      case 'union':
        return {
          ...f,
          variants: Object.fromEntries(Object.entries(f.variants).map(([k, fs]) => [k, fs.map(visit)]))
        };
      default:
        return f;
    }
  };
  const next: DenseSchema = { ...schema, fields: schema.fields.map(visit) };
  if (schema.templates) next.templates = schema.templates.map(visit);
  return next;
};

const templateNames = (schema: DenseSchema) => new Set(templatesOf(schema).map((t) => t.name));

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

/** Remove template `i`; later templates move up and every ref follows. Refs to it become -1 (an error). */
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
  const visit = (f: DenseField) => {
    switch (f.type) {
      case 'reference':
        if (templates[f.ref] && !order.includes(f.ref)) {
          order.push(f.ref);
          visit(templates[f.ref]);
        }
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
      case 'union':
        Object.values(f.variants).forEach((fs) => fs.forEach(visit));
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

export const countPointers = (schema: DenseSchema) =>
  listNodes(schema, { templates: true }).filter(({ field }) => field.type === 'pointer').length;

/** densing's own migration: pointer targets become templates, data and payloads stay the same */
export const convertPointers = (schema: DenseSchema): DenseSchema => pointersToTemplates(schema);
