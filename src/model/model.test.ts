import * as densing from 'densing';
import { calculateDenseDataSize, densing as encode, schemaFromJson, type DenseSchema } from 'densing';
import { describe, expect, it } from 'vitest';
import { analyze, charsForBits } from './analyze';
import {
  addDefinition,
  extractDefinition,
  removeDefinition,
  renamePreset,
  updateDefinition,
  usesOf
} from './definitions';
import { schemaToCode } from './codegen';
import { reducer, type State } from './store';
import { defaultFor, reconcile } from './data';
import { examples } from './examples';
import {
  addVariant,
  changeType,
  duplicateField,
  fieldTemplate,
  moveField,
  removeVariant,
  renameVariant,
  unwrapField,
  wrapField
} from './ops';
import { getAt, pathKey } from './paths';
import { layoutBits } from './ribbon';

const evalCode = (code: string): DenseSchema => {
  const body = code.replace(/^import .*$/m, '').replace(/export const (\w+) =/, 'return');
  const names = Object.keys(densing);
  return new Function(...names, body)(...names.map((n) => (densing as Record<string, unknown>)[n]));
};

describe('examples', () => {
  for (const ex of examples) {
    it(`${ex.id}: analyzes clean`, () => {
      const a = analyze(ex.schema);
      expect([...a.errors.entries()]).toEqual([]);
      expect(a.rootErrors).toEqual([]);
      expect(a.schema).not.toBeNull();
    });

    it(`${ex.id}: codegen round-trips`, () => {
      expect(evalCode(schemaToCode(ex.schema, ex.name))).toEqual(schemaFromJson(ex.schema));
    });

    it(`${ex.id}: ribbon matches the encoder bit for bit`, () => {
      const a = analyze(ex.schema);
      const segs = layoutBits(a.schema!, ex.data, a.byName);
      const total = segs.reduce((s, x) => s + x.bits, 0);
      expect(total).toBe(calculateDenseDataSize(a.schema!, ex.data).totalBits);
      expect(encode(a.schema!, ex.data, 'binary').length).toBe(total);
      // segments are contiguous
      segs.forEach((s, i) => i && expect(s.start).toBe(segs[i - 1].start + segs[i - 1].bits));
    });

    it(`${ex.id}: reconcile keeps valid data untouched`, () => {
      const a = analyze(ex.schema);
      expect(reconcile(a.schema!, ex.data, a.byName)).toEqual(ex.data);
    });
  }

  it('device bits are written in field order', () => {
    const ex = examples[0];
    const a = analyze(ex.schema);
    const bits = encode(a.schema!, ex.data, 'binary');
    const [deviceId] = layoutBits(a.schema!, ex.data, a.byName);
    expect(bits.slice(deviceId.start, deviceId.start + deviceId.bits)).toBe((42).toString(2).padStart(10, '0'));
    expect(encode(a.schema!, ex.data)).toBe('Cqnu');
  });
});

describe('analyze', () => {
  it('marks the node an error belongs to', () => {
    const s: DenseSchema = {
      fields: [{ type: 'object', name: 'o', fields: [{ type: 'int', name: 'x', min: 5, max: 1, defaultValue: 5 }] }]
    };
    const a = analyze(s);
    expect([...a.errors.keys()]).toEqual(['fields[0].fields[0]']);
    expect(a.schema).toBeNull();
  });

  it('maps pointer errors to the pointer node', () => {
    const s: DenseSchema = { fields: [{ type: 'pointer', name: 'p', targetName: 'nope' }] };
    expect([...analyze(s).errors.keys()]).toEqual(['fields[0]']);
  });

  it('flags duplicate names on the later field', () => {
    const s: DenseSchema = { fields: [fieldTemplate('bool', 'a'), fieldTemplate('int', 'a')] };
    expect([...analyze(s).errors.keys()]).toEqual(['fields[1]']);
  });

  it('chars for bits', () => {
    expect(charsForBits(24, 64)).toBe(4);
    expect(charsForBits(0, 64)).toBe(0);
    expect(charsForBits(8, 38)).toBe(2);
  });
});

describe('ops', () => {
  const base = (): DenseSchema => ({
    fields: [
      fieldTemplate('bool', 'a'),
      { type: 'object', name: 'o', fields: [fieldTemplate('int', 'x')] },
      fieldTemplate('enum', 'c')
    ]
  });

  it('moves a field down within a list', () => {
    const r = moveField(base(), ['fields', 0], ['fields'], 3)!;
    expect(r.schema.fields.map((f) => f.name)).toEqual(['o', 'c', 'a']);
    expect(r.path).toEqual(['fields', 2]);
  });

  it('moves a field into a later sibling object', () => {
    const r = moveField(base(), ['fields', 0], ['fields', 1, 'fields'], 1)!;
    expect(r.schema.fields.map((f) => f.name)).toEqual(['o', 'c']);
    expect(getAt(r.schema, r.path).name).toBe('a');
    expect(pathKey(r.path)).toBe('fields[0].fields[1]');
  });

  it('moves a field out of an object', () => {
    const r = moveField(base(), ['fields', 1, 'fields', 0], ['fields'], 0)!;
    expect(r.schema.fields.map((f) => f.name)).toEqual(['x', 'a', 'o', 'c']);
  });

  it('refuses to move a field into itself', () => {
    expect(moveField(base(), ['fields', 1], ['fields', 1, 'fields'], 0)).toBeNull();
  });

  it('duplicates with unique names', () => {
    const r = duplicateField(base(), ['fields', 1])!;
    const copy = getAt(r.schema, r.path);
    expect(copy.name).toBe('o2');
    expect(copy.fields[0].name).toBe('x2');
    expect(analyze(r.schema).errors.size).toBe(0);
  });

  it('wraps and unwraps keeping the data key', () => {
    const s = base();
    const wrapped = wrapField(s, s.fields[0], 'optional');
    expect(wrapped).toMatchObject({ type: 'optional', name: 'a', field: { type: 'bool' } });
    expect(unwrapField(wrapped)).toEqual(s.fields[0]);
  });

  it('changes type keeping ranges and options', () => {
    const s = base();
    expect(changeType({ type: 'int', name: 'n', min: -3, max: 9, defaultValue: 0 }, 'fixed', s)).toMatchObject({
      min: -3,
      max: 9
    });
    expect(changeType(s.fields[2], 'union', s)).toMatchObject({ variants: { a: [], b: [], c: [] } });
  });

  it('keeps union variants and discriminator in sync', () => {
    let u = fieldTemplate('union', 'u');
    if (u.type !== 'union') throw new Error();
    u = addVariant(u, 'c');
    u = { ...u, variants: { ...u.variants, c: [fieldTemplate('bool', 'flag')] } };
    u = renameVariant(u, 'c', 'z');
    expect(u.discriminator.options).toEqual(['a', 'b', 'z']);
    expect(u.variants.z[0].name).toBe('flag');
    u = removeVariant(u, 'a');
    expect(u.discriminator).toMatchObject({ options: ['b', 'z'], defaultValue: 'b' });
    expect(analyze({ fields: [u] }).errors.size).toBe(0);
  });
});

describe('data', () => {
  it('reconcile fixes values that no longer fit', () => {
    const s: DenseSchema = schemaFromJson({
      fields: [
        { type: 'int', name: 'n', min: 0, max: 10 },
        { type: 'array', name: 'xs', minLength: 2, maxLength: 3, items: { type: 'bool', name: 'b' } }
      ]
    });
    const a = analyze(s);
    expect(reconcile(s, { n: 50, xs: [true, true, true, true], gone: 1 }, a.byName)).toEqual({
      n: 0,
      xs: [true, true, true]
    });
    expect(reconcile(s, { n: 4, xs: [] }, a.byName)).toEqual({ n: 4, xs: [false, false] });
  });

  it('defaults terminate for recursive fields', () => {
    const ex = examples.find((e) => e.id === 'expression')!;
    const a = analyze(ex.schema);
    expect(defaultFor(a.schema!.fields[0], a.schema!, a.byName)).toEqual({ type: 'number', value: 0 });
  });
});

describe('numeric definitions', () => {
  const box = examples.find((e) => e.id === 'box')!;
  const a = analyze(box.schema);

  it('encodes like the densing README', () => {
    expect(encode(a.schema!, { width: 120, height: 40, depth: 800 })).toBe('DwFGQA');
    expect(encode(a.schema!, { $presets: { length: 'm' }, width: 12.5, height: 0.4, depth: 80 })).toBe('icQBQ-gA');
  });

  it('counts the preset header in totals and ranges', () => {
    expect(a.header).toBe(1);
    expect(a.ranges.get('definitions[0]')).toEqual({ min: 1, max: 1 });
    expect(a.ranges.get('fields[0]')).toEqual({ min: 10, max: 14 });
    expect(a.total).toEqual({ min: 31, max: 43 });
  });

  it('ribbon starts with the preset selector and matches the encoder', () => {
    const data = { $presets: { length: 'm' }, width: 12.5, height: 0.4, depth: 80 };
    const segs = layoutBits(a.schema!, data, a.byName);
    expect(segs[0]).toMatchObject({
      kind: 'preset',
      start: 0,
      bits: 1,
      nodeKey: 'definitions[0]',
      dataPath: '$presets.length'
    });
    expect(segs[1]).toMatchObject({ refKey: 'definitions[0]', bits: 14 });
    expect(segs.reduce((n, x) => n + x.bits, 0)).toBe(encode(a.schema!, data, 'binary').length);
  });

  it('reconcile adds $presets and resets values the new preset cannot hold', () => {
    expect(reconcile(a.schema!, { width: 120, height: 40, depth: 800 }, a.byName)).toEqual(box.data);
    const switched = reconcile(a.schema!, { ...(box.data as object), $presets: { length: 'm' } }, a.byName);
    expect(switched).toEqual({ $presets: { length: 'm' }, width: 0, height: 40, depth: 0 });
    expect(reconcile(a.schema!, { ...(box.data as object), $presets: { length: 'nope' } }, a.byName).$presets).toEqual({
      length: 'mm'
    });
  });

  it('codegen uses schemaWithDefinitions and round-trips', () => {
    const code = schemaToCode(box.schema, box.name);
    expect(code).toContain(
      "definition('length', { mm: { min: 0, max: 1000 }, m: { min: 0, max: 100, precision: 0.01 } })"
    );
    expect(code).toContain("referenceNumeric('width', 'length')");
  });

  it('renaming a definition updates its references, removing one leaves them flagged', () => {
    const d = box.schema.definitions![0];
    const renamed = updateDefinition(box.schema, 0, { ...d, name: 'size' });
    expect(usesOf(renamed, 'size')).toHaveLength(3);
    expect(analyze(renamed).schema).not.toBeNull();
    const removed = removeDefinition(box.schema, 0);
    expect(removed.definitions).toBeUndefined();
    expect([...analyze(removed).errors.keys()]).toEqual(['fields[0]', 'fields[1]', 'fields[2]']);
  });

  it('flags a bad preset on the definition', () => {
    const d = box.schema.definitions![0];
    const bad = updateDefinition(box.schema, 0, { ...d, presets: { ...d.presets, mm: { min: 10, max: 1 } } });
    expect([...analyze(bad).errors.keys()]).toEqual(['definitions[0]']);
  });

  it('renames presets in place and extracts an int into a definition', () => {
    const d = renamePreset(box.schema.definitions![0], 'mm', 'millimetre');
    expect(Object.keys(d.presets)).toEqual(['millimetre', 'm']);
    expect(d.defaultPreset).toBe('millimetre');
    const s: DenseSchema = { fields: [fieldTemplate('int', 'n')] };
    const r = extractDefinition(s, ['fields', 0], s.fields[0] as never);
    expect(r.schema.fields[0]).toEqual({ type: 'reference_numeric', name: 'n', ref: 'n' });
    const ra = analyze(r.schema);
    expect(ra.schema).not.toBeNull();
    expect(ra.total).toEqual({ min: 8, max: 8 });
    expect(addDefinition(r.schema).name).toBe('length');
  });
});

describe('renames keep the preview preset', () => {
  const box = examples.find((e) => e.id === 'box')!;
  const data = { $presets: { length: 'm' }, width: 12.5, height: 0.4, depth: 80 };
  const state = (): State => {
    const doc = { id: 'd', name: 'Box', schema: box.schema, data, base: 'base64url' as const };
    return { docs: [doc], activeId: 'd', selected: null, past: [], future: [], lastEdit: null };
  };
  const edit = (schema: DenseSchema) => reducer(state(), { type: 'editSchema', schema }).docs[0].data;
  const d = box.schema.definitions![0];

  it('follows a definition rename', () => {
    expect(edit(updateDefinition(box.schema, 0, { ...d, name: 'size' }))).toEqual({ ...data, $presets: { size: 'm' } });
  });

  it('follows a rename of the active preset', () => {
    expect(edit(updateDefinition(box.schema, 0, renamePreset(d, 'm', 'metre')))).toEqual({
      ...data,
      $presets: { length: 'metre' }
    });
  });

  it('leaves adding and removing to reconcile', () => {
    const added = edit(addDefinition(box.schema).schema) as Record<string, unknown>;
    expect(added.$presets).toEqual({ length: 'm', length2: 'coarse' });
    const removed = edit(updateDefinition(box.schema, 0, { ...d, presets: { mm: d.presets.mm } })) as Record<
      string,
      unknown
    >;
    expect(removed).toEqual({ $presets: { length: 'mm' }, width: 0, height: 0, depth: 80 });
  });
});
