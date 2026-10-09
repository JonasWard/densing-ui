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
import { getField, pathKey, type NodePath } from '../model/paths';
import { useEditor } from '../editor';
import { NumberInput, Segmented, Toggle, TypeChip } from './ui';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Ctx {
  schema: DenseSchema;
  byName: Map<string, NodePath>;
  errors: Map<string, string>;
  presets: unknown;
  depth: number;
}

export const DataForm = () => {
  const { doc, analysis, dispatch, setHover } = useEditor();
  const schema = analysis.schema;
  const errors = useMemo(() => {
    const m = new Map<string, string>();
    if (schema) for (const e of validate(schema, doc.data).errors) m.set(e.path, e.message);
    return m;
  }, [schema, doc.data]);
  if (!schema) return <p className="muted small">The form appears once the schema is valid.</p>;
  const data = (doc.data ?? {}) as Record<string, any>;
  const ctx: Ctx = { schema, byName: analysis.byName, errors, presets: data[PRESETS_KEY], depth: 0 };
  return (
    <div className="data-form" onMouseLeave={() => setHover({})}>
      <PresetPickers
        data={data}
        onChange={(presets) =>
          // values the new preset cannot hold are reset, the rest stay
          dispatch({ type: 'setData', data: reconcile(schema, { ...data, [PRESETS_KEY]: presets }, analysis.byName) })
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
  const { hover, setHover, dispatch } = useEditor();
  const { field, node, dataPath, ctx, label } = props;
  const error = ctx.errors.get(dataPath);
  const lit = hover.dataPath === dataPath;
  // a reference lays out like its template
  const shape = field.type === 'reference' ? (ctx.schema.templates?.[field.ref] ?? field) : field;
  const compound = ['object', 'array', 'union', 'optional', 'pointer'].includes(shape.type);
  return (
    <div
      className={`data-row ${compound ? 'compound' : ''} ${lit ? 'lit' : ''} ${error ? 'has-error' : ''}`}
      onMouseEnter={(e) => {
        e.stopPropagation();
        setHover({ dataPath, nodeKey: pathKey(node) });
      }}
      onFocus={() => dispatch({ type: 'select', path: node })}
    >
      <div className="data-label">
        <TypeChip type={field.type} />
        <span>{label ?? field.name}</span>
      </div>
      <div className="data-control">
        <Control {...props} />
        {error && <span className="field-error">{error}</span>}
      </div>
    </div>
  );
};

const Control = ({ field, node, dataPath, value, ctx, onChange }: RowProps) => {
  const fresh = (f: DenseField) => defaultFor(f, ctx.schema, ctx.byName, ctx.presets);
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
      const tagName = field.discriminator.name;
      const tag: string = value?.[tagName];
      const variant = field.variants[tag] ?? [];
      const switchTo = (t: string) =>
        onChange(
          Object.fromEntries([
            [tagName, t],
            ...field.variants[t].map((f) => [f.name, value && f.name in value ? value[f.name] : fresh(f)])
          ])
        );
      return (
        <div className="nested">
          {field.discriminator.options.length <= 4 ? (
            <Segmented
              small
              value={tag}
              options={field.discriminator.options.map((o) => ({ value: o, label: o }))}
              onChange={switchTo}
            />
          ) : (
            <select className="input" value={tag} onChange={(e) => switchTo(e.target.value)}>
              {field.discriminator.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          )}
          {variant.map((f, i) =>
            child(f, [...node, 'variants', tag, i], `${dataPath}.${f.name}`, value?.[f.name], (v) =>
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
    case 'pointer': {
      const target = ctx.byName.get(field.targetName);
      const tf = target && getField(ctx.schema, target);
      if (!target || !tf) return <span className="muted">unresolved</span>;
      if (ctx.depth > 40) return <span className="muted">too deep to show</span>;
      return (
        <Control
          field={{ ...tf, name: field.name }}
          node={target}
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
  const { analysis, hover, setHover, dispatch } = useEditor();
  const definitions = analysis.schema ? definitionsOf(analysis.schema) : [];
  if (!definitions.length) return null;
  const current = Object.fromEntries(definitions.map((d) => [d.name, activePresetName(d, data[PRESETS_KEY])]));
  return (
    <div className="preset-pickers">
      {definitions.map((d, i) => {
        const dataPath = `${PRESETS_KEY}.${d.name}`;
        const options = presetNames(d).map((n) => ({ value: n, label: n }));
        return (
          <div
            key={d.name}
            className={`data-row ${hover.dataPath === dataPath ? 'lit' : ''}`}
            onMouseEnter={() => setHover({ dataPath, nodeKey: pathKey(['definitions', i]) })}
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
    </div>
  );
};
