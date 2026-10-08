import { useEffect, useRef } from 'react';
import { FIELD_TYPES, type FieldType } from '../model/ops';
import { TypeChip } from './ui';

export const AddMenu = ({ onPick, onClose }: { onPick: (t: FieldType) => void; onClose: () => void }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    ref.current?.querySelector('button')?.focus();
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  return (
    <div className="add-menu" ref={ref} role="menu">
      {FIELD_TYPES.map((t) => (
        <button key={t.type} type="button" role="menuitem" onClick={() => onPick(t.type)}>
          <TypeChip type={t.type} />
          <span className="add-menu-label">{t.label}</span>
          <span className="add-menu-hint">{t.hint}</span>
        </button>
      ))}
    </div>
  );
};
