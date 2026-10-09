import { useMemo } from 'react';
import { formatBits } from '../model/analyze';
import { pathKey } from '../model/paths';
import type { Segment } from '../model/ribbon';
import { coversPath, useEditor } from '../editor';
import { useEncoding } from '../encoding';

const GROUP: Record<string, number> = { base64url: 6, binary: 8, baseQRCode45UrlSafe: 8 };

export const BitRibbon = () => {
  const { doc, analysis, hover, setHover, state, dispatch } = useEditor();
  const { error, segments, bits, encoded } = useEncoding();

  // stable color per schema node, in order of first appearance
  const colorOf = useMemo(() => {
    const m = new Map<string, number>();
    segments.forEach((s) => !m.has(s.nodeKey) && m.set(s.nodeKey, m.size % 8));
    return m;
  }, [segments]);

  const bitSeg = useMemo(() => {
    const out: Segment[] = [];
    segments.forEach((s) => {
      for (let i = 0; i < s.bits; i++) out[s.start + i] = s;
    });
    return out;
  }, [segments]);

  const legend = useMemo(() => {
    const m = new Map<string, { seg: Segment; bits: number; count: number }>();
    for (const s of segments) {
      const k = `${s.nodeKey}|${s.kind}`;
      const e = m.get(k);
      if (e) {
        e.bits += s.bits;
        e.count++;
      } else m.set(k, { seg: s, bits: s.bits, count: 1 });
    }
    return [...m.values()];
  }, [segments]);

  const selectedKey = state.selected ? pathKey(state.selected) : undefined;
  // a segment belongs to its own node, and to the references and definition it was reached through
  const belongs = (s: Segment, key: string) => coversPath(key, s.nodeKey) || s.alsoKeys.some((k) => coversPath(key, k));
  const lit = (s: Segment | undefined) =>
    !!s &&
    ((hover.nodeKey !== undefined && belongs(s, hover.nodeKey)) ||
      (hover.dataPath !== undefined && coversPath(hover.dataPath, s.dataPath)));
  const anyHover = hover.nodeKey !== undefined || hover.dataPath !== undefined;
  const hovered = segments.find(lit);

  const group = GROUP[doc.base] ?? 8;
  const charsAligned = doc.base === 'base64url' || doc.base === 'binary';
  const total = Math.max(bits.length, encoded.length * (doc.base === 'base64url' ? 6 : 0));
  const groups = Math.ceil(total / group);
  const json = JSON.stringify(doc.data) ?? '';

  const selectNode = (s: Segment) => dispatch({ type: 'select', path: s.node });

  return (
    <section className="ribbon-wrap" aria-label="Bit ribbon">
      <div className="ribbon-head">
        <h2>Bits</h2>
        {error ? (
          <span className="muted small">{error}</span>
        ) : (
          <span className="ribbon-summary">
            <b>{bits.length}</b> bits → <b className="mono">{encoded.length}</b>{' '}
            {doc.base === 'binary' ? 'digits' : 'chars'}
            <span className="muted">
              {' '}
              · schema {formatBits(analysis.total)} bits · JSON {json.length} chars
            </span>
            {json.length > 0 && (
              <span className="saving"> −{Math.max(0, Math.round((1 - encoded.length / json.length) * 100))}%</span>
            )}
          </span>
        )}
        <span className="row-spacer" />
        <span className="ribbon-hover small mono">
          {hovered ? `${hovered.dataPath} = ${hovered.value} · ${hovered.kind}` : ' '}
        </span>
      </div>
      {!error && (
        <>
          <div className={`ribbon ${anyHover ? 'dim' : ''}`} onMouseLeave={() => setHover({})}>
            {Array.from({ length: groups }, (_, g) => (
              <span key={g} className="char-group">
                <span className="char-bits">
                  {Array.from({ length: group }, (_, j) => {
                    const i = g * group + j;
                    if (i >= total) return null;
                    const s = bitSeg[i];
                    const isPad = i >= bits.length;
                    return (
                      <span
                        key={j}
                        className={`bit ${isPad ? 'pad' : `c${colorOf.get(s?.nodeKey ?? '') ?? 0} k-${s?.kind}`} ${lit(s) ? 'lit' : ''} ${
                          s && selectedKey && belongs(s, selectedKey) ? 'sel' : ''
                        } ${s && s.start === i ? 'seg-start' : ''}`}
                        title={
                          isPad
                            ? 'padding'
                            : s
                              ? `${s.dataPath} = ${s.value}\n${s.kind}, bits ${s.start}–${s.start + s.bits - 1}`
                              : ''
                        }
                        onMouseEnter={() => s && setHover({ nodeKey: s.nodeKey, dataPath: s.dataPath })}
                        onClick={() => s && selectNode(s)}
                      >
                        {isPad ? '·' : bits[i]}
                      </span>
                    );
                  })}
                </span>
                {charsAligned && <span className="char">{doc.base === 'base64url' ? encoded[g] : ''}</span>}
              </span>
            ))}
          </div>
          <div className="legend">
            {legend.map(({ seg, bits: b, count }) => (
              <button
                type="button"
                key={`${seg.nodeKey}|${seg.kind}`}
                className={`legend-item c${colorOf.get(seg.nodeKey)} k-${seg.kind} ${hover.nodeKey === seg.nodeKey ? 'lit' : ''}`}
                onMouseEnter={() => setHover({ nodeKey: seg.nodeKey })}
                onMouseLeave={() => setHover({})}
                onClick={() => selectNode(seg)}
              >
                <span className="swatch" />
                {seg.label}
                {count > 1 && <span className="muted"> ×{count}</span>}
                <span className="muted"> {b}b</span>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
};
