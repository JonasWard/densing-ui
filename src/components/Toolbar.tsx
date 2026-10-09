import { useRef, useState } from 'react';
import { examples } from '../model/examples';
import { useEditor } from '../editor';
import { parseImport } from '../model/import';
import { CopyButton } from './ui';

export const Toolbar = () => {
  const { state, doc, dispatch, link } = useEditor();
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const doImport = (raw: string, name: string) => {
    try {
      const { name: n, schema } = parseImport(raw, name);
      dispatch({ type: 'newDoc', name: n, schema });
      setImporting(false);
      setText('');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <header className="toolbar">
      <div className="brand">
        <img src="./densing.svg" alt="" width={32} height={32} />
        <span>
          <b>densing</b> builder
        </span>
      </div>
      <div className="doc-controls">
        <select
          className="input"
          value={state.activeId}
          onChange={(e) => dispatch({ type: 'switchDoc', id: e.target.value })}
          aria-label="Open schema"
        >
          {state.docs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name || 'Untitled'}
            </option>
          ))}
        </select>
        <input
          className="input doc-name"
          value={doc.name}
          onChange={(e) => dispatch({ type: 'renameDoc', name: e.target.value })}
          aria-label="Schema name"
        />
      </div>
      <div className="toolbar-actions">
        <button type="button" className="btn" onClick={() => dispatch({ type: 'newDoc' })}>
          New
        </button>
        <select
          className="input"
          value=""
          aria-label="Open an example"
          onChange={(e) => e.target.value && dispatch({ type: 'openExample', id: e.target.value })}
        >
          <option value="">Examples…</option>
          {examples.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.name}: {ex.description}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => setImporting(!importing)}>
          Import
        </button>
        {link ? (
          <CopyButton text={link} label="Copy link" className="btn" />
        ) : (
          <button type="button" className="btn" disabled title="Fix the schema to get a link">
            Copy link
          </button>
        )}
        <button
          type="button"
          className="btn"
          disabled={!state.past.length}
          onClick={() => dispatch({ type: 'undo' })}
          title="Undo (⌘Z)"
        >
          ↶
        </button>
        <button
          type="button"
          className="btn"
          disabled={!state.future.length}
          onClick={() => dispatch({ type: 'redo' })}
          title="Redo (⇧⌘Z)"
        >
          ↷
        </button>
        <button
          type="button"
          className="btn danger"
          onClick={() =>
            confirm(`Delete “${doc.name}”? You can undo this.`) && dispatch({ type: 'deleteDoc', id: doc.id })
          }
          title="Delete this schema"
        >
          Delete
        </button>
      </div>
      {importing && (
        <div className="import-box">
          <textarea
            className="input mono"
            rows={5}
            placeholder='Paste schema JSON, e.g. {"fields":[{"type":"int","name":"age","min":0,"max":120}]}'
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="inline">
            <button
              type="button"
              className="btn primary"
              disabled={!text.trim()}
              onClick={() => doImport(text, 'Imported schema')}
            >
              Import JSON
            </button>
            <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
              Choose file…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) doImport(await f.text(), f.name.replace(/\.json$/i, ''));
                e.target.value = '';
              }}
            />
            {error && <span className="field-error">{error}</span>}
          </div>
        </div>
      )}
    </header>
  );
};
