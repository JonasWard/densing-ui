import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import { useMemo, useRef, useState } from 'react';
import { formatBits } from '../model/analyze';
import {
  allNames,
  canMove,
  duplicateField,
  fieldTemplate,
  insertField,
  moveField,
  removeField,
  uniqueName,
  type FieldType
} from '../model/ops';
import { pathKey, samePath, type NodePath } from '../model/paths';
import { useEditor } from '../editor';
import { AddMenu } from './AddMenu';
import { buildRows, dropTargetFor, type DropTarget, type Row } from './tree-rows';
import { TypeChip } from './ui';

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
  pointer: 'ref'
};

export const OutlineTree = ({ onRequestRename }: { onRequestRename: () => void }) => {
  const { doc, dispatch, state, analysis, hover, setHover } = useEditor();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Row | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);
  const treeRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => buildRows(doc.schema, collapsed), [doc.schema, collapsed]);
  const fieldRows = rows.filter((r): r is Extract<Row, { kind: 'field' }> => r.kind === 'field');
  const selectedKey = state.selected ? pathKey(state.selected) : null;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const toggle = (key: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const addField = (list: NodePath, index: number, type: FieldType) => {
    const taken = allNames(doc.schema);
    const name = uniqueName(taken, BASE_NAMES[type]);
    taken.add(name);
    const field = fieldTemplate(type, name, taken);
    dispatch({ type: 'editSchema', schema: insertField(doc.schema, list, index, field), select: [...list, index] });
    setMenuFor(null);
    onRequestRename();
  };

  const select = (path: NodePath | null) => dispatch({ type: 'select', path });

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, select, .add-menu')) return;
    const i = fieldRows.findIndex((r) => r.key === selectedKey);
    const current = fieldRows[i];
    const mod = e.metaKey || e.ctrlKey;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (e.altKey && current?.list) {
        const to = e.key === 'ArrowUp' ? current.index - 1 : current.index + 2;
        const r = moveField(doc.schema, current.path, current.list, Math.max(0, to));
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
      const after = removeField(doc.schema, current.path);
      const siblings = fieldRows.filter((r) => r.list && samePath(r.list, current.list) && r.key !== current.key);
      const nextSel = siblings.length ? [...current.list, Math.min(current.index, siblings.length - 1)] : null;
      dispatch({ type: 'editSchema', schema: after, select: nextSel });
    } else if (mod && e.key.toLowerCase() === 'd' && current) {
      e.preventDefault();
      const r = duplicateField(doc.schema, current.path);
      if (r) dispatch({ type: 'editSchema', schema: r.schema, select: r.path });
    } else if (e.key === 'Enter' && current) {
      e.preventDefault();
      onRequestRename();
    }
  };

  const rowByKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows]);

  const targetFor = (e: DragMoveEvent | DragEndEvent): DropTarget | null => {
    if (!e.over || !dragging || dragging.kind !== 'field') return null;
    const row = rowByKey.get(String(e.over.id));
    if (!row) return null;
    const start = e.activatorEvent as PointerEvent;
    const y = (start.clientY + e.delta.y - e.over.rect.top) / e.over.rect.height;
    const t = dropTargetFor(row, y, collapsed);
    return t && canMove(dragging.path, t.list) ? t : null;
  };

  return (
    <div className="panel tree-panel">
      <div className="panel-head">
        <h2>Structure</h2>
        <span className="muted small">
          {analysis.total
            ? `${formatBits(analysis.total)} bits`
            : `${analysis.errors.size + analysis.rootErrors.length} issue(s)`}
        </span>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(e: DragStartEvent) => setDragging(rowByKey.get(String(e.active.id)) ?? null)}
        onDragMove={(e) => setDrop(targetFor(e))}
        onDragCancel={() => {
          setDragging(null);
          setDrop(null);
        }}
        onDragEnd={(e) => {
          const t = targetFor(e);
          if (t && dragging?.kind === 'field') {
            const r = moveField(doc.schema, dragging.path, t.list, t.index);
            if (r) {
              dispatch({ type: 'editSchema', schema: r.schema, select: r.path });
              setCollapsed((c) => {
                const n = new Set(c);
                n.delete(pathKey(t.list));
                return n;
              });
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
              errors={row.kind === 'field' ? analysis.errors.get(row.key) : undefined}
              bits={row.kind === 'field' ? formatBits(analysis.ranges.get(row.key)) : ''}
              menuOpen={menuFor === row.key}
              onToggle={() => toggle(row.key)}
              onSelect={() => {
                if (row.kind === 'field') select(row.path);
                if (row.kind === 'variant') select(row.union);
                treeRef.current?.focus();
              }}
              onHover={() => setHover(row.kind === 'field' ? { nodeKey: row.key } : {})}
              onOpenMenu={() => setMenuFor(menuFor === row.key ? null : row.key)}
              onCloseMenu={() => setMenuFor(null)}
              onAdd={(type) => row.kind === 'add' && addField(row.list, row.index, type)}
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
      <p className="muted small tree-help">
        Drag <span className="kbd">⠿</span> to move or nest · <span className="kbd">↑↓</span> select ·{' '}
        <span className="kbd">Alt ↑↓</span> reorder · <span className="kbd">Ctrl D</span> duplicate ·{' '}
        <span className="kbd">Del</span> remove
      </p>
    </div>
  );
};

interface TreeRowProps {
  row: Row;
  selected: boolean;
  hovered: boolean;
  collapsed: boolean;
  drop: DropTarget['pos'] | null;
  errors?: string[];
  bits: string;
  menuOpen: boolean;
  onToggle: () => void;
  onSelect: () => void;
  onHover: () => void;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onAdd: (t: FieldType) => void;
}

const TreeRow = ({
  row,
  selected,
  hovered,
  collapsed,
  drop,
  errors,
  bits,
  menuOpen,
  onToggle,
  onSelect,
  onHover,
  onOpenMenu,
  onCloseMenu,
  onAdd
}: TreeRowProps) => {
  const movable = row.kind === 'field' && !!row.list;
  const drag = useDraggable({ id: row.key, disabled: !movable });
  const dropZone = useDroppable({ id: row.key });
  const setRef = (el: HTMLElement | null) => {
    drag.setNodeRef(el);
    dropZone.setNodeRef(el);
  };
  const indent = { paddingLeft: `${0.5 + row.depth * 1.1}rem` };
  const dropClass = drop ? `drop-${drop}` : '';

  if (row.kind === 'add') {
    return (
      <div ref={setRef} className={`tree-row add-row ${dropClass}`} style={indent}>
        <button type="button" className="add-btn" onClick={onOpenMenu} aria-haspopup="menu" aria-expanded={menuOpen}>
          + Add field
        </button>
        {menuOpen && <AddMenu onPick={onAdd} onClose={onCloseMenu} />}
      </div>
    );
  }

  if (row.kind === 'variant') {
    return (
      <div
        ref={setRef}
        className={`tree-row variant-row ${dropClass} ${selected ? 'in-selected' : ''}`}
        style={indent}
        onClick={onSelect}
      >
        <button
          type="button"
          className="chev"
          onClick={(e) => (e.stopPropagation(), onToggle())}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? '▸' : '▾'}
        </button>
        <span className="variant-label">
          <span className="muted">when</span> {row.variant}
        </span>
        <span className="muted small">
          {row.count === 0 ? 'no fields' : `${row.count} field${row.count > 1 ? 's' : ''}`}
        </span>
      </div>
    );
  }

  const { field } = row;
  return (
    <div
      ref={setRef}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={row.hasChildren ? !collapsed : undefined}
      className={`tree-row field-row ${selected ? 'selected' : ''} ${hovered ? 'hovered' : ''} ${errors ? 'has-error' : ''} ${dropClass} ${
        drag.isDragging ? 'is-dragging' : ''
      }`}
      style={indent}
      onClick={onSelect}
      onMouseEnter={onHover}
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
      {field.type === 'pointer' && <span className="muted small">→ {field.targetName || '?'}</span>}
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
};
