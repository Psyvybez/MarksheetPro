import { useState, useMemo } from 'react';
import type { Book, CheckoutRecord, StudentCard } from '../types';
import { BookCard } from './BookCard';
import { ManageLoansModal } from './ManageLoansModal';
import { StudentCardsModal } from './StudentCardsModal';

function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9X]/gi, '').toUpperCase();
}

function isSameIsbn(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return normalizeIsbn(a) === normalizeIsbn(b);
}

type FilterMode = 'all' | 'available' | 'out';

interface LibraryViewProps {
  books: Book[];
  checkouts: CheckoutRecord[];
  studentCards: StudentCard[];
  onReturnCheckout: (checkoutId: string) => void;
  onBookClick: (book: Book) => void;
  onScanClick: () => void;
  onManualAddClick: () => void;
  onAddStudentCard: (input: Omit<StudentCard, 'id' | 'cardNumber' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateStudentCard: (cardId: string, updates: Partial<Omit<StudentCard, 'id' | 'createdAt'>>) => void;
  onDeleteStudentCard: (cardId: string) => void;
}

export function LibraryView({
  books,
  checkouts,
  studentCards,
  onReturnCheckout,
  onBookClick,
  onScanClick,
  onManualAddClick,
  onAddStudentCard,
  onUpdateStudentCard,
  onDeleteStudentCard,
}: LibraryViewProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [borrowerFilter, setBorrowerFilter] = useState('');
  const [showLoanManager, setShowLoanManager] = useState(false);
  const [showStudentCardsManager, setShowStudentCardsManager] = useState(false);

  const activeCheckouts = useMemo(() => checkouts.filter((c) => !c.returnedAt), [checkouts]);

  const borrowerOptions = useMemo(() => {
    const names = new Set(activeCheckouts.map((c) => c.borrowerName.trim()).filter(Boolean));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [activeCheckouts]);

  const borrowerCheckouts = useMemo(() => {
    if (!borrowerFilter) return [];
    const filterText = borrowerFilter.trim().toLowerCase();
    return activeCheckouts
      .filter((c) => c.borrowerName.toLowerCase().includes(filterText))
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [activeCheckouts, borrowerFilter]);

  const bookStatuses = useMemo(() => {
    return books.map((book) => {
      const active = checkouts.filter(
        (c) => (isSameIsbn(c.isbn, book.isbn) || isSameIsbn(c.isbn, book.isbn13)) && !c.returnedAt
      );
      return {
        book,
        activeCheckouts: active,
        availableCopies: Math.max(0, book.copies - active.length),
      };
    });
  }, [books, checkouts]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return bookStatuses.filter(({ book, availableCopies }) => {
      const matchesQuery =
        !q ||
        book.title.toLowerCase().includes(q) ||
        book.authors.some((a) => a.toLowerCase().includes(q)) ||
        book.category.toLowerCase().includes(q) ||
        book.genre.toLowerCase().includes(q) ||
        book.age.toLowerCase().includes(q) ||
        book.binding.toLowerCase().includes(q) ||
        book.isbn.includes(q) ||
        book.isbn13.includes(q);

      const matchesFilter =
        filter === 'all' ||
        (filter === 'available' && availableCopies > 0) ||
        (filter === 'out' && availableCopies === 0);

      const filterText = borrowerFilter.trim().toLowerCase();
      const matchesBorrower =
        !filterText ||
        activeCheckouts.some(
          (c) =>
            (isSameIsbn(c.isbn, book.isbn) || isSameIsbn(c.isbn, book.isbn13)) &&
            c.borrowerName.toLowerCase().includes(filterText)
        );

      return matchesQuery && matchesFilter && matchesBorrower;
    });
  }, [bookStatuses, query, filter, borrowerFilter, activeCheckouts]);

  return (
    <div className="view library-view">
      <div className="library-toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Search by title, author, or ISBN…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search books"
        />
        <div className="filter-tabs" role="group" aria-label="Filter books">
          {(['all', 'available', 'out'] as FilterMode[]).map((mode) => (
            <button
              key={mode}
              className={`filter-tab ${filter === mode ? 'active' : ''}`}
              onClick={() => setFilter(mode)}
            >
              {mode === 'all' ? 'All' : mode === 'available' ? 'Available' : 'Checked Out'}
            </button>
          ))}
        </div>
        <input
          className="search-input"
          type="text"
          value={borrowerFilter}
          onChange={(e) => setBorrowerFilter(e.target.value)}
          placeholder="Filter by borrower name"
          list="borrower-filter-options"
          aria-label="Filter books by borrower name"
        />
        <datalist id="borrower-filter-options">
          {borrowerOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
        {borrowerFilter && (
          <button className="btn btn-secondary library-manual-add-btn" onClick={() => setBorrowerFilter('')}>
            Clear Borrower Filter
          </button>
        )}
        <button className="btn btn-secondary library-manual-add-btn" onClick={onManualAddClick}>
          + Add Manually
        </button>
        <button
          className="btn btn-secondary library-manual-add-btn"
          onClick={() => setShowLoanManager(true)}
          aria-haspopup="dialog"
        >
          Manage Loans
        </button>
        <button
          className="btn btn-secondary library-manual-add-btn"
          onClick={() => setShowStudentCardsManager(true)}
          aria-haspopup="dialog"
        >
          Student Cards
        </button>
      </div>

      <p className="library-results-meta" aria-live="polite">
        Showing {filtered.length} of {books.length} books
      </p>

      {borrowerFilter && (
        <div className="borrower-panel" role="region" aria-label="Borrower checkouts">
          <h3 className="borrower-panel-title">Matching loans: {borrowerCheckouts.length} book(s)</h3>
          {borrowerCheckouts.length === 0 ? (
            <p className="borrower-panel-empty">No active checkouts for this borrower.</p>
          ) : (
            <ul className="borrower-checkout-list">
              {borrowerCheckouts.map((checkout) => (
                <li key={checkout.id} className="borrower-checkout-item">
                  <div className="borrower-checkout-info">
                    <span className="borrower-checkout-title">{checkout.bookTitle}</span>
                    <span className="borrower-checkout-due">Due {new Date(checkout.dueDate).toLocaleDateString()}</span>
                  </div>
                  <button className="btn btn-return" onClick={() => onReturnCheckout(checkout.id)}>
                    Quick Return
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {books.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📚</span>
          <h3>No books yet</h3>
          <p>Scan the ISBN barcode on any book to add it to your library.</p>
          <button className="btn btn-primary" onClick={onScanClick}>
            Scan a Book
          </button>
          <button className="btn btn-secondary" onClick={onManualAddClick}>
            Add Manually
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">🔍</span>
          <h3>No results</h3>
          <p>Try a different search or filter.</p>
        </div>
      ) : (
        <div className="book-list">
          {filtered.map(({ book, activeCheckouts, availableCopies }) => (
            <BookCard
              key={book.isbn13 || book.isbn}
              book={book}
              activeCheckouts={activeCheckouts}
              availableCopies={availableCopies}
              onClick={() => onBookClick(book)}
            />
          ))}
        </div>
      )}

      {showLoanManager && (
        <ManageLoansModal
          checkouts={checkouts}
          onReturnCheckout={onReturnCheckout}
          onClose={() => setShowLoanManager(false)}
        />
      )}

      {showStudentCardsManager && (
        <StudentCardsModal
          cards={studentCards}
          onAddCard={onAddStudentCard}
          onUpdateCard={onUpdateStudentCard}
          onDeleteCard={onDeleteStudentCard}
          onClose={() => setShowStudentCardsManager(false)}
        />
      )}
    </div>
  );
}
