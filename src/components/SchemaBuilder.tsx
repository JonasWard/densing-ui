import { useState } from 'react';
import {
  schema,
  int,
  bool,
  fixed,
  enumeration,
  optional,
  array,
  enumArray,
  object,
  union,
  pointer,
  type DenseField,
  type DenseSchema,
  type IntField,
  type FixedPointField,
  type EnumField,
  type OptionalField,
  type ArrayField,
  type EnumArrayField,
  type ObjectField,
  type UnionField,
  type PointerField,
  type BoolField
} from 'densing';
import { encodeSchemaToBase64, decodeSchemaFromBase64 } from '../schemas/schema-codec-zstd';
import './SchemaBuilder.css';

interface SchemaBuilderProps {
  onSchemaCreated: (schema: DenseSchema, defaultData: any, name: string, DenseFields: DenseField[]) => void;
  onClose: () => void;
}

export const SchemaBuilder = ({ onSchemaCreated, onClose }: SchemaBuilderProps) => {
  const [schemaName, setSchemaName] = useState('Custom Schema');
  const [fields, setFields] = useState<DenseField[]>([]);
  const [editingField, setEditingField] = useState<DenseField | null>(null);

  // Generate a unique field name that doesn't conflict with existing fields
  const generateUniqueFieldName = (baseName: string = 'field'): string => {
    const existingNames = fields.map((f) => f.name);

    // Extract base name (part before the dash)
    const parts = baseName.split('-');
    const nameBase = parts[0];

    // Find the next available index
    let idx = 1;
    let candidateName = `${nameBase}-${idx}`;

    while (existingNames.includes(candidateName)) {
      idx++;
      candidateName = `${nameBase}-${idx}`;
    }

    return candidateName;
  };

  const addField = () => {
    const newField: BoolField = {
      name: generateUniqueFieldName('bool'),
      type: 'bool',
      defaultValue: false
    };
    setFields([...fields, newField]);
    setEditingField(newField);
  };

  const handleDownloadSchema = () => {
    const schemaData = {
      name: schemaName,
      fields: fields,
      version: '1.0'
    };

    const json = JSON.stringify(schemaData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${schemaName.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleUploadSchema = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const schemaData = JSON.parse(json);

        if (schemaData.fields && Array.isArray(schemaData.fields)) {
          setSchemaName(schemaData.name || 'Imported Schema');
          setFields(schemaData.fields);
          setEditingField(null);
        } else {
          alert('Invalid schema file format');
        }
      } catch (error) {
        alert('Error parsing schema file: ' + String(error));
      }
    };
    reader.readAsText(file);

    // Reset the input so the same file can be uploaded again
    event.target.value = '';
  };

  const handleCopyBase64 = async () => {
    if (fields.length === 0) {
      alert('Add at least one field before exporting');
      return;
    }

    try {
      const base64 = await encodeSchemaToBase64(schemaName, fields);
      const shareUrl = `${window.location.origin}${window.location.pathname}#/schema/${base64}`;

      await navigator.clipboard.writeText(shareUrl);
      alert(
        `Share URL copied to clipboard!\n\n` +
          `URL length: ${shareUrl.length} characters\n` +
          `Base64 size: ${base64.length} characters\n\n` +
          `Anyone with this link can open your schema in the builder!`
      );
    } catch (error) {
      alert('Error encoding schema: ' + String(error));
    }
  };

  const handlePasteBase64 = async () => {
    try {
      const base64 = await navigator.clipboard.readText();
      if (!base64.trim()) {
        alert('Clipboard is empty');
        return;
      }

      const { name, fields: importedFields } = await decodeSchemaFromBase64(base64.trim());
      setSchemaName(name);
      setFields(importedFields);
      setEditingField(null);
      alert(`Schema "${name}" imported successfully!\n\n${importedFields.length} field(s) loaded.`);
    } catch (error) {
      alert(
        'Error decoding schema from clipboard. Make sure you copied a valid schema base64 string.\n\n' + String(error)
      );
    }
  };

  const updateField = (name: string, updates: Partial<DenseField>) => {
    const updatedFields = fields.map((f) => (f.name === name ? ({ ...f, ...updates } as DenseField) : f));
    setFields(updatedFields);
    if (editingField?.name === name) {
      setEditingField({ ...editingField, ...updates } as DenseField);
    }
  };

  const removeField = (name: string) => {
    setFields(fields.filter((f) => f.name !== name));
    if (editingField?.name === name) {
      setEditingField(null);
    }
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...fields];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;
    [newFields[index], newFields[newIndex]] = [newFields[newIndex], newFields[index]];
    setFields(newFields);
  };

  const createDefaultField = <T extends DenseField['type']>(
    type: T,
    name: string = '',
    existingNames: string[] = []
  ): DenseField & { type: T } => {
    // Ensure unique name
    let uniqueName = name;
    if (!name) {
      // Use type as base name
      uniqueName = type;
    }

    // Extract base name (part before the dash if exists)
    const parts = uniqueName.split('-');
    const nameBase = parts[0];

    // Find next available index
    let idx = 1;
    let candidateName = `${nameBase}-${idx}`;

    while (existingNames.includes(candidateName)) {
      idx++;
      candidateName = `${nameBase}-${idx}`;
    }

    uniqueName = candidateName;

    switch (type) {
      case 'bool':
        return { type, name: uniqueName, defaultValue: false } as BoolField & { type: T };
      case 'int':
        return { type, name: uniqueName, min: 0, max: 100, defaultValue: 0 } as IntField & { type: T };
      case 'fixed':
        return { type, name: uniqueName, min: 0, max: 100, precision: 0.1, defaultValue: 0 } as FixedPointField & {
          type: T;
        };
      case 'enum':
        return { type, name: uniqueName, options: ['option1', 'option2'], defaultValue: 'option1' } as EnumField & {
          type: T;
        };
      case 'optional':
        return {
          type,
          name: uniqueName,
          field: createDefaultField('bool', '', existingNames)
        } as OptionalField & {
          type: T;
        };
      case 'array':
        return {
          type,
          name: uniqueName,
          minLength: 0,
          maxLength: 10,
          items: createDefaultField('int', '', existingNames)
        } as ArrayField & {
          type: T;
        };
      case 'enum_array':
        return {
          type,
          name: uniqueName,
          minLength: 0,
          maxLength: 10,
          enum: createDefaultField('enum', '', existingNames) as EnumField,
          defaultValue: []
        } as EnumArrayField & { type: T };
      case 'object':
        return {
          type,
          name: uniqueName,
          fields: [createDefaultField('bool', '', existingNames)]
        } as ObjectField & {
          type: T;
        };
      case 'union':
        return {
          type,
          name: uniqueName,
          discriminator: {
            ...createDefaultField('enum', '', existingNames),
            options: ['A', 'B'],
            defaultValue: 'A'
          } as EnumField,
          variants: {
            A: [createDefaultField('bool', '', existingNames)],
            B: [createDefaultField('int', '', existingNames)]
          }
        } as UnionField & { type: T };
      case 'pointer':
        return {
          type,
          name: uniqueName,
          targetName: '' // User will specify which field to point to
        } as PointerField & { type: T };
    }
  };

  const buildDenseField = (config: DenseField): DenseField => {
    switch (config.type) {
      case 'bool':
        return bool(config.name);
      case 'int':
        return int(config.name, config.min ?? 0, config.max ?? 100);
      case 'fixed':
        return fixed(config.name, config.min ?? 0, config.max ?? 100, config.precision ?? 0.1);
      case 'enum':
        return enumeration(config.name, config.options ?? ['option1', 'option2']);
      case 'optional':
        const optField = config as OptionalField;
        if (optField.field) {
          return optional(config.name, buildDenseField(optField.field));
        }
        return optional(config.name, bool('value'));
      case 'array':
        const arrayField = config as ArrayField;
        if (arrayField.items) {
          return array(
            config.name,
            arrayField.minLength ?? 0,
            arrayField.maxLength ?? 10,
            buildDenseField(arrayField.items)
          );
        }
        return array(config.name, 0, 10, int('item', 0, 100));
      case 'enum_array':
        const enumArrayField = config as EnumArrayField;
        if (enumArrayField.enum) {
          return enumArray(
            config.name,
            buildDenseField(enumArrayField.enum) as any,
            enumArrayField.minLength ?? 0,
            enumArrayField.maxLength ?? 10
          );
        }
        return enumArray(config.name, enumeration('item', ['A', 'B', 'C']), 0, 10);
      case 'object':
        const objectField = config as ObjectField;
        if (objectField.fields && objectField.fields.length > 0) {
          return object(config.name, ...objectField.fields.map(buildDenseField));
        }
        return object(config.name, bool('field1'));
      case 'union':
        const unionField = config as UnionField;
        if (unionField.discriminator && unionField.variants) {
          return union(
            config.name,
            unionField.discriminator,
            Object.fromEntries(
              Object.entries(unionField.variants).map(([key, fields]) => [key, fields.map(buildDenseField)])
            )
          );
        }
        return union(config.name, enumeration('type', ['A', 'B']), {
          A: [bool('fieldA')],
          B: [int('fieldB', 0, 100)]
        });
      case 'pointer':
        const pointerField = config as PointerField;
        return pointer(config.name, pointerField.targetName || 'root');
    }
  };

  const getDefaultValue = (config: DenseField): any => {
    switch (config.type) {
      case 'bool':
        return (config as BoolField).defaultValue ?? false;
      case 'int':
        return (config as IntField).defaultValue ?? (config as IntField).min ?? 0;
      case 'fixed':
        return (config as FixedPointField).defaultValue ?? (config as FixedPointField).min ?? 0;
      case 'enum':
        return (config as EnumField).defaultValue ?? (config as EnumField).options?.[0] ?? 'option1';
      case 'optional':
        return (config as OptionalField).defaultValue ?? null;
      case 'array':
      case 'enum_array':
        return (config as EnumArrayField).defaultValue ?? [];
      case 'object':
        const obj: any = {};
        const objectField = config as ObjectField;
        objectField.fields?.forEach((f) => {
          obj[f.name] = getDefaultValue(f);
        });
        return obj;
      case 'union':
        const unionField = config as UnionField;
        if (unionField.discriminator && unionField.variants) {
          const firstOption = unionField.discriminator.defaultValue ?? unionField.discriminator.options?.[0];
          if (firstOption) {
            const result: any = { [unionField.discriminator.name]: firstOption };
            const variantFields = unionField.variants[firstOption] ?? [];
            variantFields.forEach((f) => {
              result[f.name] = getDefaultValue(f);
            });
            return result;
          }
        }
        return {};
      case 'pointer':
        // Pointer fields reference other fields, so return a simple default
        return null;
      default:
        return null;
    }
  };

  const handleGenerate = () => {
    if (fields.length === 0) {
      alert('Please add at least one field');
      return;
    }

    try {
      const denseFields = fields.map(buildDenseField);
      const builtSchema = schema(...denseFields);

      const defaultData: any = {};
      fields.forEach((f) => {
        defaultData[f.name] = getDefaultValue(f);
      });

      onSchemaCreated(builtSchema, defaultData, schemaName, fields);
    } catch (error) {
      alert('Error creating schema: ' + String(error));
    }
  };

  return (
    <div className="schema-builder-overlay">
      <div className="schema-builder">
        <div className="schema-builder-header">
          <div>
            <h2>Schema Builder</h2>
            <div className="import-export-buttons">
              <label className="import-button">
                📥 Import JSON
                <input type="file" accept=".json" onChange={handleUploadSchema} style={{ display: 'none' }} />
              </label>
              <button className="export-button" onClick={handleDownloadSchema} disabled={fields.length === 0}>
                📤 Export JSON
              </button>
              <button
                className="base64-button"
                onClick={handleCopyBase64}
                disabled={fields.length === 0}
                title="Copy schema as compact base64 string"
              >
                🔗 Copy Base64
              </button>
              <button className="base64-button" onClick={handlePasteBase64} title="Paste base64 string from clipboard">
                📋 Paste Base64
              </button>
            </div>
          </div>
          <button className="close-button" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="schema-builder-content">
          <div className="schema-name-section">
            <label>Schema Name:</label>
            <input
              type="text"
              value={schemaName}
              onChange={(e) => setSchemaName(e.target.value)}
              placeholder="My Custom Schema"
            />
          </div>

          <div className="fields-section">
            <div className="fields-header">
              <h3>Fields</h3>
              <button className="add-field-button" onClick={addField}>
                + Add Field
              </button>
            </div>

            <div className="fields-list">
              {fields.map((field, index) => (
                <div
                  key={field.name}
                  className={`field-item ${editingField?.name === field.name ? 'active' : ''}`}
                  onClick={() => setEditingField(field)}
                >
                  <div className="field-item-info">
                    <span className="field-item-name">{field.name}</span>
                    <span className="field-item-type">{field.type}</span>
                  </div>
                  <div className="field-item-actions">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveField(index, 'up');
                      }}
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        moveField(index, 'down');
                      }}
                      disabled={index === fields.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeField(field.name);
                      }}
                      className="remove-button"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}

              {fields.length === 0 && (
                <div className="empty-state">No fields yet. Click "Add Field" to get started.</div>
              )}
            </div>
          </div>
          {editingField && (
            <FieldEditor
              field={editingField}
              onChange={(updated) => updateField(editingField.name, updated)}
              createDefaultField={createDefaultField}
              allFields={fields}
            />
          )}
        </div>

        <div className="schema-builder-footer">
          <button className="cancel-button" onClick={onClose}>
            Cancel
          </button>
          <button className="generate-button" onClick={handleGenerate} disabled={fields.length === 0}>
            Generate Schema
          </button>
        </div>
      </div>
    </div>
  );
};

// Separate component for editing a field
const FieldEditor = ({
  field,
  onChange,
  createDefaultField,
  allFields
}: {
  field: DenseField;
  onChange: (field: Partial<DenseField>) => void;
  createDefaultField: (type: DenseField['type'], name?: string, existingNames?: string[]) => DenseField;
  allFields: DenseField[];
}) => {
  // Validate field name uniqueness
  const validateFieldName = (newName: string): boolean => {
    if (!newName.trim()) {
      alert('Field name cannot be empty');
      return false;
    }
    if (newName !== field.name && allFields.some((f) => f.name === newName)) {
      alert(`Field name "${newName}" already exists. Please use a unique name.`);
      return false;
    }
    return true;
  };

  const existingNames = allFields.map((f) => f.name);

  return (
    <div className="field-editor">
      <h3>Edit Field</h3>

      <div className="field-name-type-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label>Field Name:</label>
          <input
            type="text"
            value={field.name}
            onChange={(e) => {
              if (validateFieldName(e.target.value)) {
                onChange({ name: e.target.value });
              }
            }}
            onBlur={(e) => {
              if (!validateFieldName(e.target.value)) {
                // Revert to original name if invalid
                e.target.value = field.name;
              }
            }}
            placeholder="fieldName"
          />
        </div>
      </div>

      <div className="form-group">
        <label>Field Type:</label>
        <div className="type-radio-grid">
          {[
            { value: 'bool', label: 'Boolean' },
            { value: 'int', label: 'Integer' },
            { value: 'fixed', label: 'Fixed' },
            { value: 'enum', label: 'Enum' },
            { value: 'optional', label: 'Optional' },
            { value: 'array', label: 'Array' },
            { value: 'enum_array', label: 'Enum Array' },
            { value: 'object', label: 'Object' },
            { value: 'union', label: 'Union' },
            { value: 'pointer', label: 'Pointer' }
          ].map(({ value, label }) => (
            <label key={value} className="type-radio-option">
              <input
                type="radio"
                name={`field-type-${field.name}`}
                value={value}
                checked={field.type === value}
                onChange={(e) => {
                  const newType = e.target.value as DenseField['type'];
                  const newField = createDefaultField(newType, field.name, existingNames);
                  onChange(newField);
                }}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {(field.type === 'int' || field.type === 'fixed') && (
        <>
          <div className="form-group">
            <label>Min Value:</label>
            <input
              type="number"
              value={field.min ?? 0}
              onChange={(e) => onChange({ min: parseFloat(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>Max Value:</label>
            <input
              type="number"
              value={field.max ?? 100}
              onChange={(e) => onChange({ max: parseFloat(e.target.value) })}
            />
          </div>
        </>
      )}

      {field.type === 'fixed' && (
        <div className="form-group">
          <label>Precision:</label>
          <input
            type="number"
            step="0.01"
            value={field.precision ?? 0.1}
            onChange={(e) => onChange({ precision: parseFloat(e.target.value) })}
          />
        </div>
      )}

      {field.type === 'enum' && (
        <div className="form-group">
          <label>Options (comma-separated):</label>
          <input
            type="text"
            defaultValue={field.options?.join(', ') ?? 'option1, option2'}
            onBlur={(e) =>
              onChange({
                options: e.target.value
                  .split(',')
                  .map((o) => o.trim())
                  .filter(Boolean)
              })
            }
            placeholder="option1, option2, option3"
          />
        </div>
      )}

      {(field.type === 'array' || field.type === 'enum_array') && (
        <>
          <div className="form-group">
            <label>Min Length:</label>
            <input
              type="number"
              value={field.minLength ?? 0}
              onChange={(e) => onChange({ minLength: parseInt(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>Max Length:</label>
            <input
              type="number"
              value={field.maxLength ?? 10}
              onChange={(e) => onChange({ maxLength: parseInt(e.target.value) })}
            />
          </div>
        </>
      )}

      {field.type === 'optional' && (field as OptionalField).field && (
        <NestedDenseField
          title="Wrapped Field"
          field={(field as OptionalField).field}
          onChange={(updated) => onChange({ field: updated })}
          createDefaultField={createDefaultField}
          existingNames={existingNames}
        />
      )}

      {field.type === 'array' && (field as ArrayField).items && (
        <NestedDenseField
          title="Array Item Type"
          field={(field as ArrayField).items}
          onChange={(updated) => onChange({ items: updated })}
          createDefaultField={createDefaultField}
          existingNames={existingNames}
        />
      )}

      {field.type === 'enum_array' && (field as EnumArrayField).enum && (
        <div className="nested-config">
          <h4>Enum Configuration:</h4>
          <div className="form-group">
            <label>Options (comma-separated):</label>
            <input
              type="text"
              defaultValue={((field as EnumArrayField).enum as EnumField).options?.join(', ') ?? 'A, B, C'}
              onBlur={(e) => {
                const updated: EnumField = {
                  ...(field as EnumArrayField).enum!,
                  options: e.target.value
                    .split(',')
                    .map((o) => o.trim())
                    .filter(Boolean)
                };
                onChange({ enum: updated });
              }}
              placeholder="A, B, C"
            />
          </div>
        </div>
      )}

      {field.type === 'object' && (
        <ObjectFieldsConfig
          fields={(field as ObjectField).fields ?? []}
          onChange={(updated) => onChange({ fields: updated })}
          createDefaultField={createDefaultField}
          parentFieldNames={existingNames}
        />
      )}

      {field.type === 'union' && (field as UnionField).discriminator && (field as UnionField).variants && (
        <UnionConfig
          discriminator={(field as UnionField).discriminator}
          variants={(field as UnionField).variants}
          onChange={(discriminator, variants) => onChange({ discriminator, variants })}
          createDefaultField={createDefaultField}
          parentFieldNames={existingNames}
        />
      )}

      {field.type === 'pointer' && (
        <div className="pointer-config">
          <label>
            <span className="label">Target Field Name:</span>
            <input
              type="text"
              value={(field as PointerField).targetName || ''}
              onChange={(e) => onChange({ targetName: e.target.value })}
              placeholder="Enter field name to reference"
              className="input"
            />
          </label>
          <p className="hint">Enter the name of another field to create a recursive reference</p>
        </div>
      )}
    </div>
  );
};

// Component for configuring nested fields (optional, array items)
const NestedDenseField = ({
  title,
  field,
  onChange,
  createDefaultField,
  existingNames: _existingNames
}: {
  title: string;
  field: DenseField;
  onChange: (field: DenseField) => void;
  createDefaultField: (type: DenseField['type'], name?: string, existingNames?: string[]) => DenseField;
  existingNames: string[];
}) => {
  return (
    <div className="nested-config">
      <h4>{title}:</h4>
      <FieldEditor
        field={field}
        onChange={(updates) => onChange({ ...field, ...updates } as DenseField)}
        createDefaultField={createDefaultField}
        allFields={[field]} // For nested fields, only check against itself
      />
    </div>
  );
};

// Component for object fields configuration
const ObjectFieldsConfig = ({
  fields,
  onChange,
  createDefaultField
}: {
  fields: DenseField[];
  onChange: (fields: DenseField[]) => void;
  createDefaultField: (type: DenseField['type'], name?: string, existingNames?: string[]) => DenseField;
  parentFieldNames: string[];
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const existingNames = fields.map((f) => f.name);

  const addField = () => {
    const newField = createDefaultField('bool', '', existingNames);
    onChange([...fields, newField]);
    setEditingIndex(fields.length);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  return (
    <div className="nested-config">
      <div className="object-fields-header">
        <h4>Object Fields:</h4>
        <button className="add-nested-button" onClick={addField}>
          + Add Field
        </button>
      </div>

      <div className="object-fields-list">
        {fields.map((field, index) => (
          <div key={field.name} className="object-field-item">
            <div
              className="object-field-summary"
              onClick={() => setEditingIndex(editingIndex === index ? null : index)}
            >
              <span>
                {field.name} ({field.type})
              </span>
              <div className="object-field-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeField(index);
                  }}
                >
                  ×
                </button>
              </div>
            </div>
            {editingIndex === index && (
              <div className="object-field-details">
                <FieldEditor
                  field={field}
                  onChange={(updates) => {
                    const updated = [...fields];
                    updated[index] = { ...field, ...updates } as DenseField;
                    onChange(updated);
                  }}
                  createDefaultField={createDefaultField}
                  allFields={fields}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Component for union configuration
const UnionConfig = ({
  discriminator,
  variants,
  onChange,
  createDefaultField
}: {
  discriminator: EnumField;
  variants: Record<string, DenseField[]>;
  onChange: (discriminator: EnumField, variants: Record<string, DenseField[]>) => void;
  createDefaultField: (type: DenseField['type'], name?: string, existingNames?: string[]) => DenseField;
  parentFieldNames: string[];
}) => {
  const [editingVariant, setEditingVariant] = useState<string | null>(null);

  const updateDiscriminator = (options: string[]) => {
    const newVariants: Record<string, DenseField[]> = {};
    const allVariantFieldNames = Object.values(variants)
      .flat()
      .map((f) => f.name);
    options.forEach((option) => {
      newVariants[option] = variants[option] ?? [createDefaultField('bool', '', allVariantFieldNames)];
    });
    onChange({ ...discriminator, options } as EnumField, newVariants);
  };

  const updateVariantFields = (variantKey: string, fields: DenseField[]) => {
    onChange(discriminator, { ...variants, [variantKey]: fields });
  };

  return (
    <div className="nested-config">
      <h4>Union Configuration:</h4>

      <div className="form-group">
        <label>Discriminator Name:</label>
        <input
          type="text"
          value={discriminator.name}
          onChange={(e) => onChange({ ...discriminator, name: e.target.value } as EnumField, variants)}
        />
      </div>

      <div className="form-group">
        <label>Variant Options (comma-separated):</label>
        <input
          type="text"
          key={discriminator.options?.join(',')}
          defaultValue={discriminator.options?.join(', ') ?? ''}
          onBlur={(e) => {
            const options = e.target.value
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean);
            updateDiscriminator(options);
          }}
          placeholder="A, B, C"
        />
      </div>

      <div className="union-variants">
        <h5>Variant Fields:</h5>
        {discriminator.options?.map((option) => (
          <div key={option} className="union-variant">
            <div
              className="variant-header"
              onClick={() => setEditingVariant(editingVariant === option ? null : option)}
            >
              <span>
                When {discriminator.name} = "{option}":
              </span>
              <span className="variant-field-count">{variants[option]?.length ?? 0} field(s)</span>
            </div>
            {editingVariant === option && (
              <ObjectFieldsConfig
                fields={variants[option] ?? []}
                onChange={(fields) => updateVariantFields(option, fields)}
                createDefaultField={createDefaultField}
                parentFieldNames={[
                  discriminator.name,
                  ...Object.values(variants)
                    .flat()
                    .map((f) => f.name)
                ]}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
