import type { DenseField, DenseSchema, EnumField, NumericDefinition, NumericPreset } from 'densing';
import { canonicalTemplateOrder } from './templates';

const str = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const key = (s: string) => (/^[A-Za-z_$][\w$]*$/.test(s) ? s : str(s));
const list = (xs: readonly string[]) => `[${xs.map(str).join(', ')}]`;
const lit = (v: unknown) => JSON.stringify(v);

const enumCall = (f: EnumField) =>
  `enumeration(${str(f.name)}, ${list(f.options)}${f.defaultValue !== f.options[0] ? `, ${str(f.defaultValue)}` : ''})`;

/** Template constant names, and which template is being declared (references to it or later ones are lazy) */
interface Ctx {
  names: string[];
  declaring: number;
}

const fieldCode = (f: DenseField, indent: string, ctx: Ctx): string => {
  const next = indent + '  ';
  const sub = (c: DenseField, i = indent) => fieldCode(c, i, ctx);
  switch (f.type) {
    case 'bool':
      return `bool(${str(f.name)}${f.defaultValue ? ', true' : ''})`;
    case 'int':
      return `int(${str(f.name)}, ${f.min}, ${f.max}${f.defaultValue !== f.min ? `, ${f.defaultValue}` : ''})`;
    case 'fixed':
      return `fixed(${str(f.name)}, ${f.min}, ${f.max}, ${f.precision}${f.defaultValue !== f.min ? `, ${f.defaultValue}` : ''})`;
    case 'enum':
      return enumCall(f);
    case 'enum_array':
      return `enumArray(${str(f.name)}, ${enumCall(f.enum)}, ${f.minLength}, ${f.maxLength}${
        f.defaultValue?.length ? `, ${list(f.defaultValue)}` : ''
      })`;
    case 'array':
      return `array(${str(f.name)}, ${f.minLength}, ${f.maxLength}, ${sub(f.items)})`;
    case 'optional':
      return `optional(${str(f.name)}, ${sub(f.field)}${
        f.defaultValue !== undefined && f.defaultValue !== null ? `, ${lit(f.defaultValue)}` : ''
      })`;
    case 'pointer':
      return `pointer(${str(f.name)}, ${str(f.targetName)})`;
    case 'reference_numeric':
      return `referenceNumeric(${str(f.name)}, ${str(f.ref)})`;
    case 'reference': {
      const target = ctx.names[f.ref];
      // a template that is not declared yet (itself, or a later one) is passed as a function
      return `reference(${str(f.name)}, ${f.ref < ctx.declaring ? target : `() => ${target}`})`;
    }
    case 'object':
      if (!f.fields.length) return `object(${str(f.name)})`;
      return `object(\n${next}${[str(f.name), ...f.fields.map((c) => sub(c, next))].join(`,\n${next}`)}\n${indent})`;
    case 'union': {
      const inner = next + '  ';
      const variants = Object.entries(f.variants)
        .map(([k, fs]) =>
          fs.length
            ? `${next}${key(k)}: [\n${inner}${fs.map((c) => sub(c, inner)).join(`,\n${inner}`)}\n${next}]`
            : `${next}${key(k)}: []`
        )
        .join(',\n');
      return `union(${str(f.name)}, ${enumCall(f.discriminator)}, {\n${variants}\n${indent}})`;
    }
  }
};

const builders = (schema: DenseSchema) => {
  const used = new Set<string>(schema.definitions?.length ? ['schemaWithDefinitions', 'definition'] : ['schema']);
  const names: Record<DenseField['type'], string> = {
    bool: 'bool',
    int: 'int',
    fixed: 'fixed',
    enum: 'enumeration',
    enum_array: 'enumArray',
    array: 'array',
    optional: 'optional',
    pointer: 'pointer',
    reference_numeric: 'referenceNumeric',
    reference: 'reference',
    object: 'object',
    union: 'union'
  };
  const visit = (f: DenseField) => {
    used.add(names[f.type]);
    if (f.type === 'enum_array' || f.type === 'union') used.add('enumeration');
    if (f.type === 'object') f.fields.forEach(visit);
    if (f.type === 'array') visit(f.items);
    if (f.type === 'optional') visit(f.field);
    if (f.type === 'union') Object.values(f.variants).flat().forEach(visit);
  };
  schema.fields.forEach(visit);
  if (schema.templates?.length) {
    used.add('template');
    schema.templates.forEach(visit);
  }
  return [...used].sort();
};

export const identifier = (name: string, suffix = '') => {
  const words = name.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const id = words.map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'My';
  return (/^\d/.test(id) ? `_${id}` : id) + suffix;
};

const presetCode = (p: NumericPreset) =>
  `{ min: ${p.min}, max: ${p.max}${p.precision !== undefined ? `, precision: ${p.precision}` : ''}${
    p.defaultValue !== undefined && p.defaultValue !== p.min ? `, defaultValue: ${p.defaultValue}` : ''
  } }`;

const definitionCode = (d: NumericDefinition) => {
  const names = Object.keys(d.presets);
  const presets = names.map((n) => `${key(n)}: ${presetCode(d.presets[n])}`).join(', ');
  const def = d.defaultPreset !== undefined && d.defaultPreset !== names[0] ? `, ${str(d.defaultPreset)}` : '';
  return `definition(${str(d.name)}, { ${presets} }${def})`;
};

const RESERVED = new Set(
  'schema schemaWithDefinitions template reference definition bool int fixed enumeration enumArray array optional pointer referenceNumeric object union Template break case catch class const continue debugger default delete do else enum export extends false finally for function if import in instanceof let new null return super switch this throw true try typeof var void while with yield await'.split(
    ' '
  )
);

/** A valid, unused identifier for each template name (`vec3`, `my shape` → `myShape`) */
const templateNames = (templates: DenseField[]) => {
  const taken = new Set<string>();
  return templates.map((t) => {
    const words = t.name.split(/[^A-Za-z0-9_$]+/).filter(Boolean);
    let id = words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1) : w)).join('') || 'shape';
    if (/^\d/.test(id)) id = `_${id}`;
    if (RESERVED.has(id)) id = `${id}Template`;
    let unique = id;
    for (let n = 2; taken.has(unique); n++) unique = `${id}${n}`;
    taken.add(unique);
    return unique;
  });
};

/** Does the field refer, lazily, to a template that is not declared before `declaring` + 1? */
const hasLazyRef = (f: DenseField, declaring: number): boolean => {
  switch (f.type) {
    case 'reference':
      return f.ref >= declaring;
    case 'object':
      return f.fields.some((c) => hasLazyRef(c, declaring));
    case 'array':
      return hasLazyRef(f.items, declaring);
    case 'optional':
      return hasLazyRef(f.field, declaring);
    case 'union':
      return Object.values(f.variants).some((fs) => fs.some((c) => hasLazyRef(c, declaring)));
    default:
      return false;
  }
};

/**
 * TypeScript source that builds `schema` with densing's builder functions. Templates are declared
 * first, in the order `schema()` numbers them, so the result is the same schema.
 */
export const schemaToCode = (input: DenseSchema, name: string): string => {
  const schema = canonicalTemplateOrder(input);
  const templates = schema.templates ?? [];
  const names = templateNames(templates);
  const lazy = templates.map((t, i) => hasLazyRef(t, i));
  const decls = templates.map(
    (t, i) =>
      `const ${names[i]}${lazy[i] ? ': Template' : ''} = template(${fieldCode(t, '', { names, declaring: i })});\n`
  );
  const fields = schema.fields.map((f) => fieldCode(f, '  ', { names, declaring: templates.length }));
  const defs = schema.definitions ?? [];
  const imports =
    `import { ${builders(schema).join(', ')} } from 'densing';\n` +
    (lazy.some(Boolean) ? `import type { Template } from 'densing';\n` : '');
  const head = `${imports}\n${decls.length ? `${decls.join('\n')}\n` : ''}export const ${identifier(name, 'Schema')} = `;
  if (!defs.length) return `${head}schema(\n  ${fields.join(',\n  ')}\n);\n`;
  const definitions = `[\n    ${defs.map(definitionCode).join(',\n    ')}\n  ]`;
  return `${head}schemaWithDefinitions(\n  ${[definitions, ...fields].join(',\n  ')}\n);\n`;
};
