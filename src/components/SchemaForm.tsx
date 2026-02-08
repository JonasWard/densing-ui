import { useState, useEffect } from 'react';
import { densing, validate, type DenseSchema, type DenseField } from 'densing';
import { FieldInput } from './FieldInput';
import './SchemaForm.css';

interface SchemaFormProps {
  schema: DenseSchema;
  data: any;
  onDataChange: (data: any) => void;
  onEncode: (encoded: string) => void;
}

export const SchemaForm = ({ schema, data, onDataChange, onEncode }: SchemaFormProps) => {
  const [validationErrors, setValidationErrors] = useState<Array<{ path: string; message: string }>>([]);

  const handleFieldChange = (fieldName: string, value: any) => {
    const newData = { ...data, [fieldName]: value };
    onDataChange(newData);
  };

  const handleEncode = () => {
    const validation = validate(schema, data);
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }
    
    setValidationErrors([]);
    try {
      const encoded = densing(schema, data);
      onEncode(encoded);
    } catch (error) {
      setValidationErrors([{ path: 'general', message: String(error) }]);
    }
  };

  // Auto-encode on data change
  useEffect(() => {
    const validation = validate(schema, data);
    if (validation.valid) {
      try {
        const encoded = densing(schema, data);
        onEncode(encoded);
        setValidationErrors([]);
      } catch (error) {
        // Silent fail for auto-encoding
      }
    } else {
      setValidationErrors(validation.errors);
    }
  }, [data, schema, onEncode]);

  return (
    <div className="schema-form">
      <h2>Schema Fields</h2>
      
      <div className="fields-container">
        {schema.fields.map((field: DenseField) => (
          <FieldInput
            key={field.name}
            field={field}
            value={data[field.name]}
            onChange={(value) => handleFieldChange(field.name, value)}
          />
        ))}
      </div>

      {validationErrors.length > 0 && (
        <div className="validation-errors">
          <h3>Validation Errors:</h3>
          <ul>
            {validationErrors.map((error, idx) => (
              <li key={idx}>
                <strong>{error.path}:</strong> {error.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button className="encode-button" onClick={handleEncode}>
        🔒 Encode Data
      </button>
    </div>
  );
};
