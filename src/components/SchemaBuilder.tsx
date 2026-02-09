import { useState } from 'react';
import { schema, int, bool, fixed, enumeration, optional, array, enumArray, object, union, createRecursiveUnion, type DenseField, type DenseSchema } from 'densing';
import './SchemaBuilder.css';

interface FieldConfig {
  id: string;
  name: string;
  type: 'bool' | 'int' | 'fixed' | 'enum' | 'optional' | 'array' | 'enum_array' | 'object' | 'union' | 'recursive_union';
  // For int and fixed
  min?: number;
  max?: number;
  precision?: number;
  // For enum
  options?: string[];
  // For optional, array
  wrappedField?: FieldConfig;
  // For array
  minLength?: number;
  maxLength?: number;
  // For enum_array
  enumField?: FieldConfig;
  // For object
  fields?: FieldConfig[];
  // For union
  discriminatorField?: FieldConfig;
  variants?: Record<string, FieldConfig[]>;
  // For recursive_union
  maxDepth?: number;
  recursiveVariants?: Record<string, FieldConfig[]>; // Fields that can use 'recurse'
}

interface SchemaBuilderProps {
  onSchemaCreated: (schema: DenseSchema, defaultData: any, name: string) => void;
  onClose: () => void;
}

export const SchemaBuilder = ({ onSchemaCreated, onClose }: SchemaBuilderProps) => {
  const [schemaName, setSchemaName] = useState('Custom Schema');
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [editingField, setEditingField] = useState<FieldConfig | null>(null);

  const addField = () => {
    const newField: FieldConfig = {
      id: Date.now().toString(),
      name: `field${fields.length + 1}`,
      type: 'bool',
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

  const updateField = (id: string, updates: Partial<FieldConfig>) => {
    const updatedFields = fields.map(f => f.id === id ? { ...f, ...updates } : f);
    setFields(updatedFields);
    if (editingField?.id === id) {
      setEditingField({ ...editingField, ...updates });
    }
  };

  const removeField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
    if (editingField?.id === id) {
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

  const createDefaultField = (type: FieldConfig['type'], name: string = 'field'): FieldConfig => {
    const baseField: FieldConfig = {
      id: Date.now().toString() + Math.random(),
      name: name,
      type: type,
    };
    
    switch (type) {
      case 'int':
        return { ...baseField, min: 0, max: 100 };
      case 'fixed':
        return { ...baseField, min: 0, max: 100, precision: 0.1 };
      case 'enum':
        return { ...baseField, options: ['option1', 'option2'] };
      case 'optional':
        return { ...baseField, wrappedField: createDefaultField('bool', 'value') };
      case 'array':
        return { ...baseField, minLength: 0, maxLength: 10, wrappedField: createDefaultField('int', 'item') };
      case 'enum_array':
        return { ...baseField, minLength: 0, maxLength: 10, enumField: createDefaultField('enum', 'item') };
      case 'object':
        return { ...baseField, fields: [createDefaultField('bool', 'field1')] };
      case 'union':
        return {
          ...baseField,
          discriminatorField: { ...createDefaultField('enum', 'type'), options: ['A', 'B'] },
          variants: {
            'A': [createDefaultField('bool', 'fieldA')],
            'B': [createDefaultField('int', 'fieldB')]
          }
        };
      case 'recursive_union':
        return {
          ...baseField,
          options: ['leaf', 'branch'],
          maxDepth: 3,
          recursiveVariants: {
            'leaf': [createDefaultField('int', 'value')],
            'branch': [] // Will be filled with recursive references in UI
          }
        };
      default:
        return baseField;
    }
  };

  const buildDenseField = (config: FieldConfig): DenseField => {
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
        if (config.wrappedField) {
          return optional(config.name, buildDenseField(config.wrappedField));
        }
        return optional(config.name, bool('value'));
      case 'array':
        if (config.wrappedField) {
          return array(
            config.name,
            config.minLength ?? 0,
            config.maxLength ?? 10,
            buildDenseField(config.wrappedField)
          );
        }
        return array(config.name, 0, 10, int('item', 0, 100));
      case 'enum_array':
        if (config.enumField) {
          return enumArray(
            config.name,
            buildDenseField(config.enumField) as any,
            config.minLength ?? 0,
            config.maxLength ?? 10
          );
        }
        return enumArray(config.name, enumeration('item', ['A', 'B', 'C']), 0, 10);
      case 'object':
        if (config.fields && config.fields.length > 0) {
          return object(config.name, ...config.fields.map(buildDenseField));
        }
        return object(config.name, bool('field1'));
      case 'union':
        if (config.discriminatorField && config.variants) {
          const discriminator = buildDenseField(config.discriminatorField) as any;
          const variantMap: Record<string, DenseField[]> = {};
          Object.entries(config.variants).forEach(([key, fields]) => {
            variantMap[key] = fields.map(buildDenseField);
          });
          return union(config.name, discriminator, variantMap);
        }
        return union(config.name, enumeration('type', ['A', 'B']), {
          A: [bool('fieldA')],
          B: [int('fieldB', 0, 100)]
        });
      case 'recursive_union':
        if (config.options && config.recursiveVariants) {
          return createRecursiveUnion(
            config.name,
            config.options,
            (recurse) => {
              const variantMap: Record<string, DenseField[]> = {};
              Object.entries(config.recursiveVariants!).forEach(([key, fields]) => {
                variantMap[key] = fields.map(fieldConfig => {
                  // Check if this is a special "recurse" marker field
                  if (fieldConfig.type === 'object' && fieldConfig.name === '__recurse__') {
                    return recurse(fieldConfig.fields?.[0]?.name ?? 'child');
                  }
                  return buildDenseField(fieldConfig);
                });
              });
              return variantMap;
            },
            config.maxDepth ?? 3
          );
        }
        return createRecursiveUnion(
          config.name,
          ['leaf', 'branch'],
          (recurse) => ({
            leaf: [int('value', 0, 100)],
            branch: [recurse('left'), recurse('right')]
          }),
          3
        );
      default:
        return bool(config.name);
    }
  };

  const getDefaultValue = (config: FieldConfig): any => {
    switch (config.type) {
      case 'bool':
        return false;
      case 'int':
        return config.min ?? 0;
      case 'fixed':
        return config.min ?? 0;
      case 'enum':
        return config.options?.[0] ?? 'option1';
      case 'optional':
        return null;
      case 'array':
      case 'enum_array':
        return [];
      case 'object':
        const obj: any = {};
        config.fields?.forEach(f => {
          obj[f.name] = getDefaultValue(f);
        });
        return obj;
      case 'union':
        if (config.discriminatorField && config.variants) {
          const firstOption = config.discriminatorField.options?.[0];
          if (firstOption) {
            const result: any = { [config.discriminatorField.name]: firstOption };
            const variantFields = config.variants[firstOption] ?? [];
            variantFields.forEach(f => {
              result[f.name] = getDefaultValue(f);
            });
            return result;
          }
        }
        return {};
      case 'recursive_union':
        if (config.options && config.recursiveVariants) {
          const firstOption = config.options[0];
          if (firstOption) {
            const result: any = { type: firstOption };
            const variantFields = config.recursiveVariants[firstOption] ?? [];
            variantFields.forEach(f => {
              // Skip recurse markers in default value
              if (f.type === 'object' && f.name === '__recurse__') {
                return;
              }
              result[f.name] = getDefaultValue(f);
            });
            return result;
          }
        }
        return { type: 'leaf', value: 0 };
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
      fields.forEach(f => {
        defaultData[f.name] = getDefaultValue(f);
      });

      onSchemaCreated(builtSchema, defaultData, schemaName);
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
                <input
                  type="file"
                  accept=".json"
                  onChange={handleUploadSchema}
                  style={{ display: 'none' }}
                />
              </label>
              <button 
                className="export-button" 
                onClick={handleDownloadSchema}
                disabled={fields.length === 0}
              >
                📤 Export JSON
              </button>
            </div>
          </div>
          <button className="close-button" onClick={onClose}>×</button>
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
              <button className="add-field-button" onClick={addField}>+ Add Field</button>
            </div>

            <div className="fields-list">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className={`field-item ${editingField?.id === field.id ? 'active' : ''}`}
                  onClick={() => setEditingField(field)}
                >
                  <div className="field-item-info">
                    <span className="field-item-name">{field.name}</span>
                    <span className="field-item-type">{field.type}</span>
                  </div>
                  <div className="field-item-actions">
                    <button
                      onClick={(e) => { e.stopPropagation(); moveField(index, 'up'); }}
                      disabled={index === 0}
                    >
                      ↑
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); moveField(index, 'down'); }}
                      disabled={index === fields.length - 1}
                    >
                      ↓
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeField(field.id); }}
                      className="remove-button"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}

              {fields.length === 0 && (
                <div className="empty-state">
                  No fields yet. Click "Add Field" to get started.
                </div>
              )}
            </div>
          </div>

          {editingField && (
            <FieldEditor
              field={editingField}
              onChange={(updated) => updateField(editingField.id, updated)}
              createDefaultField={createDefaultField}
            />
          )}
        </div>

        <div className="schema-builder-footer">
          <button className="cancel-button" onClick={onClose}>Cancel</button>
          <button 
            className="generate-button" 
            onClick={handleGenerate}
            disabled={fields.length === 0}
          >
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
  createDefaultField 
}: { 
  field: FieldConfig; 
  onChange: (field: Partial<FieldConfig>) => void;
  createDefaultField: (type: FieldConfig['type'], name?: string) => FieldConfig;
}) => {
  return (
    <div className="field-editor">
      <h3>Edit Field</h3>

      <div className="field-name-type-row">
        <div className="form-group" style={{ flex: 1 }}>
          <label>Field Name:</label>
          <input
            type="text"
            value={field.name}
            onChange={(e) => onChange({ name: e.target.value })}
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
            { value: 'recursive_union', label: 'Recursive' }
          ].map(({ value, label }) => (
            <label key={value} className="type-radio-option">
              <input
                type="radio"
                name={`field-type-${field.id}`}
                value={value}
                checked={field.type === value}
                onChange={(e) => {
                  const newType = e.target.value as FieldConfig['type'];
                  const newField = createDefaultField(newType, field.name);
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

      {field.type === 'optional' && field.wrappedField && (
        <NestedFieldConfig
          title="Wrapped Field"
          field={field.wrappedField}
          onChange={(updated) => onChange({ wrappedField: updated })}
          createDefaultField={createDefaultField}
        />
      )}

      {field.type === 'array' && field.wrappedField && (
        <NestedFieldConfig
          title="Array Item Type"
          field={field.wrappedField}
          onChange={(updated) => onChange({ wrappedField: updated })}
          createDefaultField={createDefaultField}
        />
      )}

      {field.type === 'enum_array' && field.enumField && (
        <div className="nested-config">
          <h4>Enum Configuration:</h4>
          <div className="form-group">
            <label>Options (comma-separated):</label>
            <input
              type="text"
              defaultValue={field.enumField.options?.join(', ') ?? 'A, B, C'}
              onBlur={(e) => {
                const updated = {
                  ...field.enumField!,
                  options: e.target.value
                    .split(',')
                    .map((o) => o.trim())
                    .filter(Boolean)
                };
                onChange({ enumField: updated });
              }}
              placeholder="A, B, C"
            />
          </div>
        </div>
      )}

      {field.type === 'object' && (
        <ObjectFieldsConfig
          fields={field.fields ?? []}
          onChange={(updated) => onChange({ fields: updated })}
          createDefaultField={createDefaultField}
        />
      )}

      {field.type === 'union' && field.discriminatorField && field.variants && (
        <UnionConfig
          discriminatorField={field.discriminatorField}
          variants={field.variants}
          onChange={(discriminator, variants) => onChange({ discriminatorField: discriminator, variants })}
          createDefaultField={createDefaultField}
        />
      )}

      {field.type === 'recursive_union' && (
        <RecursiveUnionConfig
          options={field.options ?? []}
          recursiveVariants={field.recursiveVariants ?? {}}
          maxDepth={field.maxDepth ?? 3}
          onChange={(options, recursiveVariants, maxDepth) => onChange({ options, recursiveVariants, maxDepth })}
          createDefaultField={createDefaultField}
        />
      )}
    </div>
  );
};

// Component for configuring nested fields (optional, array items)
const NestedFieldConfig = ({ 
  title,
  field, 
  onChange,
  createDefaultField
}: { 
  title: string;
  field: FieldConfig; 
  onChange: (field: FieldConfig) => void;
  createDefaultField: (type: FieldConfig['type'], name?: string) => FieldConfig;
}) => {
  return (
    <div className="nested-config">
      <h4>{title}:</h4>
      <FieldEditor
        field={field}
        onChange={(updates) => onChange({ ...field, ...updates })}
        createDefaultField={createDefaultField}
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
  fields: FieldConfig[];
  onChange: (fields: FieldConfig[]) => void;
  createDefaultField: (type: FieldConfig['type'], name?: string) => FieldConfig;
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const addField = () => {
    const newField = createDefaultField('bool', `field${fields.length + 1}`);
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
        <button className="add-nested-button" onClick={addField}>+ Add Field</button>
      </div>
      
      <div className="object-fields-list">
        {fields.map((field, index) => (
          <div key={field.id} className="object-field-item">
            <div 
              className="object-field-summary"
              onClick={() => setEditingIndex(editingIndex === index ? null : index)}
            >
              <span>{field.name} ({field.type})</span>
              <div className="object-field-actions">
                <button onClick={(e) => { e.stopPropagation(); removeField(index); }}>×</button>
              </div>
            </div>
            {editingIndex === index && (
              <div className="object-field-details">
                <FieldEditor
                  field={field}
                  onChange={(updates) => {
                    const updated = [...fields];
                    updated[index] = { ...field, ...updates };
                    onChange(updated);
                  }}
                  createDefaultField={createDefaultField}
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
  discriminatorField,
  variants,
  onChange,
  createDefaultField
}: {
  discriminatorField: FieldConfig;
  variants: Record<string, FieldConfig[]>;
  onChange: (discriminator: FieldConfig, variants: Record<string, FieldConfig[]>) => void;
  createDefaultField: (type: FieldConfig['type'], name?: string) => FieldConfig;
}) => {
  const [editingVariant, setEditingVariant] = useState<string | null>(null);

  const updateDiscriminator = (options: string[]) => {
    const newVariants: Record<string, FieldConfig[]> = {};
    options.forEach(option => {
      newVariants[option] = variants[option] ?? [createDefaultField('bool', `field${option}`)];
    });
    onChange({ ...discriminatorField, options }, newVariants);
  };

  const updateVariantFields = (variantKey: string, fields: FieldConfig[]) => {
    onChange(discriminatorField, { ...variants, [variantKey]: fields });
  };

  return (
    <div className="nested-config">
      <h4>Union Configuration:</h4>
      
      <div className="form-group">
        <label>Discriminator Name:</label>
        <input
          type="text"
          value={discriminatorField.name}
          onChange={(e) => onChange({ ...discriminatorField, name: e.target.value }, variants)}
        />
      </div>

      <div className="form-group">
        <label>Variant Options (comma-separated):</label>
        <input
          type="text"
          key={discriminatorField.options?.join(',')}
          defaultValue={discriminatorField.options?.join(', ') ?? ''}
          onBlur={(e) => {
            const options = e.target.value.split(',').map(o => o.trim()).filter(Boolean);
            updateDiscriminator(options);
          }}
          placeholder="A, B, C"
        />
      </div>

      <div className="union-variants">
        <h5>Variant Fields:</h5>
        {discriminatorField.options?.map(option => (
          <div key={option} className="union-variant">
            <div 
              className="variant-header"
              onClick={() => setEditingVariant(editingVariant === option ? null : option)}
            >
              <span>When {discriminatorField.name} = "{option}":</span>
              <span className="variant-field-count">
                {variants[option]?.length ?? 0} field(s)
              </span>
            </div>
            {editingVariant === option && (
              <ObjectFieldsConfig
                fields={variants[option] ?? []}
                onChange={(fields) => updateVariantFields(option, fields)}
                createDefaultField={createDefaultField}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Component for recursive union configuration
const RecursiveUnionConfig = ({
  options,
  recursiveVariants,
  maxDepth,
  onChange,
  createDefaultField
}: {
  options: string[];
  recursiveVariants: Record<string, FieldConfig[]>;
  maxDepth: number;
  onChange: (options: string[], variants: Record<string, FieldConfig[]>, maxDepth: number) => void;
  createDefaultField: (type: FieldConfig['type'], name?: string) => FieldConfig;
}) => {
  const [editingVariant, setEditingVariant] = useState<string | null>(null);

  const updateOptions = (newOptions: string[]) => {
    const newVariants: Record<string, FieldConfig[]> = {};
    newOptions.forEach(option => {
      newVariants[option] = recursiveVariants[option] ?? [createDefaultField('int', `field${option}`)];
    });
    onChange(newOptions, newVariants, maxDepth);
  };

  const updateVariantFields = (variantKey: string, fields: FieldConfig[]) => {
    onChange(options, { ...recursiveVariants, [variantKey]: fields }, maxDepth);
  };

  const addRecurseField = (variantKey: string) => {
    const recurseMarker: FieldConfig = {
      id: Date.now().toString() + Math.random(),
      name: '__recurse__',
      type: 'object',
      fields: [{ ...createDefaultField('bool', 'child'), name: 'child' }]
    };
    const currentFields = recursiveVariants[variantKey] ?? [];
    updateVariantFields(variantKey, [...currentFields, recurseMarker]);
  };

  return (
    <div className="nested-config">
      <h4>Recursive Union Configuration:</h4>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
        Define a union that can reference itself. Use "Add Recursive Reference" to create fields that repeat the whole structure.
      </p>
      
      <div className="form-group">
        <label>Max Depth:</label>
        <input
          type="number"
          min="1"
          max="10"
          value={maxDepth}
          onChange={(e) => onChange(options, recursiveVariants, parseInt(e.target.value) || 3)}
        />
        <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
          Maximum nesting levels (prevents infinite structures)
        </small>
      </div>

      <div className="form-group">
        <label>Variant Types (comma-separated):</label>
        <input
          type="text"
          key={options.join(',')}
          defaultValue={options.join(', ')}
          onBlur={(e) => {
            const newOptions = e.target.value.split(',').map(o => o.trim()).filter(Boolean);
            updateOptions(newOptions);
          }}
          placeholder="leaf, branch, node"
        />
        <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
          Example: "leaf, branch" for a tree structure
        </small>
      </div>

      <div className="union-variants">
        <h5>Variant Fields:</h5>
        {options.map(option => (
          <div key={option} className="union-variant">
            <div 
              className="variant-header"
              onClick={() => setEditingVariant(editingVariant === option ? null : option)}
            >
              <span>When type = "{option}":</span>
              <span className="variant-field-count">
                {recursiveVariants[option]?.length ?? 0} field(s)
              </span>
            </div>
            {editingVariant === option && (
              <div style={{ padding: '1rem', background: 'var(--background)' }}>
                <button
                  className="add-nested-button"
                  onClick={() => addRecurseField(option)}
                  style={{ marginBottom: '0.75rem' }}
                >
                  🔄 Add Recursive Reference
                </button>
                <RecursiveVariantFieldsConfig
                  fields={recursiveVariants[option] ?? []}
                  onChange={(fields) => updateVariantFields(option, fields)}
                  createDefaultField={createDefaultField}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Component for managing fields in recursive union variants
const RecursiveVariantFieldsConfig = ({
  fields,
  onChange,
  createDefaultField
}: {
  fields: FieldConfig[];
  onChange: (fields: FieldConfig[]) => void;
  createDefaultField: (type: FieldConfig['type'], name?: string) => FieldConfig;
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const addField = () => {
    const newField = createDefaultField('int', `field${fields.length + 1}`);
    onChange([...fields, newField]);
    setEditingIndex(fields.length);
  };

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
  };

  const updateRecurseName = (index: number, newName: string) => {
    const updated = [...fields];
    if (updated[index].fields?.[0]) {
      updated[index] = {
        ...updated[index],
        fields: [{ ...updated[index].fields![0], name: newName }]
      };
    }
    onChange(updated);
  };

  return (
    <div className="object-fields-list">
      {fields.map((field, index) => (
        <div key={field.id} className="object-field-item">
          {field.name === '__recurse__' ? (
            // Special display for recursive reference
            <div className="object-field-summary" style={{ background: '#e0f2fe' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                <span style={{ fontWeight: 'bold', color: '#0284c7' }}>🔄 Recursive Reference</span>
                <input
                  type="text"
                  value={field.fields?.[0]?.name ?? 'child'}
                  onChange={(e) => updateRecurseName(index, e.target.value)}
                  placeholder="field name"
                  style={{ 
                    padding: '0.25rem 0.5rem', 
                    border: '1px solid #0284c7', 
                    borderRadius: '0.25rem',
                    width: '150px'
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>
              <div className="object-field-actions">
                <button onClick={(e) => { e.stopPropagation(); removeField(index); }}>×</button>
              </div>
            </div>
          ) : (
            // Normal field
            <>
              <div 
                className="object-field-summary"
                onClick={() => setEditingIndex(editingIndex === index ? null : index)}
              >
                <span>{field.name} ({field.type})</span>
                <div className="object-field-actions">
                  <button onClick={(e) => { e.stopPropagation(); removeField(index); }}>×</button>
                </div>
              </div>
              {editingIndex === index && (
                <div className="object-field-details">
                  <FieldEditor
                    field={field}
                    onChange={(updates) => {
                      const updated = [...fields];
                      updated[index] = { ...field, ...updates };
                      onChange(updated);
                    }}
                    createDefaultField={createDefaultField}
                  />
                </div>
              )}
            </>
          )}
        </div>
      ))}
      
      <button className="add-nested-button" onClick={addField} style={{ marginTop: '0.5rem' }}>
        + Add Regular Field
      </button>
    </div>
  );
};
