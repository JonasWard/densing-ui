import { createContext, useContext } from 'react';

/**
 * What is folded shut in the Structure and Try it panels, by id: `tree:<row key>`,
 * `tree-section:<name>`, `data:<data path>`, `try:<section>`. Per browser tab, not part of the schema.
 */
export interface Collapse {
  collapsed: ReadonlySet<string>;
  isCollapsed: (id: string) => boolean;
  toggle: (id: string) => void;
  setMany: (ids: string[], collapsed: boolean) => void;
  /** open everything whose id starts with `prefix` */
  clear: (prefix: string) => void;
}

export const CollapseContext = createContext<Collapse | null>(null);

export const useCollapse = () => {
  const ctx = useContext(CollapseContext);
  if (!ctx) throw new Error('useCollapse outside CollapseContext');
  return ctx;
};
