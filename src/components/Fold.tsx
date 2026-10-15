import type { ReactNode } from 'react';
import { useCollapse } from '../ui-state';

/** A titled block that folds shut from its header; `id` is its key in the shared collapse state */
export const Fold = ({
  id,
  title,
  actions,
  children,
  className = ''
}: {
  id: string;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) => {
  const fold = useCollapse();
  const closed = fold.isCollapsed(id);
  return (
    <div className={`fold-block ${className}`}>
      <div className="fold-block-head">
        <button type="button" className="section-toggle" aria-expanded={!closed} onClick={() => fold.toggle(id)}>
          <span className="chev-glyph">{closed ? '▸' : '▾'}</span>
          <h3>{title}</h3>
        </button>
        <span className="row-spacer" />
        {!closed && actions}
      </div>
      {!closed && children}
    </div>
  );
};
