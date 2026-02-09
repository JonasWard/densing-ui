import { useState } from 'react';
import { undensing, calculateDenseDataSize, type DenseSchema } from 'densing';
import { QRCodeSVG } from 'qrcode.react';
import './EncodedDisplay.css';

interface EncodedDisplayProps {
  schema: DenseSchema;
  data: any;
  encodedString: string;
  onDecode: (data: any) => void;
  shareUrl?: string;
}

export const EncodedDisplay = ({ schema, data, encodedString, onDecode, shareUrl }: EncodedDisplayProps) => {
  const [decodeInput, setDecodeInput] = useState('');
  const [decodeError, setDecodeError] = useState<string>('');

  const handleDecode = () => {
    try {
      const decoded = undensing(schema, decodeInput);
      onDecode(decoded);
      setDecodeError('');
    } catch (error) {
      setDecodeError(String(error));
    }
  };

  const sizeInfo = encodedString ? calculateDenseDataSize(schema, data) : null;
  const jsonString = JSON.stringify(data);
  const compressionRatio = encodedString && jsonString
    ? (((jsonString.length - encodedString.length) / jsonString.length) * 100).toFixed(1)
    : '0';

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(encodedString);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = encodedString;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  };

  return (
    <div className="encoded-display">
      <h2>Encoded Output</h2>

      {encodedString ? (
        <>
          <div className="encoded-value">
            <div className="encoded-header">
              <span className="label">Base64 Encoded:</span>
              <button className="copy-button" onClick={copyToClipboard} title="Copy to clipboard">
                📋 Copy
              </button>
            </div>
            <code className="encoded-string">{encodedString}</code>
          </div>

          {sizeInfo && (
            <div className="size-info">
              <h3>Size Analysis</h3>
              <div className="size-grid">
                <div className="size-item">
                  <span className="size-label">Total Bits:</span>
                  <span className="size-value">{sizeInfo.totalBits} bits</span>
                </div>
                <div className="size-item">
                  <span className="size-label">Base64 Length:</span>
                  <span className="size-value">{sizeInfo.base64Length} chars</span>
                </div>
                <div className="size-item">
                  <span className="size-label">JSON Length:</span>
                  <span className="size-value">{jsonString.length} chars</span>
                </div>
                <div className="size-item highlight">
                  <span className="size-label">Compression:</span>
                  <span className="size-value">{compressionRatio}% smaller</span>
                </div>
              </div>

              <div className="field-sizes">
                <h4>Bits per Field:</h4>
                <ul>
                  {Object.entries(sizeInfo.fieldSizes).map(([fieldName, bits]) => (
                    <li key={fieldName}>
                      <span className="field-name">{fieldName}:</span>
                      <span className="field-bits">{bits} bits</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="efficiency">
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${sizeInfo.efficiency.utilizationPercent}%` }}
                  ></div>
                </div>
                <span className="efficiency-label">
                  Efficiency: {sizeInfo.efficiency.utilizationPercent.toFixed(1)}%
                </span>
              </div>
            </div>
          )}

          {shareUrl && (
            <div className="qr-code-section">
              <h3>Share URL QR Code:</h3>
              <div className="qr-code-container">
                <QRCodeSVG value={shareUrl} size={200} level="M" />
              </div>
              <p className="qr-hint">Scan to open this exact state</p>
            </div>
          )}

          <div className="json-comparison">
            <h3>JSON Equivalent:</h3>
            <pre className="json-code">{JSON.stringify(data, null, 2)}</pre>
          </div>
        </>
      ) : (
        <div className="placeholder">
          <p>👆 Fill in the form fields to see the encoded output</p>
        </div>
      )}

      <div className="decode-section">
        <h3>Decode from String</h3>
        <div className="decode-input-group">
          <input
            type="text"
            placeholder="Paste encoded string here..."
            value={decodeInput}
            onChange={(e) => setDecodeInput(e.target.value)}
            className="decode-input"
          />
          <button onClick={handleDecode} className="decode-button">
            🔓 Decode
          </button>
        </div>
        {decodeError && (
          <div className="decode-error">
            <strong>Decode Error:</strong> {decodeError}
          </div>
        )}
      </div>
    </div>
  );
};
