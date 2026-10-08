import type { DenseField, DenseSchema, EnumField, NumericDefinition, NumericPreset } from 'densing';

const str = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const key = (s: string) => (/^[A-Za-z_$][\w$]*$/.test(s) ? s : str(s));
const list = (xs: readonly string[]) => `[${xs.map(str).join(', ')}]`;
const lit = (v: unknown) => JSON.stringify(v);

const enumCall = (f: EnumField) =>
  `enumeration(${str(f.name)}, ${list(f.options)}${f.defaultValue !== f.options[0] ? `, ${str(f.defaultValue)}` : ''})`;

const fieldCode = (f: DenseField, indent: string): string => {
  const next = indent + '  ';
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
      return `array(${str(f.name)}, ${f.minLength}, ${f.maxLength}, ${fieldCode(f.items, indent)})`;
    case 'optional':
      return `optional(${str(f.name)}, ${fieldCode(f.field, indent)}${
        f.defaultValue !== undefined && f.defaultValue !== null ? `, ${lit(f.defaultValue)}` : ''
      })`;
    case 'pointer':
      return `pointer(${str(f.name)}, ${str(f.targetName)})`;
    case 'reference_numeric':
      return `referenceNumeric(${str(f.name)}, ${str(f.ref)})`;
    case 'object':
      if (!f.fields.length) return `object(${str(f.name)})`;
      return `object(\n${next}${[str(f.name), ...f.fields.map((c) => fieldCode(c, next))].join(`,\n${next}`)}\n${indent})`;
    case 'union': {
      const inner = next + '  ';
      const variants = Object.entries(f.variants)
        .map(([k, fs]) =>
          fs.length
            ? `${next}${key(k)}: [\n${inner}${fs.map((c) => fieldCode(c, inner)).join(`,\n${inner}`)}\n${next}]`
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

/** TypeScript source that builds `schema` with densing's builder functions */
export const schemaToCode = (schema: DenseSchema, name: string): string => {
  const fields = schema.fields.map((f) => fieldCode(f, '  '));
  const defs = schema.definitions ?? [];
  const head = `import { ${builders(schema).join(', ')} } from 'densing';\n\nexport const ${identifier(name, 'Schema')} = `;
  if (!defs.length) return `${head}schema(\n  ${fields.join(',\n  ')}\n);\n`;
  const definitions = `[\n    ${defs.map(definitionCode).join(',\n    ')}\n  ]`;
  return `${head}schemaWithDefinitions(\n  ${[definitions, ...fields].join(',\n  ')}\n);\n`;
};
