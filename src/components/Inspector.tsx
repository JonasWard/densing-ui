import {
  calculateDenseFieldBitWidth,
  type DenseField,
  type EnumArrayField,
  type EnumField,
  type UnionField
} from 'densing';
import { useEffect, useRef } from 'react';
import { charsForBits, formatBits } from '../model/analyze';
import {
  FIELD_TYPES,
  addVariant,
  bitsForStates,
  canUnwrap,
  changeType,
  duplicateField,
  fixedSteps,
  normalizeDefault,
  removeVariant,
  renameVariant,
  uniqueName,
  unwrapField,
  updateField,
  wrapField,
  type FieldType,
  type WrapKind
} from '../model/ops';
import { extractDefinition } from '../model/definitions';
import { getField, isTemplateRoot, parentListPath, pathKey, type NodePath } from '../model/paths';
import { deleteNode, makeTemplate } from '../model/templates';
import { PointerDeprecation, ReferenceEditor, TemplateUses } from './TemplateInspector';
import { coversPath, useEditor } from '../editor';
import { DefinitionInspector, ReferenceNumericEditor } from './DefinitionInspector';
import { Field, NumberInput, Stat, TextInput, Toggle, TypeChip } from './ui';

export const Inspector = ({ renameNonce }: { renameNonce: number }) => {
  const { doc, state } = useEditor();
  const path = state.selected;
  const field = path ? getField(doc.schema, path) : undefined;
  if (path?.[0] === 'definitions' && typeof path[1] === 'number')
    return <DefinitionInspector key={pathKey(path)} index={path[1]} />;
  if (!path || !field) return <SchemaOverview />;
  return <FieldInspector key={pathKey(path)} path={path} field={field} renameNonce={renameNonce} />;
};

const SchemaOverview = () => {
  const { doc, analysis } = useEditor();
  const t = analysis.total;
  return (
    <div className="panel inspector">
      <div className="panel-head">
        <h2>Schema</h2>
      </div>
      <div className="stats">
        <Stat label="fields" value={doc.schema.fields.length} />
        {!!doc.schema.definitions?.length && <Stat label="preset header bits" value={analysis.header} />}
        <Stat label="bits" value={formatBits(t)} />
        <Stat
          label="base64url chars"
          value={t ? formatBits({ min: charsForBits(t.min, 64), max: charsForBits(t.max, 64) }) : '?'}
        />
        <Stat
          label="QR base45 chars"
          value={t ? formatBits({ min: charsForBits(t.min, 38), max: charsForBits(t.max, 38) }) : '?'}
        />
      </div>
      <PointerDeprecation />
      {analysis.rootErrors.map((e) => (
        <p key={e} className="error-box">
          {e}
        </p>
      ))}
      {analysis.errors.size > 0 && (
        <p className="error-box">
          {analysis.errors.size} field{analysis.errors.size > 1 ? 's have' : ' has'} problems: they are marked{' '}
          <span className="error-dot">!</span> in the structure.
        </p>
      )}
      <div className="tips">
        <p>Select a field to edit it. Each one shows what it costs in bits and how to make it cheaper.</p>
        <ul>
          <li>
            A range of <b>N</b> values costs <b>⌈log₂ N⌉</b> bits. Values left over at the top of the range come for
            free.
          </li>
          <li>Optional fields cost one presence bit, arrays a length prefix, unions a tag.</li>
          <li>Enum arrays are packed in base N, which is cheaper than an array of enums.</li>
          <li>The ribbon above shows every bit the preview data encodes to, grouped by output character.</li>
        </ul>
      </div>
    </div>
  );
};

/** last rename request already acted on; requests can arrive before the inspector for the new field mounts */
let handledRename = 0;

interface FieldInspectorProps {
  path: NodePath;
  field: DenseField;
  renameNonce: number;
}

const FieldInspector = ({ path, field, renameNonce }: FieldInspectorProps) => {
  const { doc, analysis, dispatch } = useEditor();
  const key = pathKey(path);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renameNonce > handledRename) {
      handledRename = renameNonce;
      nameRef.current?.focus();
      nameRef.current?.select();
    }
  }, [renameNonce]);

  const set = (next: DenseField, coalesce?: string) =>
    dispatch({
      type: 'editSchema',
      schema: updateField(doc.schema, path, normalizeDefault(next)),
      coalesce: coalesce && `${key}:${coalesce}`
    });
  const errors = analysis.errors.get(key);
  const templateRoot = isTemplateRoot(path);
  const inList = !!parentListPath(path);
  const range = analysis.ranges.get(key);

  const wrap = (kind: WrapKind) =>
    dispatch({ type: 'editSchema', schema: updateField(doc.schema, path, wrapField(doc.schema, field, kind)) });

  return (
    <div className="panel inspector">
      <div className="panel-head">
        <TypeChip type={field.type} />
        <h2 className="truncate">{field.name || 'unnamed'}</h2>
        {templateRoot && <span className="template-badge">template</span>}
        <span className="bits-badge big">{formatBits(range)} bits</span>
      </div>
      <p className="path muted small mono">{key}</p>
      {errors?.map((e) => (
        <p key={e} className="error-box">
          {e}
        </p>
      ))}

      <div className="grid-2">
        <label className="form-field">
          <span className="form-label">{templateRoot ? 'Type name' : 'Name'}</span>
          <input
            ref={nameRef}
            className="input"
            value={field.name}
            spellCheck={false}
            onChange={(e) => set({ ...field, name: e.target.value }, 'name')}
          />
          {templateRoot && <span className="form-hint">the name of the shape, not a key in the data</span>}
        </label>
        <Field label="Type">
          <select
            className="input"
            value={field.type}
            onChange={(e) =>
              dispatch({
                type: 'editSchema',
                schema: updateField(doc.schema, path, changeType(field, e.target.value as FieldType, doc.schema))
              })
            }
          >
            {FIELD_TYPES.filter((t) => !t.deprecated || t.type === field.type).map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <TypeEditor field={field} set={set} path={path} />
      {templateRoot && <TemplateUses index={path[1] as number} />}

      <div className="actions">
        {inList && !templateRoot && (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              const r = duplicateField(doc.schema, path);
              if (r) dispatch({ type: 'editSchema', schema: r.schema, select: r.path });
            }}
          >
            Duplicate
          </button>
        )}
        {(field.type === 'int' || field.type === 'fixed') && (
          <button
            type="button"
            className="btn small"
            title="Move this range into a numeric definition, so other fields can share it and it can get presets"
            onClick={() => {
              const r = extractDefinition(doc.schema, path, field);
              dispatch({ type: 'editSchema', schema: r.schema, select: r.definitionPath });
            }}
          >
            Share range
          </button>
        )}
        {!templateRoot && field.type !== 'reference' && (
          <button
            type="button"
            className="btn small"
            title="Move this field's shape into a template, so other fields can use it too"
            onClick={() => {
              const r = makeTemplate(doc.schema, path);
              if (r) dispatch({ type: 'editSchema', schema: r.schema, select: r.templatePath });
            }}
          >
            Make template
          </button>
        )}
        <span className="muted small">Wrap in</span>
        {(['optional', 'array', 'object'] as WrapKind[]).map((k) => (
          <button key={k} type="button" className="btn small" onClick={() => wrap(k)}>
            {k}
          </button>
        ))}
        {canUnwrap(field) && (
          <button type="button" className="btn small" onClick={() => set(unwrapField(field))}>
            Unwrap
          </button>
        )}
        <span className="row-spacer" />
        {inList && (
          <button
            type="button"
            className="btn small danger"
            onClick={() => dispatch({ type: 'editSchema', schema: deleteNode(doc.schema, path), select: null })}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

type Setter = (f: DenseField, coalesce?: string) => void;

const TypeEditor = ({ field, set, path }: { field: DenseField; set: Setter; path: NodePath }) => {
  switch (field.type) {
    case 'bool':
      return (
        <Field label="Default">
          <Toggle
            checked={!!field.defaultValue}
            onChange={(v) => set({ ...field, defaultValue: v })}
            label="Default value"
          />
        </Field>
      );
    case 'int':
      return <IntEditor field={field} set={set} />;
    case 'fixed':
      return <FixedEditor field={field} set={set} />;
    case 'enum':
      return <EnumEditor field={field} onChange={(f) => set(f, 'enum')} />;
    case 'enum_array':
      return <EnumArrayEditor field={field} set={set} />;
    case 'array':
      return <ArrayEditor field={field} set={set} path={path} />;
    case 'optional':
      return <OptionalEditor field={field} path={path} />;
    case 'object':
      return <ObjectEditor field={field} path={path} />;
    case 'union':
      return <UnionEditor field={field} set={set} path={path} />;
    case 'pointer':
      return (
        <>
          <PointerDeprecation />
          <PointerEditor field={field} set={set} path={path} />
        </>
      );
    case 'reference':
      return <ReferenceEditor field={field} path={path} />;
    case 'reference_numeric':
      return <ReferenceNumericEditor field={field} path={path} />;
  }
};

const RangeStats = ({ states, unit = 'values' }: { states: number; unit?: string }) => {
  const bits = bitsForStates(states);
  const capacity = 2 ** bits;
  const spare = capacity - states;
  return (
    <div className="stats">
      <Stat label={unit} value={states.toLocaleString()} />
      <Stat label="bits" value={bits} />
      <Stat label={`${unit} that fit`} value={capacity.toLocaleString()} />
      <Stat
        label="unused"
        value={spare.toLocaleString()}
        tone={spare === 0 ? 'good' : spare > capacity / 4 ? 'warn' : undefined}
      />
    </div>
  );
};

const IntEditor = ({ field, set }: { field: Extract<DenseField, { type: 'int' }>; set: Setter }) => {
  const states = field.max - field.min + 1;
  const bits = bitsForStates(states);
  const fullMax = field.min + 2 ** bits - 1;
  const lowerMax = field.min + 2 ** Math.max(0, bits - 1) - 1;
  return (
    <>
      <div className="grid-3">
        <Field label="Min">
          <NumberInput integer value={field.min} onChange={(v) => set({ ...field, min: v }, 'min')} />
        </Field>
        <Field label="Max">
          <NumberInput integer value={field.max} onChange={(v) => set({ ...field, max: v }, 'max')} />
        </Field>
        <Field label="Default">
          <NumberInput
            integer
            value={field.defaultValue}
            min={field.min}
            max={field.max}
            onChange={(v) => set({ ...field, defaultValue: v }, 'def')}
          />
        </Field>
      </div>
      {states > 0 && <RangeStats states={states} />}
      <div className="suggestions">
        {states > 0 && fullMax !== field.max && (
          <button type="button" className="suggestion" onClick={() => set({ ...field, max: fullMax })}>
            Use the full {bits} bits: max → <b>{fullMax}</b> <span className="muted">(free)</span>
          </button>
        )}
        {bits > 1 && (
          <button type="button" className="suggestion" onClick={() => set({ ...field, max: lowerMax })}>
            Save 1 bit: max → <b>{lowerMax}</b>
          </button>
        )}
      </div>
    </>
  );
};

const PRECISIONS = [1, 0.5, 0.25, 0.1, 0.05, 0.01, 0.001];

const FixedEditor = ({ field, set }: { field: Extract<DenseField, { type: 'fixed' }>; set: Setter }) => {
  const steps = field.precision > 0 ? fixedSteps(field.min, field.max, field.precision) : 0;
  const bits = bitsForStates(steps);
  const fullMax = +(field.min + (2 ** bits - 1) * field.precision).toPrecision(12);
  return (
    <>
      <div className="grid-3">
        <Field label="Min">
          <NumberInput value={field.min} step={field.precision} onChange={(v) => set({ ...field, min: v }, 'min')} />
        </Field>
        <Field label="Max">
          <NumberInput value={field.max} step={field.precision} onChange={(v) => set({ ...field, max: v }, 'max')} />
        </Field>
        <Field label="Default">
          <NumberInput
            value={field.defaultValue}
            step={field.precision}
            min={field.min}
            max={field.max}
            onChange={(v) => set({ ...field, defaultValue: v }, 'def')}
          />
        </Field>
      </div>
      <Field label="Precision" hint="Each option shows what it costs in bits for the current range">
        <div className="chips">
          {PRECISIONS.map((p) => {
            const b = bitsForStates(fixedSteps(field.min, field.max, p));
            return (
              <button
                key={p}
                type="button"
                className={`chip ${p === field.precision ? 'on' : ''}`}
                onClick={() => set({ ...field, precision: p })}
              >
                {p} <span className="muted">· {b}b</span>
              </button>
            );
          })}
          <NumberInput
            className="narrow"
            value={field.precision}
            onChange={(v) => v > 0 && set({ ...field, precision: v }, 'prec')}
            aria-label="Custom precision"
          />
        </div>
      </Field>
      {steps > 0 && <RangeStats states={steps} unit="steps" />}
      {steps > 0 && fullMax !== field.max && (
        <div className="suggestions">
          <button type="button" className="suggestion" onClick={() => set({ ...field, max: fullMax })}>
            Use the full {bits} bits: max → <b>{fullMax}</b> <span className="muted">(free)</span>
          </button>
        </div>
      )}
    </>
  );
};

const OptionsEditor = ({ options, onChange }: { options: readonly string[]; onChange: (o: string[]) => void }) => {
  const add = () => onChange([...options, uniqueName(new Set(options), `option${options.length + 1}`)]);
  return (
    <div className="options">
      {options.map((o, i) => (
        <div key={i} className="option-row">
          <span className="muted mono small">{i}</span>
          <TextInput
            value={o}
            aria-label={`Option ${i + 1}`}
            onChange={(v) => onChange(options.map((x, j) => (j === i ? v : x)))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
                requestAnimationFrame(() => {
                  const inputs = (e.target as HTMLElement).closest('.options')?.querySelectorAll('input');
                  inputs?.[inputs.length - 1]?.focus();
                });
              }
            }}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label={`Remove ${o}`}
            disabled={options.length <= 2}
            onClick={() => onChange(options.filter((_, j) => j !== i))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn small" onClick={add}>
        + Option
      </button>
    </div>
  );
};

const EnumEditor = ({ field, onChange }: { field: EnumField; onChange: (f: EnumField) => void }) => {
  const bits = bitsForStates(field.options.length);
  const free = 2 ** bits - field.options.length;
  return (
    <>
      <Field
        label="Options"
        hint={
          free > 0 ? `${free} more option${free > 1 ? 's' : ''} fit in the same ${bits} bits` : `${bits} bits, full`
        }
      >
        <OptionsEditor options={field.options} onChange={(options) => onChange({ ...field, options })} />
      </Field>
      <Field label="Default">
        <select
          className="input"
          value={field.defaultValue}
          onChange={(e) => onChange({ ...field, defaultValue: e.target.value })}
        >
          {field.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </Field>
    </>
  );
};

const LengthInputs = ({
  min,
  max,
  onChange
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number, c: string) => void;
}) => (
  <div className="grid-3">
    <Field label="Min length">
      <NumberInput integer value={min} min={0} onChange={(v) => onChange(v, max, 'minLen')} />
    </Field>
    <Field label="Max length">
      <NumberInput integer value={max} min={0} onChange={(v) => onChange(min, v, 'maxLen')} />
    </Field>
    <Field label="Length prefix">
      <span className="readout">{plural(bitsForStates(max - min + 1), 'bit')}</span>
    </Field>
  </div>
);

const EnumArrayEditor = ({ field, set }: { field: EnumArrayField; set: Setter }) => {
  const n = field.enum.options.length;
  const lengthBits = bitsForStates(field.maxLength - field.minLength + 1);
  let packed = 0;
  try {
    packed = calculateDenseFieldBitWidth(field, Array(field.maxLength).fill(field.enum.options[0])) - lengthBits;
  } catch {
    packed = NaN;
  }
  const naive = field.maxLength * bitsForStates(n);
  return (
    <>
      <LengthInputs
        min={field.minLength}
        max={field.maxLength}
        onChange={(minLength, maxLength, c) => set({ ...field, minLength, maxLength }, c)}
      />
      <Field label={`Options (enum "${field.enum.name}")`}>
        <OptionsEditor
          options={field.enum.options}
          onChange={(options) =>
            set({ ...field, enum: normalizeDefault({ ...field.enum, options }) as EnumField }, 'enum')
          }
        />
      </Field>
      <div className="stats">
        <Stat label={`bits for ${field.maxLength} items, packed`} value={Number.isNaN(packed) ? '?' : packed} />
        <Stat label="as an array of enums" value={naive} />
        <Stat
          label="saved"
          value={Number.isNaN(packed) ? '?' : naive - packed}
          tone={naive - packed > 0 ? 'good' : undefined}
        />
      </div>
    </>
  );
};

const ChildLink = ({ label, path }: { label: string; path: NodePath }) => {
  const { doc, dispatch, analysis } = useEditor();
  const child = getField(doc.schema, path);
  if (!child) return null;
  return (
    <button type="button" className="child-link" onClick={() => dispatch({ type: 'select', path })}>
      <span className="muted small">{label}</span>
      <TypeChip type={child.type} />
      <span>{child.name}</span>
      <span className="row-spacer" />
      <span className="bits-badge">{formatBits(analysis.ranges.get(pathKey(path)))}</span>
    </button>
  );
};

const ArrayEditor = ({
  field,
  set,
  path
}: {
  field: Extract<DenseField, { type: 'array' }>;
  set: Setter;
  path: NodePath;
}) => (
  <>
    <LengthInputs
      min={field.minLength}
      max={field.maxLength}
      onChange={(minLength, maxLength, c) => set({ ...field, minLength, maxLength }, c)}
    />
    <ChildLink label="Each item" path={[...path, 'items']} />
    {field.items.type === 'enum' && (
      <div className="suggestions">
        <button
          type="button"
          className="suggestion"
          onClick={() =>
            set({
              type: 'enum_array',
              name: field.name,
              minLength: field.minLength,
              maxLength: field.maxLength,
              enum: field.items as EnumField,
              defaultValue: []
            })
          }
        >
          Items are enums: switch to a packed <b>enum array</b>
        </button>
      </div>
    )}
  </>
);

const OptionalEditor = ({ field, path }: { field: Extract<DenseField, { type: 'optional' }>; path: NodePath }) => (
  <>
    <p className="muted small">
      1 presence bit, then the field below when it is present. The {field.field.name} value is stored under the key “
      {field.name}”.
    </p>
    <ChildLink label="When present" path={[...path, 'field']} />
  </>
);

const ObjectEditor = ({ field, path }: { field: Extract<DenseField, { type: 'object' }>; path: NodePath }) => (
  <div className="children">
    {field.fields.length === 0 && (
      <p className="muted small">No fields yet: use “+ Add field” under it in the structure, or drag fields onto it.</p>
    )}
    {field.fields.map((_, i) => (
      <ChildLink key={i} label="" path={[...path, 'fields', i]} />
    ))}
  </div>
);

const UnionEditor = ({ field, set, path }: { field: UnionField; set: Setter; path: NodePath }) => {
  const { analysis, doc } = useEditor();
  const keys = field.discriminator.options;
  const tagBits = bitsForStates(keys.length);
  const variantBits = (k: string) =>
    formatBits(
      (field.variants[k] ?? []).reduce(
        (acc, _, i) => {
          const r = analysis.ranges.get(pathKey([...path, 'variants', k, i]));
          return r ? { min: acc.min + r.min, max: acc.max + r.max } : acc;
        },
        { min: tagBits, max: tagBits }
      )
    );
  return (
    <>
      <div className="grid-2">
        <Field label="Tag name" hint={`stored as data.${field.name}.${field.discriminator.name}`}>
          <TextInput
            value={field.discriminator.name}
            onChange={(v) => set({ ...field, discriminator: { ...field.discriminator, name: v } }, 'tag')}
          />
        </Field>
        <Field label="Tag">
          <span className="readout">{plural(tagBits, 'bit')}</span>
        </Field>
      </div>
      <Field label="Variants" hint="Default variant is selected. Each variant's fields are edited in the structure.">
        <div className="options">
          {keys.map((k, i) => (
            <div key={i} className="option-row">
              <input
                type="radio"
                name={`default-${pathKey(path)}`}
                checked={field.discriminator.defaultValue === k}
                onChange={() => set({ ...field, discriminator: { ...field.discriminator, defaultValue: k } })}
                aria-label={`Default variant ${k}`}
              />
              <TextInput
                value={k}
                aria-label={`Variant ${i + 1}`}
                onChange={(v) => v && set(renameVariant(field, k, v), `variant${i}`)}
              />
              <span className="bits-badge">{variantBits(k)}</span>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${k}`}
                disabled={keys.length <= 2}
                onClick={() => set(removeVariant(field, k))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn small"
            onClick={() =>
              set(
                addVariant(
                  field,
                  uniqueName(new Set([...keys, ...doc.schema.fields.map((f) => f.name)]), `variant${keys.length + 1}`)
                )
              )
            }
          >
            + Variant
          </button>
        </div>
      </Field>
    </>
  );
};

const PointerEditor = ({
  field,
  set,
  path
}: {
  field: Extract<DenseField, { type: 'pointer' }>;
  set: Setter;
  path: NodePath;
}) => {
  const { analysis, doc, dispatch } = useEditor();
  const self = pathKey(path);
  const targets = [...analysis.byName.entries()].filter(
    ([, p]) => pathKey(p) !== self && getField(doc.schema, p)?.type !== 'pointer'
  );
  const target = analysis.byName.get(field.targetName);
  const recursive = !!target && coversPath(pathKey(target), self);
  return (
    <>
      <Field
        label="Points to"
        hint="A pointer encodes like the field it names. Pointing at an ancestor makes the schema recursive."
      >
        <select
          className="input"
          value={field.targetName}
          onChange={(e) => set({ ...field, targetName: e.target.value })}
        >
          <option value="">choose a field…</option>
          {targets.map(([name, p]) => (
            <option key={name} value={name}>
              {name} ({getField(doc.schema, p)?.type})
            </option>
          ))}
        </select>
      </Field>
      {target && (
        <button type="button" className="child-link" onClick={() => dispatch({ type: 'select', path: target })}>
          <span className="muted small">{recursive ? 'Recursive, into ancestor' : 'Target'}</span>
          <span>{field.targetName}</span>
          <span className="row-spacer" />
          <span className="muted small mono">{pathKey(target)}</span>
        </button>
      )}
      {recursive && (
        <p className="muted small">
          Recursive schemas have no upper size limit: each level costs its tag plus its own fields.
        </p>
      )}
    </>
  );
};
