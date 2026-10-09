import type { DenseField, DenseSchema } from 'densing';
import { pathKey, type NodePath } from '../model/paths';

export type Row =
  | {
      kind: 'field';
      key: string;
      path: NodePath;
      field: DenseField;
      depth: number;
      list: NodePath | null;
      index: number;
      slot?: string;
      hasChildren: boolean;
    }
  | { kind: 'variant'; key: string; path: NodePath; union: NodePath; variant: string; depth: number; count: number }
  | { kind: 'add'; key: string; list: NodePath; depth: number; index: number }
  /** the heading of the templates, below the fields */
  | { kind: 'section'; key: string; label: string; count: number; depth: number };

/** Flatten the schema into the rows the outline shows, skipping collapsed subtrees */
export const buildRows = (schema: DenseSchema, collapsed: Set<string>): Row[] => {
  const rows: Row[] = [];
  const list = (fields: DenseField[], listPath: NodePath, depth: number) => {
    fields.forEach((f, i) => field(f, [...listPath, i], depth, listPath, i));
    rows.push({ kind: 'add', key: `${pathKey(listPath)}+`, list: listPath, depth, index: fields.length });
  };
  const field = (
    f: DenseField,
    path: NodePath,
    depth: number,
    listPath: NodePath | null,
    index: number,
    slot?: string
  ) => {
    const key = pathKey(path);
    const hasChildren = f.type === 'object' || f.type === 'union' || f.type === 'array' || f.type === 'optional';
    rows.push({ kind: 'field', key, path, field: f, depth, list: listPath, index, slot, hasChildren });
    if (!hasChildren || collapsed.has(key)) return;
    switch (f.type) {
      case 'object':
        list(f.fields ?? [], [...path, 'fields'], depth + 1);
        break;
      case 'array':
        if (f.items) field(f.items, [...path, 'items'], depth + 1, null, 0, 'item');
        break;
      case 'optional':
        if (f.field) field(f.field, [...path, 'field'], depth + 1, null, 0, 'value');
        break;
      case 'union':
        for (const [variant, fields] of Object.entries(f.variants ?? {})) {
          const vPath = [...path, 'variants', variant];
          const vKey = pathKey(vPath);
          rows.push({
            kind: 'variant',
            key: vKey,
            path: vPath,
            union: path,
            variant,
            depth: depth + 1,
            count: fields.length
          });
          if (!collapsed.has(vKey)) list(fields, vPath, depth + 2);
        }
        break;
    }
  };
  list(schema.fields, ['fields'], 0);
  const templates = schema.templates ?? [];
  rows.push({ kind: 'section', key: 'templates#', label: 'Templates', count: templates.length, depth: 0 });
  // template roots sit in the root templates list; their position is the index references use
  templates.forEach((t, i) => field(t, ['templates', i], 0, ['templates'], i));
  return rows;
};

export type DropTarget = { rowKey: string; pos: 'before' | 'after' | 'into'; list: NodePath; index: number };

/** Where a drop on `row` at relative height `y` (0..1) lands */
export const dropTargetFor = (row: Row, y: number, collapsed: Set<string>): DropTarget | null => {
  if (row.kind === 'section') return null;
  if (row.kind === 'add') return { rowKey: row.key, pos: 'before', list: row.list, index: row.index };
  if (row.kind === 'variant') {
    const open = !collapsed.has(row.key);
    return { rowKey: row.key, pos: 'into', list: row.path, index: open ? 0 : row.count };
  }
  const { field, list, index } = row;
  if (field.type === 'object') {
    const open = !collapsed.has(row.key);
    const inside = {
      rowKey: row.key,
      pos: 'into' as const,
      list: [...row.path, 'fields'],
      index: open ? 0 : (field.fields?.length ?? 0)
    };
    if (!list) return inside;
    if (y < 0.3) return { rowKey: row.key, pos: 'before', list, index };
    if (!open && y > 0.7) return { rowKey: row.key, pos: 'after', list, index: index + 1 };
    return inside;
  }
  if (!list) return null;
  return y < 0.5
    ? { rowKey: row.key, pos: 'before', list, index }
    : { rowKey: row.key, pos: 'after', list, index: index + 1 };
};
