import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { FieldType } from '../model/ops';
import { TYPE_GLYPH } from './ui-utils';

export const TypeChip = ({ type }: { type: FieldType }) => (
  <span className={`type-chip t-${type}`} title={type}>
    {TYPE_GLYPH[type]}
  </span>
);

/** Plain controlled text input with the shared styling */
export const TextInput = ({
  value,
  onChange,
  className = '',
  ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  'aria-label'?: string;
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) => (
  <input
    {...rest}
    className={`input ${className}`}
    value={value}
    spellCheck={false}
    onChange={(e) => onChange(e.target.value)}
  />
);

/**
 * Number input that lets you type freely (`-`, `0.`, empty) and only reports parseable numbers.
 */
export const NumberInput = ({
  value,
  onChange,
  step,
  min,
  max,
  className = '',
  integer = false,
  'aria-label': ariaLabel
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  className?: string;
  'aria-label'?: string;
}) => {
  const [draft, setDraft] = useState(String(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);
  return (
    <input
      className={`input num ${className}`}
      inputMode={integer ? 'numeric' : 'decimal'}
      aria-label={ariaLabel}
      value={draft}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        setDraft(String(value));
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const s = (step ?? 1) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
          let next = +(value + s).toPrecision(12);
          if (min !== undefined) next = Math.max(min, next);
          if (max !== undefined) next = Math.min(max, next);
          setDraft(String(next));
          onChange(next);
        }
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw.trim() === '' || raw === '-' || raw.endsWith('.')) return;
        const n = Number(raw);
        if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) return;
        onChange(n);
      }}
    />
  );
};

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) => (
  <label className="form-field">
    <span className="form-label">{label}</span>
    {children}
    {hint && <span className="form-hint">{hint}</span>}
  </label>
);

export const Stat = ({ label, value, tone }: { label: string; value: ReactNode; tone?: 'good' | 'warn' }) => (
  <div className={`stat ${tone ?? ''}`}>
    <span className="stat-value">{value}</span>
    <span className="stat-label">{label}</span>
  </div>
);

export const Segmented = <T extends string>({
  value,
  options,
  onChange,
  small
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  small?: boolean;
}) => (
  <div className={`segmented ${small ? 'small' : ''}`} role="radiogroup">
    {options.map((o) => (
      <button
        key={o.value}
        type="button"
        role="radio"
        aria-checked={o.value === value}
        title={o.title}
        className={o.value === value ? 'on' : ''}
        onClick={() => onChange(o.value)}
      >
        {o.label}
      </button>
    ))}
  </div>
);

export const CopyButton = ({ text, label = 'Copy' }: { text: string; label?: string }) => {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          // clipboard blocked
        }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
};

export const Toggle = ({
  checked,
  onChange,
  label
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className={`toggle ${checked ? 'on' : ''}`}
    onClick={() => onChange(!checked)}
  >
    <span />
  </button>
);
