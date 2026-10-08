import { undensing } from 'densing';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import type { BaseChoice } from '../model/store';
import { getDefaultData } from 'densing';
import { useEditor } from '../editor';
import { useEncoding } from '../encoding';
import { DataForm } from './DataForm';
import { CopyButton, Segmented } from './ui';

const BASES: { value: BaseChoice; label: string; title: string }[] = [
  { value: 'base64url', label: 'base64url', title: 'URL safe, 6 bits per character' },
  { value: 'baseQRCode45UrlSafe', label: 'QR', title: 'Characters QR codes store in alphanumeric mode' },
  { value: 'binary', label: 'binary', title: 'One character per bit' }
];

export const Playground = () => {
  const { doc, dispatch, analysis } = useEditor();
  const { encoded, error } = useEncoding();
  const [paste, setPaste] = useState('');
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  const decode = (text: string) => {
    setPaste(text);
    if (!analysis.schema || !text.trim()) return setDecodeError(null);
    try {
      dispatch({ type: 'setData', data: undensing(analysis.schema, text.trim(), doc.base) });
      setDecodeError(null);
    } catch (e) {
      const path = (e as { path?: string }).path;
      setDecodeError(`${path ? `${path}: ` : ''}${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="playground">
      <div className="encoded-box">
        <div className="inline between">
          <Segmented small value={doc.base} options={BASES} onChange={(base) => dispatch({ type: 'setBase', base })} />
          <span className="inline">
            {encoded && <CopyButton text={encoded} />}
            <button
              type="button"
              className={`btn small ${showQr ? 'on' : ''}`}
              onClick={() => setShowQr(!showQr)}
              disabled={!encoded}
            >
              QR
            </button>
          </span>
        </div>
        <output className="encoded mono">
          {error ? <span className="muted">{error}</span> : encoded || <span className="muted">(empty)</span>}
        </output>
        {showQr && encoded && (
          <div className="qr">
            <QRCodeSVG value={encoded} size={168} marginSize={2} />
          </div>
        )}
        <input
          className="input mono"
          placeholder="Paste an encoded string to decode it"
          value={paste}
          onChange={(e) => decode(e.target.value)}
          aria-label="Decode"
        />
        {decodeError && <p className="field-error">{decodeError}</p>}
      </div>
      <div className="inline between">
        <h3>Preview data</h3>
        {analysis.schema && (
          <button
            type="button"
            className="btn small"
            onClick={() => dispatch({ type: 'setData', data: getDefaultData(analysis.schema!) })}
          >
            Reset to defaults
          </button>
        )}
      </div>
      <DataForm />
    </div>
  );
};
