import type { ReferenceField } from 'densing';
import { formatBits } from '../model/analyze';
import { updateField } from '../model/ops';
import { getField, pathKey, type NodePath } from '../model/paths';
import { addTemplate, inlineReference, templateUses } from '../model/templates';
import { useEditor } from '../editor';
import { Field, TypeChip } from './ui';

/** The editor for a `reference` field: which template it uses, and ways to it */
export const ReferenceEditor = ({ field, path }: { field: ReferenceField; path: NodePath }) => {
  const { doc, dispatch, analysis } = useEditor();
  const templates = doc.schema.templates ?? [];
  const target = templates[field.ref];
  const targetPath: NodePath = ['templates', field.ref];
  return (
    <>
      <Field
        label="Template"
        hint="The field is encoded exactly like the template; the template itself is never in the data"
      >
        <select
          className="input"
          value={target ? String(field.ref) : ''}
          onChange={(e) => {
            if (e.target.value === '__new') {
              const r = addTemplate(doc.schema);
              dispatch({
                type: 'editSchema',
                schema: updateField(r.schema, path, { ...field, ref: r.index }),
                select: r.path
              });
            } else
              dispatch({
                type: 'editSchema',
                schema: updateField(doc.schema, path, { ...field, ref: Number(e.target.value) })
              });
          }}
        >
          {!target && <option value="">choose a template…</option>}
          {templates.map((t, i) => (
            <option key={i} value={i}>
              {t.name} ({t.type})
            </option>
          ))}
          <option value="__new">+ New template…</option>
        </select>
      </Field>
      {target && (
        <>
          <button type="button" className="child-link" onClick={() => dispatch({ type: 'select', path: targetPath })}>
            <span className="muted small">Uses</span>
            <TypeChip type={target.type} />
            <span>{target.name}</span>
            <span className="row-spacer" />
            <span className="muted small">{templateUses(doc.schema, field.ref).length} uses</span>
            <span className="bits-badge">{formatBits(analysis.ranges.get(pathKey(targetPath)))}</span>
          </button>
          <div className="actions">
            <button type="button" className="btn small" onClick={() => dispatch({ type: 'select', path: targetPath })}>
              Edit “{target.name}”
            </button>
            <button
              type="button"
              className="btn small"
              title="Replace this reference with its own copy of the template"
              onClick={() => dispatch({ type: 'editSchema', schema: inlineReference(doc.schema, path) })}
            >
              Inline
            </button>
          </div>
        </>
      )}
    </>
  );
};

/** For a template root: where it is used */
export const TemplateUses = ({ index }: { index: number }) => {
  const { doc, dispatch } = useEditor();
  const uses = templateUses(doc.schema, index);
  return (
    <Field label="Used by" hint="Editing the template changes every field below">
      <div className="children">
        {uses.length === 0 && (
          <p className="error-box">
            Not used by any field or union variant: densing requires every template to be referenced.
          </p>
        )}
        {uses.map((p) => {
          // a union variant (`[...union, 'variants', key]`) links to its union
          const variant = p[p.length - 2] === 'variants' ? String(p[p.length - 1]) : null;
          const owner = variant !== null ? p.slice(0, -2) : p;
          const f = getField(doc.schema, owner);
          return (
            f && (
              <button
                key={pathKey(p)}
                type="button"
                className="child-link"
                onClick={() => dispatch({ type: 'select', path: owner })}
              >
                <TypeChip type={f.type} />
                <span>{f.name}</span>
                {variant !== null && (
                  <span className="muted small">
                    when <b>{variant}</b>
                  </span>
                )}
                <span className="row-spacer" />
                <span className="muted small mono">{pathKey(owner)}</span>
              </button>
            )
          );
        })}
      </div>
    </Field>
  );
};
