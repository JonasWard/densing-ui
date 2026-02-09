import { describe, it, expect } from 'vitest';
import { encodeSchemaToBase64, decodeSchemaFromBase64 } from './schema-codec';
import type { FieldConfig } from '../components/SchemaBuilder';

describe('Schema Codec', () => {
  describe('Basic field types', () => {
    it('should encode and decode a boolean field', () => {
      const fields: FieldConfig[] = [
        {
          id: '1',
          name: 'enabled',
          type: 'bool'
        }
      ];

      const base64 = encodeSchemaToBase64('Test Schema', fields);
      const decoded = decodeSchemaFromBase64(base64);

      expect(decoded.name).toBe('Test Schema');
      expect(decoded.fields).toHaveLength(1);
      expect(decoded.fields[0].type).toBe('bool');
      expect(decoded.fields[0].name).toBe('enabled');
    });

    it('should encode and decode an integer field', () => {
      const fields: FieldConfig[] = [
        {
          id: '1',
          name: 'count',
          type: 'int',
          min: 0,
          max: 100
        }
      ];

      const base64 = encodeSchemaToBase64('Test Schema', fields);
      const decoded = decodeSchemaFromBase64(base64);

      expect(decoded.fields[0].type).toBe('int');
      expect(decoded.fields[0].name).toBe('count');
      expect(decoded.fields[0].min).toBe(0);
      expect(decoded.fields[0].max).toBe(100);
    });

    it('should encode and decode a fixed field', () => {
      const fields: FieldConfig[] = [
        {
          id: '1',
          name: 'temperature',
          type: 'fixed',
          min: -40,
          max: 125,
          precision: 0.1
        }
      ];

      const base64 = encodeSchemaToBase64('Test Schema', fields);
      const decoded = decodeSchemaFromBase64(base64);

      expect(decoded.fields[0].type).toBe('fixed');
      expect(decoded.fields[0].name).toBe('temperature');
      expect(decoded.fields[0].min).toBe(-40);
      expect(decoded.fields[0].max).toBe(125);
      expect(decoded.fields[0].precision).toBe(0.1);
    });

    it('should encode and decode an enum field', () => {
      const fields: FieldConfig[] = [
        {
          id: '1',
          name: 'status',
          type: 'enum',
          options: ['pending', 'active', 'completed']
        }
      ];

      const base64 = encodeSchemaToBase64('Test Schema', fields);
      const decoded = decodeSchemaFromBase64(base64);

      expect(decoded.fields[0].type).toBe('enum');
      expect(decoded.fields[0].name).toBe('status');
      expect(decoded.fields[0].options).toEqual(['pending', 'active', 'completed']);
    });
  });

  describe('Complex field types', () => {
    it('should encode and decode an optional field', () => {
      const fields: FieldConfig[] = [
        {
          id: '1',
          name: 'age',
          type: 'optional',
          wrappedField: {
            id: '2',
            name: 'value',
            type: 'int',
            min: 0,
            max: 120
          }
        }
      ];

      const base64 = encodeSchemaToBase64('Test Schema', fields);
      const decoded = decodeSchemaFromBase64(base64);

      expect(decoded.fields[0].type).toBe('optional');
      expect(decoded.fields[0].name).toBe('age');
      expect(decoded.fields[0].wrappedField?.type).toBe('int');
      expect(decoded.fields[0].wrappedField?.min).toBe(0);
      expect(decoded.fields[0].wrappedField?.max).toBe(120);
    });

    it('should encode and decode an array field', () => {
      const fields: FieldConfig[] = [
        {
          id: '1',
          name: 'scores',
          type: 'array',
          minLength: 0,
          maxLength: 10,
          wrappedField: {
            id: '2',
            name: 'item',
            type: 'int',
            min: 0,
            max: 100
          }
        }
      ];

      const base64 = encodeSchemaToBase64('Test Schema', fields);
      const decoded = decodeSchemaFromBase64(base64);

      expect(decoded.fields[0].type).toBe('array');
      expect(decoded.fields[0].name).toBe('scores');
      expect(decoded.fields[0].minLength).toBe(0);
      expect(decoded.fields[0].maxLength).toBe(10);
      expect(decoded.fields[0].wrappedField?.type).toBe('int');
    });

    it('should encode and decode an object field', () => {
      const fields: FieldConfig[] = [
        {
          id: '1',
          name: 'offset',
          type: 'object',
          fields: [
            {
              id: '2',
              name: 'start',
              type: 'int',
              min: -256,
              max: 255
            },
            {
              id: '3',
              name: 'end',
              type: 'int',
              min: -256,
              max: 255
            }
          ]
        }
      ];

      const base64 = encodeSchemaToBase64('Test Schema', fields);
      const decoded = decodeSchemaFromBase64(base64);

      expect(decoded.fields[0].type).toBe('object');
      expect(decoded.fields[0].name).toBe('offset');
      expect(decoded.fields[0].fields).toHaveLength(2);
      expect(decoded.fields[0].fields?.[0].name).toBe('start');
      expect(decoded.fields[0].fields?.[0].min).toBe(-256);
      expect(decoded.fields[0].fields?.[1].name).toBe('end');
    });
  });

  describe('Real-world example', () => {
    it('should encode and decode the custom building schema', () => {
      const fields: FieldConfig[] = [
        {
          id: '1',
          name: 'length',
          type: 'int',
          min: 0,
          max: 7500
        },
        {
          id: '2',
          name: 'width',
          type: 'int',
          min: 0,
          max: 500
        },
        {
          id: '3',
          name: 'height',
          type: 'int',
          min: 0,
          max: 500
        },
        {
          id: '4',
          name: 'typology',
          type: 'enum',
          options: ['barn', 'school', 'house', 'church', 'castle']
        },
        {
          id: '5',
          name: 'offset',
          type: 'object',
          fields: [
            {
              id: '6',
              name: 'start',
              type: 'int',
              min: -256,
              max: 255
            },
            {
              id: '7',
              name: 'end',
              type: 'int',
              min: -256,
              max: 255
            }
          ]
        }
      ];

      const base64 = encodeSchemaToBase64('Custom Schema', fields);
      console.log('Encoded base64:', base64);
      
      const decoded = decodeSchemaFromBase64(base64);

      // Verify schema name
      expect(decoded.name).toBe('Custom Schema');
      
      // Verify all fields
      expect(decoded.fields).toHaveLength(5);
      
      // Verify integer fields
      expect(decoded.fields[0].name).toBe('length');
      expect(decoded.fields[0].type).toBe('int');
      expect(decoded.fields[0].min).toBe(0);
      expect(decoded.fields[0].max).toBe(7500);
      
      expect(decoded.fields[1].name).toBe('width');
      expect(decoded.fields[1].max).toBe(500);
      
      expect(decoded.fields[2].name).toBe('height');
      expect(decoded.fields[2].max).toBe(500);
      
      // Verify enum field
      expect(decoded.fields[3].name).toBe('typology');
      expect(decoded.fields[3].type).toBe('enum');
      expect(decoded.fields[3].options).toEqual(['barn', 'school', 'house', 'church', 'castle']);
      
      // Verify object field
      expect(decoded.fields[4].name).toBe('offset');
      expect(decoded.fields[4].type).toBe('object');
      expect(decoded.fields[4].fields).toHaveLength(2);
      expect(decoded.fields[4].fields?.[0].name).toBe('start');
      expect(decoded.fields[4].fields?.[0].min).toBe(-256);
      expect(decoded.fields[4].fields?.[0].max).toBe(255);
      expect(decoded.fields[4].fields?.[1].name).toBe('end');
    });
  });
});
