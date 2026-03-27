import { useMemo } from 'react';
import type { Book, CheckoutRecord } from '../types';

interface DashboardViewProps {
  books: Book[];
  checkouts: CheckoutRecord[];
  onScanClick: () => void;
  onLibraryClick: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isDue(dueDateIso: string): boolean {
  return new Date(dueDateIso) < new Date();
}

export function DashboardView({ books, checkouts, onScanClick, onLibraryClick }: DashboardViewProps) {
  const stats = useMemo(() => {
    const totalCopies = books.reduce((s, b) => s + b.copies, 0);
    const activeCheckouts = checkouts.filter((c) => !c.returnedAt);
    const overdueCheckouts = activeCheckouts.filter((c) => isDue(c.dueDate));
    return {
      totalTitles: books.length,
      totalCopies,
      checkedOut: activeCheckouts.length,
      available: totalCopies - activeCheckouts.length,
      overdue: overdueCheckouts.length,
    };
  }, [books, checkouts]);

  const recentActivity = useMemo(() => {
    return [...checkouts]
      .sort(
        (a, b) =>
          new Date(b.returnedAt ?? b.checkedOutAt).getTime() - new Date(a.returnedAt ?? a.checkedOutAt).getTime()
      )
      .slice(0, 5);
  }, [checkouts]);

  const overdueList = useMemo(() => {
    return checkouts
      .filter((c) => !c.returnedAt && isDue(c.dueDate))
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [checkouts]);

  return (
    <div className="view dashboard-view">
      {/* Hero scan button */}
      <div className="scan-hero">
        <button className="scan-hero-btn" onClick={onScanClick} aria-label="Open scanner">
          <span className="scan-hero-icon">📷</span>
          <span>Scan a Book</span>
        </button>
        <p className="scan-hero-hint">Check in or check out any book with your camera</p>
      </div>

      {/* Stats grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-value">{stats.totalTitles}</span>
          <span className="stat-label">Titles</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{stats.totalCopies}</span>
          <span className="stat-label">Copies</span>
        </div>
        <div className="stat-card stat-available">
          <span className="stat-value">{stats.available}</span>
          <span className="stat-label">Available</span>
        </div>
        <div className={`stat-card ${stats.checkedOut > 0 ? 'stat-out' : ''}`}>
          <span className="stat-value">{stats.checkedOut}</span>
          <span className="stat-label">Checked Out</span>
        </div>
      </div>

      {/* Overdue alert */}
      {overdueList.length > 0 && (
        <div className="overdue-alert">
          <h3 className="overdue-title">⚠️ Overdue ({overdueList.length})</h3>
          <ul className="overdue-list">
            {overdueList.map((c) => (
              <li key={c.id} className="overdue-item">
                <span className="overdue-name">{c.borrowerName}</span>
                <span className="overdue-book">{c.bookTitle}</span>
                <span className="overdue-date">Due {formatDate(c.dueDate)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent activity */}
      {recentActivity.length > 0 ? (
        <div className="activity-section">
          <h3 className="section-title">Recent Activity</h3>
          <ul className="activity-list">
            {recentActivity.map((c) => (
              <li key={c.id} className="activity-item">
                <span className={`activity-dot ${c.returnedAt ? 'dot-returned' : 'dot-out'}`} />
                <div className="activity-info">
                  <span className="activity-book">{c.bookTitle}</span>
                  <span className="activity-person">
                    {c.returnedAt
                      ? `Returned by ${c.borrowerName} on ${formatDate(c.returnedAt)}`
                      : `Checked out to ${c.borrowerName} on ${formatDate(c.checkedOutAt)}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="empty-state" style={{ marginTop: '1.5rem' }}>
          <span className="empty-icon">📖</span>
          <h3>Library is empty</h3>
          <p>Start by scanning a book's ISBN barcode to add it to your library.</p>
          <button className="btn btn-primary" onClick={onLibraryClick}>
            View Library
          </button>
        </div>
      )}
    </div>
  );
}
