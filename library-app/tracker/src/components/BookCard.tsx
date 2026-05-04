import type { Book, CheckoutRecord } from '../types';

interface BookCardProps {
  book: Book;
  activeCheckouts: CheckoutRecord[];
  availableCopies: number;
  onClick: () => void;
  hideBorrowerDetails?: boolean;
}

export function BookCard({
  book,
  activeCheckouts,
  availableCopies,
  onClick,
  hideBorrowerDetails = false,
}: BookCardProps) {
  const isAvailable = availableCopies > 0;
  const holdCount = Array.isArray(book.holds) ? book.holds.length : 0;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className="book-card"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={`View details for ${book.title}`}
    >
      <div className="book-card-cover">
        {book.coverImage ? (
          <img src={book.coverImage} alt={`Cover of ${book.title}`} loading="lazy" />
        ) : (
          <div className="book-card-no-cover">
            <span>📖</span>
          </div>
        )}
      </div>
      <div className="book-card-info">
        <h3 className="book-card-title">{book.title}</h3>
        <p className="book-card-author">{book.authors.length > 0 ? book.authors.join(', ') : 'Unknown author'}</p>
        {book.publisher && <p className="book-card-publisher">{book.publisher}</p>}
        <div className="book-card-footer">
          <span className={`status-badge ${isAvailable ? 'status-available' : 'status-out'}`}>
            {isAvailable
              ? availableCopies === book.copies
                ? 'Available'
                : `${availableCopies} of ${book.copies} available`
              : 'Checked Out'}
          </span>
          {!hideBorrowerDetails && activeCheckouts.length > 0 && (
            <span className="book-card-borrower">
              {activeCheckouts[0].borrowerName}
              {activeCheckouts.length > 1 && ` +${activeCheckouts.length - 1}`}
            </span>
          )}
          {holdCount > 0 && <span className="book-card-holds">Holds: {holdCount}</span>}
          <button
            type="button"
            className="btn btn-secondary book-card-open-btn"
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
          >
            View Card
          </button>
        </div>
      </div>
    </div>
  );
}
