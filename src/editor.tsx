import { createContext, useContext, type Dispatch } from 'react';
import type { Analysis } from './model/analyze';
import type { Action, Doc, State } from './model/store';

export interface Hover {
  nodeKey?: string;
  dataPath?: string;
}

export interface EditorContextValue {
  state: State;
  dispatch: Dispatch<Action>;
  doc: Doc;
  analysis: Analysis;
  hover: Hover;
  setHover: (h: Hover) => void;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export const useEditor = () => {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('useEditor outside EditorContext');
  return ctx;
};

/** `a` equals `b` or is an ancestor of it in either path grammar (`x.y`, `x[0]`) */
export const coversPath = (a: string | undefined, b: string) =>
  !!a && (a === b || b.startsWith(`${a}.`) || b.startsWith(`${a}[`));
