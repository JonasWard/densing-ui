import { densing, undensing } from 'densing';
import { metaSchema, encodeStringTable, decodeStringTable, getStringIndex } from './meta-schema';
import type { FieldConfig } from '../components/SchemaBuilder';

/**
 * Convert FieldConfig to meta-schema format
 */
export function fieldConfigToMetaFormat(
  field: FieldConfig,
  strings: string[]
): any {
  // Store field name in string table and get its index
  const nameIndex = getStringIndex(strings, field.name);

  const base: any = {
    type: field.type,
    nameIndex: nameIndex // Store the name index in the meta format
  };

  switch (field.type) {
    case 'bool':
      return { ...base };

    case 'int':
      return {
        ...base,
        min: field.min ?? 0,
        max: field.max ?? 100
      };

    case 'fixed':
      return {
        ...base,
        min: field.min ?? 0,
        max: field.max ?? 100,
        precision: field.precision ?? 0.1
      };

    case 'enum':
      return {
        ...base,
        options: (field.options ?? []).map((opt) => getStringIndex(strings, opt))
      };

    case 'optional':
      return {
        ...base,
        wrapped: field.wrappedField ? fieldConfigToMetaFormat(field.wrappedField, strings) : null
      };

    case 'array':
      return {
        ...base,
        minLength: field.minLength ?? 0,
        maxLength: field.maxLength ?? 10,
        item: field.wrappedField ? fieldConfigToMetaFormat(field.wrappedField, strings) : null
      };

    case 'enum_array':
      return {
        ...base,
        minLength: field.minLength ?? 0,
        maxLength: field.maxLength ?? 10,
        options: (field.enumField?.options ?? []).map((opt) => getStringIndex(strings, opt))
      };

    case 'object':
      return {
        ...base,
        fields: (field.fields ?? []).map((f) => fieldConfigToMetaFormat(f, strings))
      };

    case 'union':
      const discriminatorOptions = field.discriminatorField?.options ?? [];
      return {
        ...base,
        options: discriminatorOptions.map((opt) => getStringIndex(strings, opt)),
        variants: discriminatorOptions.map((opt) => {
          const variantFields = field.variants?.[opt] ?? [];
          return {
            variantFields: variantFields.map((f) => fieldConfigToMetaFormat(f, strings))
          };
        })
      };

    default:
      return base;
  }
}

/**
 * Convert meta-schema format back to FieldConfig
 */
export function metaFormatToFieldConfig(metaField: any, strings: string[], idPrefix: string = ''): FieldConfig {
  const id = idPrefix + Date.now().toString() + Math.random();

  // Get the field name from the stored nameIndex
  const name = strings[metaField.nameIndex] || 'field';

  const base: FieldConfig = {
    id,
    name,
    type: metaField.type
  };

  switch (metaField.type) {
    case 'bool':
      return base;

    case 'int':
      return {
        ...base,
        min: metaField.min,
        max: metaField.max
      };

    case 'fixed':
      return {
        ...base,
        min: metaField.min,
        max: metaField.max,
        precision: metaField.precision
      };

    case 'enum':
      return {
        ...base,
        options: metaField.options.map((idx: number) => strings[idx])
      };

    case 'optional':
      return {
        ...base,
        wrappedField: metaField.wrapped
          ? metaFormatToFieldConfig(metaField.wrapped, strings, idPrefix + '1')
          : undefined
      };

    case 'array':
      return {
        ...base,
        minLength: metaField.minLength,
        maxLength: metaField.maxLength,
        wrappedField: metaField.item ? metaFormatToFieldConfig(metaField.item, strings, idPrefix + '1') : undefined
      };

    case 'enum_array':
      return {
        ...base,
        minLength: metaField.minLength,
        maxLength: metaField.maxLength,
        enumField: {
          id: id + '_enum',
          name: 'item',
          type: 'enum',
          options: metaField.options.map((idx: number) => strings[idx])
        }
      };

    case 'object':
      return {
        ...base,
        fields: metaField.fields.map((f: any, i: number) => metaFormatToFieldConfig(f, strings, idPrefix + i))
      };

    case 'union':
      const discriminatorOptions = metaField.options.map((idx: number) => strings[idx]);
      const variants: Record<string, FieldConfig[]> = {};

      discriminatorOptions.forEach((opt: string, i: number) => {
        const variantData = metaField.variants[i];
        variants[opt] = variantData.variantFields.map((f: any, j: number) =>
          metaFormatToFieldConfig(f, strings, idPrefix + i + j)
        );
      });

      return {
        ...base,
        discriminatorField: {
          id: id + '_disc',
          name: 'type',
          type: 'enum',
          options: discriminatorOptions
        },
        variants
      };

    default:
      return base;
  }
}

/**
 * Encode an entire schema configuration to base64
 */
export function encodeSchemaToBase64(
  schemaName: string,
  fields: FieldConfig[]
): string {
  const strings: string[] = [];
  
  // Add schema name and field names to string table
  strings.push(schemaName);
  
  // Convert fields to meta format
  const metaFields = fields.map(field => {
    strings.push(field.name);
    return fieldConfigToMetaFormat(field, strings);
  });

  // Create the full schema data structure
  const schemaData = {
    schema: {
      meta: {
        version: 1
      },
      fields: metaFields,
      strings: encodeStringTable(strings)
    }
  };

  // Encode with densing
  return densing(metaSchema, schemaData);
}

/**
 * Decode a base64 schema back to schema configuration
 */
export function decodeSchemaFromBase64(base64: string): {
  name: string;
  fields: FieldConfig[];
} {
  // Decode with densing
  const schemaData = undensing(metaSchema, base64);
  
  // Decode string table
  const strings = decodeStringTable(schemaData.schema.strings);
  
  // First string is schema name
  const name = strings[0];
  
  // Convert meta format back to FieldConfig
  const fields = schemaData.schema.fields.map((metaField: any) => metaFormatToFieldConfig(metaField, strings));

  return { name, fields };
}
