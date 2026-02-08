import { type DenseField } from 'densing';
import './FieldInput.css';

interface FieldInputProps {
  field: DenseField;
  value: any;
  onChange: (value: any) => void;
}

export const FieldInput = ({ field, value, onChange }: FieldInputProps) => {
  const renderInput = () => {
    switch (field.type) {
      case 'bool':
        return (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={value ?? field.defaultValue}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span className="checkbox-custom"></span>
            {value ? 'True' : 'False'}
          </label>
        );

      case 'int':
        return (
          <div className="number-input">
            <input
              type="number"
              min={field.min}
              max={field.max}
              value={value ?? field.defaultValue}
              onChange={(e) => onChange(parseInt(e.target.value, 10))}
            />
            <span className="range-info">
              Range: [{field.min}, {field.max}]
            </span>
          </div>
        );

      case 'fixed':
        return (
          <div className="number-input">
            <input
              type="number"
              min={field.min}
              max={field.max}
              step={field.precision}
              value={value ?? field.defaultValue}
              onChange={(e) => onChange(parseFloat(e.target.value))}
            />
            <span className="range-info">
              Range: [{field.min}, {field.max}], Precision: {field.precision}
            </span>
          </div>
        );

      case 'enum':
        return (
          <select
            value={value ?? field.defaultValue}
            onChange={(e) => onChange(e.target.value)}
          >
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
                <FieldInput
                  field={field.field}
                  value={value}
                  onChange={onChange}
                />
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
                    [subField.name]: newVal,
                  });
                }}
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

      case 'union':
        const discriminatorValue = value?.[field.discriminator.name] ?? field.discriminator.defaultValue;
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
                  value={value?.[variantField.name]}
                  onChange={(newVal) => {
                    onChange({
                      ...value,
                      [variantField.name]: newVal,
                    });
                  }}
                />
              ))}
            </div>
          </div>
        );

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
  if ('defaultValue' in field) {
    return field.defaultValue;
  }
  
  switch (field.type) {
    case 'bool':
      return false;
    case 'int':
      return field.min;
    case 'fixed':
      return field.min;
    case 'enum':
      return field.options[0];
    case 'array':
      return [];
    case 'enum_array':
      return [];
    case 'object':
      const obj: any = {};
      field.fields.forEach((f) => {
        obj[f.name] = getDefaultValue(f);
      });
      return obj;
    case 'union':
      const discriminatorValue = field.discriminator.defaultValue;
      const result: any = { [field.discriminator.name]: discriminatorValue };
      const variantFields = field.variants[discriminatorValue] ?? [];
      variantFields.forEach((f) => {
        result[f.name] = getDefaultValue(f);
      });
      return result;
    case 'optional':
      return null;
    default:
      return null;
  }
};
