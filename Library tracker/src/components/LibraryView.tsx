import { useState, useMemo } from 'react';
import type { Book, CheckoutRecord } from '../types';
import { BookCard } from './BookCard';
import { ManageLoansModal } from './ManageLoansModal';

type FilterMode = 'all' | 'available' | 'out';

interface LibraryViewProps {
  books: Book[];
  checkouts: CheckoutRecord[];
  onReturnCheckout: (checkoutId: string) => void;
  onBookClick: (book: Book) => void;
  onScanClick: () => void;
  onManualAddClick: () => void;
}

export function LibraryView({
  books,
  checkouts,
  onReturnCheckout,
  onBookClick,
  onScanClick,
  onManualAddClick,
}: LibraryViewProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [borrowerFilter, setBorrowerFilter] = useState('');
  const [showLoanManager, setShowLoanManager] = useState(false);

  const activeCheckouts = useMemo(() => checkouts.filter((c) => !c.returnedAt), [checkouts]);

  const borrowerOptions = useMemo(() => {
    const names = new Set(activeCheckouts.map((c) => c.borrowerName.trim()).filter(Boolean));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [activeCheckouts]);

  const borrowerCheckouts = useMemo(() => {
    if (!borrowerFilter) return [];
    return activeCheckouts
      .filter((c) => c.borrowerName === borrowerFilter)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [activeCheckouts, borrowerFilter]);

  const bookStatuses = useMemo(() => {
    return books.map((book) => {
      const active = checkouts.filter((c) => (c.isbn === book.isbn || c.isbn === book.isbn13) && !c.returnedAt);
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

      const matchesBorrower =
        !borrowerFilter || activeCheckouts.some((c) => (c.isbn === book.isbn || c.isbn === book.isbn13) && c.borrowerName === borrowerFilter);

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
        <select
          className="search-input"
          value={borrowerFilter}
          onChange={(e) => setBorrowerFilter(e.target.value)}
          aria-label="Filter by borrower"
        >
          <option value="">All borrowers</option>
          {borrowerOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <button className="btn btn-secondary library-manual-add-btn" onClick={onManualAddClick}>
          + Add Manually
        </button>
        <button className="btn btn-secondary library-manual-add-btn" onClick={() => setShowLoanManager(true)}>
          Manage Loans
        </button>
      </div>

      {borrowerFilter && (
        <div className="borrower-panel" role="region" aria-label="Borrower checkouts">
          <h3 className="borrower-panel-title">{borrowerFilter} currently has {borrowerCheckouts.length} book(s)</h3>
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
    </div>
  );
}
