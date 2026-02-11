import { useState, useEffect } from 'react';
import { validateField, type IntField, type FixedPointField, type ValidationError } from 'densing';

interface NumericInputProps {
  field: IntField | FixedPointField;
  value: number;
  onChange: (value: number) => void;
}

export const NumericInput = ({ field, value, onChange }: NumericInputProps) => {
  const [internalValue, setInternalValue] = useState<string>(String(value ?? field.defaultValue));

  // Update internal value when external value changes
  useEffect(() => {
    setInternalValue(String(value ?? field.defaultValue));
  }, [value, field.defaultValue]);

  const handleCommit = () => {
    const parsed = field.type === 'int' ? parseInt(internalValue, 10) : parseFloat(internalValue);

    if (isNaN(parsed)) {
      // Reset to current value if invalid
      setInternalValue(String(value ?? field.defaultValue));
      return;
    }

    // Validate using densing's validateField
    const errors: ValidationError[] = [];
    validateField(field, parsed, field.name, errors);

    if (errors.length === 0) {
      // Value is valid
      onChange(parsed);
    } else {
      // If validation fails, clamp to valid range
      let clamped = parsed;
      if (field.type === 'int' || field.type === 'fixed') {
        clamped = Math.max(field.min, Math.min(field.max, parsed));
      }

      // For fixed point, also round to precision
      if (field.type === 'fixed') {
        clamped = Math.round(clamped / field.precision) * field.precision;
      }

      setInternalValue(String(clamped));
      onChange(clamped);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommit();
      e.currentTarget.blur();
    }
  };

  return (
    <div className="number-input">
      <input
        type="number"
        min={field.min}
        max={field.max}
        step={field.type === 'fixed' ? field.precision : 1}
        value={internalValue}
        onChange={(e) => setInternalValue(e.target.value)}
        onBlur={handleCommit}
        onKeyDown={handleKeyDown}
      />
      <span className="range-info">
        Range: [{field.min}, {field.max}]{field.type === 'fixed' && `, Precision: ${field.precision}`}
      </span>
    </div>
  );
};
