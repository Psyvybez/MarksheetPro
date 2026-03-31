import { useMemo, useState } from 'react';
import type { CheckoutRecord } from '../types';

interface ManageLoansModalProps {
  checkouts: CheckoutRecord[];
  onReturnCheckout: (checkoutId: string) => void;
  onClose: () => void;
}

function isOverdue(dueDateIso: string): boolean {
  return new Date(dueDateIso) < new Date();
}

export function ManageLoansModal({ checkouts, onReturnCheckout, onClose }: ManageLoansModalProps) {
  const [query, setQuery] = useState('');
  const [showOnlyOverdue, setShowOnlyOverdue] = useState(false);

  const activeCheckouts = useMemo(() => checkouts.filter((c) => !c.returnedAt), [checkouts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activeCheckouts
      .filter((c) => {
        const matchesQuery =
          !q || c.borrowerName.toLowerCase().includes(q) || c.bookTitle.toLowerCase().includes(q);
        const matchesOverdue = !showOnlyOverdue || isOverdue(c.dueDate);
        return matchesQuery && matchesOverdue;
      })
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [activeCheckouts, query, showOnlyOverdue]);

  const handleReturnFiltered = () => {
    if (filtered.length === 0) return;
    const confirmed = window.confirm(`Return ${filtered.length} currently filtered checkout(s)?`);
    if (!confirmed) return;
    filtered.forEach((record) => onReturnCheckout(record.id));
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Manage loans">
      <div className="modal-sheet">
        <button className="modal-close-btn" onClick={onClose} aria-label="Close manage loans">
          ✕
        </button>

        <h2 className="modal-title">Manage Loans</h2>

        <div className="loan-toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Filter by borrower or title"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search active loans"
          />
          <label className="loan-overdue-toggle">
            <input
              type="checkbox"
              checked={showOnlyOverdue}
              onChange={(e) => setShowOnlyOverdue(e.target.checked)}
            />
            <span>Only overdue</span>
          </label>
          <button className="btn btn-secondary" onClick={handleReturnFiltered} disabled={filtered.length === 0}>
            Return Filtered ({filtered.length})
          </button>
        </div>

        {activeCheckouts.length === 0 ? (
          <div className="empty-state" style={{ paddingTop: '1.5rem', paddingBottom: '1.5rem' }}>
            <span className="empty-icon">✅</span>
            <h3>No active loans</h3>
            <p>All checked-out books have been returned.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ paddingTop: '1.5rem', paddingBottom: '1.5rem' }}>
            <span className="empty-icon">🔎</span>
            <h3>No matching loans</h3>
            <p>Try a different filter or disable overdue-only mode.</p>
          </div>
        ) : (
          <ul className="loan-list">
            {filtered.map((record) => (
              <li key={record.id} className="loan-item">
                <div className="loan-item-info">
                  <span className="loan-item-title">{record.bookTitle}</span>
                  <span className="loan-item-meta">{record.borrowerName}</span>
                  <span className={`loan-item-meta ${isOverdue(record.dueDate) ? 'loan-overdue' : ''}`}>
                    Due {new Date(record.dueDate).toLocaleDateString()}
                  </span>
                </div>
                <button className="btn btn-return" onClick={() => onReturnCheckout(record.id)}>
                  Return
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
