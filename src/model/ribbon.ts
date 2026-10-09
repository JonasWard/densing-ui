import { calculateDenseFieldBitWidth, type DenseField, type DenseSchema } from 'densing';
import { activePresetName, definitionsOf, PRESETS_KEY, selectorBits } from './definitions';
import { bitsForStates } from './ops';
import { pathKey, type NodePath } from './paths';

export type SegmentKind = 'value' | 'presence' | 'length' | 'tag' | 'packed' | 'preset';

export interface Segment {
  start: number;
  bits: number;
  kind: SegmentKind;
  /** schema node this segment belongs to (template and pointer bodies resolve to their own nodes) */
  nodeKey: string;
  node: NodePath;
  /** data path in densing's grammar: `colors[1].r`, `expr.left.type` */
  dataPath: string;
  label: string;
  /** the value as written, for tooltips */
  value: string;
  /**
   * other nodes these bits belong to: the reference / pointer fields they were reached through, and
   * for shared numbers the definition they are encoded with (`definitions[0]`)
   */
  alsoKeys: string[];
}

/**
 * Lay out the bits `densing(schema, data)` writes, in the same order as the encoder.
 * `byName` resolves pointers the way densing does (first depth-first match over the fields).
 */
export const layoutBits = (schema: DenseSchema, data: unknown, byName: Map<string, NodePath>): Segment[] => {
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
        const tag = value?.[field.discriminator.name];
        emit(
          bitsForStates(field.discriminator.options.length),
          'tag',
          `${field.name}.${field.discriminator.name}`,
          JSON.stringify(tag),
          `${dataPath}.${field.discriminator.name}`
        );
        (field.variants[tag] ?? []).forEach((f, i) =>
          visit(f, [...node, 'variants', tag, i], value?.[f.name], `${dataPath}.${f.name}`, via)
        );
        break;
      }
      case 'reference': {
        const target = schema.templates?.[field.ref];
        if (target) visit(target, ['templates', field.ref], value, dataPath, [...via, pathKey(node)]);
        break;
      }
      case 'pointer': {
        const target = byName.get(field.targetName);
        if (target) visit(resolve(schema, target), target, value, dataPath, [...via, pathKey(node)]);
        break;
      }
    }
  };

  schema.fields.forEach((f, i) => visit(f, ['fields', i], (data as Record<string, unknown>)?.[f.name], f.name, []));
  return out;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resolve = (schema: DenseSchema, path: NodePath): DenseField => path.reduce((n: any, s) => n[s], schema);
