import { useEffect, useMemo, useReducer, useState } from 'react';
import { BitRibbon } from './components/BitRibbon';
import { ExportPanel } from './components/ExportPanel';
import { Inspector } from './components/Inspector';
import { OutlineTree } from './components/OutlineTree';
import { Playground } from './components/Playground';
import { Toolbar } from './components/Toolbar';
import { Segmented } from './components/ui';
import { EditorContext, type Hover } from './editor';
import { analyze } from './model/analyze';
import { activeDoc, initialState, persist, reducer } from './model/store';

const App = () => {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const [hover, setHover] = useState<Hover>({});
  const [renameNonce, setRenameNonce] = useState(0);
  const [side, setSide] = useState<'data' | 'export'>('data');
  const doc = activeDoc(state);
  const analysis = useMemo(() => analyze(doc.schema), [doc.schema]);

  useEffect(() => {
    const t = setTimeout(() => persist(state), 250);
    return () => clearTimeout(t);
  }, [state]);

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

  const ctx = useMemo(() => ({ state, dispatch, doc, analysis, hover, setHover }), [state, doc, analysis, hover]);

  return (
    <EditorContext.Provider value={ctx}>
      <div className="app">
        <Toolbar />
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
