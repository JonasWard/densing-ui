import type { DenseSchema, DenseField } from 'densing';
import type { FieldConfig } from '../components/SchemaBuilder';

/**
 * Convert DenseSchema to FieldConfig array for export
 * This is a best-effort conversion that handles basic field types
 */
export function schemaToFieldConfigs(denseSchema: DenseSchema): FieldConfig[] {
  const fields: FieldConfig[] = [];
  
  // Access the schema's fields (densing internal structure)
  const schemaFields = (denseSchema as any).fields as DenseField[];
  
  if (!schemaFields || !Array.isArray(schemaFields)) {
    return [];
  }

  schemaFields.forEach((field, index) => {
    const config = convertDenseFieldToConfig(field, index);
    if (config) {
      fields.push(config);
    }
  });

  return fields;
}

function convertDenseFieldToConfig(field: DenseField, index: number): FieldConfig | null {
  const baseId = Date.now().toString() + index;
  
  switch (field.type) {
    case 'bool':
      return {
        id: baseId,
        name: field.name,
        type: 'bool'
      };
    
    case 'int':
      return {
        id: baseId,
        name: field.name,
        type: 'int',
        min: field.min,
        max: field.max
      };
    
    case 'fixed':
      return {
        id: baseId,
        name: field.name,
        type: 'fixed',
        min: field.min,
        max: field.max,
        precision: field.precision
      };
    
    case 'enum':
      return {
        id: baseId,
        name: field.name,
        type: 'enum',
        options: [...field.options]
      };
    
    case 'optional':
      const wrappedField = convertDenseFieldToConfig(field.field, index + 1);
      return wrappedField ? {
        id: baseId,
        name: field.name,
        type: 'optional',
        wrappedField
      } : null;
    
    case 'array':
      const arrayField = field as any;
      const itemField = convertDenseFieldToConfig(arrayField.field, index + 1);
      return itemField ? {
        id: baseId,
        name: field.name,
        type: 'array',
        minLength: arrayField.minLength,
        maxLength: arrayField.maxLength,
        wrappedField: itemField
      } : null;
    
    case 'enum_array':
      const enumArrayField = field as any;
      return {
        id: baseId,
        name: field.name,
        type: 'enum_array',
        minLength: enumArrayField.minLength,
        maxLength: enumArrayField.maxLength,
        enumField: {
          id: baseId + '_enum',
          name: 'item',
          type: 'enum',
          options: [...enumArrayField.enumField.options]
        }
      };
    
    case 'object':
      const objectFields: FieldConfig[] = [];
      field.fields.forEach((f, i) => {
        const converted = convertDenseFieldToConfig(f, index * 100 + i);
        if (converted) {
          objectFields.push(converted);
        }
      });
      return {
        id: baseId,
        name: field.name,
        type: 'object',
        fields: objectFields
      };
    
    case 'union':
      const discriminatorOptions = field.discriminator.options;
      const variants: Record<string, FieldConfig[]> = {};
      
      Object.entries(field.variants).forEach(([key, variantFields]) => {
        variants[key] = variantFields.map((f, i) => {
          const converted = convertDenseFieldToConfig(f, index * 1000 + i);
          return converted!;
        }).filter(Boolean);
      });

      return {
        id: baseId,
        name: field.name,
        type: 'union',
        discriminatorField: {
          id: baseId + '_disc',
          name: field.discriminator.name,
          type: 'enum',
          options: [...discriminatorOptions]
        },
        variants
      };
    
    default:
      return null;
  }
}
