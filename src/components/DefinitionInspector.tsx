import type { DenseField, NumericDefinition, NumericPreset, ReferenceNumericField } from 'densing';
import { formatBits } from '../model/analyze';
import {
  activePresetName,
  addDefinition,
  definitionsOf,
  normalizePreset,
  PRESETS_KEY,
  presetAsField,
  presetBits,
  presetNames,
  presetTemplate,
  removeDefinition,
  removePreset,
  renameDefinitionInData,
  renamePreset,
  renamePresetInData,
  selectorBits,
  updateDefinition,
  usesOf
} from '../model/definitions';
import { updateField } from '../model/ops';
import { getField, pathKey, type NodePath } from '../model/paths';
import { useEditor } from '../editor';
import { Field, NumberInput, Stat, TextInput, Toggle, TypeChip } from './ui';

const safeBits = (p: NumericPreset) => {
  if (p.precision !== undefined && !(p.precision > 0)) return '?';
  const b = presetBits(p);
  return Number.isFinite(b) ? String(b) : '?';
};

const widthRange = (widths: string[]) => {
  if (!widths.length || widths.includes('?')) return '?';
  const n = widths.map(Number);
  return formatBits({ min: Math.min(...n), max: Math.max(...n) });
};

export const DefinitionInspector = ({ index }: { index: number }) => {
  const { doc, analysis, dispatch } = useEditor();
  const d = definitionsOf(doc.schema)[index];
  if (!d) return null;
  const key = pathKey(['definitions', index]);
  const names = presetNames(d);
  const uses = usesOf(doc.schema, d.name);
  const set = (next: NumericDefinition, coalesce?: string) =>
    dispatch({
      type: 'editSchema',
      schema: updateDefinition(doc.schema, index, next),
      coalesce: coalesce && `${key}:${coalesce}`
    });
  const setPreset = (name: string, p: NumericPreset, coalesce?: string) =>
    set({ ...d, presets: { ...d.presets, [name]: normalizePreset(p) } }, coalesce);
  const header = selectorBits(d);
  const widths = names.map((n) => safeBits(d.presets[n]));

  return (
    <div className="panel inspector">
      <div className="panel-head">
        <span className="type-chip t-definition">def</span>
        <h2 className="truncate">{d.name || 'unnamed'}</h2>
        <span className="bits-badge big">{header} header bits</span>
      </div>
      <p className="path muted small mono">{key}</p>
      {analysis.errors.get(key)?.map((e) => (
        <p key={e} className="error-box">
          {e}
        </p>
      ))}
      <Field label="Name" hint="Renaming updates every shared number that uses it">
        <TextInput value={d.name} onChange={(v) => set({ ...d, name: v }, 'name', renameDefinitionInData(d.name, v))} />
      </Field>

      <div className="stats">
        <Stat label="presets" value={names.length} />
        <Stat label="bits to choose one, per payload" value={header} tone={header === 0 ? 'good' : undefined} />
        <Stat label="bits per field" value={widthRange(widths)} />
        <Stat label="fields using it" value={uses.length} />
      </div>

      <Field
        label="Presets"
        hint="The selected preset is the default. Preset order is the index order stored in the payload."
      >
        <div className="presets">
          {names.map((n, i) => {
            const p = d.presets[n];
            const decimal = p.precision !== undefined;
            return (
              <div key={i} className="preset-card">
                <div className="option-row">
                  <input
                    type="radio"
                    name={`default-preset-${key}`}
                    checked={(d.defaultPreset ?? names[0]) === n}
                    onChange={() => set({ ...d, defaultPreset: n })}
                    aria-label={`Default preset ${n}`}
                  />
                  <TextInput
                    value={n}
                    aria-label={`Preset ${i + 1} name`}
                    onChange={(v) => v && set(renamePreset(d, n, v), `preset${i}`, renamePresetInData(d.name, n, v))}
                  />
                  <span className="bits-badge">{safeBits(p)}b</span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove preset ${n}`}
                    disabled={names.length <= 1}
                    onClick={() => set(removePreset(d, n))}
                  >
                    ×
                  </button>
                </div>
                <div className="grid-4">
                  <Field label="Min">
                    <NumberInput
                      value={p.min}
                      integer={!decimal}
                      step={p.precision}
                      onChange={(v) => setPreset(n, { ...p, min: v }, `min${i}`)}
                    />
                  </Field>
                  <Field label="Max">
                    <NumberInput
                      value={p.max}
                      integer={!decimal}
                      step={p.precision}
                      onChange={(v) => setPreset(n, { ...p, max: v }, `max${i}`)}
                    />
                  </Field>
                  <Field label="Precision">
                    <span className="inline">
                      <Toggle
                        checked={decimal}
                        label={`Decimals for ${n}`}
                        onChange={(on) => {
                          if (on) return setPreset(n, { ...p, precision: 0.1 });
                          const integer: NumericPreset = {
                            min: Math.ceil(p.min),
                            max: Math.floor(p.max),
                            defaultValue: Math.round(p.defaultValue ?? p.min)
                          };
                          setPreset(n, integer);
                        }}
                      />
                      {decimal ? (
                        <NumberInput
                          className="narrow"
                          value={p.precision!}
                          onChange={(v) => v > 0 && setPreset(n, { ...p, precision: v }, `prec${i}`)}
                          aria-label={`Precision of ${n}`}
                        />
                      ) : (
                        <span className="muted small">integer</span>
                      )}
                    </span>
                  </Field>
                  <Field label="Default">
                    <NumberInput
                      value={p.defaultValue ?? p.min}
                      integer={!decimal}
                      step={p.precision}
                      min={p.min}
                      max={p.max}
                      onChange={(v) => setPreset(n, { ...p, defaultValue: v }, `def${i}`)}
                    />
                  </Field>
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className="btn small"
            onClick={() => {
              const [name, preset] = presetTemplate(d);
              set({ ...d, presets: { ...d.presets, [name]: preset } });
            }}
          >
            + Preset
          </button>
        </div>
      </Field>
      {names.length === 1 && (
        <p className="muted small">With a single preset, choosing it costs nothing: the header spends 0 bits.</p>
      )}

      <Field label="Used by">
        <div className="children">
          {uses.length === 0 && (
            <p className="muted small">
              No fields use it yet. Add a “Shared number” field, or use “Share range” on an integer or fixed field.
            </p>
          )}
          {uses.map((p) => (
            <UseLink key={pathKey(p)} path={p} />
          ))}
        </div>
      </Field>

      <div className="actions">
        <span className="row-spacer" />
        <button
          type="button"
          className="btn small danger"
          onClick={() => dispatch({ type: 'editSchema', schema: removeDefinition(doc.schema, index), select: null })}
        >
          Delete definition
        </button>
      </div>
    </div>
  );
};

const UseLink = ({ path }: { path: NodePath }) => {
  const { doc, dispatch } = useEditor();
  const f = getField(doc.schema, path);
  if (!f) return null;
  return (
    <button type="button" className="child-link" onClick={() => dispatch({ type: 'select', path })}>
      <TypeChip type={f.type} />
      <span>{f.name}</span>
      <span className="row-spacer" />
      <span className="muted small mono">{pathKey(path)}</span>
    </button>
  );
};

export const ReferenceNumericEditor = ({ field, path }: { field: ReferenceNumericField; path: NodePath }) => {
  const { doc, dispatch, analysis } = useEditor();
  const definitions = definitionsOf(doc.schema);
  const index = definitions.findIndex((d) => d.name === field.ref);
  const d = definitions[index];
  const presets = (doc.data as Record<string, unknown> | undefined)?.[PRESETS_KEY];
  const active = d ? activePresetName(d, presets) : undefined;
  const replace = (schema = doc.schema, select?: NodePath) => dispatch({ type: 'editSchema', schema, select });
  const setAtPath = (next: DenseField) => replace(updateField(doc.schema, path, next));
  return (
    <>
      <Field label="Definition" hint="The range and precision come from the definition's active preset">
        <select
          className="input"
          value={field.ref}
          onChange={(e) => {
            if (e.target.value === '__new') {
              const r = addDefinition(doc.schema);
              replace(updateField(r.schema, path, { ...field, ref: r.name }), r.path);
            } else setAtPath({ ...field, ref: e.target.value });
          }}
        >
          {!d && <option value={field.ref}>{field.ref ? `${field.ref} (missing)` : 'choose a definition…'}</option>}
          {definitions.map((x) => (
            <option key={x.name} value={x.name}>
              {x.name}
            </option>
          ))}
          <option value="__new">+ New definition…</option>
        </select>
      </Field>
      {d && (
        <>
          <div className="preset-table">
            {presetNames(d).map((n) => {
              const p = d.presets[n];
              return (
                <div key={n} className={`preset-line ${n === active ? 'on' : ''}`}>
                  <span className="mono">{n}</span>
                  <span className="muted small mono">
                    {p.min} … {p.max}
                    {p.precision !== undefined ? ` by ${p.precision}` : ''}
                  </span>
                  <span className="row-spacer" />
                  {n === active && <span className="muted small">in preview</span>}
                  <span className="bits-badge">{safeBits(p)}b</span>
                </div>
              );
            })}
          </div>
          <div className="actions">
            <button type="button" className="btn small" onClick={() => replace(doc.schema, ['definitions', index])}>
              Edit “{d.name}”
            </button>
            {active && (
              <button
                type="button"
                className="btn small"
                onClick={() => setAtPath(presetAsField(d, active, field.name))}
              >
                Inline the “{active}” preset
              </button>
            )}
            <span className="row-spacer" />
            <span className="muted small">{formatBits(analysis.ranges.get(pathKey(path)))} bits</span>
          </div>
        </>
      )}
    </>
  );
};
