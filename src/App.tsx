import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BitRibbon } from './components/BitRibbon';
import { ExportPanel } from './components/ExportPanel';
import { Inspector } from './components/Inspector';
import { OutlineTree } from './components/OutlineTree';
import { Playground } from './components/Playground';
import { Toolbar } from './components/Toolbar';
import { Segmented } from './components/ui';
import { EditorContext, type Hover } from './editor';
import { analyze } from './model/analyze';
import { decodeLink, encodeLink } from './model/share';
import { activeDoc, initialState, persist, reducer } from './model/store';

const App = () => {
  // a link (#n=…&s=…&d=…) opens its schema and data once, on load
  const [incoming] = useState(() => decodeLink(window.location.hash));
  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const stored = initialState();
    return incoming?.ok
      ? reducer(stored, { type: 'openShared', name: incoming.name, schema: incoming.schema, data: incoming.data })
      : stored;
  });
  const [hover, setHover] = useState<Hover>({});
  const [renameNonce, setRenameNonce] = useState(0);
  const [side, setSide] = useState<'data' | 'export'>('data');
  const doc = activeDoc(state);
  const analysis = useMemo(() => analyze(doc.schema), [doc.schema]);
  const [linkError, setLinkError] = useState<string | null>(incoming && !incoming.ok ? incoming.error : null);

  const hash = useMemo(() => {
    if (!analysis.schema) return null;
    try {
      return encodeLink(doc.name, analysis.schema, doc.data);
    } catch {
      return null; // the preview data does not encode (yet)
    }
  }, [analysis.schema, doc.name, doc.data]);

  // keep the address bar a working link; while the schema is invalid the last valid one stays
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => {
      if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
    }, 300);
    return () => clearTimeout(t);
  }, [hash]);
  const link = hash ? `${window.location.origin}${window.location.pathname}${hash}` : null;

  useEffect(() => {
    const t = setTimeout(() => persist(state), 250);
    return () => clearTimeout(t);
  }, [state]);

  // the debounce above would lose the last quarter second when the page goes away: save then too
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  }, [state]);
  useEffect(() => {
    const flush = () => persist(latest.current);
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]');
      if (typing || !(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' || k === 'y') {
        e.preventDefault();
        dispatch({ type: k === 'y' || e.shiftKey ? 'redo' : 'undo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const ctx = useMemo(
    () => ({ state, dispatch, doc, analysis, hover, setHover, link }),
    [state, doc, analysis, hover, link]
  );

  return (
    <EditorContext.Provider value={ctx}>
      <div className="app">
        <Toolbar />
        {linkError && (
          <div className="link-error" role="alert">
            <span>
              <b>This link could not be opened.</b> {linkError}
            </span>
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setLinkError(null)}>
              ×
            </button>
          </div>
        )}
        <BitRibbon />
        <main className="workspace">
          <OutlineTree onRequestRename={() => setRenameNonce((n) => n + 1)} />
          <Inspector renameNonce={renameNonce} />
          <aside className="panel side-panel">
            <div className="panel-head">
              <Segmented
                value={side}
                onChange={setSide}
                options={[
                  { value: 'data', label: 'Try it' },
                  { value: 'export', label: 'Export' }
                ]}
              />
            </div>
            {side === 'data' ? <Playground /> : <ExportPanel />}
          </aside>
        </main>
      </div>
    </EditorContext.Provider>
  );
};

export default App;
