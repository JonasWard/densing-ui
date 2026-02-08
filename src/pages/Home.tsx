import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { undensing, densing, type DenseSchema } from 'densing';
import { SchemaForm } from '../components/SchemaForm';
import { EncodedDisplay } from '../components/EncodedDisplay';
import { SchemaSelector } from '../components/SchemaSelector';
import { exampleSchemas } from '../schemas/examples';
import './Home.css';

export const Home = () => {
  const { example, state } = useParams();
  const navigate = useNavigate();

  // Initialize from URL params or defaults
  const initialSchema = (example && example in exampleSchemas) 
    ? example as keyof typeof exampleSchemas 
    : 'device';
  
  const [selectedSchema, setSelectedSchema] = useState<keyof typeof exampleSchemas>(initialSchema);
  const [currentSchema, setCurrentSchema] = useState<DenseSchema>(exampleSchemas[initialSchema].schema);
  const [formData, setFormData] = useState<any>(() => {
    // Try to decode state from URL
    if (state && example && example in exampleSchemas) {
      try {
        return undensing(exampleSchemas[example as keyof typeof exampleSchemas].schema, state);
      } catch (error) {
        console.error('Failed to decode state from URL:', error);
        return exampleSchemas[initialSchema].defaultData;
      }
    }
    return exampleSchemas[initialSchema].defaultData;
  });
  const [encodedString, setEncodedString] = useState<string>('');

  // Update URL when schema or data changes
  useEffect(() => {
    if (encodedString) {
      navigate(`/${selectedSchema}/${encodedString}`, { replace: true });
    }
  }, [selectedSchema, encodedString, navigate]);

  // Decode state from URL when URL changes
  useEffect(() => {
    if (state && example && example in exampleSchemas) {
      try {
        const decoded = undensing(exampleSchemas[example as keyof typeof exampleSchemas].schema, state);
        setFormData(decoded);
        setSelectedSchema(example as keyof typeof exampleSchemas);
        setCurrentSchema(exampleSchemas[example as keyof typeof exampleSchemas].schema);
      } catch (error) {
        console.error('Failed to decode state from URL:', error);
      }
    }
  }, [state, example]);

  const handleSchemaChange = (schemaKey: keyof typeof exampleSchemas) => {
    setSelectedSchema(schemaKey);
    setCurrentSchema(exampleSchemas[schemaKey].schema);
    setFormData(exampleSchemas[schemaKey].defaultData);
    setEncodedString('');
    
    // Update URL with new schema
    try {
      const encoded = densing(exampleSchemas[schemaKey].schema, exampleSchemas[schemaKey].defaultData);
      navigate(`/${schemaKey}/${encoded}`, { replace: true });
    } catch (error) {
      navigate(`/${schemaKey}`, { replace: true });
    }
  };

  const handleDataChange = (newData: any) => {
    setFormData(newData);
  };

  const handleEncodedChange = (encoded: string) => {
    setEncodedString(encoded);
  };

  const shareUrl = window.location.href;

  return (
    <div className="home">
      <header className="app-header">
        <h1>🎯 Densing UI</h1>
        <p className="subtitle">Ultra-compact data serialization playground</p>
        {encodedString && (
          <div className="share-section">
            <div className="share-url-container">
              <input 
                type="text" 
                readOnly 
                value={shareUrl} 
                className="share-url-input"
                onClick={(e) => e.currentTarget.select()}
              />
              <button 
                className="share-copy-button"
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
        )}
      </header>

      <main className="app-main">
        <SchemaSelector
          schemas={exampleSchemas}
          selectedSchema={selectedSchema}
          onSchemaChange={handleSchemaChange}
        />

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
    </div>
  );
};
