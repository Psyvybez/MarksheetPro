import { useState, useMemo } from 'react';
import type { Book, CheckoutRecord } from '../types';
import { BookCard } from './BookCard';

type FilterMode = 'all' | 'available' | 'out';

interface LibraryViewProps {
  books: Book[];
  checkouts: CheckoutRecord[];
  onBookClick: (book: Book) => void;
  onScanClick: () => void;
}

export function LibraryView({ books, checkouts, onBookClick, onScanClick }: LibraryViewProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');

  const bookStatuses = useMemo(() => {
    return books.map((book) => {
      const active = checkouts.filter(
        (c) => (c.isbn === book.isbn || c.isbn === book.isbn13) && !c.returnedAt,
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
        book.isbn.includes(q) ||
        book.isbn13.includes(q);

      const matchesFilter =
        filter === 'all' ||
        (filter === 'available' && availableCopies > 0) ||
        (filter === 'out' && availableCopies === 0);

      return matchesQuery && matchesFilter;
    });
  }, [bookStatuses, query, filter]);

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
      </div>

      {books.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">📚</span>
          <h3>No books yet</h3>
          <p>Scan the ISBN barcode on any book to add it to your library.</p>
          <button className="btn btn-primary" onClick={onScanClick}>
            Scan a Book
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
    </div>
  );
}
