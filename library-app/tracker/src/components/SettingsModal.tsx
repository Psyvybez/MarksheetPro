import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { exportLibraryBackup, importLibraryBackup } from '../services/storage';
import { getLocalTeacherId, getTeacherIdForLinks } from '../services/cloudStorage';
import { checkAndSendDueReminders } from '../services/notifications';

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
  const [portalQrDataUrl, setPortalQrDataUrl] = useState<string | null>(null);
  const [portalQrError, setPortalQrError] = useState<string | null>(null);
  const [sendingDueReminders, setSendingDueReminders] = useState(false);
  const [dueRemindersMessage, setDueRemindersMessage] = useState<string | null>(null);
  const [dueRemindersError, setDueRemindersError] = useState<string | null>(null);
  const [teacherUserId, setTeacherUserId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return getLocalTeacherId();
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    const resolveUserId = async () => {
      const userId = await getTeacherIdForLinks();
      if (!cancelled) {
        setTeacherUserId(userId);
      }
    };

    resolveUserId();

    return () => {
      cancelled = true;
    };
  }, []);

  const studentPortalUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const url = new URL('./student.html', window.location.href);
    if (teacherUserId) {
      url.searchParams.set('teacher', teacherUserId);
    }
    return url.toString();
  }, [teacherUserId]);

  useEffect(() => {
    let cancelled = false;

    const generatePortalQr = async () => {
      if (!studentPortalUrl) return;
      try {
        const dataUrl = await QRCode.toDataURL(studentPortalUrl, {
          errorCorrectionLevel: 'H',
          margin: 1,
          width: 220,
        });
        if (!cancelled) {
          setPortalQrDataUrl(dataUrl);
          setPortalQrError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setPortalQrError(error instanceof Error ? error.message : 'Failed to generate QR code.');
        }
      }
    };

    generatePortalQr();

    return () => {
      cancelled = true;
    };
  }, [studentPortalUrl]);

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

  const handleOpenStudentPortal = () => {
    if (!studentPortalUrl) return;
    window.open(studentPortalUrl, '_blank', 'noopener,noreferrer');
  };

  const handleOpenPosterPage = () => {
    if (typeof window === 'undefined') return;
    const posterUrl = new URL('/library-app/Student-portal-poster.html', window.location.origin);
    if (teacherUserId) {
      posterUrl.searchParams.set('teacher', teacherUserId);
    }
    window.open(posterUrl.toString(), '_blank', 'noopener,noreferrer');
  };

  const handleSendDueReminders = async () => {
    setDueRemindersError(null);
    setDueRemindersMessage(null);
    setSendingDueReminders(true);

    try {
      const result = await checkAndSendDueReminders();
      setSendingDueReminders(false);

      if (result.ok) {
        setDueRemindersMessage('Due reminders sent successfully.');
      } else {
        setDueRemindersError(result.error || 'Failed to send due reminders.');
      }
    } catch (err) {
      setSendingDueReminders(false);
      setDueRemindersError(err instanceof Error ? err.message : 'Failed to send due reminders.');
    }
  };

  const handleCopyStudentPortalLink = async () => {
    if (!studentPortalUrl) return;

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }
      await navigator.clipboard.writeText(studentPortalUrl);
      setBackupMessage('Student portal link copied.');
      setBackupError(null);
    } catch {
      setBackupError('Could not copy the student portal link. Copy it manually from the text box below.');
    }
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
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Settings" onClick={onClose}>
      <div className="modal-sheet" onClick={(event) => event.stopPropagation()}>
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
          <h3 className="settings-label">Student Portal QR</h3>
          <p className="settings-hint">Students can scan this code to open the reservation portal on their devices.</p>
          {portalQrDataUrl ? (
            <img className="settings-portal-qr" src={portalQrDataUrl} alt="Student portal QR code" />
          ) : (
            <p className="settings-hint">Generating QR code...</p>
          )}
          {portalQrError && (
            <p className="settings-error" role="alert">
              {portalQrError}
            </p>
          )}
          <input className="checkout-input" value={studentPortalUrl} readOnly aria-label="Student portal URL" />
          <div className="settings-backup-actions">
            <button type="button" className="btn btn-secondary" onClick={handleCopyStudentPortalLink}>
              Copy Link
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleOpenStudentPortal}>
              Open Student Portal
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleOpenPosterPage}>
              Open Printable Poster
            </button>
          </div>
        </div>

        <div className="settings-vault-box">
          <h3 className="settings-label">SMS Notifications</h3>
          <p className="settings-hint">Manually trigger due date reminders to send to students.</p>
          {dueRemindersMessage && (
            <p className="settings-success" role="alert">
              {dueRemindersMessage}
            </p>
          )}
          {dueRemindersError && (
            <p className="settings-error" role="alert">
              {dueRemindersError}
            </p>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleSendDueReminders}
            disabled={sendingDueReminders}
          >
            {sendingDueReminders ? 'Sending...' : 'Send Due Date Reminders'}
          </button>
          <p className="settings-hint">
            This sends reminders to students for books due in 2 days, 1 day, or today. Normally runs at 9am via
            scheduler.
          </p>
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
