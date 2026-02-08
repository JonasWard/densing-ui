import { useState } from 'react';
import { schema, int, bool, fixed, enumeration, optional, array, enumArray, object, union, type DenseField, type DenseSchema } from 'densing';
import './SchemaBuilder.css';

interface FieldConfig {
  id: string;
  name: string;
  type: 'bool' | 'int' | 'fixed' | 'enum' | 'optional' | 'array' | 'enum_array' | 'object' | 'union';
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

  const createDefaultField = (type: FieldConfig['type']): FieldConfig => {
    const baseField: FieldConfig = {
      id: Date.now().toString() + Math.random(),
      name: 'item',
      type: type,
    };
    
    switch (type) {
      case 'int':
        return { ...baseField, min: 0, max: 100 };
      case 'fixed':
        return { ...baseField, min: 0, max: 100, precision: 0.1 };
      case 'enum':
        return { ...baseField, options: ['option1', 'option2'] };
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
          <h2>Schema Builder</h2>
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
            <div className="field-editor">
              <h3>Edit Field</h3>
              
              <div className="form-group">
                <label>Field Name:</label>
                <input
                  type="text"
                  value={editingField.name}
                  onChange={(e) => updateField(editingField.id, { name: e.target.value })}
                  placeholder="fieldName"
                />
              </div>

              <div className="form-group">
                <label>Field Type:</label>
                <select
                  value={editingField.type}
                  onChange={(e) => {
                    const newType = e.target.value as FieldConfig['type'];
                    const updates: Partial<FieldConfig> = { 
                      type: newType,
                      min: undefined,
                      max: undefined,
                      precision: undefined,
                      options: undefined,
                      wrappedField: undefined,
                      fields: undefined,
                      minLength: undefined,
                      maxLength: undefined,
                      enumField: undefined,
                      discriminatorField: undefined,
                      variants: undefined,
                    };
                    
                    // Set defaults for specific types
                    if (newType === 'int') {
                      updates.min = 0;
                      updates.max = 100;
                    } else if (newType === 'fixed') {
                      updates.min = 0;
                      updates.max = 100;
                      updates.precision = 0.1;
                    } else if (newType === 'enum') {
                      updates.options = ['option1', 'option2'];
                    } else if (newType === 'optional') {
                      updates.wrappedField = createDefaultField('bool');
                    } else if (newType === 'array') {
                      updates.minLength = 0;
                      updates.maxLength = 10;
                      updates.wrappedField = createDefaultField('int');
                    } else if (newType === 'enum_array') {
                      updates.minLength = 0;
                      updates.maxLength = 10;
                      updates.enumField = createDefaultField('enum');
                    } else if (newType === 'object') {
                      updates.fields = [createDefaultField('bool')];
                    } else if (newType === 'union') {
                      updates.discriminatorField = { ...createDefaultField('enum'), name: 'type', options: ['A', 'B'] };
                      updates.variants = {
                        'A': [{ ...createDefaultField('bool'), name: 'fieldA' }],
                        'B': [{ ...createDefaultField('int'), name: 'fieldB' }]
                      };
                    }
                    
                    updateField(editingField.id, updates);
                  }}
                >
                  <option value="bool">Boolean</option>
                  <option value="int">Integer</option>
                  <option value="fixed">Fixed Point Number</option>
                  <option value="enum">Enumeration</option>
                  <option value="optional">Optional</option>
                  <option value="array">Array</option>
                  <option value="enum_array">Enum Array</option>
                  <option value="object">Object</option>
                  <option value="union">Union</option>
                </select>
              </div>

              {(editingField.type === 'int' || editingField.type === 'fixed') && (
                <>
                  <div className="form-group">
                    <label>Min Value:</label>
                    <input
                      type="number"
                      value={editingField.min ?? 0}
                      onChange={(e) => updateField(editingField.id, { min: parseFloat(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Max Value:</label>
                    <input
                      type="number"
                      value={editingField.max ?? 100}
                      onChange={(e) => updateField(editingField.id, { max: parseFloat(e.target.value) })}
                    />
                  </div>
                </>
              )}

              {editingField.type === 'fixed' && (
                <div className="form-group">
                  <label>Precision:</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editingField.precision ?? 0.1}
                    onChange={(e) => updateField(editingField.id, { precision: parseFloat(e.target.value) })}
                  />
                </div>
              )}

              {editingField.type === 'enum' && (
                <div className="form-group">
                  <label>Options (comma-separated):</label>
                  <input
                    type="text"
                    value={editingField.options?.join(', ') ?? 'option1, option2'}
                    onChange={(e) => updateField(editingField.id, { 
                      options: e.target.value.split(',').map(o => o.trim()).filter(Boolean)
                    })}
                    placeholder="option1, option2, option3"
                  />
                </div>
              )}

              {(editingField.type === 'array' || editingField.type === 'enum_array') && (
                <>
                  <div className="form-group">
                    <label>Min Length:</label>
                    <input
                      type="number"
                      value={editingField.minLength ?? 0}
                      onChange={(e) => updateField(editingField.id, { minLength: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Max Length:</label>
                    <input
                      type="number"
                      value={editingField.maxLength ?? 10}
                      onChange={(e) => updateField(editingField.id, { maxLength: parseInt(e.target.value) })}
                    />
                  </div>
                </>
              )}

              {editingField.type === 'optional' && editingField.wrappedField && (
                <div className="nested-config">
                  <h4>Wrapped Field Configuration:</h4>
                  <NestedFieldEditor
                    field={editingField.wrappedField}
                    onChange={(updated) => updateField(editingField.id, { wrappedField: updated })}
                  />
                </div>
              )}

              {editingField.type === 'array' && editingField.wrappedField && (
                <div className="nested-config">
                  <h4>Array Item Configuration:</h4>
                  <NestedFieldEditor
                    field={editingField.wrappedField}
                    onChange={(updated) => updateField(editingField.id, { wrappedField: updated })}
                  />
                </div>
              )}

              {editingField.type === 'enum_array' && editingField.enumField && (
                <div className="nested-config">
                  <h4>Enum Configuration:</h4>
                  <div className="form-group">
                    <label>Options (comma-separated):</label>
                    <input
                      type="text"
                      value={editingField.enumField.options?.join(', ') ?? 'A, B, C'}
                      onChange={(e) => {
                        const updated = { ...editingField.enumField!, options: e.target.value.split(',').map(o => o.trim()).filter(Boolean) };
                        updateField(editingField.id, { enumField: updated });
                      }}
                      placeholder="A, B, C"
                    />
                  </div>
                </div>
              )}

              {editingField.type === 'object' && (
                <div className="nested-config">
                  <h4>Object Fields:</h4>
                  <div className="form-note">
                    Complex object field configuration - add simple bool field by default.
                    For more complex objects, consider creating them as separate schemas.
                  </div>
                </div>
              )}

              {editingField.type === 'union' && (
                <div className="nested-config">
                  <h4>Union Configuration:</h4>
                  <div className="form-note">
                    Complex union configuration - defaults created with type discriminator.
                    For more complex unions, consider creating them programmatically.
                  </div>
                </div>
              )}
            </div>
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

const NestedFieldEditor = ({ field, onChange }: { field: FieldConfig; onChange: (field: FieldConfig) => void }) => {
  return (
    <div className="nested-field-editor">
      <div className="form-group">
        <label>Type:</label>
        <select
          value={field.type}
          onChange={(e) => {
            const newType = e.target.value as FieldConfig['type'];
            const baseField: FieldConfig = {
              ...field,
              type: newType,
              min: undefined,
              max: undefined,
              precision: undefined,
              options: undefined,
            };
            
            if (newType === 'int') {
              onChange({ ...baseField, min: 0, max: 100 });
            } else if (newType === 'fixed') {
              onChange({ ...baseField, min: 0, max: 100, precision: 0.1 });
            } else if (newType === 'enum') {
              onChange({ ...baseField, options: ['option1', 'option2'] });
            } else {
              onChange(baseField);
            }
          }}
        >
          <option value="bool">Boolean</option>
          <option value="int">Integer</option>
          <option value="fixed">Fixed Point</option>
          <option value="enum">Enum</option>
        </select>
      </div>

      {field.type === 'int' && (
        <>
          <div className="form-group">
            <label>Min:</label>
            <input
              type="number"
              value={field.min ?? 0}
              onChange={(e) => onChange({ ...field, min: parseFloat(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>Max:</label>
            <input
              type="number"
              value={field.max ?? 100}
              onChange={(e) => onChange({ ...field, max: parseFloat(e.target.value) })}
            />
          </div>
        </>
      )}

      {field.type === 'fixed' && (
        <>
          <div className="form-group">
            <label>Min:</label>
            <input
              type="number"
              value={field.min ?? 0}
              onChange={(e) => onChange({ ...field, min: parseFloat(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>Max:</label>
            <input
              type="number"
              value={field.max ?? 100}
              onChange={(e) => onChange({ ...field, max: parseFloat(e.target.value) })}
            />
          </div>
          <div className="form-group">
            <label>Precision:</label>
            <input
              type="number"
              step="0.01"
              value={field.precision ?? 0.1}
              onChange={(e) => onChange({ ...field, precision: parseFloat(e.target.value) })}
            />
          </div>
        </>
      )}

      {field.type === 'enum' && (
        <div className="form-group">
          <label>Options:</label>
          <input
            type="text"
            value={field.options?.join(', ') ?? 'option1, option2'}
            onChange={(e) => onChange({ 
              ...field, 
              options: e.target.value.split(',').map(o => o.trim()).filter(Boolean)
            })}
            placeholder="option1, option2"
          />
        </div>
      )}
    </div>
  );
};
