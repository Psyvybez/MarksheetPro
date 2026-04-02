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
type SearchScope = 'all' | 'title' | 'author' | 'isbn' | 'genre';

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function getGenreTokens(genre: string): string[] {
  return genre
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

interface LibraryViewProps {
  books: Book[];
  checkouts: CheckoutRecord[];
  studentCards: StudentCard[];
  onReturnCheckout: (checkoutId: string) => void;
  onBookClick: (book: Book) => void;
  onScanClick: () => void;
  onScanSearchClick: () => void;
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
  onScanSearchClick,
  onManualAddClick,
  onAddStudentCard,
  onUpdateStudentCard,
  onDeleteStudentCard,
}: LibraryViewProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [genreFilter, setGenreFilter] = useState('all');
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

  const genreOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const book of books) {
      for (const token of getGenreTokens(book.genre)) {
        unique.add(token);
      }
    }

    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [books]);

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

  const q = normalizeText(query);
  const tokens = q.split(/\s+/).filter(Boolean);

  const getSearchText = (book: Book): string => {
    if (searchScope === 'title') return normalizeText(book.title);
    if (searchScope === 'author') return normalizeText(book.authors.join(' '));
    if (searchScope === 'isbn') return normalizeText(`${book.isbn} ${book.isbn13}`);
    if (searchScope === 'genre') return normalizeText(book.genre);

    return normalizeText(
      `${book.title} ${book.authors.join(' ')} ${book.category} ${book.genre} ${book.age} ${book.binding} ${book.isbn} ${book.isbn13}`
    );
  };

  const scoreBook = (book: Book): number => {
    if (!q) return 0;
    const title = normalizeText(book.title);
    const authors = normalizeText(book.authors.join(' '));
    const genre = normalizeText(book.genre);
    const isbnText = normalizeText(`${book.isbn} ${book.isbn13}`);

    let score = 0;
    if (isbnText === q) score += 120;
    if (isbnText.includes(q)) score += 60;
    if (title.startsWith(q)) score += 45;
    if (title.includes(q)) score += 30;
    if (authors.includes(q)) score += 20;
    if (genre.includes(q)) score += 16;
    return score;
  };

  const matchesBookFilters = (
    book: Book,
    availableCopies: number,
    activeCheckouts: CheckoutRecord[],
    options?: { ignoreGenre?: boolean }
  ): boolean => {
    const searchText = getSearchText(book);
    const matchesQuery = tokens.length === 0 || tokens.every((token) => searchText.includes(token));

    const matchesAvailability =
      filter === 'all' ||
      (filter === 'available' && availableCopies > 0) ||
      (filter === 'out' && availableCopies === 0);

    const bookGenreTokens = getGenreTokens(book.genre);
    const matchesGenre = options?.ignoreGenre
      ? true
      : genreFilter === 'all' || bookGenreTokens.some((token) => token === genreFilter);

    const borrowerText = borrowerFilter.trim().toLowerCase();
    const matchesBorrower =
      !borrowerText || activeCheckouts.some((checkout) => checkout.borrowerName.toLowerCase().includes(borrowerText));

    return matchesQuery && matchesAvailability && matchesGenre && matchesBorrower;
  };

  const genreQuickChips = useMemo(() => {
    const counts = new Map<string, number>();

    for (const { book, availableCopies, activeCheckouts } of bookStatuses) {
      if (!matchesBookFilters(book, availableCopies, activeCheckouts, { ignoreGenre: true })) continue;

      for (const token of getGenreTokens(book.genre)) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
    }

    const sorted = [...counts.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });

    const topChips = sorted.slice(0, 10).map(([name, count]) => ({ name, count }));

    if (genreFilter !== 'all' && !topChips.some((chip) => chip.name === genreFilter)) {
      topChips.unshift({ name: genreFilter, count: counts.get(genreFilter) ?? 0 });
    }

    return topChips;
  }, [bookStatuses, genreFilter, query, filter, searchScope, borrowerFilter]);

  const filtered = useMemo(() => {
    return bookStatuses
      .filter(({ book, availableCopies, activeCheckouts }) =>
        matchesBookFilters(book, availableCopies, activeCheckouts)
      )
      .sort((a, b) => {
        const scoreDiff = scoreBook(b.book) - scoreBook(a.book);
        if (scoreDiff !== 0) return scoreDiff;
        return a.book.title.localeCompare(b.book.title);
      });
  }, [bookStatuses, query, filter, searchScope, genreFilter, borrowerFilter]);

  const hasActiveExtraFilters = searchScope !== 'all' || genreFilter !== 'all' || Boolean(borrowerFilter.trim());

  return (
    <div className="view library-view">
      <div className="library-toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Search your library…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search books"
        />
        <div className="library-filter-row">
          <select
            className="search-input library-select"
            value={searchScope}
            onChange={(e) => setSearchScope(e.target.value as SearchScope)}
            aria-label="Search scope"
          >
            <option value="all">Search: All fields</option>
            <option value="title">Search: Title</option>
            <option value="author">Search: Author</option>
            <option value="isbn">Search: ISBN</option>
            <option value="genre">Search: Genre</option>
          </select>
          <select
            className="search-input library-select"
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            aria-label="Filter by genre"
          >
            <option value="all">Genre: All</option>
            {genreOptions.map((genre) => (
              <option key={genre} value={genre}>
                {genre}
              </option>
            ))}
          </select>
        </div>
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

        {genreQuickChips.length > 0 && (
          <div className="library-genre-chips" role="group" aria-label="Quick genre filters">
            <button
              className={`library-genre-chip ${genreFilter === 'all' ? 'active' : ''}`}
              onClick={() => setGenreFilter('all')}
            >
              All Genres
            </button>
            {genreQuickChips.map((genre) => (
              <button
                key={genre.name}
                className={`library-genre-chip ${genreFilter === genre.name ? 'active' : ''}`}
                onClick={() => setGenreFilter(genre.name)}
              >
                {genre.name} ({genre.count})
              </button>
            ))}
          </div>
        )}

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
        {hasActiveExtraFilters && (
          <button
            className="btn btn-secondary library-manual-add-btn"
            onClick={() => {
              setSearchScope('all');
              setGenreFilter('all');
              setBorrowerFilter('');
            }}
          >
            Clear Extra Filters
          </button>
        )}
        <button className="btn btn-secondary library-manual-add-btn" onClick={onManualAddClick}>
          + Add Manually
        </button>
        <button className="btn btn-secondary library-manual-add-btn" onClick={onScanSearchClick}>
          Scan to Search
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
        {genreFilter !== 'all' ? ` • Genre: ${genreFilter}` : ''}
        {searchScope !== 'all' ? ` • Scope: ${searchScope}` : ''}
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
