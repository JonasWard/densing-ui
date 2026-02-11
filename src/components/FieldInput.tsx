import { useEffect } from 'react';
import {
  type DenseField,
  type IntField,
  type FixedPointField,
  type EnumField,
  type ObjectField,
  type UnionField,
  type DenseSchema
} from 'densing';
import { NumericInput } from './NumericInput';
import './FieldInput.css';

interface FieldInputProps {
  field: DenseField;
  value: any;
  onChange: (value: any) => void;
  schema?: DenseSchema; // Optional: for pointer fields to reference sibling fields
}

export const FieldInput = ({ field, value, onChange, schema }: FieldInputProps) => {
  // Initialize union fields properly
  useEffect(() => {
    if (field.type === 'union') {
      const currentValue = value || {};
      const discriminatorValue = currentValue[field.discriminator.name] ?? field.discriminator.defaultValue;

      // If value doesn't have the discriminator or variant fields, initialize it
      if (!currentValue[field.discriminator.name]) {
        const variantFields = field.variants[discriminatorValue] ?? [];
        const initialValue: any = { [field.discriminator.name]: discriminatorValue };
        variantFields.forEach((variantField) => {
          initialValue[variantField.name] = getDefaultValue(variantField);
        });
        onChange(initialValue);
      }
    }
  }, [field, value, onChange]);

  const renderInput = () => {
    switch (field.type) {
      case 'bool':
        return (
          <label className="checkbox-label">
            <input type="checkbox" checked={value ?? field.defaultValue} onChange={(e) => onChange(e.target.checked)} />
            <span className="checkbox-custom"></span>
            {value ? 'True' : 'False'}
          </label>
        );

      case 'int':
        return <NumericInput field={field as IntField} value={value} onChange={onChange} />;

      case 'fixed':
        return <NumericInput field={field as FixedPointField} value={value} onChange={onChange} />;

      case 'enum':
        return (
          <select value={value ?? field.defaultValue} onChange={(e) => onChange(e.target.value)}>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'optional':
        const isPresent = value !== null && value !== undefined;
        return (
          <div className="optional-field">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={isPresent}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange(getDefaultValue(field.field));
                  } else {
                    onChange(null);
                  }
                }}
              />
              <span className="checkbox-custom"></span>
              Present
            </label>
            {isPresent && (
              <div className="nested-field">
                <FieldInput field={field.field} value={value} onChange={onChange} schema={schema} />
              </div>
            )}
          </div>
        );

      case 'object':
        return (
          <div className="object-field">
            {field.fields.map((subField) => (
              <FieldInput
                key={subField.name}
                field={subField}
                value={value?.[subField.name]}
                onChange={(newVal) => {
                  onChange({
                    ...value,
                    [subField.name]: newVal
                  });
                }}
                schema={schema}
              />
            ))}
          </div>
        );

      case 'array':
        const arrayValue = value ?? [];
        return (
          <div className="array-field">
            <div className="array-controls">
              <button
                onClick={() => {
                  if (arrayValue.length < field.maxLength) {
                    onChange([...arrayValue, getDefaultValue(field.items)]);
                  }
                }}
                disabled={arrayValue.length >= field.maxLength}
              >
                + Add Item
              </button>
              <span className="array-info">
                {arrayValue.length} / {field.maxLength} items
              </span>
            </div>
            {arrayValue.map((item: any, idx: number) => (
              <div key={idx} className="array-item">
                <span className="array-index">#{idx + 1}</span>
                <FieldInput
                  field={field.items}
                  value={item}
                  onChange={(newVal) => {
                    const newArray = [...arrayValue];
                    newArray[idx] = newVal;
                    onChange(newArray);
                  }}
                  schema={schema}
                />
                <button
                  className="remove-button"
                  onClick={() => {
                    const newArray = arrayValue.filter((_: any, i: number) => i !== idx);
                    onChange(newArray);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        );

      case 'enum_array':
        const enumArrayValue = value ?? field.defaultValue ?? [];
        return (
          <div className="array-field">
            <div className="array-controls">
              <button
                onClick={() => {
                  if (enumArrayValue.length < field.maxLength) {
                    onChange([...enumArrayValue, field.enum.defaultValue]);
                  }
                }}
                disabled={enumArrayValue.length >= field.maxLength}
              >
                + Add Item
              </button>
              <span className="array-info">
                {enumArrayValue.length} / {field.maxLength} items
              </span>
            </div>
            {enumArrayValue.map((item: any, idx: number) => (
              <div key={idx} className="array-item">
                <span className="array-index">#{idx + 1}</span>
                <select
                  value={item}
                  onChange={(e) => {
                    const newArray = [...enumArrayValue];
                    newArray[idx] = e.target.value;
                    onChange(newArray);
                  }}
                >
                  {field.enum.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <button
                  className="remove-button"
                  onClick={() => {
                    const newArray = enumArrayValue.filter((_: any, i: number) => i !== idx);
                    onChange(newArray);
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        );

      case 'union': {
        // Ensure value is properly initialized
        const currentValue = value || {};
        const discriminatorValue = currentValue[field.discriminator.name] ?? field.discriminator.defaultValue;
        const variantFields = field.variants[discriminatorValue] ?? [];

        return (
          <div className="union-field">
            <div className="discriminator">
              <label>Type:</label>
              <select
                value={discriminatorValue}
                onChange={(e) => {
                  const newValue = { [field.discriminator.name]: e.target.value };
                  const newVariantFields = field.variants[e.target.value] ?? [];
                  newVariantFields.forEach((variantField) => {
                    newValue[variantField.name] = getDefaultValue(variantField);
                  });
                  onChange(newValue);
                }}
              >
                {field.discriminator.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="variant-fields">
              {variantFields.map((variantField) => (
                <FieldInput
                  key={variantField.name}
                  field={variantField}
                  value={currentValue[variantField.name]}
                  onChange={(newVal) => {
                    onChange({
                      ...currentValue,
                      [variantField.name]: newVal
                    });
                  }}
                  schema={schema}
                />
              ))}
            </div>
          </div>
        );
      }

      case 'pointer': {
        // Get the target field from the schema
        const targetName = (field as any).targetName || '';
        const targetField = schema?.fields?.find((f) => f.name === targetName);

        if (!targetField) {
          return (
            <div className="pointer-info">
              <span className="info-text">🔄 Pointer references "{targetName}" but field not found</span>
            </div>
          );
        }

        // Render the input for the target field type
        // The pointer acts as a recursive reference in the schema, but in the UI
        // we render it as if it were the target field
        return (
          <div className="pointer-field">
            <span className="pointer-label">🔄 References: {targetName}</span>
            <FieldInput field={targetField} value={value} onChange={onChange} schema={schema} />
          </div>
        );
      }

      default:
        return <div className="unsupported">Unsupported field type: {(field as any).type}</div>;
    }
  };

  return (
    <div className="field-input">
      <label className="field-label">
        <span className="field-name">{field.name}</span>
        <span className="field-type">{field.type}</span>
      </label>
      <div className="field-control">{renderInput()}</div>
    </div>
  );
};

const getDefaultValue = (field: DenseField): any => {
  switch (field.type) {
    case 'bool':
      return false;
    case 'int':
      return (field as IntField).min;
    case 'fixed':
      return (field as FixedPointField).min;
    case 'enum':
      return (field as EnumField).options[0];
    case 'array':
      return [];
    case 'enum_array':
      return [];
    case 'object': {
      const objectField = field as ObjectField;
      const obj: any = {};
      objectField.fields.forEach((f) => {
        obj[f.name] = getDefaultValue(f);
      });
      return obj;
    }
    case 'union': {
      const unionField = field as UnionField;
      const discriminatorValue = unionField.discriminator.defaultValue;
      const result: any = { [unionField.discriminator.name]: discriminatorValue };
      const variantFields = unionField.variants[discriminatorValue] ?? [];
      variantFields.forEach((f) => {
        result[f.name] = getDefaultValue(f);
      });
      return result;
    }
    case 'optional':
      return null;
    default:
      return null;
  }
};
