import { useMemo } from 'react';
import type { CheckoutRecord, StudentCard } from '../types';

interface StudentProfileModalProps {
  borrowerName: string;
  studentCards: StudentCard[];
  checkouts: CheckoutRecord[];
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isOverdue(dueDateIso: string): boolean {
  return new Date(dueDateIso) < new Date();
}

export function StudentProfileModal({ borrowerName, studentCards, checkouts, onClose }: StudentProfileModalProps) {
  const card = useMemo(() => {
    const normalized = borrowerName.trim().toLowerCase();
    return (
      studentCards.find((c) => c.studentName.trim().toLowerCase() === normalized) ??
      studentCards.find((c) => c.studentName.trim().toLowerCase().includes(normalized)) ??
      null
    );
  }, [borrowerName, studentCards]);

  const activeLoans = useMemo(
    () =>
      checkouts
        .filter(
          (c) => !c.returnedAt && c.borrowerName.trim().toLowerCase() === borrowerName.trim().toLowerCase()
        )
        .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()),
    [checkouts, borrowerName]
  );

  const loanHistory = useMemo(
    () =>
      checkouts
        .filter(
          (c) => c.returnedAt && c.borrowerName.trim().toLowerCase() === borrowerName.trim().toLowerCase()
        )
        .sort((a, b) => new Date(b.returnedAt!).getTime() - new Date(a.returnedAt!).getTime())
        .slice(0, 5),
    [checkouts, borrowerName]
  );

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Student profile: ${borrowerName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-sheet student-profile-sheet">
        <button className="modal-close-btn" onClick={onClose} aria-label="Close student profile">
          ✕
        </button>

        <h2 className="modal-title">Student Profile</h2>

        {/* Card details */}
        {card ? (
          <div className="student-profile-card">
            <div className="student-profile-header">
              <div className="student-profile-avatar" aria-hidden="true">
                {card.studentName.charAt(0).toUpperCase()}
              </div>
              <div className="student-profile-identity">
                <h3 className="student-profile-name">{card.studentName}</h3>
                {(card.grade || card.homeroom) && (
                  <p className="student-profile-meta">
                    {[card.grade, card.homeroom].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p className="student-profile-meta">Card: {card.cardNumber}</p>
              </div>
              <span
                className={`student-profile-status-badge ${card.isActive ? 'badge-active' : 'badge-inactive'}`}
              >
                {card.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>

            {card.notes && (
              <p className="student-profile-notes">{card.notes}</p>
            )}
          </div>
        ) : (
          <div className="student-profile-card student-profile-no-card">
            <div className="student-profile-header">
              <div className="student-profile-avatar" aria-hidden="true">
                {borrowerName.charAt(0).toUpperCase()}
              </div>
              <div className="student-profile-identity">
                <h3 className="student-profile-name">{borrowerName}</h3>
                <p className="student-profile-meta student-profile-unregistered">No library card on file</p>
              </div>
            </div>
          </div>
        )}

        {/* Active loans */}
        <div className="student-profile-section">
          <h4 className="student-profile-section-title">
            Currently Checked Out
            <span className="student-profile-count">{activeLoans.length}</span>
          </h4>
          {activeLoans.length === 0 ? (
            <p className="student-profile-empty">No books currently checked out.</p>
          ) : (
            <ul className="student-profile-loan-list">
              {activeLoans.map((loan) => (
                <li key={loan.id} className={`student-profile-loan-item ${isOverdue(loan.dueDate) ? 'loan-overdue-item' : ''}`}>
                  <span className="student-profile-loan-title">{loan.bookTitle}</span>
                  <span className="student-profile-loan-due">
                    {isOverdue(loan.dueDate) ? '⚠ Overdue · ' : ''}Due {formatDate(loan.dueDate)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Recent history */}
        {loanHistory.length > 0 && (
          <div className="student-profile-section">
            <h4 className="student-profile-section-title">
              Recent Returns
              <span className="student-profile-count">{loanHistory.length}</span>
            </h4>
            <ul className="student-profile-loan-list">
              {loanHistory.map((loan) => (
                <li key={loan.id} className="student-profile-loan-item student-profile-loan-returned">
                  <span className="student-profile-loan-title">{loan.bookTitle}</span>
                  <span className="student-profile-loan-due">Returned {formatDate(loan.returnedAt!)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button className="btn btn-secondary" style={{ width: '100%', marginTop: '0.5rem' }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
