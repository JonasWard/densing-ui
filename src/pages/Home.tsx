import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { undensing, densing, type DenseSchema } from 'densing';
import { SchemaForm } from '../components/SchemaForm';
import { EncodedDisplay } from '../components/EncodedDisplay';
import { SchemaSelector } from '../components/SchemaSelector';
import { SchemaBuilder } from '../components/SchemaBuilder';
import { exampleSchemas } from '../schemas/examples';
import './Home.css';

type SchemaEntry = {
  name: string;
  description: string;
  schema: DenseSchema;
  defaultData: any;
};

export const Home = () => {
  const { example, state } = useParams();
  const navigate = useNavigate();

  // State for custom schemas
  const [customSchemas, setCustomSchemas] = useState<Record<string, SchemaEntry>>({});
  const [allSchemas, setAllSchemas] = useState<Record<string, SchemaEntry>>({ ...exampleSchemas });
  const [showBuilder, setShowBuilder] = useState(false);

  // Initialize from URL params or defaults
  const initialSchema = (example && example in allSchemas) 
    ? example
    : 'device';
  
  const [selectedSchema, setSelectedSchema] = useState<string>(initialSchema);
  const [currentSchema, setCurrentSchema] = useState<DenseSchema>(allSchemas[initialSchema].schema);
  const [formData, setFormData] = useState<any>(() => {
    // Try to decode state from URL
    if (state && example && example in allSchemas) {
      try {
        return undensing(allSchemas[example].schema, state);
      } catch (error) {
        console.error('Failed to decode state from URL:', error);
        return allSchemas[initialSchema].defaultData;
      }
    }
    return allSchemas[initialSchema].defaultData;
  });
  const [encodedString, setEncodedString] = useState<string>('');

  // Update allSchemas when custom schemas change
  useEffect(() => {
    setAllSchemas({ ...exampleSchemas, ...customSchemas });
  }, [customSchemas]);

  // Update URL when schema or data changes
  useEffect(() => {
    if (encodedString) {
      navigate(`/${selectedSchema}/${encodedString}`, { replace: true });
    }
  }, [selectedSchema, encodedString, navigate]);

  // Decode state from URL when URL changes
  useEffect(() => {
    if (state && example && example in allSchemas) {
      try {
        const decoded = undensing(allSchemas[example].schema, state);
        setFormData(decoded);
        setSelectedSchema(example);
        setCurrentSchema(allSchemas[example].schema);
      } catch (error) {
        console.error('Failed to decode state from URL:', error);
      }
    }
  }, [state, example, allSchemas]);

  const handleSchemaChange = (schemaKey: string) => {
    setSelectedSchema(schemaKey);
    setCurrentSchema(allSchemas[schemaKey].schema);
    setFormData(allSchemas[schemaKey].defaultData);
    setEncodedString('');
    
    // Update URL with new schema
    try {
      const encoded = densing(allSchemas[schemaKey].schema, allSchemas[schemaKey].defaultData);
      navigate(`/${schemaKey}/${encoded}`, { replace: true });
    } catch (error) {
      navigate(`/${schemaKey}`, { replace: true });
    }
  };

  const handleSchemaCreated = (schema: DenseSchema, defaultData: any, name: string) => {
    const schemaKey = `custom_${Date.now()}`;
    const newSchema: SchemaEntry = {
      name: name,
      description: 'Custom schema',
      schema: schema,
      defaultData: defaultData,
    };
    
    setCustomSchemas({ ...customSchemas, [schemaKey]: newSchema });
    setShowBuilder(false);
    
    // Switch to the new schema
    setTimeout(() => {
      handleSchemaChange(schemaKey);
    }, 100);
  };

  const handleDataChange = (newData: any) => {
    setFormData(newData);
  };

  const handleEncodedChange = (encoded: string) => {
    setEncodedString(encoded);
  };

  const handleExportCustomSchemas = () => {
    const data = JSON.stringify(customSchemas, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'custom-schemas.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportCustomSchemas = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = e.target?.result as string;
        const imported = JSON.parse(json);
        
        // Validate and merge
        if (typeof imported === 'object' && imported !== null) {
          setCustomSchemas({ ...customSchemas, ...imported });
        } else {
          alert('Invalid custom schemas file format');
        }
      } catch (error) {
        alert('Error parsing file: ' + String(error));
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const generateTypeDefinition = (data: any, indent: string = ''): string => {
    if (data === null || data === undefined) return 'null';
    
    const dataType = typeof data;
    
    if (dataType === 'boolean') return 'boolean';
    if (dataType === 'number') return 'number';
    if (dataType === 'string') return 'string';
    
    if (Array.isArray(data)) {
      if (data.length === 0) return 'any[]';
      const itemType = generateTypeDefinition(data[0], indent);
      return `${itemType}[]`;
    }
    
    if (dataType === 'object') {
      const entries = Object.entries(data);
      if (entries.length === 0) return 'Record<string, any>';
      
      const fields = entries.map(([key, value]) => {
        const valueType = generateTypeDefinition(value, indent + '  ');
        return `${indent}  ${key}: ${valueType};`;
      }).join('\n');
      
      return `{\n${fields}\n${indent}}`;
    }
    
    return 'any';
  };

  const handleDownloadType = () => {
    const currentEntry = allSchemas[selectedSchema];
    if (!currentEntry) return;

    // Convert schema name to PascalCase for type name
    const typeName = currentEntry.name
      .split(/[\s-_]+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');

    const typeDefinition = generateTypeDefinition(formData, typeName);
    
    const tsContent = `// Generated TypeScript type for ${currentEntry.name}
// Schema: ${currentEntry.description}

export type ${typeName} = ${typeDefinition};

// Example usage:
// import { ${typeName} } from './${selectedSchema}-type';
// const data: ${typeName} = ${JSON.stringify(formData, null, 2)};
`;
    
    const blob = new Blob([tsContent], { type: 'text/typescript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedSchema}-type.ts`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const shareUrl = window.location.href;

  return (
    <div className="home">
      <header className="app-header">
        <h1>🎯 Densing UI</h1>
        <p className="subtitle">Ultra-compact data serialization playground</p>
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
            <button
              className="download-type-button"
              onClick={handleDownloadType}
              title="Download TypeScript type definition"
            >
              📝 Download Type
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <div className="schema-selector-wrapper">
          <SchemaSelector schemas={allSchemas} selectedSchema={selectedSchema} onSchemaChange={handleSchemaChange} />
          <div className="schema-actions">
            <button className="build-schema-button" onClick={() => setShowBuilder(true)}>
              ⚡ Build Custom Schema
            </button>
            {Object.keys(customSchemas).length > 0 && (
              <div className="custom-schema-actions">
                <button className="export-custom-button" onClick={handleExportCustomSchemas}>
                  💾 Export Custom Schemas
                </button>
              </div>
            )}
            <label className="import-custom-button">
              📂 Import Custom Schemas
              <input type="file" accept=".json" onChange={handleImportCustomSchemas} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        <div className="content-grid">
          <div className="form-panel">
            <SchemaForm
              schema={currentSchema}
              data={formData}
              onDataChange={handleDataChange}
              onEncode={handleEncodedChange}
            />
          </div>

          <div className="encoded-panel">
            <EncodedDisplay
              schema={currentSchema}
              data={formData}
              encodedString={encodedString}
              onDecode={handleDataChange}
            />
          </div>
        </div>
      </main>

      {showBuilder && <SchemaBuilder onSchemaCreated={handleSchemaCreated} onClose={() => setShowBuilder(false)} />}
    </div>
  );
};
