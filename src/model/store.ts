import { getDefaultData, type DenseSchema } from 'densing';
import { analyze } from './analyze';
import { reconcile } from './data';
import { examples } from './examples';
import type { NodePath } from './paths';

export type BaseChoice = 'base64url' | 'baseQRCode45UrlSafe' | 'binary';

export interface Doc {
  id: string;
  name: string;
  schema: DenseSchema;
  data: unknown;
  base: BaseChoice;
}

interface Snapshot {
  docs: Doc[];
  activeId: string;
  selected: NodePath | null;
}

export interface State extends Snapshot {
  past: Snapshot[];
  future: Snapshot[];
  /** coalesces bursts of edits (typing in one input) into one undo step */
  lastEdit: { key: string; at: number } | null;
}

export type Action =
  | { type: 'select'; path: NodePath | null }
  | { type: 'editSchema'; schema: DenseSchema; select?: NodePath | null; coalesce?: string }
  | { type: 'setData'; data: unknown }
  | { type: 'setBase'; base: BaseChoice }
  | { type: 'renameDoc'; name: string }
  | { type: 'newDoc'; name?: string; schema?: DenseSchema; data?: unknown }
  | { type: 'openExample'; id: string }
  | { type: 'switchDoc'; id: string }
  | { type: 'deleteDoc'; id: string }
  | { type: 'undo' }
  | { type: 'redo' };

const STORAGE_KEY = 'densing-ui:v1';
const HISTORY = 100;
const COALESCE_MS = 1000;

const newId = () => Math.random().toString(36).slice(2, 10);

const docFromExample = (id: string): Doc => {
  const ex = examples.find((e) => e.id === id) ?? examples[0];
  return { id: newId(), name: ex.name, schema: ex.schema, data: ex.data, base: 'base64url' };
};

const fitData = (schema: DenseSchema, data: unknown): unknown => {
  const a = analyze(schema);
  if (!a.schema) return data;
  try {
    return reconcile(a.schema, data, a.byName);
  } catch {
    return getDefaultData(a.schema);
  }
};

export const initialState = (): State => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Snapshot;
      if (Array.isArray(saved.docs) && saved.docs.length) {
        const activeId = saved.docs.some((d) => d.id === saved.activeId) ? saved.activeId : saved.docs[0].id;
        return { docs: saved.docs, activeId, selected: null, past: [], future: [], lastEdit: null };
      }
    }
  } catch {
    // storage unavailable or corrupt: start fresh
  }
  const doc = docFromExample('device');
  return { docs: [doc], activeId: doc.id, selected: null, past: [], future: [], lastEdit: null };
};

export const persist = (state: State) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ docs: state.docs, activeId: state.activeId }));
  } catch {
    // ignore: private mode or quota
  }
};

export const activeDoc = (state: State): Doc => state.docs.find((d) => d.id === state.activeId) ?? state.docs[0];

const snapshot = (s: State): Snapshot => ({ docs: s.docs, activeId: s.activeId, selected: s.selected });

/** Apply a change that should be undoable */
const commit = (state: State, next: Partial<Snapshot>, coalesce?: string): State => {
  const now = Date.now();
  const merge = coalesce && state.lastEdit?.key === coalesce && now - state.lastEdit.at < COALESCE_MS;
  return {
    ...state,
    ...next,
    past: merge ? state.past : [...state.past.slice(-HISTORY + 1), snapshot(state)],
    future: [],
    lastEdit: coalesce ? { key: coalesce, at: now } : null
  };
};

const updateActive = (state: State, patch: Partial<Doc>): Doc[] =>
  state.docs.map((d) => (d.id === state.activeId ? { ...d, ...patch } : d));

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'select':
      return { ...state, selected: action.path };
    case 'editSchema': {
      const doc = activeDoc(state);
      return commit(
        state,
        {
          docs: updateActive(state, { schema: action.schema, data: fitData(action.schema, doc.data) }),
          selected: action.select === undefined ? state.selected : action.select
        },
        action.coalesce
      );
    }
    case 'setData':
      // preview data is a scratch value, not part of undo history
      return { ...state, docs: updateActive(state, { data: action.data }) };
    case 'setBase':
      return { ...state, docs: updateActive(state, { base: action.base }) };
    case 'renameDoc':
      return commit(state, { docs: updateActive(state, { name: action.name }) }, 'renameDoc');
    case 'newDoc': {
      const schema = action.schema ?? { fields: [] };
      const doc: Doc = {
        id: newId(),
        name: action.name ?? 'Untitled schema',
        schema,
        data: action.data ?? {},
        base: 'base64url'
      };
      doc.data = fitData(schema, doc.data);
      return commit(state, { docs: [...state.docs, doc], activeId: doc.id, selected: null });
    }
    case 'openExample': {
      const doc = docFromExample(action.id);
      return commit(state, { docs: [...state.docs, doc], activeId: doc.id, selected: null });
    }
    case 'switchDoc':
      return { ...state, activeId: action.id, selected: null, lastEdit: null };
    case 'deleteDoc': {
      const docs = state.docs.filter((d) => d.id !== action.id);
      if (!docs.length) docs.push(docFromExample('device'));
      const activeId = docs.some((d) => d.id === state.activeId) ? state.activeId : docs[0].id;
      return commit(state, { docs, activeId, selected: null });
    }
    case 'undo': {
      const prev = state.past[state.past.length - 1];
      if (!prev) return state;
      return {
        ...state,
        ...prev,
        past: state.past.slice(0, -1),
        future: [snapshot(state), ...state.future],
        lastEdit: null
      };
    }
    case 'redo': {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        ...next,
        past: [...state.past, snapshot(state)],
        future: state.future.slice(1),
        lastEdit: null
      };
    }
  }
};
