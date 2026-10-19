import { densing, schemaFromJson, undensing, type DenseSchema } from 'densing';
import { describe, expect, it, vi } from 'vitest';
import golden from './fixtures/densing-0.4.json';
import { convertUnions, upgradeSchema } from './migrate';
import { parseImport } from './import';
import { decodeLink } from './share';
import { initialState } from './store';

// encodings recorded on densing 0.4.6 (fixtures/densing-0.4.json); 0.5 must give the same strings
describe('schemas from densing 0.4', () => {
  for (const ex of golden.examples) {
    it(`${ex.id}: converts and encodes as on 0.4.6`, () => {
      const schema = schemaFromJson(upgradeSchema(ex.schema as unknown as DenseSchema));
      expect(densing(schema, ex.data as object)).toBe(ex.encoded);
      expect(undensing(schema, ex.encoded)).toEqual(ex.data);
    });

    it(`${ex.id}: converts by hand (as for an invalid schema) to the same encoding`, () => {
      const schema = schemaFromJson(convertUnions(ex.schema));
      expect(densing(schema, ex.data as object)).toBe(ex.encoded);
    });
  }

  it('converts pointers inside old unions', () => {
    const p = golden.pointers;
    const up = upgradeSchema(p.schema as unknown as DenseSchema);
    expect(JSON.stringify(up)).not.toContain('pointer');
    expect(densing(schemaFromJson(up), p.data as object)).toBe(p.encoded);
  });

  it('turns a pointer that cannot be resolved into a reference to no template', () => {
    const up = upgradeSchema({
      fields: [{ type: 'pointer', name: 'p', targetName: 'nowhere' }]
    } as unknown as DenseSchema);
    expect(up.fields[0]).toEqual({ type: 'reference', name: 'p', ref: -1 });
  });

  it('leaves 0.5 schemas alone', () => {
    const s = upgradeSchema(golden.examples[0].schema as unknown as DenseSchema);
    expect(upgradeSchema(s)).toBe(s);
  });

  it('upgrades documents saved in local storage before densing 0.5', () => {
    const p = golden.pointers;
    const saved = {
      docs: [{ id: 'd', name: 'Old', schema: p.schema, data: p.data, base: 'base64url' }],
      activeId: 'd'
    };
    vi.stubGlobal('localStorage', { getItem: () => JSON.stringify(saved), setItem: () => {} });
    try {
      const doc = initialState().docs[0];
      expect(JSON.stringify(doc.schema)).not.toContain('pointer');
      expect(densing(schemaFromJson(doc.schema), doc.data as object)).toBe(p.encoded);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('upgrades imported 0.4 schema files', () => {
    const p = golden.pointers;
    const { schema } = parseImport(JSON.stringify({ name: 'Old', ...p.schema }), 'x');
    expect(densing(schemaFromJson(schema), p.data as object)).toBe(p.encoded);
  });

  it('opens a link made on 0.4.6', () => {
    const decoded = decodeLink(golden.link.hash);
    if (!decoded?.ok) throw new Error(JSON.stringify(decoded));
    expect(decoded.name).toBe(golden.link.name);
    expect(decoded.data).toEqual(golden.link.data);
  });
});
