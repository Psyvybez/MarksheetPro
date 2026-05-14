import { useMemo, useState } from 'react';
import type { Book, CheckoutRecord, StudentCard } from '../types';
import { StudentProfileModal } from './StudentProfileModal';

interface DashboardViewProps {
  books: Book[];
  checkouts: CheckoutRecord[];
  studentCards: StudentCard[];
  onReturnCheckout: (checkoutId: string) => void;
  onAddStudentCard: (input: Omit<StudentCard, 'id' | 'cardNumber' | 'createdAt' | 'updatedAt'>) => void;
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

export function DashboardView({
  books,
  checkouts,
  studentCards,
  onReturnCheckout,
  onAddStudentCard,
  onScanClick,
  onLibraryClick,
}: DashboardViewProps) {
  const [profileName, setProfileName] = useState<string | null>(null);
  const [studentNameInput, setStudentNameInput] = useState('');
  const [gradeInput, setGradeInput] = useState('');
  const [homeroomInput, setHomeroomInput] = useState('');
  const [cardCreateError, setCardCreateError] = useState<string | null>(null);
  const [cardCreateMessage, setCardCreateMessage] = useState<string | null>(null);
  const hasBooks = books.length > 0;
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
      .slice(0, 8);
  }, [checkouts]);

  const overdueList = useMemo(() => {
    return checkouts
      .filter((c) => !c.returnedAt && isDue(c.dueDate))
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [checkouts]);

  const handleQuickReturn = (checkout: CheckoutRecord) => {
    const confirmed = window.confirm(
      `Confirm return for "${checkout.bookTitle}" checked out to ${checkout.borrowerName}?`
    );
    if (!confirmed) return;
    onReturnCheckout(checkout.id);
  };

  const handleQuickCreateCard = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedName = studentNameInput.trim();
    if (!trimmedName) {
      setCardCreateError('Student name is required.');
      setCardCreateMessage(null);
      return;
    }

    onAddStudentCard({
      studentName: trimmedName,
      grade: gradeInput.trim(),
      homeroom: homeroomInput.trim(),
      notes: '',
      isActive: true,
    });

    setCardCreateError(null);
    setCardCreateMessage(`${trimmedName} card created.`);
    setStudentNameInput('');
    setGradeInput('');
    setHomeroomInput('');
  };

  return (
    <>
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
                  <div className="overdue-main">
                    <button className="student-name-btn" onClick={() => setProfileName(c.borrowerName)}>
                      {c.borrowerName}
                    </button>
                    <span className="overdue-book">{c.bookTitle}</span>
                    <span className="overdue-date">Due {formatDate(c.dueDate)}</span>
                  </div>
                  <button className="btn btn-return dashboard-return-btn" onClick={() => handleQuickReturn(c)}>
                    Confirm Return
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="activity-section">
          <h3 className="section-title">Create Student Card</h3>
          <form className="dashboard-card-form" onSubmit={handleQuickCreateCard}>
            <input
              className="search-input"
              type="text"
              value={studentNameInput}
              onChange={(event) => setStudentNameInput(event.target.value)}
              placeholder="Student name"
              maxLength={120}
              required
            />
            <div className="dashboard-card-form-row">
              <input
                className="search-input"
                type="text"
                value={gradeInput}
                onChange={(event) => setGradeInput(event.target.value)}
                placeholder="Grade (optional)"
                maxLength={40}
              />
              <input
                className="search-input"
                type="text"
                value={homeroomInput}
                onChange={(event) => setHomeroomInput(event.target.value)}
                placeholder="Homeroom (optional)"
                maxLength={80}
              />
            </div>
            <button className="btn btn-primary" type="submit">
              Create Card
            </button>
          </form>
          {cardCreateError && (
            <p className="settings-error" role="alert">
              {cardCreateError}
            </p>
          )}
          {cardCreateMessage && (
            <p className="settings-success" role="status">
              {cardCreateMessage}
            </p>
          )}
          <p className="settings-hint">Total student cards: {studentCards.length}</p>
        </div>

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
                      {c.returnedAt ? 'Returned by ' : 'Checked out to '}
                      <button className="student-name-btn" onClick={() => setProfileName(c.borrowerName)}>
                        {c.borrowerName}
                      </button>
                      {c.returnedAt ? ` on ${formatDate(c.returnedAt)}` : ` on ${formatDate(c.checkedOutAt)}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : hasBooks ? (
          <div className="empty-state" style={{ marginTop: '1.5rem' }}>
            <span className="empty-icon">🗂️</span>
            <h3>No borrowing activity yet</h3>
            <p>Your catalog is loaded. Check out a book to start tracking recent activity here.</p>
            <button className="btn btn-primary" onClick={onLibraryClick}>
              View Library
            </button>
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

      {profileName && (
        <StudentProfileModal
          borrowerName={profileName}
          studentCards={studentCards}
          checkouts={checkouts}
          onClose={() => setProfileName(null)}
        />
      )}
    </>
  );
}
