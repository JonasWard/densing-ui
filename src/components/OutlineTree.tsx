import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import { memo, useLayoutEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import type { DenseSchema } from 'densing';
import type { Analysis } from '../model/analyze';
import type { Action } from '../model/store';
import { formatBits } from '../model/analyze';
import {
  allNames,
  canMove,
  duplicateField,
  fieldTemplate,
  insertField,
  moveField,
  uniqueName,
  type FieldType
} from '../model/ops';
import { pathKey, samePath, type NodePath } from '../model/paths';
import { useEditor, type Hover } from '../editor';
import { useCollapse } from '../ui-state';
import { addTemplate, deleteNode, templateUseCounts, withVariantTemplates } from '../model/templates';
import { isTemplateRoot } from '../model/paths';
import { addDefinition, definitionsOf, presetNames, usesOf } from '../model/definitions';
import { AddMenu } from './AddMenu';
import { buildRows, dropTargetFor, foldableKeys, type DropTarget, type Row } from './tree-rows';
import { TypeChip } from './ui';

const NO_TEMPLATE = ['choose a template for this variant'];

const BASE_NAMES: Record<FieldType, string> = {
  bool: 'flag',
  int: 'count',
  fixed: 'amount',
  enum: 'kind',
  object: 'group',
  array: 'list',
  enum_array: 'tags',
  optional: 'maybe',
  union: 'choice',
  reference_numeric: 'size',
  reference: 'part'
};

export const OutlineTree = ({ onRequestRename }: { onRequestRename: () => void }) => {
  const { doc, dispatch, state, analysis, hover, setHover } = useEditor();
  // a stable callback, so the tree below skips re-rendering when only the preview data changes
  const rename = useRef(onRequestRename);
  useLayoutEffect(() => {
    rename.current = onRequestRename;
  });
  const requestRename = useMemo(() => () => rename.current(), []);
  return (
    <div className="tree-panel">
      <DefinitionsSection />
      <TreeView
        schema={doc.schema}
        selected={state.selected}
        analysis={analysis}
        hover={hover}
        dispatch={dispatch}
        setHover={setHover}
        onRequestRename={requestRename}
      />
      <p className="muted small tree-help">
        Drag <span className="kbd">⠿</span> to move or nest · <span className="kbd">↑↓</span> select ·{' '}
        <span className="kbd">Alt ↑↓</span> reorder · <span className="kbd">Ctrl D</span> duplicate ·{' '}
        <span className="kbd">Del</span> remove
      </p>
    </div>
  );
};

interface TreeViewProps {
  schema: DenseSchema;
  selected: NodePath | null;
  analysis: Analysis;
  hover: Hover;
  dispatch: Dispatch<Action>;
  setHover: (h: Hover) => void;
  onRequestRename: () => void;
}

const TreeView = memo(function TreeView({
  schema: docSchema,
  selected,
  analysis,
  hover,
  dispatch,
  setHover,
  onRequestRename
}: TreeViewProps) {
  const fold = useCollapse();
  // this tree's folded rows, from the shared collapse state (`tree:<row key>`)
  const collapsed = useMemo(
    () => new Set([...fold.collapsed].filter((k) => k.startsWith('tree:')).map((k) => k.slice(5))),
    [fold.collapsed]
  );
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Row | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => buildRows(docSchema, collapsed), [docSchema, collapsed]);
  const fieldRows = rows.filter((r): r is Extract<Row, { kind: 'field' }> => r.kind === 'field');
  const selectedKey = selected ? pathKey(selected) : null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const toggle = (key: string) => fold.toggle(`tree:${key}`);

  const addField = (list: NodePath, index: number, type: FieldType) => {
    const taken = allNames(docSchema);
    const name = uniqueName(taken, BASE_NAMES[type]);
    taken.add(name);
    let schema = docSchema;
    let field = fieldTemplate(type, name, taken);
    if (field.type === 'reference_numeric') {
      // a shared number needs a definition: use the first one, or create one
      const first = definitionsOf(schema)[0];
      if (first) field = { ...field, ref: first.name };
      else {
        const added = addDefinition(schema);
        schema = added.schema;
        field = { ...field, ref: added.name };
      }
    }
    if (field.type === 'reference') {
      // a reference needs a template: use the first one, or create one
      if (!schema.templates?.length) schema = addTemplate(schema).schema;
      field = { ...field, ref: 0 };
    }
    // a union's variants each get a new empty template
    ({ schema, field } = withVariantTemplates(schema, field));
    dispatch({ type: 'editSchema', schema: insertField(schema, list, index, field), select: [...list, index] });
    setMenuFor(null);
    onRequestRename();
  };

  const select = (path: NodePath | null) => dispatch({ type: 'select', path });

  // uses per template (references and union variants), counted once per schema rather than once per row
  const useCounts = useMemo(() => templateUseCounts(docSchema), [docSchema]);

  /** a short hint after the name: what a reference uses, how often a template is used */
  const rowNote = (row: Extract<Row, { kind: 'field' }>): string | undefined => {
    const f = row.field;
    if (f.type === 'reference') return `→ ${docSchema.templates?.[f.ref]?.name ?? '?'}`;
    if (isTemplateRoot(row.path)) {
      const uses = useCounts.get(row.index) ?? 0;
      return `${uses} use${uses === 1 ? '' : 's'}`;
    }
    return undefined;
  };

  // rows get one stable set of handlers, so a row only re-renders when its own props change
  const latest = useRef<RowActions | null>(null);
  useLayoutEffect(() => {
    latest.current = {
      toggle,
      select: (row) => {
        if (row.kind === 'field') select(row.path);
        // a variant opens its template, where its fields are edited; without one, its union
        if (row.kind === 'variant') select(docSchema.templates?.[row.ref] ? ['templates', row.ref] : row.union);
        treeRef.current?.focus();
      },
      hover: (row) => setHover(row.kind === 'field' ? { nodeKey: row.key } : {}),
      openMenu: (key) => setMenuFor(menuFor === key ? null : key),
      closeMenu: () => setMenuFor(null),
      add: (row, type) => row.kind === 'add' && addField(row.list, row.index, type),
      addTemplate: () => {
        const r = addTemplate(docSchema);
        dispatch({ type: 'editSchema', schema: r.schema, select: r.path });
      }
    };
  });
  const actions = useMemo<RowActions>(
    () => ({
      toggle: (key) => latest.current?.toggle(key),
      select: (row) => latest.current?.select(row),
      hover: (row) => latest.current?.hover(row),
      openMenu: (key) => latest.current?.openMenu(key),
      closeMenu: () => latest.current?.closeMenu(),
      add: (row, type) => latest.current?.add(row, type),
      addTemplate: () => latest.current?.addTemplate()
    }),
    []
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, select, .add-menu')) return;
    const i = fieldRows.findIndex((r) => r.key === selectedKey);
    const current = fieldRows[i];
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (e.altKey && current?.list) {
        const to = e.key === 'ArrowUp' ? current.index - 1 : current.index + 2;
        const r = moveField(docSchema, current.path, current.list, Math.max(0, to));
        if (r && !samePath(r.path, current.path)) dispatch({ type: 'editSchema', schema: r.schema, select: r.path });
        return;
      }
      const next = fieldRows[e.key === 'ArrowDown' ? Math.min(fieldRows.length - 1, i + 1) : Math.max(0, i - 1)];
      if (next) select(next.path);
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && current?.hasChildren) {
      e.preventDefault();
      const isCollapsed = collapsed.has(current.key);
      if ((e.key === 'ArrowLeft') !== isCollapsed) toggle(current.key);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && current?.list) {
      e.preventDefault();
      const after = deleteNode(docSchema, current.path);
      const siblings = fieldRows.filter((r) => r.list && samePath(r.list, current.list) && r.key !== current.key);
      const nextSel = siblings.length ? [...current.list, Math.min(current.index, siblings.length - 1)] : null;
      dispatch({ type: 'editSchema', schema: after, select: nextSel });
    } else if (mod && e.key.toLowerCase() === 'd' && current) {
      e.preventDefault();
      const r = duplicateField(docSchema, current.path);
      if (r) dispatch({ type: 'editSchema', schema: r.schema, select: r.path });
    } else if (e.key === 'Enter' && current) {
      e.preventDefault();
      onRequestRename();
    }
  };

  const rowByKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  // the row under the pointer, found from the DOM: registering every row as a dnd-kit droppable costs
  // O(rows²) on mount, which takes seconds for schemas with thousands of rows
  const targetFor = (e: DragMoveEvent | DragEndEvent): DropTarget | null => {
    if (!dragging || dragging.kind !== 'field') return null;
    const start = e.activatorEvent as PointerEvent;
    const x = start.clientX + e.delta.x;
    const y = start.clientY + e.delta.y;
    const el = document
      .elementsFromPoint(x, y)
      .map((n) => n.closest('[data-row-key]'))
      .find((n) => n && treeRef.current?.contains(n));
    const row = el && rowByKey.get(el.getAttribute('data-row-key')!);
    if (!el || !row) return null;
    const rect = el.getBoundingClientRect();
    const t = dropTargetFor(row, (y - rect.top) / rect.height, collapsed);
    return t && canMove(dragging.path, t.list) ? t : null;
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e: DragStartEvent) => setDragging(rowByKey.get(String(e.active.id)) ?? null)}
      onDragMove={(e) => setDrop(targetFor(e))}
      onDragCancel={() => {
        setDragging(null);
        setDrop(null);
      }}
      onDragEnd={(e) => {
        const t = targetFor(e);
        if (t && dragging?.kind === 'field') {
          const r = moveField(docSchema, dragging.path, t.list, t.index);
          if (r) {
            dispatch({ type: 'editSchema', schema: r.schema, select: r.path });
            fold.setMany([`tree:${pathKey(t.list)}`], false);
          }
        }
        setDragging(null);
        setDrop(null);
      }}
    >
      <div
        className="tree"
        role="tree"
        tabIndex={0}
        ref={treeRef}
        onKeyDown={onKeyDown}
        onMouseLeave={() => setHover({})}
        aria-label="Schema structure"
      >
        {rows.map((row) => (
          <TreeRow
            key={row.key}
            row={row}
            selected={
              row.kind === 'field'
                ? row.key === selectedKey
                : row.kind === 'variant' && pathKey(row.union) === selectedKey
            }
            hovered={row.kind === 'field' && hover.nodeKey === row.key}
            collapsed={collapsed.has(row.key)}
            drop={drop?.rowKey === row.key ? drop.pos : null}
            errors={
              row.kind === 'field'
                ? analysis.errors.get(row.key)
                : row.kind === 'variant' && !docSchema.templates?.[row.ref]
                  ? NO_TEMPLATE
                  : undefined
            }
            bits={
              row.kind === 'field'
                ? formatBits(analysis.ranges.get(row.key))
                : row.kind === 'variant' && docSchema.templates?.[row.ref]
                  ? formatBits(analysis.ranges.get(pathKey(['templates', row.ref])))
                  : ''
            }
            menuOpen={menuFor === row.key}
            note={
              row.kind === 'field'
                ? rowNote(row)
                : row.kind === 'variant'
                  ? `→ ${docSchema.templates?.[row.ref]?.name ?? 'no template'}`
                  : undefined
            }
            actions={actions}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {dragging?.kind === 'field' && (
          <div className="tree-row drag-ghost">
            <TypeChip type={dragging.field.type} />
            <span className="row-name">{dragging.field.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
});

interface RowActions {
  toggle: (key: string) => void;
  select: (row: Row) => void;
  hover: (row: Row) => void;
  openMenu: (key: string) => void;
  closeMenu: () => void;
  add: (row: Row, type: FieldType) => void;
  addTemplate: () => void;
}

interface TreeRowProps {
  row: Row;
  selected: boolean;
  hovered: boolean;
  collapsed: boolean;
  drop: DropTarget['pos'] | null;
  errors?: string[];
  bits: string;
  menuOpen: boolean;
  note?: string;
  actions: RowActions;
}

const TreeRow = memo(function TreeRow({
  row,
  selected,
  hovered,
  collapsed,
  drop,
  errors,
  bits,
  menuOpen,
  note,
  actions
}: TreeRowProps) {
  const movable = row.kind === 'field' && !!row.list && !isTemplateRoot(row.path);
  const drag = useDraggable({ id: row.key, disabled: !movable });
  const setRef = (el: HTMLElement | null) => drag.setNodeRef(el);
  const onToggle = () => actions.toggle(row.key);
  const onSelect = () => actions.select(row);
  const indent = { paddingLeft: `${0.5 + row.depth * 1.1}rem` };
  const dropClass = drop ? `drop-${drop}` : '';
  // the add menu floats above the page and positions itself against this button
  const [addButton, setAddButton] = useState<HTMLButtonElement | null>(null);

  if (row.kind === 'add') {
    return (
      <div ref={setRef} data-row-key={row.key} className={`tree-row add-row ${dropClass}`} style={indent}>
        <button
          ref={setAddButton}
          type="button"
          className="add-btn"
          onClick={() => actions.openMenu(row.key)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          + Add field
        </button>
        {menuOpen && (
          <AddMenu anchor={addButton} onPick={(type) => actions.add(row, type)} onClose={actions.closeMenu} />
        )}
      </div>
    );
  }

  if (row.kind === 'section') {
    return (
      <div
        ref={setRef}
        data-row-key={row.key}
        className={`tree-row section-row ${row.key === 'fields#' ? 'first' : ''}`}
      >
        <button
          type="button"
          className="section-toggle"
          aria-expanded={!collapsed}
          onClick={(e) => (e.stopPropagation(), onToggle())}
        >
          <span className="chev-glyph">{collapsed ? '▸' : '▾'}</span>
          <span className="form-label">{row.label}</span>
          <span className="muted small">{row.count === 0 ? 'none yet' : row.count}</span>
        </button>
        <span className="row-spacer" />
        {row.key === 'templates#' && (
          <button type="button" className="add-btn" onClick={actions.addTemplate}>
            + Template
          </button>
        )}
      </div>
    );
  }

  if (row.kind === 'variant') {
    return (
      <div
        ref={setRef}
        data-row-key={row.key}
        className={`tree-row variant-row ${selected ? 'in-selected' : ''} ${errors ? 'has-error' : ''}`}
        style={indent}
        onClick={onSelect}
        title="Edit this variant's fields in its template"
      >
        <span className="chev" />
        <span className="variant-label">
          <span className="muted">when</span> {row.variant}
        </span>
        {note && <span className="muted small">{note}</span>}
        <span className="row-spacer" />
        {errors && (
          <span className="error-dot" title={errors.join('\n')}>
            !
          </span>
        )}
        <span className="bits-badge">{bits}</span>
      </div>
    );
  }

  const { field } = row;
  return (
    <div
      ref={setRef}
      data-row-key={row.key}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={row.hasChildren ? !collapsed : undefined}
      className={`tree-row field-row ${selected ? 'selected' : ''} ${hovered ? 'hovered' : ''} ${errors ? 'has-error' : ''} ${dropClass} ${
        drag.isDragging ? 'is-dragging' : ''
      }`}
      style={indent}
      onClick={onSelect}
      onMouseEnter={() => actions.hover(row)}
    >
      <span
        className={`grip ${movable ? '' : 'hidden'}`}
        {...(movable ? drag.listeners : {})}
        {...(movable ? drag.attributes : {})}
        title="Drag to move"
      >
        ⠿
      </span>
      {row.hasChildren ? (
        <button
          type="button"
          className="chev"
          onClick={(e) => (e.stopPropagation(), onToggle())}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
      ) : (
        <span className="chev" />
      )}
      <TypeChip type={field.type} />
      <span className="row-name">{field.name || <em className="muted">unnamed</em>}</span>
      {row.slot && <span className="slot-tag">{row.slot}</span>}
      {note && <span className="muted small">{note}</span>}
      {field.type === 'reference_numeric' && <span className="muted small">→ {field.ref || '?'}</span>}
      {field.type === 'array' && (
        <span className="muted small">
          ×{field.minLength === field.maxLength ? field.minLength : `${field.minLength}–${field.maxLength}`}
        </span>
      )}
      <span className="row-spacer" />
      {errors && (
        <span className="error-dot" title={errors.join('\n')}>
          !
        </span>
      )}
      <span className="bits-badge">{bits}</span>
    </div>
  );
});

/** Numeric definitions live beside the fields: shared ranges with presets, chosen once per payload */
const DefinitionsSection = () => {
  const { doc, state, dispatch, analysis, hover, setHover } = useEditor();
  const fold = useCollapse();
  const definitions = definitionsOf(doc.schema);
  const selectedKey = state.selected ? pathKey(state.selected) : null;
  const closed = fold.isCollapsed('tree:definitions#');
  return (
    <div className="definitions" onMouseLeave={() => setHover({})}>
      <div className="definitions-head">
        <button
          type="button"
          className="section-toggle"
          aria-expanded={!closed}
          onClick={() => fold.toggle('tree:definitions#')}
        >
          <span className="chev-glyph">{closed ? '▸' : '▾'}</span>
          <span className="form-label">Shared numbers</span>
          <span className="muted small">{definitions.length === 0 ? 'none yet' : definitions.length}</span>
        </button>
        <button
          type="button"
          className="add-btn"
          onClick={() => {
            const r = addDefinition(doc.schema);
            dispatch({ type: 'editSchema', schema: r.schema, select: r.path });
          }}
        >
          + Definition
        </button>
      </div>
      {!closed && definitions.length === 0 && (
        <p className="muted small definitions-empty">
          A definition is a numeric range with presets (e.g. mm or m), used by any number of “shared number” fields.
        </p>
      )}
      {!closed &&
        definitions.map((d, i) => {
          const key = pathKey(['definitions', i]);
          const uses = usesOf(doc.schema, d.name).length;
          return (
            <div
              key={i}
              className={`tree-row field-row def-row ${selectedKey === key ? 'selected' : ''} ${hover.nodeKey === key ? 'hovered' : ''} ${
                analysis.errors.has(key) ? 'has-error' : ''
              }`}
              onClick={() => dispatch({ type: 'select', path: ['definitions', i] })}
              onMouseEnter={() => setHover({ nodeKey: key })}
            >
              <span className="type-chip t-definition">def</span>
              <span className="row-name">{d.name || <em className="muted">unnamed</em>}</span>
              <span className="muted small">
                {presetNames(d).length} preset{presetNames(d).length === 1 ? '' : 's'} · {uses} use
                {uses === 1 ? '' : 's'}
              </span>
              <span className="row-spacer" />
              {analysis.errors.has(key) && (
                <span className="error-dot" title={analysis.errors.get(key)!.join('\n')}>
                  !
                </span>
              )}
              <span className="bits-badge" title="bits in the payload header to choose the preset">
                {formatBits(analysis.ranges.get(key))}
              </span>
            </div>
          );
        })}
    </div>
  );
};

/** Panel-head buttons for the Structure panel: fold every container, or open everything */
export const StructureActions = () => {
  const { doc, analysis } = useEditor();
  const fold = useCollapse();
  return (
    <>
      <span className="muted small">
        {analysis.total
          ? `${formatBits(analysis.total)} bits`
          : `${analysis.errors.size + analysis.rootErrors.length} issue(s)`}
      </span>
      <button
        type="button"
        className="btn small"
        title="Fold every container; the sections stay open"
        onClick={() => {
          fold.clear('tree:');
          fold.setMany(
            foldableKeys(doc.schema).map((k) => `tree:${k}`),
            true
          );
        }}
      >
        Collapse all
      </button>
      <button type="button" className="btn small" onClick={() => fold.clear('tree:')}>
        Expand all
      </button>
    </>
  );
};
