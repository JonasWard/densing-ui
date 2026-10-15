import { useRef, type ReactNode } from 'react';
import { canHide, equalize, resize, visiblePanels, visibleSizes, type Layout, type PanelId } from '../model/layout';

export interface PanelSpec {
  id: PanelId;
  title: string;
  actions?: ReactNode;
  body: ReactNode;
}

const KEY_STEP = 0.02;

/**
 * The content panels side by side. Separators between neighbours resize them (drag, or ←/→ when
 * focused; double-click evens the two out), and each panel can be hidden while another is visible.
 */
export const PanelLayout = ({
  panels,
  layout,
  onLayout
}: {
  panels: PanelSpec[];
  layout: Layout;
  onLayout: (l: Layout) => void;
}) => {
  const row = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number; start: Layout; left: PanelId; right: PanelId } | null>(null);
  const visible = visiblePanels(layout);
  const shares = visibleSizes(layout);
  const byId = new Map(panels.map((p) => [p.id, p]));

  /** width the panels share, without the separators */
  const panelWidth = () => {
    const el = row.current;
    if (!el) return 1;
    const seps = [...el.querySelectorAll<HTMLElement>(':scope > .pane-separator')].reduce(
      (s, x) => s + x.offsetWidth,
      0
    );
    return Math.max(1, el.clientWidth - seps);
  };

  return (
    <div className="panes" ref={row}>
      {visible.map((id, i) => {
        const spec = byId.get(id)!;
        const next = visible[i + 1];
        return [
          <section key={id} className={`pane pane-${id}`} style={{ flex: `${shares[id]} 1 0` }} aria-label={spec.title}>
            <div className="pane-head">
              <h2>{spec.title}</h2>
              <div className="pane-actions">{spec.actions}</div>
              <button
                type="button"
                className="icon-btn pane-hide"
                aria-label={`Hide ${spec.title}`}
                title={canHide(layout, id) ? `Hide ${spec.title}` : 'One panel always stays open'}
                disabled={!canHide(layout, id)}
                onClick={() => onLayout({ ...layout, hidden: [...layout.hidden, id] })}
              >
                ×
              </button>
            </div>
            <div className="pane-body">{spec.body}</div>
          </section>,
          next && (
            <div
              key={`${id}|${next}`}
              className="pane-separator"
              role="separator"
              aria-orientation="vertical"
              aria-label={`Resize ${spec.title} and ${byId.get(next)!.title}`}
              aria-valuenow={Math.round((shares[id] ?? 0) * 100)}
              tabIndex={0}
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                drag.current = { x: e.clientX, width: panelWidth(), start: layout, left: id, right: next };
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (d) onLayout(resize(d.start, d.left, d.right, (e.clientX - d.x) / d.width));
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onDoubleClick={() => onLayout(equalize(layout, id, next))}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  onLayout(resize(layout, id, next, e.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP));
                }
              }}
            />
          )
        ];
      })}
    </div>
  );
};

const MIN_BITS = 48;

/** The handle under the bits area: drag to change its height, double-click for its natural height */
export const BitsSeparator = ({
  area,
  layout,
  onLayout
}: {
  area: React.RefObject<HTMLDivElement | null>;
  layout: Layout;
  onLayout: (l: Layout) => void;
}) => {
  const drag = useRef<{ y: number; height: number } | null>(null);
  const clamp = (h: number) => Math.round(Math.max(MIN_BITS, Math.min(window.innerHeight * 0.7, h)));
  return (
    <div
      className="bits-separator"
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the bits area"
      tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { y: e.clientY, height: area.current?.getBoundingClientRect().height ?? 120 };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) onLayout({ ...layout, bitsHeight: clamp(d.height + e.clientY - d.y) });
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={() => onLayout({ ...layout, bitsHeight: null })}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const h = layout.bitsHeight ?? area.current?.getBoundingClientRect().height ?? 120;
          onLayout({ ...layout, bitsHeight: clamp(h + (e.key === 'ArrowDown' ? 16 : -16)) });
        }
      }}
    />
  );
};

/** Mobile: a section that folds shut from its header */
export const FoldSection = ({
  title,
  open,
  onToggle,
  actions,
  children
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) => (
  <section className={`fold ${open ? 'open' : ''}`} aria-label={title}>
    <div className="fold-head">
      <button type="button" className="fold-toggle" aria-expanded={open} onClick={onToggle}>
        <span className="chev-glyph">{open ? '▾' : '▸'}</span>
        <h2>{title}</h2>
      </button>
      {open && actions && <div className="pane-actions">{actions}</div>}
    </div>
    {open && <div className="fold-body">{children}</div>}
  </section>
);

/** Reopen hidden panels / see which are open (desktop header) */
export const ViewToggles = ({
  panels,
  layout,
  onToggle
}: {
  panels: { id: PanelId; title: string }[];
  layout: Layout;
  onToggle: (id: PanelId) => void;
}) => (
  <div className="segmented small view-toggles" role="group" aria-label="Panels">
    {panels.map((p) => {
      const shown = !layout.hidden.includes(p.id);
      return (
        <button
          key={p.id}
          type="button"
          aria-pressed={shown}
          className={shown ? 'on' : ''}
          disabled={shown && !canHide(layout, p.id)}
          title={
            shown ? (canHide(layout, p.id) ? `Hide ${p.title}` : 'One panel always stays open') : `Show ${p.title}`
          }
          onClick={() => onToggle(p.id)}
        >
          {p.title}
        </button>
      );
    })}
  </div>
);
