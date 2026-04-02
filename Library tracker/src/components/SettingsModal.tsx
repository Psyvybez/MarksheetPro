import { useRef, useState } from 'react';
import { exportLibraryBackup, importLibraryBackup } from '../services/storage';

interface SettingsModalProps {
  onDataImported: () => void;
  onLoadDemoData: () => void;
  onClearAllData: () => void;
  onClearCheckoutsOnly: () => void;
  summary: {
    totalTitles: number;
    totalCopies: number;
    activeLoans: number;
    studentCards: number;
  };
  onClose: () => void;
}

export function SettingsModal({
  onDataImported,
  onLoadDemoData,
  onClearAllData,
  onClearCheckoutsOnly,
  summary,
  onClose,
}: SettingsModalProps) {
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportBackup = () => {
    setBackupError(null);
    setBackupMessage(null);
    try {
      const payload = exportLibraryBackup();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `library-backup-${date}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setBackupMessage('Backup exported successfully.');
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Failed to export backup.');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setBackupError(null);
    setBackupMessage(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      importLibraryBackup(parsed);
      onDataImported();
      setBackupMessage('Backup imported successfully.');
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Failed to import backup.');
    } finally {
      event.target.value = '';
    }
  };

  const handleLoadDemoData = () => {
    setBackupError(null);
    setBackupMessage(null);

    const confirmed = window.confirm('Load demo dataset? This will replace your current books and checkout history.');
    if (!confirmed) return;

    try {
      onLoadDemoData();
      setBackupMessage('Demo dataset loaded. You can now test overdue and checkout flows.');
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : 'Failed to load demo dataset.');
    }
  };

  const handleOpenVaultPage = () => {
    const vaultUrl = '/Library-vault.html';
    if (window.top && window.top !== window) {
      window.top.location.href = vaultUrl;
      return;
    }

    window.location.href = vaultUrl;
  };

  const handleClearAllData = () => {
    setBackupError(null);
    setBackupMessage(null);

    const confirmed = window.confirm(
      'Delete all library data? This removes books, checkout history, and student cards from this account.'
    );
    if (!confirmed) return;

    onClearAllData();
    setBackupMessage('All library data was cleared.');
  };

  const handleClearCheckoutsOnly = () => {
    setBackupError(null);
    setBackupMessage(null);

    const confirmed = window.confirm('Clear only checkout history? Books and student cards will stay unchanged.');
    if (!confirmed) return;

    onClearCheckoutsOnly();
    setBackupMessage('Checkout history was cleared.');
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="modal-sheet">
        <button className="modal-close-btn" onClick={onClose} aria-label="Close settings">
          ✕
        </button>
        <h2 className="modal-title">Settings</h2>

        <div className="settings-summary-box">
          <h3 className="settings-label">Library Snapshot</h3>
          <div className="settings-summary-grid">
            <div className="settings-summary-card">
              <span className="settings-summary-value">{summary.totalTitles}</span>
              <span className="settings-summary-label">Titles</span>
            </div>
            <div className="settings-summary-card">
              <span className="settings-summary-value">{summary.totalCopies}</span>
              <span className="settings-summary-label">Copies</span>
            </div>
            <div className="settings-summary-card">
              <span className="settings-summary-value">{summary.activeLoans}</span>
              <span className="settings-summary-label">Active Loans</span>
            </div>
            <div className="settings-summary-card">
              <span className="settings-summary-value">{summary.studentCards}</span>
              <span className="settings-summary-label">Student Cards</span>
            </div>
          </div>
        </div>

        <div className="settings-backup-box">
          <h3 className="settings-label">Library Backup</h3>
          <p className="settings-hint">Export and import your book catalog and checkout history as JSON.</p>
          <div className="settings-backup-actions">
            <button type="button" className="btn btn-secondary" onClick={handleExportBackup}>
              Export Backup
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleImportClick}>
              Import Backup
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleLoadDemoData}>
              Load Demo Dataset
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportChange}
              style={{ display: 'none' }}
            />
          </div>
          {backupMessage && (
            <p className="settings-success" role="status">
              {backupMessage}
            </p>
          )}
          {backupError && (
            <p className="settings-error" role="alert">
              {backupError}
            </p>
          )}
        </div>

        <div className="settings-vault-box">
          <h3 className="settings-label">Vault Access</h3>
          <p className="settings-hint">Need the passphrase-protected page? Open the dedicated vault route.</p>
          <button type="button" className="btn btn-secondary" onClick={handleOpenVaultPage}>
            Open Vault Page
          </button>
        </div>

        <div className="settings-danger-box">
          <h3 className="settings-label">Danger Zone</h3>
          <p className="settings-hint">Use only if you want to reset specific library data.</p>
          <button type="button" className="btn btn-secondary" onClick={handleClearCheckoutsOnly}>
            Reset Only Checkouts
          </button>
          <button type="button" className="btn btn-danger-soft" onClick={handleClearAllData}>
            Clear All Library Data
          </button>
        </div>
      </div>
    </div>
  );
}
