import { validate, type DenseField, type DenseSchema } from 'densing';
import { useMemo } from 'react';
import { defaultFor, reconcile } from '../model/data';
import {
  activePresetName,
  definitionsOf,
  findDefinition,
  PRESETS_KEY,
  presetAsField,
  presetNames
} from '../model/definitions';
import { variantNames } from '../model/ops';
import { pathKey, type NodePath } from '../model/paths';
import { variantFields, variantObjectIndex } from '../model/templates';
import { useEditor } from '../editor';
import { useCollapse } from '../ui-state';
import { Fold } from './Fold';
import { NumberInput, Segmented, Toggle, TypeChip } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Ctx {
  schema: DenseSchema;
  errors: Map<string, string>;
  presets: unknown;
  depth: number;
}

export const DataForm = () => {
  const { doc, analysis, dispatch, hover, setHover } = useEditor();
  const schema = analysis.schema;
  const errors = useMemo(() => {
    const m = new Map<string, string>();
    if (schema) for (const e of validate(schema, doc.data).errors) m.set(e.path, e.message);
    return m;
  }, [schema, doc.data]);
  if (!schema) return <p className="muted small">The form appears once the schema is valid.</p>;
  const data = (doc.data ?? {}) as Record<string, any>;
  const ctx: Ctx = { schema, errors, presets: data[PRESETS_KEY], depth: 0 };
  return (
    <div
      className="data-form"
      onMouseLeave={() => setHover({})}
      // one handler for all rows: the innermost row under the pointer is the value being pointed at
      onMouseOver={(e) => {
        const row = (e.target as HTMLElement).closest<HTMLElement>('.data-row[data-path]');
        if (!row) return;
        const { path, node } = row.dataset;
        if (path !== hover.dataPath || node !== hover.nodeKey) setHover({ dataPath: path, nodeKey: node });
      }}
    >
      <PresetPickers
        data={data}
        onChange={(presets) =>
          // values the new preset cannot hold are reset, the rest stay
          dispatch({ type: 'setData', data: reconcile(schema, { ...data, [PRESETS_KEY]: presets }) })
        }
      />
      {schema.fields.map((f, i) => (
        <FieldRow
          key={f.name}
          field={f}
          node={['fields', i]}
          dataPath={f.name}
          value={data[f.name]}
          ctx={ctx}
          onChange={(v) => dispatch({ type: 'setData', data: { ...data, [f.name]: v } })}
        />
      ))}
    </div>
  );
};

interface RowProps {
  field: DenseField;
  node: NodePath;
  dataPath: string;
  value: any;
  ctx: Ctx;
  onChange: (v: any) => void;
  label?: string;
}

const FieldRow = (props: RowProps) => {
  const { hover, dispatch } = useEditor();
  const { field, node, dataPath, ctx, label } = props;
  const error = ctx.errors.get(dataPath);
  // a reference lays out like its template
  const shape = field.type === 'reference' ? (ctx.schema.templates?.[field.ref] ?? field) : field;
  // this exact value, or (for a union) its tag bits
  const lit =
    hover.dataPath === dataPath || (shape.type === 'union' && hover.dataPath === `${dataPath}.${shape.discriminator}`);
  const compound = ['object', 'array', 'union', 'optional'].includes(shape.type);
  const fold = useCollapse();
  const foldId = `data:${dataPath}`;
  const closed = compound && fold.isCollapsed(foldId);
  return (
    <div
      className={`data-row ${compound ? 'compound' : ''} ${lit ? 'lit' : ''} ${error ? 'has-error' : ''}`}
      data-path={dataPath}
      data-node={pathKey(node)}
      onFocus={() => dispatch({ type: 'select', path: node })}
    >
      <div className="data-label">
        {compound && (
          <button
            type="button"
            className="chev"
            aria-expanded={!closed}
            aria-label={`${closed ? 'Expand' : 'Collapse'} ${label ?? field.name}`}
            onClick={() => fold.toggle(foldId)}
          >
            {closed ? '▸' : '▾'}
          </button>
        )}
        <TypeChip type={field.type} />
        <span>{label ?? field.name}</span>
        {closed && <span className="muted small fold-summary">{summary(shape, props.value)}</span>}
      </div>
      <div className="data-control">
        {!closed && <Control {...props} />}
        {error && <span className="field-error">{error}</span>}
      </div>
    </div>
  );
};

/** What a folded row shows instead of its controls */
const summary = (shape: DenseField, value: any): string => {
  switch (shape.type) {
    case 'object':
      return `${shape.fields.length} field${shape.fields.length === 1 ? '' : 's'}`;
    case 'array': {
      const n = Array.isArray(value) ? value.length : 0;
      return `${n} item${n === 1 ? '' : 's'}`;
    }
    case 'union':
      return String(value?.[shape.discriminator] ?? '');
    case 'optional':
      return value === null || value === undefined ? 'absent' : 'present';
    default:
      return '…';
  }
};

const Control = ({ field, node, dataPath, value, ctx, onChange }: RowProps) => {
  const fresh = (f: DenseField) => defaultFor(f, ctx.schema, ctx.presets);
  const child = (f: DenseField, n: NodePath, p: string, v: any, set: (v: any) => void, label?: string) => (
    <FieldRow
      key={p}
      field={f}
      node={n}
      dataPath={p}
      value={v}
      ctx={{ ...ctx, depth: ctx.depth + 1 }}
      onChange={set}
      label={label}
    />
  );
  switch (field.type) {
    case 'bool':
      return <Toggle checked={!!value} onChange={onChange} label={field.name} />;
    case 'int':
    case 'fixed': {
      const step = field.type === 'fixed' ? field.precision : 1;
      return (
        <div className="num-control">
          <input
            type="range"
            min={field.min}
            max={field.max}
            step={step}
            value={typeof value === 'number' ? value : field.min}
            onChange={(e) =>
              onChange(field.type === 'fixed' ? +Number(e.target.value).toFixed(12) : Number(e.target.value))
            }
            aria-label={field.name}
          />
          <NumberInput
            value={typeof value === 'number' ? value : field.min}
            step={step}
            min={field.min}
            max={field.max}
            integer={field.type === 'int'}
            onChange={onChange}
          />
        </div>
      );
    }
    case 'enum':
      return field.options.length <= 4 ? (
        <Segmented
          small
          value={value}
          options={field.options.map((o) => ({ value: o, label: o }))}
          onChange={onChange}
        />
      ) : (
        <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
          {field.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      );
    case 'enum_array': {
      const items: string[] = Array.isArray(value) ? value : [];
      return (
        <div className="chips">
          {items.map((v, i) => (
            <span key={i} className="chip on">
              <select
                className="bare"
                value={v}
                onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              >
                {field.enum.options.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              <button
                type="button"
                className="icon-btn"
                aria-label="Remove"
                disabled={items.length <= field.minLength}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </span>
          ))}
          <button
            type="button"
            className="btn small"
            disabled={items.length >= field.maxLength}
            onClick={() => onChange([...items, field.enum.defaultValue])}
          >
            +
          </button>
          <span className="muted small">
            {items.length}/{field.maxLength}
          </span>
        </div>
      );
    }
    case 'optional': {
      const present = value !== null && value !== undefined;
      return (
        <div className="nested">
          <label className="inline">
            <Toggle
              checked={present}
              onChange={(on) => onChange(on ? fresh(field.field) : null)}
              label={`${field.name} present`}
            />
            <span className="muted small">{present ? 'present' : 'absent (1 bit)'}</span>
          </label>
          {present && child(field.field, [...node, 'field'], dataPath, value, onChange, field.field.name)}
        </div>
      );
    }
    case 'array': {
      const items: any[] = Array.isArray(value) ? value : [];
      return (
        <div className="nested">
          {items.map((item, i) => (
            <div key={i} className="array-item">
              {child(
                field.items,
                [...node, 'items'],
                `${dataPath}[${i}]`,
                item,
                (v) => onChange(items.map((x, j) => (j === i ? v : x))),
                `[${i}]`
              )}
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove item ${i}`}
                disabled={items.length <= field.minLength}
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <div className="inline">
            <button
              type="button"
              className="btn small"
              disabled={items.length >= field.maxLength}
              onClick={() => onChange([...items, fresh(field.items)])}
            >
              + Item
            </button>
            <span className="muted small">
              {items.length} of {field.minLength}–{field.maxLength}
            </span>
          </div>
        </div>
      );
    }
    case 'object': {
      const obj = value ?? {};
      return (
        <div className="nested">
          {field.fields.map((f, i) =>
            child(f, [...node, 'fields', i], `${dataPath}.${f.name}`, obj[f.name], (v) =>
              onChange({ ...obj, [f.name]: v })
            )
          )}
        </div>
      );
    }
    case 'union': {
      const tagName = field.discriminator;
      const keys = variantNames(field);
      const tag: string = value?.[tagName];
      const known = typeof tag === 'string' && tag in field.variants;
      // the variant's fields live in its template: the rows point at the template's nodes
      const variant = known ? variantFields(ctx.schema, field, tag) : [];
      const t = known ? variantObjectIndex(ctx.schema, field, tag) : -1;
      const switchTo = (next: string) =>
        onChange(
          Object.fromEntries([
            [tagName, next],
            ...variantFields(ctx.schema, field, next).map((f) => [
              f.name,
              value && f.name in value ? value[f.name] : fresh(f)
            ])
          ])
        );
      if (ctx.depth > 40) return <span className="muted">too deep to show</span>;
      return (
        <div className="nested">
          {keys.length <= 4 ? (
            <Segmented small value={tag} options={keys.map((o) => ({ value: o, label: o }))} onChange={switchTo} />
          ) : (
            <select className="input" value={tag} onChange={(e) => switchTo(e.target.value)}>
              {keys.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          )}
          {variant.map((f, i) =>
            child(f, ['templates', t, 'fields', i], `${dataPath}.${f.name}`, value?.[f.name], (v) =>
              onChange({ ...value, [f.name]: v })
            )
          )}
        </div>
      );
    }
    case 'reference_numeric': {
      const d = findDefinition(ctx.schema, field.ref);
      if (!d) return <span className="muted">unresolved</span>;
      const preset = activePresetName(d, ctx.presets);
      return (
        <div className="ref-control">
          <Control
            field={presetAsField(d, preset, field.name)}
            node={node}
            dataPath={dataPath}
            value={value}
            ctx={ctx}
            onChange={onChange}
          />
          <span className="unit" title={`${d.name} preset`}>
            {preset}
          </span>
        </div>
      );
    }
    case 'reference': {
      const tf = ctx.schema.templates?.[field.ref];
      if (!tf) return <span className="muted">unresolved</span>;
      if (ctx.depth > 40) return <span className="muted">too deep to show</span>;
      return (
        <Control
          field={{ ...tf, name: field.name }}
          node={['templates', field.ref]}
          dataPath={dataPath}
          value={value}
          ctx={{ ...ctx, depth: ctx.depth + 1 }}
          onChange={onChange}
        />
      );
    }
  }
};

/** One picker per numeric definition: the preset this payload uses */
const PresetPickers = ({
  data,
  onChange
}: {
  data: Record<string, any>;
  onChange: (presets: Record<string, string>) => void;
}) => {
  const { analysis, hover, dispatch } = useEditor();
  const definitions = analysis.schema ? definitionsOf(analysis.schema) : [];
  if (!definitions.length) return null;
  const current = Object.fromEntries(definitions.map((d) => [d.name, activePresetName(d, data[PRESETS_KEY])]));
  return (
    <Fold id="try-section:presets" title="Presets" className="preset-pickers">
      {definitions.map((d, i) => {
        const dataPath = `${PRESETS_KEY}.${d.name}`;
        const options = presetNames(d).map((n) => ({ value: n, label: n }));
        return (
          <div
            key={d.name}
            className={`data-row ${hover.dataPath === dataPath ? 'lit' : ''}`}
            data-path={dataPath}
            data-node={pathKey(['definitions', i])}
            onFocus={() => dispatch({ type: 'select', path: ['definitions', i] })}
          >
            <div className="data-label">
              <span className="type-chip t-definition">def</span>
              <span>{d.name} preset</span>
            </div>
            <div className="data-control">
              {options.length <= 4 ? (
                <Segmented
                  small
                  value={current[d.name]}
                  options={options}
                  onChange={(v) => onChange({ ...current, [d.name]: v })}
                />
              ) : (
                <select
                  className="input"
                  value={current[d.name]}
                  onChange={(e) => onChange({ ...current, [d.name]: e.target.value })}
                >
                  {options.map((o) => (
                    <option key={o.value}>{o.value}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        );
      })}
    </Fold>
  );
};
