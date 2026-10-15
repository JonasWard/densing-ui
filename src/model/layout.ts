/** The three content panels, left to right */
export const PANELS = ['structure', 'inspector', 'side'] as const;
export type PanelId = (typeof PANELS)[number];

export interface Layout {
  /** relative share of each panel; hidden panels keep theirs so showing them again restores it */
  sizes: Record<PanelId, number>;
  hidden: PanelId[];
  /** height of the bits area in px, `null` for its natural height (capped by CSS) */
  bitsHeight: number | null;
  /** mobile only: sections that are folded shut */
  closedSections: string[];
}

export const DEFAULT_LAYOUT: Layout = {
  sizes: { structure: 0.27, inspector: 0.4, side: 0.33 },
  hidden: [],
  bitsHeight: null,
  closedSections: []
};

/** Smallest share a visible panel may get */
export const MIN_SHARE = 0.15;

export const visiblePanels = (layout: Layout): PanelId[] => PANELS.filter((id) => !layout.hidden.includes(id));

/** Shares of the visible panels, scaled to add up to 1 */
export const visibleSizes = (layout: Layout): Partial<Record<PanelId, number>> => {
  const visible = visiblePanels(layout);
  const total = visible.reduce((s, id) => s + layout.sizes[id], 0) || 1;
  return Object.fromEntries(visible.map((id) => [id, layout.sizes[id] / total]));
};

/**
 * Move the boundary between two neighbouring visible panels by `delta` (a share of the visible
 * width; positive grows `left`). Neither side drops below `min`.
 */
export const resize = (layout: Layout, left: PanelId, right: PanelId, delta: number, min = MIN_SHARE): Layout => {
  const shares = visibleSizes(layout);
  const a = shares[left];
  const b = shares[right];
  if (a === undefined || b === undefined) return layout;
  const d = Math.max(min - a, Math.min(b - min, delta));
  const next = { ...shares, [left]: a + d, [right]: b - d };
  // write the new visible shares back, leaving the hidden panels' shares as they were
  return { ...layout, sizes: { ...layout.sizes, ...rescale(layout, next) } };
};

/** Visible shares (adding up to 1) back into the scale the stored sizes use */
const rescale = (layout: Layout, shares: Partial<Record<PanelId, number>>) => {
  const total = visiblePanels(layout).reduce((s, id) => s + layout.sizes[id], 0) || 1;
  return Object.fromEntries(Object.entries(shares).map(([id, v]) => [id, (v as number) * total]));
};

/** Equal shares for two neighbours (double-click on their separator) */
export const equalize = (layout: Layout, left: PanelId, right: PanelId): Layout => {
  const shares = visibleSizes(layout);
  if (shares[left] === undefined || shares[right] === undefined) return layout;
  const half = (shares[left]! + shares[right]!) / 2;
  return { ...layout, sizes: { ...layout.sizes, ...rescale(layout, { ...shares, [left]: half, [right]: half }) } };
};

/** Show or hide a panel; hiding the last visible one is refused */
export const togglePanel = (layout: Layout, id: PanelId): Layout => {
  if (layout.hidden.includes(id)) return { ...layout, hidden: layout.hidden.filter((h) => h !== id) };
  if (visiblePanels(layout).length <= 1) return layout;
  return { ...layout, hidden: [...layout.hidden, id] };
};

export const canHide = (layout: Layout, id: PanelId) => !layout.hidden.includes(id) && visiblePanels(layout).length > 1;

export const toggleSection = (layout: Layout, id: string): Layout => ({
  ...layout,
  closedSections: layout.closedSections.includes(id)
    ? layout.closedSections.filter((s) => s !== id)
    : [...layout.closedSections, id]
});

const STORAGE_KEY = 'densing-ui:layout';

/** A saved layout, or the default when there is none or it does not make sense */
export const parseLayout = (raw: string | null): Layout => {
  try {
    if (!raw) return DEFAULT_LAYOUT;
    const v = JSON.parse(raw);
    const sizes = PANELS.map((id) => v?.sizes?.[id]);
    if (!sizes.every((x) => typeof x === 'number' && Number.isFinite(x) && x > 0)) return DEFAULT_LAYOUT;
    const hidden = Array.isArray(v.hidden) ? PANELS.filter((id) => v.hidden.includes(id)) : [];
    const bitsHeight =
      typeof v.bitsHeight === 'number' && Number.isFinite(v.bitsHeight) && v.bitsHeight > 0 ? v.bitsHeight : null;
    const closedSections = Array.isArray(v.closedSections)
      ? v.closedSections.filter((s: unknown) => typeof s === 'string')
      : [];
    return {
      sizes: Object.fromEntries(PANELS.map((id, i) => [id, sizes[i]])) as Layout['sizes'],
      // at least one panel stays visible, whatever was saved
      hidden: hidden.length >= PANELS.length ? [] : hidden,
      bitsHeight,
      closedSections
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
};

export const loadLayout = (): Layout => {
  try {
    return parseLayout(localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_LAYOUT;
  }
};

export const saveLayout = (layout: Layout) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // storage unavailable: the layout just isn't remembered
  }
};
