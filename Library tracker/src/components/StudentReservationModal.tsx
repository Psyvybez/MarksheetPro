import { useMemo, useState } from 'react';
import { BookCard } from './BookCard';
import type { Book, CheckoutRecord, StudentCard } from '../types';

interface StudentReservationModalProps {
  books: Book[];
  checkouts: CheckoutRecord[];
  onAuthenticate: (cardNumber: string, studentName: string) => StudentCard | null;
  onTrackView: (book: Book, studentCard: StudentCard) => void;
  onReserve: (book: Book, studentCard: StudentCard) => boolean;
  onClose?: () => void;
  standalone?: boolean;
}

function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9X]/gi, '').toUpperCase();
}

type FilterMode = 'all' | 'available' | 'out';
type SearchScope = 'all' | 'title' | 'author' | 'isbn' | 'genre';
type SortMode = 'relevance' | 'title-az' | 'newest-added' | 'oldest-added' | 'copies-high-low' | 'copies-low-high';

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function getGenreTokens(genre: string): string[] {
  return genre
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

export function StudentReservationModal({
  books,
  checkouts,
  onAuthenticate,
  onTrackView,
  onReserve,
  onClose,
  standalone = false,
}: StudentReservationModalProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [studentName, setStudentName] = useState('');
  const [activeStudent, setActiveStudent] = useState<StudentCard | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterMode>('all');
  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [sortMode, setSortMode] = useState<SortMode>('relevance');
  const [genreFilter, setGenreFilter] = useState('all');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
      const isbnKeys = [normalizeIsbn(book.isbn), normalizeIsbn(book.isbn13)];
      const activeCheckouts = checkouts.filter(
        (record) => !record.returnedAt && isbnKeys.includes(normalizeIsbn(record.isbn))
      );
      const availableCopies = Math.max(0, book.copies - activeCheckouts.length);
      const queue = Array.isArray(book.holds) ? book.holds : [];
      const isQueuedByActiveStudent =
        !!activeStudent &&
        queue.some(
          (entry) =>
            entry.studentCardId === activeStudent.id ||
            (!!entry.studentCardNumber &&
              entry.studentCardNumber.toLowerCase() === activeStudent.cardNumber.toLowerCase())
        );

      return {
        book,
        activeCheckouts,
        availableCopies,
        queue,
        isQueuedByActiveStudent,
      };
    });
  }, [books, checkouts, activeStudent]);

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

  const genreQuickChips = useMemo(() => {
    const counts = new Map<string, number>();

    for (const status of bookStatuses) {
      const matchesAvailability =
        filter === 'all' ||
        (filter === 'available' && status.availableCopies > 0) ||
        (filter === 'out' && status.availableCopies === 0);
      const searchText = getSearchText(status.book);
      const matchesQuery = tokens.length === 0 || tokens.every((token) => searchText.includes(token));

      if (!matchesAvailability || !matchesQuery) continue;

      for (const token of getGenreTokens(status.book.genre)) {
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
  }, [bookStatuses, filter, genreFilter, q, searchScope, tokens]);

  const filteredBooks = useMemo(() => {
    return bookStatuses
      .filter((status) => {
        const searchText = getSearchText(status.book);
        const matchesQuery = tokens.length === 0 || tokens.every((token) => searchText.includes(token));
        const matchesAvailability =
          filter === 'all' ||
          (filter === 'available' && status.availableCopies > 0) ||
          (filter === 'out' && status.availableCopies === 0);
        const bookGenreTokens = getGenreTokens(status.book.genre);
        const matchesGenre = genreFilter === 'all' || bookGenreTokens.some((token) => token === genreFilter);

        return matchesQuery && matchesAvailability && matchesGenre;
      })
      .sort((a, b) => {
        if (sortMode === 'newest-added') {
          return new Date(b.book.addedAt).getTime() - new Date(a.book.addedAt).getTime();
        }

        if (sortMode === 'oldest-added') {
          return new Date(a.book.addedAt).getTime() - new Date(b.book.addedAt).getTime();
        }

        if (sortMode === 'copies-high-low') {
          const diff = b.availableCopies - a.availableCopies;
          if (diff !== 0) return diff;
          return a.book.title.localeCompare(b.book.title);
        }

        if (sortMode === 'copies-low-high') {
          const diff = a.availableCopies - b.availableCopies;
          if (diff !== 0) return diff;
          return a.book.title.localeCompare(b.book.title);
        }

        if (sortMode === 'title-az') {
          return a.book.title.localeCompare(b.book.title);
        }

        const scoreDiff = scoreBook(b.book) - scoreBook(a.book);
        if (scoreDiff !== 0) return scoreDiff;
        return a.book.title.localeCompare(b.book.title);
      });
  }, [bookStatuses, tokens, filter, genreFilter, sortMode, searchScope, q]);

  const selectedBook = useMemo(() => {
    if (!selectedBookId) return null;
    return books.find((book) => (book.isbn13 || book.isbn) === selectedBookId) ?? null;
  }, [books, selectedBookId]);

  const selectedBookStatus = useMemo(() => {
    if (!selectedBook) return null;
    return bookStatuses.find((status) => (status.book.isbn13 || status.book.isbn) === (selectedBook.isbn13 || selectedBook.isbn)) ?? null;
  }, [bookStatuses, selectedBook]);

  const studentActiveHoldCount = useMemo(() => {
    if (!activeStudent) return 0;
    return books.reduce((count, book) => {
      const holds = Array.isArray(book.holds) ? book.holds : [];
      const hasHold = holds.some(
        (h) =>
          h.studentCardId === activeStudent.id ||
          (!!h.studentCardNumber &&
            h.studentCardNumber.toLowerCase() === activeStudent.cardNumber.toLowerCase())
      );
      return count + (hasHold ? 1 : 0);
    }, 0);
  }, [books, activeStudent]);

  const hasActiveExtraFilters = searchScope !== 'all' || genreFilter !== 'all' || sortMode !== 'relevance';

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

  const handleReserve = (book: Book) => {
    if (!activeStudent) return;
    setError(null);
    setMessage(null);

    const isAlreadyQueuedForThisBook = (Array.isArray(book.holds) ? book.holds : []).some(
      (h) =>
        h.studentCardId === activeStudent.id ||
        (!!h.studentCardNumber &&
          h.studentCardNumber.toLowerCase() === activeStudent.cardNumber.toLowerCase())
    );

    if (studentActiveHoldCount >= 1 && !isAlreadyQueuedForThisBook) {
      setError('You can only reserve 1 book at a time. Cancel your current reservation to reserve a different book.');
      return;
    }

    const reserved = onReserve(book, activeStudent);
    if (!reserved) {
      setError('This reservation could not be completed. You may already be in line for this title.');
      return;
    }

    setMessage(`Reservation saved for ${book.title}.`);
  };

  const outerClassName = standalone ? 'student-portal-page' : 'modal-backdrop';
  const innerClassName = standalone ? 'student-portal-page-shell student-portal-sheet' : 'modal-sheet student-portal-sheet';

  return (
    <div
      className={outerClassName}
      role={standalone ? undefined : 'dialog'}
      aria-modal={standalone ? undefined : true}
      aria-label="Student reservation portal"
    >
      <div className={innerClassName}>
        {!standalone && onClose && (
          <button className="modal-close-btn" onClick={onClose} aria-label="Close student reservation portal">
            ✕
          </button>
        )}

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
                <div className="student-session-meta">
                  Card: {activeStudent.cardNumber}
                  {(activeStudent.grade || activeStudent.homeroom) && (
                    <> &nbsp;·&nbsp; {[activeStudent.grade, activeStudent.homeroom].filter(Boolean).join(' · ')}</>
                  )}
                </div>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setActiveStudent(null);
                  setSelectedBookId(null);
                  setMessage(null);
                  setQuery('');
                  setFilter('all');
                  setSearchScope('all');
                  setSortMode('relevance');
                  setGenreFilter('all');
                }}
              >
                Sign Out
              </button>
            </div>

            {studentActiveHoldCount >= 1 && (
              <p className="settings-hint student-limit-notice" role="status">
                You have an active reservation. Students may only reserve 1 book at a time.
              </p>
            )}

            <div className="student-portal-shell">
              <div className="student-portal-catalog">
                <div className="library-toolbar student-portal-toolbar">
                  <input
                    className="search-input"
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search the catalog"
                    aria-label="Search catalog for reservation"
                  />
                  <div className="library-filter-row">
                    <select
                      className="search-input library-select"
                      value={searchScope}
                      onChange={(event) => setSearchScope(event.target.value as SearchScope)}
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
                      onChange={(event) => setGenreFilter(event.target.value)}
                      aria-label="Filter by genre"
                    >
                      <option value="all">Genre: All</option>
                      {genreOptions.map((genre) => (
                        <option key={genre} value={genre}>
                          {genre}
                        </option>
                      ))}
                    </select>
                    <select
                      className="search-input library-select"
                      value={sortMode}
                      onChange={(event) => setSortMode(event.target.value as SortMode)}
                      aria-label="Sort books"
                    >
                      <option value="relevance">Sort: Relevance</option>
                      <option value="title-az">Sort: Title A-Z</option>
                      <option value="newest-added">Sort: Newest Added</option>
                      <option value="oldest-added">Sort: Oldest Added</option>
                      <option value="copies-high-low">Sort: Most Available Copies</option>
                      <option value="copies-low-high">Sort: Fewest Available Copies</option>
                    </select>
                  </div>
                  <div className="filter-tabs" role="group" aria-label="Filter books by availability">
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

                  {hasActiveExtraFilters && (
                    <button
                      className="btn btn-secondary library-manual-add-btn"
                      onClick={() => {
                        setSearchScope('all');
                        setGenreFilter('all');
                        setSortMode('relevance');
                      }}
                    >
                      Clear Extra Filters
                    </button>
                  )}
                </div>

                <p className="library-results-meta student-portal-results-meta" aria-live="polite">
                  Showing {filteredBooks.length} of {books.length} books
                  {genreFilter !== 'all' ? ` • Genre: ${genreFilter}` : ''}
                  {searchScope !== 'all' ? ` • Scope: ${searchScope}` : ''}
                  {filter === 'available' ? ' • Available only' : ''}
                  {filter === 'out' ? ' • Checked out only' : ''}
                </p>

                {filteredBooks.length === 0 ? (
                  <div className="empty-state student-portal-empty-state">
                    <span className="empty-icon">🔎</span>
                    <h3>No matching books</h3>
                    <p>Try a different search or filter.</p>
                  </div>
                ) : (
                  <div className="book-list student-book-list">
                    {filteredBooks.map((status) => {
                      const key = status.book.isbn13 || status.book.isbn;
                      return (
                        <div key={key} className="student-book-card-shell">
                          <BookCard
                            book={status.book}
                            activeCheckouts={status.activeCheckouts}
                            availableCopies={status.availableCopies}
                            onClick={() => handleSelectBook(status.book)}
                          />
                          <div className="student-book-card-actions">
                            <div className="student-book-card-meta">
                              <span className="student-book-card-queue">
                                {status.availableCopies > 0
                                  ? `${status.availableCopies} available now`
                                  : `Waitlist length ${status.queue.length}`}
                              </span>
                              {status.isQueuedByActiveStudent && (
                                <span className="student-book-card-reserved">You are already in line</span>
                              )}
                            </div>
                            <button
                              className="btn btn-primary"
                              onClick={() => handleReserve(status.book)}
                              disabled={
                                status.isQueuedByActiveStudent ||
                                (studentActiveHoldCount >= 1 && !status.isQueuedByActiveStudent)
                              }
                            >
                              {status.isQueuedByActiveStudent
                                ? 'Already Reserved'
                                : studentActiveHoldCount >= 1
                                  ? '1 Book Limit Reached'
                                  : status.availableCopies > 0
                                    ? 'Reserve This Copy'
                                    : 'Join Waitlist'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <aside className="student-portal-details" role="region" aria-label="Selected book details">
                {selectedBook && selectedBookStatus ? (
                  <div className="student-book-details-card">
                    <div className="modal-book-header student-book-details-header">
                      <div className="modal-cover">
                        {selectedBook.coverImage ? (
                          <img src={selectedBook.coverImage} alt={`Cover of ${selectedBook.title}`} />
                        ) : (
                          <div className="modal-cover-placeholder">📖</div>
                        )}
                      </div>
                      <div className="modal-book-meta">
                        <h3 className="modal-book-title">{selectedBook.title}</h3>
                        <p className="modal-book-author">
                          {selectedBook.authors.length > 0 ? selectedBook.authors.join(', ') : 'Unknown author'}
                        </p>
                        {selectedBook.publisher && <p className="modal-book-publisher">{selectedBook.publisher}</p>}
                        <p className="modal-book-isbn">ISBN: {selectedBook.isbn13 || selectedBook.isbn}</p>
                        {selectedBook.genre && <p className="modal-book-isbn">Genre: {selectedBook.genre}</p>}
                        {selectedBook.category && <p className="modal-book-isbn">Category: {selectedBook.category}</p>}
                      </div>
                    </div>

                    <div
                      className={`modal-status-bar ${selectedBookStatus.availableCopies > 0 ? 'status-available' : 'status-out'}`}
                    >
                      {selectedBookStatus.availableCopies > 0
                        ? `${selectedBookStatus.availableCopies} of ${selectedBook.copies} copies available`
                        : `Checked out • ${selectedBookStatus.queue.length} in waitlist`}
                    </div>

                    <div className="student-book-details-copy">
                      <p>{selectedBook.synopsis || 'No synopsis available for this title.'}</p>
                    </div>

                    {selectedBookStatus.queue.length > 0 && (
                      <div className="student-book-waitlist">
                        <h4 className="modal-section-title">Waitlist Snapshot</h4>
                        <p className="student-book-waitlist-text">
                          {selectedBookStatus.isQueuedByActiveStudent
                            ? 'You are already in the queue for this book.'
                            : `There ${selectedBookStatus.queue.length === 1 ? 'is' : 'are'} ${selectedBookStatus.queue.length} student${selectedBookStatus.queue.length === 1 ? '' : 's'} waiting for this title.`}
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="empty-state student-portal-empty-state student-portal-detail-empty">
                    <span className="empty-icon">📘</span>
                    <h3>Select a book</h3>
                    <p>Tap any catalog card to preview the book and its reservation status.</p>
                  </div>
                )}
              </aside>
            </div>
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

      </div>
    </div>
  );
}
