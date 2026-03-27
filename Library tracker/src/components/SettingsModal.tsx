import { useState } from 'react';
import { getStoredApiKey, saveApiKey } from '../services/storage';

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [key, setKey] = useState(getStoredApiKey);
  const [saved, setSaved] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveApiKey(key.trim());
    setSaved(true);
    setTimeout(onClose, 800);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="modal-sheet">
        <button className="modal-close-btn" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
        <h2 className="modal-title">Settings</h2>

        <form onSubmit={handleSave}>
          <div className="settings-field">
            <label htmlFor="api-key" className="settings-label">
              ISBNdb API Key
            </label>
            <p className="settings-hint">
              Get a free key at{' '}
              <a href="https://isbndb.com/apidocs/v2" target="_blank" rel="noopener noreferrer">
                isbndb.com
              </a>
              . Required to look up book information from ISBN barcodes.
            </p>
            <input
              id="api-key"
              className="checkout-input"
              type="password"
              placeholder="Paste your ISBNdb API key…"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary btn-full" disabled={!key.trim()}>
              {saved ? '✓ Saved!' : 'Save API Key'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
