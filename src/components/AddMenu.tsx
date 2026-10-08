import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FIELD_TYPES, type FieldType } from '../model/ops';
import { TypeChip } from './ui';

const GAP = 4;
const MARGIN = 8;

interface Placement {
  top: number;
  left: number;
  maxHeight?: number;
}

/**
 * Where the menu goes: below the anchor when it fits, else above, else on the roomier side with a
 * capped height (the menu then scrolls). Kept inside the viewport horizontally.
 */
const place = (anchor: DOMRect, menu: { width: number; height: number }): Placement => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(MARGIN, Math.min(anchor.left, vw - menu.width - MARGIN));
  const below = vh - anchor.bottom - GAP - MARGIN;
  const above = anchor.top - GAP - MARGIN;
  if (menu.height <= below) return { top: anchor.bottom + GAP, left };
  if (menu.height <= above) return { top: anchor.top - GAP - menu.height, left };
  return below >= above
    ? { top: anchor.bottom + GAP, left, maxHeight: below }
    : { top: MARGIN, left, maxHeight: above };
};

/**
 * The field type picker. Rendered into `document.body` so the scrolling panels around the tree
 * cannot clip it, and kept attached to its anchor button while the page or a panel scrolls.
 */
export const AddMenu = ({
  anchor,
  onPick,
  onClose
}: {
  anchor: HTMLElement | null;
  onPick: (t: FieldType) => void;
  onClose: () => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      const menu = ref.current;
      if (!anchor || !menu) return;
      // measure the menu at its natural height, not a previously capped one
      const prev = menu.style.maxHeight;
      menu.style.maxHeight = '';
      const size = { width: menu.offsetWidth, height: menu.scrollHeight };
      menu.style.maxHeight = prev;
      setPlacement(place(anchor.getBoundingClientRect(), size));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchor]);

  // the parent passes a new onClose on every render; keep listeners (and focus) from re-running for it
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  // focus the first item once the menu is placed: before that it is hidden and cannot take focus
  const placed = placement !== null;
  useEffect(() => {
    if (placed) ref.current?.querySelector('button')?.focus({ preventScroll: true });
  }, [placed]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      const target = e.target as Node;
      // the anchor toggles the menu itself; closing here would reopen it on the same click
      if (!ref.current?.contains(target) && !anchor?.contains(target)) close.current();
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close.current();
        anchor?.focus();
      }
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', keys);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', keys);
    };
  }, [anchor]);

  const moveFocus = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return createPortal(
    <div
      className="add-menu"
      ref={ref}
      role="menu"
      onKeyDown={moveFocus}
      style={
        placement
          ? { top: placement.top, left: placement.left, maxHeight: placement.maxHeight }
          : { top: 0, left: 0, visibility: 'hidden' }
      }
    >
      {FIELD_TYPES.map((t) => (
        <button key={t.type} type="button" role="menuitem" onClick={() => onPick(t.type)}>
          <TypeChip type={t.type} />
          <span className="add-menu-label">{t.label}</span>
          <span className="add-menu-hint">{t.hint}</span>
        </button>
      ))}
    </div>,
    document.body
  );
};
