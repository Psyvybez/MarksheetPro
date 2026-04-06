import { useMemo, useState } from 'react';
import type { Book, CheckoutRecord, StudentCard } from '../types';

interface StudentReservationModalProps {
  books: Book[];
  checkouts: CheckoutRecord[];
  studentCards: StudentCard[];
  onAuthenticate: (cardNumber: string, studentName: string) => StudentCard | null;
  onTrackView: (book: Book, studentCard: StudentCard) => void;
  onReserve: (book: Book, studentCard: StudentCard) => boolean;
  onClose: () => void;
}

function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9X]/gi, '').toUpperCase();
}

export function StudentReservationModal({
  books,
  checkouts,
  studentCards,
  onAuthenticate,
  onTrackView,
  onReserve,
  onClose,
}: StudentReservationModalProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [studentName, setStudentName] = useState('');
  const [activeStudent, setActiveStudent] = useState<StudentCard | null>(null);
  const [query, setQuery] = useState('');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const filteredBooks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;

    return books.filter((book) => {
      const text = `${book.title} ${book.authors.join(' ')} ${book.genre} ${book.category} ${book.isbn} ${book.isbn13}`.toLowerCase();
      return text.includes(q);
    });
  }, [books, query]);

  const selectedBook = useMemo(() => {
    if (!selectedBookId) return null;
    return books.find((book) => (book.isbn13 || book.isbn) === selectedBookId) ?? null;
  }, [books, selectedBookId]);

  const handleSignIn = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const card = onAuthenticate(cardNumber, studentName);
    if (!card) {
      setError('Could not sign in. Check card number and student name.');
      return;
    }

    setActiveStudent(card);
    setCardNumber(card.cardNumber);
    setStudentName(card.studentName);
    setMessage(`Signed in as ${card.studentName}.`);
  };

  const handleSelectBook = (book: Book) => {
    setSelectedBookId(book.isbn13 || book.isbn);
    if (activeStudent) {
      onTrackView(book, activeStudent);
    }
  };

  const getBookStats = (book: Book) => {
    const isbnKeys = [normalizeIsbn(book.isbn), normalizeIsbn(book.isbn13)];
    const active = checkouts.filter(
      (record) => !record.returnedAt && isbnKeys.includes(normalizeIsbn(record.isbn))
    );

    const availableCopies = Math.max(0, book.copies - active.length);
    const queue = Array.isArray(book.holds) ? book.holds : [];
    const isQueuedByActiveStudent =
      !!activeStudent &&
      queue.some(
        (entry) =>
          entry.studentCardId === activeStudent.id ||
          (!!entry.studentCardNumber && entry.studentCardNumber.toLowerCase() === activeStudent.cardNumber.toLowerCase())
      );

    return { availableCopies, queue, isQueuedByActiveStudent };
  };

  const handleReserve = (book: Book) => {
    if (!activeStudent) return;
    setError(null);
    setMessage(null);

    const reserved = onReserve(book, activeStudent);
    if (!reserved) {
      setError('This reservation could not be completed. You may already be in line for this title.');
      return;
    }

    setMessage(`Reservation saved for ${book.title}.`);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Student reservation portal">
      <div className="modal-sheet">
        <button className="modal-close-btn" onClick={onClose} aria-label="Close student reservation portal">
          ✕
        </button>

        <h2 className="modal-title">Student Reservation Portal</h2>

        {!activeStudent ? (
          <form className="checkout-form" onSubmit={handleSignIn}>
            <label className="checkout-label" htmlFor="student-card-number">
              Library Card Number
            </label>
            <input
              id="student-card-number"
              className="checkout-input"
              type="text"
              value={cardNumber}
              onChange={(event) => setCardNumber(event.target.value)}
              placeholder="Example: LIB-00001"
              autoComplete="off"
              required
            />

            <label className="checkout-label" htmlFor="student-name">
              Student Name
            </label>
            <input
              id="student-name"
              className="checkout-input"
              type="text"
              value={studentName}
              onChange={(event) => setStudentName(event.target.value)}
              placeholder="Name on card"
              autoComplete="off"
              required
            />

            <button className="btn btn-primary" type="submit">
              Sign In
            </button>

            <p className="settings-hint">Only active assigned library cards can access reservation mode.</p>
          </form>
        ) : (
          <>
            <div className="student-session-bar">
              <div>
                <strong>{activeStudent.studentName}</strong>
                <div className="student-session-meta">Card: {activeStudent.cardNumber}</div>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setActiveStudent(null);
                  setSelectedBookId(null);
                  setMessage(null);
                }}
              >
                Sign Out
              </button>
            </div>

            <input
              className="search-input"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title, author, genre, or ISBN"
              aria-label="Search catalog for reservation"
            />

            {filteredBooks.length === 0 ? (
              <div className="empty-state" style={{ paddingTop: '1rem', paddingBottom: '1rem' }}>
                <span className="empty-icon">🔎</span>
                <h3>No matching books</h3>
                <p>Try a different search term.</p>
              </div>
            ) : (
              <ul className="student-catalog-list">
                {filteredBooks.map((book) => {
                  const key = book.isbn13 || book.isbn;
                  const stats = getBookStats(book);
                  return (
                    <li key={key} className="student-catalog-item">
                      <button className="student-catalog-main" onClick={() => handleSelectBook(book)}>
                        <span className="student-catalog-title">{book.title}</span>
                        <span className="student-catalog-meta">
                          {book.authors[0] ? `By ${book.authors.join(', ')}` : 'Unknown author'}
                        </span>
                        <span className="student-catalog-meta">
                          {stats.availableCopies > 0
                            ? `${stats.availableCopies} copy${stats.availableCopies === 1 ? '' : 'ies'} available`
                            : `Checked out • Queue ${stats.queue.length}`}
                        </span>
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={() => handleReserve(book)}
                        disabled={stats.isQueuedByActiveStudent}
                      >
                        {stats.isQueuedByActiveStudent ? 'Already Reserved' : 'Reserve'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            {selectedBook && (
              <div className="student-book-details" role="region" aria-label="Selected book details">
                <h3>{selectedBook.title}</h3>
                <p>{selectedBook.synopsis || 'No synopsis available for this title.'}</p>
                <p className="settings-hint">Viewed by: {activeStudent.studentName}</p>
              </div>
            )}
          </>
        )}

        {message && (
          <p className="settings-success" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}

        <p className="settings-hint">Active student cards in system: {studentCards.filter((card) => card.isActive).length}</p>
      </div>
    </div>
  );
}
