import { calculateDenseFieldBitWidth, type DenseField, type DenseSchema } from 'densing';
import { activePresetName, definitionsOf, PRESETS_KEY, selectorBits } from './definitions';
import { bitsForStates } from './ops';
import { pathKey, type NodePath } from './paths';

export type SegmentKind = 'value' | 'presence' | 'length' | 'tag' | 'packed' | 'preset';

export interface Segment {
  start: number;
  bits: number;
  kind: SegmentKind;
  /** schema node this segment belongs to (pointer targets resolve to the target's nodes) */
  nodeKey: string;
  node: NodePath;
  /** data path in densing's grammar: `colors[1].r`, `expr.left.type` */
  dataPath: string;
  label: string;
  /** the value as written, for tooltips */
  value: string;
  /** for `reference_numeric` values: the definition they are encoded with (`definitions[0]`) */
  refKey?: string;
}

/**
 * Lay out the bits `densing(schema, data)` writes, in the same order as the encoder.
 * `byName` resolves pointers the way densing does (first depth-first match).
 */
export const layoutBits = (schema: DenseSchema, data: unknown, byName: Map<string, NodePath>): Segment[] => {
  const out: Segment[] = [];
  let cursor = 0;
  const emit = (
    bits: number,
    kind: SegmentKind,
    node: NodePath,
    dataPath: string,
    label: string,
    value: string,
    refKey?: string
  ) => {
    if (bits > 0) out.push({ start: cursor, bits, kind, nodeKey: pathKey(node), node, dataPath, label, value, refKey });
    cursor += bits;
  };
  // header: the active preset of every definition, in definition order
  const presets = (data as Record<string, unknown>)?.[PRESETS_KEY];
  const definitions = definitionsOf(schema);
  definitions.forEach((d, i) => {
    const name = activePresetName(d, presets);
    emit(
      selectorBits(d),
      'preset',
      ['definitions', i],
      `${PRESETS_KEY}.${d.name}`,
      `${d.name} preset`,
      JSON.stringify(name)
    );
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visit = (field: DenseField, node: NodePath, value: any, dataPath: string) => {
    const key = node;
    switch (field.type) {
      case 'bool':
      case 'int':
      case 'fixed':
      case 'enum':
        emit(calculateDenseFieldBitWidth(field, value), 'value', key, dataPath, field.name, JSON.stringify(value));
        break;
      case 'reference_numeric': {
        const i = definitions.findIndex((d) => d.name === field.ref);
        const bits = calculateDenseFieldBitWidth(field, value, schema, presets as Record<string, unknown>);
        emit(bits, 'value', key, dataPath, field.name, JSON.stringify(value), pathKey(['definitions', i]));
        break;
      }
      case 'optional': {
        const present = value !== null && value !== undefined;
        emit(1, 'presence', key, dataPath, `${field.name}?`, present ? 'present' : 'absent');
        if (present) visit(field.field, [...node, 'field'], value, dataPath);
        break;
      }
      case 'array': {
        const items: unknown[] = Array.isArray(value) ? value : [];
        emit(
          bitsForStates(field.maxLength - field.minLength + 1),
          'length',
          key,
          dataPath,
          `${field.name}.length`,
          String(items.length)
        );
        items.forEach((item, i) => visit(field.items, [...node, 'items'], item, `${dataPath}[${i}]`));
        break;
      }
      case 'enum_array': {
        const items: string[] = Array.isArray(value) ? value : [];
        const lengthBits = bitsForStates(field.maxLength - field.minLength + 1);
        emit(lengthBits, 'length', key, dataPath, `${field.name}.length`, String(items.length));
        emit(
          calculateDenseFieldBitWidth(field, items) - lengthBits,
          'packed',
          key,
          dataPath,
          field.name,
          items.join(',')
        );
        break;
      }
      case 'object':
        field.fields.forEach((f, i) => visit(f, [...node, 'fields', i], value?.[f.name], `${dataPath}.${f.name}`));
        break;
      case 'union': {
        const tag = value?.[field.discriminator.name];
        emit(
          bitsForStates(field.discriminator.options.length),
          'tag',
          key,
          `${dataPath}.${field.discriminator.name}`,
          `${field.name}.${field.discriminator.name}`,
          JSON.stringify(tag)
        );
        (field.variants[tag] ?? []).forEach((f, i) =>
          visit(f, [...node, 'variants', tag, i], value?.[f.name], `${dataPath}.${f.name}`)
        );
        break;
      }
      case 'pointer': {
        const target = byName.get(field.targetName);
        if (target) visit(resolve(schema, target), target, value, dataPath);
        break;
      }
    }
  };

  schema.fields.forEach((f, i) => visit(f, ['fields', i], (data as Record<string, unknown>)?.[f.name], f.name));
  return out;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resolve = (schema: DenseSchema, path: NodePath): DenseField => path.reduce((n: any, s) => n[s], schema);
