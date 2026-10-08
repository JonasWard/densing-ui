import type { DenseField, DenseSchema, FixedPointField, IntField, NumericDefinition, NumericPreset } from 'densing';
import { bitsForStates, fixedSteps, uniqueName } from './ops';
import { listNodes, setAt, type NodePath } from './paths';

/** Data key that holds the active preset of each definition (densing's `PRESETS_KEY`) */
export const PRESETS_KEY = '$presets';

export type ActivePresets = Record<string, string>;

export const definitionsOf = (schema: DenseSchema): NumericDefinition[] => schema.definitions ?? [];

export const presetNames = (d: NumericDefinition) => Object.keys(d.presets ?? {});

export const defaultPresetName = (d: NumericDefinition) => d.defaultPreset ?? presetNames(d)[0];

export const activePresetName = (d: NumericDefinition, presets?: unknown): string => {
  const selected = presets && typeof presets === 'object' ? (presets as Record<string, unknown>)[d.name] : undefined;
  return typeof selected === 'string' && selected in d.presets ? selected : defaultPresetName(d);
};

/** A preset as the field it encodes like: `int` without precision, `fixed` with it */
export const presetAsField = (
  d: NumericDefinition,
  preset: string,
  name = `${d.name}.${preset}`
): IntField | FixedPointField => {
  const { min, max, precision, defaultValue } = d.presets[preset];
  return precision === undefined
    ? { type: 'int', name, min, max, defaultValue: defaultValue ?? min }
    : { type: 'fixed', name, min, max, precision, defaultValue: defaultValue ?? min };
};

export const presetBits = (p: NumericPreset) =>
  bitsForStates(p.precision === undefined ? p.max - p.min + 1 : fixedSteps(p.min, p.max, p.precision));

/** Bits the payload header spends on choosing this definition's preset */
export const selectorBits = (d: NumericDefinition) => bitsForStates(presetNames(d).length);

export const headerBits = (schema: DenseSchema) => definitionsOf(schema).reduce((s, d) => s + selectorBits(d), 0);

export const findDefinition = (schema: DenseSchema, name: string) => definitionsOf(schema).find((d) => d.name === name);

/** Paths of the `reference_numeric` fields that use a definition */
export const usesOf = (schema: DenseSchema, name: string): NodePath[] =>
  listNodes(schema)
    .filter(({ field }) => field.type === 'reference_numeric' && field.ref === name)
    .map((n) => n.path);

const setDefinitions = (schema: DenseSchema, definitions: NumericDefinition[]): DenseSchema => {
  const next: DenseSchema = { ...schema, definitions };
  if (!definitions.length) delete next.definitions;
  return next;
};

export const definitionTemplate = (schema: DenseSchema, base = 'length'): NumericDefinition => ({
  name: uniqueName(new Set(definitionsOf(schema).map((d) => d.name)), base),
  presets: {
    coarse: { min: 0, max: 1000, defaultValue: 0 },
    fine: { min: 0, max: 100, precision: 0.01, defaultValue: 0 }
  },
  defaultPreset: 'coarse'
});

export const addDefinition = (schema: DenseSchema, d: NumericDefinition = definitionTemplate(schema)) => ({
  schema: setDefinitions(schema, [...definitionsOf(schema), d]),
  path: ['definitions', definitionsOf(schema).length] as NodePath,
  name: d.name
});

export const removeDefinition = (schema: DenseSchema, index: number): DenseSchema =>
  setDefinitions(
    schema,
    definitionsOf(schema).filter((_, i) => i !== index)
  );

/** Replace a definition; a rename also updates every field that refers to it */
export const updateDefinition = (schema: DenseSchema, index: number, next: NumericDefinition): DenseSchema => {
  const prev = definitionsOf(schema)[index];
  let out = setDefinitions(
    schema,
    definitionsOf(schema).map((d, i) => (i === index ? next : d))
  );
  if (prev && prev.name !== next.name)
    for (const path of usesOf(schema, prev.name)) out = setAt(out, [...path, 'ref'], next.name);
  return out;
};

/** Turn an int / fixed field into a reference to a new definition with that range as its only preset */
export const extractDefinition = (schema: DenseSchema, path: NodePath, field: IntField | FixedPointField) => {
  const preset: NumericPreset =
    field.type === 'fixed'
      ? { min: field.min, max: field.max, precision: field.precision, defaultValue: field.defaultValue }
      : { min: field.min, max: field.max, defaultValue: field.defaultValue };
  const d: NumericDefinition = {
    name: uniqueName(new Set(definitionsOf(schema).map((x) => x.name)), field.name),
    presets: { default: preset },
    defaultPreset: 'default'
  };
  const added = addDefinition(schema, d);
  const ref: DenseField = { type: 'reference_numeric', name: field.name, ref: d.name };
  return { schema: setAt(added.schema, path, ref), definitionPath: added.path };
};

export const presetTemplate = (d: NumericDefinition): [string, NumericPreset] => {
  const last = d.presets[presetNames(d)[presetNames(d).length - 1]];
  return [uniqueName(new Set(presetNames(d)), 'preset'), last ? { ...last } : { min: 0, max: 100, defaultValue: 0 }];
};

/** Rename a preset keeping its position (preset order is the index order in the header) */
export const renamePreset = (d: NumericDefinition, from: string, to: string): NumericDefinition => {
  if (from === to || to in d.presets) return d;
  const presets = Object.fromEntries(Object.entries(d.presets).map(([k, v]) => [k === from ? to : k, v]));
  return { ...d, presets, defaultPreset: d.defaultPreset === from ? to : d.defaultPreset };
};

export const removePreset = (d: NumericDefinition, name: string): NumericDefinition => {
  const presets = { ...d.presets };
  delete presets[name];
  const names = Object.keys(presets);
  return { ...d, presets, defaultPreset: d.defaultPreset === name || !d.defaultPreset ? names[0] : d.defaultPreset };
};

/** Clamp a preset's default value into its range */
export const normalizePreset = (p: NumericPreset): NumericPreset => {
  const d = Number.isFinite(p.defaultValue) ? (p.defaultValue as number) : p.min;
  return { ...p, defaultValue: Math.min(Math.max(d, p.min), Math.max(p.min, p.max)) };
};

const withPresets = (data: unknown, change: (presets: Record<string, unknown>) => Record<string, unknown>) => {
  if (!data || typeof data !== 'object') return data;
  const presets = (data as Record<string, unknown>)[PRESETS_KEY];
  if (!presets || typeof presets !== 'object') return data;
  return { ...data, [PRESETS_KEY]: change(presets as Record<string, unknown>) };
};

/** Keep the preview's chosen preset when its definition is renamed */
export const renameDefinitionInData = (from: string, to: string) => (data: unknown) =>
  withPresets(data, (p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k === from ? to : k, v])));

/** Keep the preview's chosen preset when that preset is renamed */
export const renamePresetInData = (definition: string, from: string, to: string) => (data: unknown) =>
  withPresets(data, (p) => (p[definition] === from ? { ...p, [definition]: to } : p));
