import type { DenseSchema, DenseField, IntField, FixedPointField, EnumField, OptionalField, ArrayField, EnumArrayField, ObjectField, UnionField, PointerField } from 'densing';

/**
 * Convert DenseSchema to DenseField array for export
 * This is a best-effort conversion that handles basic field types
 * Note: DenseField from densing now uses name as the unique identifier
 */
export function schemaToDenseFields(denseSchema: DenseSchema): DenseField[] {
  // Access the schema's fields
  const schemaFields = denseSchema.fields;

  if (!schemaFields || !Array.isArray(schemaFields)) {
    return [];
  }

  // DenseField objects are already in the correct format
  return schemaFields;
}

/**
 * Helper to deeply clone a field (for editing purposes)
 */
export function cloneDenseField(field: DenseField): DenseField {
  switch (field.type) {
    case 'bool':
      return { ...field };

    case 'int':
      return { ...field } as IntField;

    case 'fixed':
      return { ...field } as FixedPointField;

    case 'enum':
      return {
        ...field,
        options: [...field.options]
      } as EnumField;

    case 'optional':
      const optField = field as OptionalField;
      return {
        ...field,
        field: cloneDenseField(optField.field)
      } as OptionalField;

    case 'array':
      const arrField = field as ArrayField;
      return {
        ...field,
        items: cloneDenseField(arrField.items)
      } as ArrayField;

    case 'enum_array':
      const enumArrField = field as EnumArrayField;
      return {
        ...field,
        enum: cloneDenseField(enumArrField.enum) as EnumField,
        defaultValue: [...enumArrField.defaultValue]
      } as EnumArrayField;

    case 'object':
      const objField = field as ObjectField;
      return {
        ...field,
        fields: objField.fields.map(cloneDenseField)
      } as ObjectField;

    case 'union':
      const unionField = field as UnionField;
      const clonedVariants: Record<string, DenseField[]> = {};
      Object.entries(unionField.variants).forEach(([key, variantFields]) => {
        clonedVariants[key] = variantFields.map(cloneDenseField);
      });
      return {
        ...field,
        discriminator: cloneDenseField(unionField.discriminator) as EnumField,
        variants: clonedVariants
      } as UnionField;

    case 'pointer':
      return { ...field } as PointerField;

    default:
      return field;
  }
}
