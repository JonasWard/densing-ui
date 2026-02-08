import './SchemaSelector.css';

interface SchemaSelectorProps<T extends string> {
  schemas: Record<T, { name: string; description: string }>;
  selectedSchema: T;
  onSchemaChange: (schemaKey: T) => void;
}

export const SchemaSelector = <T extends string>({ schemas, selectedSchema, onSchemaChange }: SchemaSelectorProps<T>) => {
  return (
    <div className="schema-selector">
      <h2>Select a Schema</h2>
      <div className="schema-buttons">
        {Object.entries(schemas).map(([key, schema]) => (
          <button
            key={key}
            className={`schema-button ${selectedSchema === key ? 'active' : ''}`}
            onClick={() => onSchemaChange(key as T)}
          >
            <span className="schema-name">{(schema as any).name}</span>
            <span className="schema-description">{(schema as any).description}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
