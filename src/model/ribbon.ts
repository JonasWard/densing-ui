import { calculateDenseFieldBitWidth, type DenseField, type DenseSchema } from 'densing';
import { activePresetName, definitionsOf, PRESETS_KEY, selectorBits } from './definitions';
import { bitsForStates, variantNames } from './ops';
import { pathKey, type NodePath } from './paths';
import { variantFields, variantObjectIndex } from './templates';

export type SegmentKind = 'value' | 'presence' | 'length' | 'tag' | 'packed' | 'preset';

export interface Segment {
  start: number;
  bits: number;
  kind: SegmentKind;
  /** schema node this segment belongs to (template bodies and union variants resolve to their templates) */
  nodeKey: string;
  node: NodePath;
  /** data path in densing's grammar: `colors[1].r`, `expr.left.type` */
  dataPath: string;
  label: string;
  /** the value as written, for tooltips */
  value: string;
  /**
   * other nodes these bits belong to: the reference fields and unions they were reached through, and
   * for shared numbers the definition they are encoded with (`definitions[0]`)
   */
  alsoKeys: string[];
}

/** Lay out the bits `densing(schema, data)` writes, in the same order as the encoder */
export const layoutBits = (schema: DenseSchema, data: unknown): Segment[] => {
  const out: Segment[] = [];
  let cursor = 0;
  const push = (seg: Omit<Segment, 'start' | 'nodeKey'>) => {
    if (seg.bits > 0) out.push({ ...seg, start: cursor, nodeKey: pathKey(seg.node) });
    cursor += seg.bits;
  };
  // header: the active preset of every definition, in definition order
  const presets = (data as Record<string, unknown>)?.[PRESETS_KEY] as Record<string, unknown> | undefined;
  const definitions = definitionsOf(schema);
  definitions.forEach((d, i) =>
    push({
      bits: selectorBits(d),
      kind: 'preset',
      node: ['definitions', i],
      dataPath: `${PRESETS_KEY}.${d.name}`,
      label: `${d.name} preset`,
      value: JSON.stringify(activePresetName(d, presets)),
      alsoKeys: []
    })
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visit = (field: DenseField, node: NodePath, value: any, dataPath: string, via: string[]) => {
    const emit = (
      bits: number,
      kind: SegmentKind,
      label: string,
      shown: string,
      path = dataPath,
      extra: string[] = []
    ) => push({ bits, kind, node, dataPath: path, label, value: shown, alsoKeys: [...via, ...extra] });
    switch (field.type) {
      case 'bool':
      case 'int':
      case 'fixed':
      case 'enum':
        emit(calculateDenseFieldBitWidth(field, value), 'value', field.name, JSON.stringify(value));
        break;
      case 'reference_numeric': {
        const i = definitions.findIndex((d) => d.name === field.ref);
        emit(
          calculateDenseFieldBitWidth(field, value, schema, presets),
          'value',
          field.name,
          JSON.stringify(value),
          dataPath,
          [pathKey(['definitions', i])]
        );
        break;
      }
      case 'optional': {
        const present = value !== null && value !== undefined;
        emit(1, 'presence', `${field.name}?`, present ? 'present' : 'absent');
        if (present) visit(field.field, [...node, 'field'], value, dataPath, via);
        break;
      }
      case 'array': {
        const items: unknown[] = Array.isArray(value) ? value : [];
        emit(
          bitsForStates(field.maxLength - field.minLength + 1),
          'length',
          `${field.name}.length`,
          String(items.length)
        );
        items.forEach((item, i) => visit(field.items, [...node, 'items'], item, `${dataPath}[${i}]`, via));
        break;
      }
      case 'enum_array': {
        const items: string[] = Array.isArray(value) ? value : [];
        const lengthBits = bitsForStates(field.maxLength - field.minLength + 1);
        emit(lengthBits, 'length', `${field.name}.length`, String(items.length));
        emit(calculateDenseFieldBitWidth(field, items) - lengthBits, 'packed', field.name, items.join(','));
        break;
      }
      case 'object':
        field.fields.forEach((f, i) => visit(f, [...node, 'fields', i], value?.[f.name], `${dataPath}.${f.name}`, via));
        break;
      case 'union': {
        const tag = value?.[field.discriminator];
        emit(
          bitsForStates(variantNames(field).length),
          'tag',
          `${field.name}.${field.discriminator}`,
          JSON.stringify(tag),
          `${dataPath}.${field.discriminator}`
        );
        if (typeof tag !== 'string' || !(tag in field.variants)) break;
        // the variant's fields are drawn under its template, reached through this union
        const t = variantObjectIndex(schema, field, tag);
        variantFields(schema, field, tag).forEach((f, i) =>
          visit(f, ['templates', t, 'fields', i], value?.[f.name], `${dataPath}.${f.name}`, [...via, pathKey(node)])
        );
        break;
      }
      case 'reference': {
        const target = schema.templates?.[field.ref];
        if (target) visit(target, ['templates', field.ref], value, dataPath, [...via, pathKey(node)]);
        break;
      }
    }
  };

  schema.fields.forEach((f, i) => visit(f, ['fields', i], (data as Record<string, unknown>)?.[f.name], f.name, []));
  return out;
};
