import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BitRibbon } from './components/BitRibbon';
import { ExportPanel } from './components/ExportPanel';
import { Inspector } from './components/Inspector';
import { OutlineTree, StructureActions } from './components/OutlineTree';
import { Playground, TryActions } from './components/Playground';
import { Toolbar } from './components/Toolbar';
import { Segmented } from './components/ui';
import { BitsSeparator, FoldSection, PanelLayout, ViewToggles, type PanelSpec } from './components/PanelLayout';
import { CollapseContext, type Collapse } from './ui-state';
import { useMediaQuery } from './use-media';
import { loadLayout, saveLayout, togglePanel, type Layout } from './model/layout';
import { pathKey } from './model/paths';
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

  const mobile = useMediaQuery('(max-width: 720px)');
  const [layout, setLayoutState] = useState<Layout>(loadLayout);
  const setLayout = (l: Layout) => {
    setLayoutState(l);
    saveLayout(l);
  };
  const [inspectorClosedFor, setInspectorClosedFor] = useState<string | null>(null);
  const bitsArea = useRef<HTMLDivElement>(null);

  const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set());
  const collapse = useMemo<Collapse>(
    () => ({
      collapsed: folded,
      isCollapsed: (id) => folded.has(id),
      toggle: (id) =>
        setFolded((f) => {
          const n = new Set(f);
          if (n.has(id)) n.delete(id);
          else n.add(id);
          return n;
        }),
      setMany: (ids, value) =>
        setFolded((f) => {
          const n = new Set(f);
          ids.forEach((id) => (value ? n.add(id) : n.delete(id)));
          return n;
        }),
      clear: (prefix) => setFolded((f) => new Set([...f].filter((id) => !id.startsWith(prefix))))
    }),
    [folded]
  );

  const ctx = useMemo(
    () => ({ state, dispatch, doc, analysis, hover, setHover, link }),
    [state, doc, analysis, hover, link]
  );

  const linkBanner = linkError && (
    <div className="link-error" role="alert">
      <span>
        <b>This link could not be opened.</b> {linkError}
      </span>
      <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setLinkError(null)}>
        ×
      </button>
    </div>
  );
  const sideTabs = (
    <Segmented
      small
      value={side}
      onChange={setSide}
      options={[
        { value: 'data', label: 'Try it' },
        { value: 'export', label: 'Export' }
      ]}
    />
  );
  const panels: PanelSpec[] = [
    {
      id: 'structure',
      title: 'Structure',
      actions: <StructureActions />,
      body: <OutlineTree onRequestRename={() => setRenameNonce((n) => n + 1)} />
    },
    { id: 'inspector', title: 'Inspector', body: <Inspector renameNonce={renameNonce} /> },
    {
      id: 'side',
      title: side === 'data' ? 'Try it' : 'Export',
      actions: (
        <>
          {sideTabs}
          {side === 'data' && <TryActions />}
        </>
      ),
      body: side === 'data' ? <Playground /> : <ExportPanel />
    }
  ];

  // mobile: the inspector folds open again whenever the selection changes
  const selectedKey = state.selected ? pathKey(state.selected) : null;
  const sectionOpen = (id: string) =>
    !layout.closedSections.includes(id) || (id === 'inspector' && selectedKey !== inspectorClosedFor);
  const toggleFold = (id: string) => {
    const open = sectionOpen(id);
    if (id === 'inspector') setInspectorClosedFor(open ? selectedKey : null);
    const closed = layout.closedSections.filter((s) => s !== id);
    setLayout({ ...layout, closedSections: open ? [...closed, id] : closed });
  };

  return (
    <EditorContext.Provider value={ctx}>
      <CollapseContext.Provider value={collapse}>
        {mobile ? (
          <div className="app mobile">
            <header className="app-header">
              <Toolbar />
              {linkBanner}
            </header>
            <FoldSection title="Bits" open={sectionOpen('bits')} onToggle={() => toggleFold('bits')}>
              <BitRibbon />
            </FoldSection>
            {panels.map((p) => (
              <FoldSection
                key={p.id}
                title={p.title}
                open={sectionOpen(p.id)}
                onToggle={() => toggleFold(p.id)}
                actions={p.actions}
              >
                {p.body}
              </FoldSection>
            ))}
          </div>
        ) : (
          <div className="app desktop">
            <header className="app-header">
              <Toolbar
                view={
                  <ViewToggles
                    panels={panels.map((p) => ({ id: p.id, title: p.id === 'side' ? 'Try it' : p.title }))}
                    layout={layout}
                    onToggle={(id) => setLayout(togglePanel(layout, id))}
                  />
                }
              />
              {linkBanner}
            </header>
            <div
              className={`bits-area ${layout.bitsHeight ? 'sized' : ''}`}
              ref={bitsArea}
              style={layout.bitsHeight ? { height: layout.bitsHeight } : undefined}
            >
              <BitRibbon />
            </div>
            <BitsSeparator area={bitsArea} layout={layout} onLayout={setLayout} />
            <PanelLayout panels={panels} layout={layout} onLayout={setLayout} />
          </div>
        )}
      </CollapseContext.Provider>
    </EditorContext.Provider>
  );
};

export default App;
