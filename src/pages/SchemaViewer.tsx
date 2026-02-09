import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  undensing,
  densing,
  type DenseSchema,
  int,
  bool,
  fixed,
  enumeration,
  optional,
  array,
  enumArray,
  object,
  union
} from 'densing';
import { decodeSchemaFromBase64 } from '../schemas/schema-codec';
import { SchemaForm } from '../components/SchemaForm';
import { EncodedDisplay } from '../components/EncodedDisplay';
import { schema as createSchema } from 'densing';
import type { FieldConfig } from '../components/SchemaBuilder';
import schemaRegistry from '../../schema-registry.json';
import './SchemaViewer.css';

export const SchemaViewer = () => {
  const { schemaBase64, stateBase64, shortName } = useParams();
  const navigate = useNavigate();

  const [schemaName, setSchemaName] = useState<string>('');
  const [denseSchema, setDenseSchema] = useState<DenseSchema | null>(null);
  const [formData, setFormData] = useState<any>(null);
  const [encodedString, setEncodedString] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [currentShortName, setCurrentShortName] = useState<string | null>(null);

  // Build DenseField from FieldConfig (copied from SchemaBuilder)
  const buildDenseField = (config: FieldConfig): any => {
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
            buildDenseField(config.enumField),
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
          const discriminator = buildDenseField(config.discriminatorField);
          const variantMap: Record<string, any[]> = {};
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
        config.fields?.forEach((f) => {
          obj[f.name] = getDefaultValue(f);
        });
        return obj;
      case 'union':
        if (config.discriminatorField && config.variants) {
          const firstOption = config.discriminatorField.options?.[0];
          if (firstOption) {
            const result: any = { [config.discriminatorField.name]: firstOption };
            const variantFields = config.variants[firstOption] ?? [];
            variantFields.forEach((f) => {
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

  // Load schema from URL on mount
  useEffect(() => {
    // Determine which parameter to use
    let actualSchemaBase64: string | undefined;
    let actualShortName: string | null = null;

    if (shortName) {
      // Using short name route
      const registryEntry = (schemaRegistry as Record<string, string>)[shortName];
      if (!registryEntry) {
        setError(`Schema short name "${shortName}" not found in registry`);
        setTimeout(() => navigate('/', { replace: true }), 3000);
        return;
      }
      actualSchemaBase64 = registryEntry;
      actualShortName = shortName;
    } else if (schemaBase64) {
      // Using full base64 route
      actualSchemaBase64 = schemaBase64;
    } else {
      navigate('/', { replace: true });
      return;
    }

    try {
      // Decode schema
      const { name, fields } = decodeSchemaFromBase64(actualSchemaBase64);
      setSchemaName(name);
      setCurrentShortName(actualShortName);

      // Build DenseSchema
      const denseFields = fields.map(buildDenseField);
      const builtSchema = createSchema(...denseFields);
      setDenseSchema(builtSchema);

      // Generate default data
      const defaultDataObj: any = {};
      fields.forEach((f) => {
        defaultDataObj[f.name] = getDefaultValue(f);
      });

      // Decode state if provided
      if (stateBase64) {
        try {
          const decodedState = undensing(builtSchema, stateBase64);
          setFormData(decodedState);
        } catch (stateError) {
          console.error('Failed to decode state:', stateError);
          setFormData(defaultDataObj);
        }
      } else {
        setFormData(defaultDataObj);
      }
    } catch (error) {
      console.error('Failed to load schema:', error);
      setError('Failed to load schema from URL. The link may be invalid or corrupted.');
      setTimeout(() => navigate('/', { replace: true }), 3000);
    }
  }, [schemaBase64, stateBase64, shortName, navigate]);

  // Encode data when it changes
  useEffect(() => {
    if (denseSchema && formData) {
      try {
        const encoded = densing(denseSchema, formData);
        setEncodedString(encoded);
      } catch (error) {
        console.error('Encoding error:', error);
        setEncodedString('');
      }
    }
  }, [denseSchema, formData]);

  // Update URL when encoded string changes
  useEffect(() => {
    if (encodedString) {
      if (currentShortName) {
        // Use short name route
        navigate(`/s/${currentShortName}/${encodedString}`, { replace: true });
      } else if (schemaBase64) {
        // Use full base64 route
        navigate(`/schema/${schemaBase64}/${encodedString}`, { replace: true });
      }
    }
  }, [currentShortName, schemaBase64, encodedString, navigate]);

  const handleFormChange = (newData: any) => {
    setFormData(newData);
  };

  const handleEncode = () => {
    if (denseSchema && formData) {
      try {
        const encoded = densing(denseSchema, formData);
        setEncodedString(encoded);
      } catch (error) {
        alert('Encoding error: ' + String(error));
      }
    }
  };

  const handleDecode = (decoded: any) => {
    setFormData(decoded);
  };

  const shareUrl = currentShortName
    ? `${window.location.origin}${window.location.pathname}#/s/${currentShortName}${
        encodedString ? `/${encodedString}` : ''
      }`
    : `${window.location.origin}${window.location.pathname}#/schema/${schemaBase64}${
        encodedString ? `/${encodedString}` : ''
      }`;

  if (error) {
    return (
      <div className="schema-viewer-error">
        <div className="error-message">
          <h1>⚠️ Error Loading Schema</h1>
          <p>{error}</p>
          <p>Redirecting to home page...</p>
        </div>
      </div>
    );
  }

  if (!denseSchema || !formData) {
    return (
      <div className="schema-viewer-loading">
        <div className="loading-message">
          <h1>📦 Loading Schema...</h1>
          <p>Decoding schema from URL</p>
        </div>
      </div>
    );
  }

  return (
    <div className="schema-viewer">
      <header className="schema-viewer-header">
        <div className="header-content">
          <button className="back-button" onClick={() => navigate('/')}>
            ← Back to Home
          </button>
          <div className="schema-info">
            <h1>🔗 {schemaName}</h1>
            <p className="subtitle">Shared schema viewer</p>
          </div>
        </div>
        <div className="share-section">
          <div className="share-url-container">
            <input
              type="text"
              disabled={!encodedString}
              readOnly
              value={shareUrl}
              className="share-url-input"
              onClick={(e) => e.currentTarget.select()}
            />
            <button
              className="share-copy-button"
              disabled={!encodedString}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                } catch (error) {
                  const input = document.querySelector('.share-url-input') as HTMLInputElement;
                  input?.select();
                  document.execCommand('copy');
                }
              }}
            >
              🔗 Copy Share Link
            </button>
          </div>
        </div>
      </header>

      <main className="schema-viewer-main">
        <div className="schema-viewer-grid">
          <div className="form-section">
            <h2>Edit Data</h2>
            <SchemaForm schema={denseSchema} data={formData} onDataChange={handleFormChange} onEncode={handleEncode} />
          </div>

          <div className="encoded-section">
            <EncodedDisplay
              schema={denseSchema}
              data={formData}
              encodedString={encodedString}
              onDecode={handleDecode}
            />
          </div>
        </div>
      </main>
    </div>
  );
};
