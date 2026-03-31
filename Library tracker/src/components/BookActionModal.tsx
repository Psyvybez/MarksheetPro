import { useState } from 'react';
import type { Book, CheckoutRecord } from '../types';
import type { BookStatus } from '../hooks/useLibrary';

interface BookActionModalProps {
  /** The book selected from the library */
  book: Book;
  /** Status from the library */
  status: BookStatus | null;
  loading: boolean;
  borrowerSuggestions: string[];
  onCheckout: (borrowerName: string) => void;
  onReturn: (checkoutId: string) => void;
  onClose: () => void;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function isDue(iso: string) {
  return new Date(iso) < new Date();
}

export function BookActionModal({
  book,
  status,
  loading,
  borrowerSuggestions,
  onCheckout,
  onReturn,
  onClose,
}: BookActionModalProps) {
  const [borrowerName, setBorrowerName] = useState('');
  const [showCheckoutForm, setShowCheckoutForm] = useState(false);

  // Since we only present the modal for books already saved to the library, status should be present
  const inLibrary = status !== null;
  const isAvailable = status ? status.isAvailable : false;
  const activeCheckouts: CheckoutRecord[] = status ? status.activeCheckouts : [];

  const handleCheckoutSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (borrowerName.trim()) {
      onCheckout(borrowerName.trim());
    }
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Book details">
      <div className="modal-sheet">
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>

        {/* Book info */}
        <div className="modal-book-header">
          <div className="modal-cover">
            {book.coverImage ? (
              <img src={book.coverImage} alt={`Cover of ${book.title}`} />
            ) : (
              <div className="modal-cover-placeholder">📖</div>
            )}
          </div>
          <div className="modal-book-meta">
            <h2 className="modal-book-title">{book.title}</h2>
            {book.authors.length > 0 && <p className="modal-book-author">{book.authors.join(', ')}</p>}
            {book.publisher && <p className="modal-book-publisher">{book.publisher}</p>}
            {book.datePublished && <p className="modal-book-year">{book.datePublished}</p>}
            <p className="modal-book-isbn">ISBN: {book.isbn13 || book.isbn}</p>
            {book.category && <p className="modal-book-isbn">Category: {book.category}</p>}
            {book.genre && <p className="modal-book-isbn">Genre: {book.genre}</p>}
            {book.age && <p className="modal-book-isbn">Age: {book.age}</p>}
            {book.binding && <p className="modal-book-isbn">Binding: {book.binding}</p>}
            {book.conditionCoverBindingIntegrity && (
              <p className="modal-book-isbn">Cover/Binding Condition: {book.conditionCoverBindingIntegrity}</p>
            )}
            {book.conditionPageQuality && (
              <p className="modal-book-isbn">Page Quality Condition: {book.conditionPageQuality}</p>
            )}
            {book.conditionOverallAppearance && (
              <p className="modal-book-isbn">Overall Condition: {book.conditionOverallAppearance}</p>
            )}
          </div>
        </div>

        {/* Status badge */}
        {inLibrary && (
          <div className={`modal-status-bar ${isAvailable ? 'status-available' : 'status-out'}`}>
            {isAvailable
              ? status!.availableCopies === status!.book.copies
                ? '✓ Available'
                : `✓ ${status!.availableCopies} of ${status!.book.copies} copies available`
              : `✗ All ${status!.book.copies} ${status!.book.copies === 1 ? 'copy' : 'copies'} checked out`}
          </div>
        )}

        {/* Active checkouts list */}
        {activeCheckouts.length > 0 && (
          <div className="modal-checkouts">
            <h3 className="modal-section-title">Currently Checked Out</h3>
            <ul className="checkout-list">
              {activeCheckouts.map((c) => (
                <li key={c.id} className="checkout-item">
                  <div className="checkout-item-info">
                    <span className="checkout-borrower">{c.borrowerName}</span>
                    <span className={`checkout-due ${isDue(c.dueDate) ? 'overdue' : ''}`}>
                      Due {formatDate(c.dueDate)}
                    </span>
                  </div>
                  <button className="btn btn-return" onClick={() => onReturn(c.id)} disabled={loading}>
                    Return
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Action area */}
        <div className="modal-actions">
          {isAvailable && !showCheckoutForm ? (
            <button className="btn btn-primary btn-full" onClick={() => setShowCheckoutForm(true)} disabled={loading}>
              Check Out
            </button>
          ) : isAvailable && showCheckoutForm ? (
            <form className="checkout-form" onSubmit={handleCheckoutSubmit}>
              <label className="checkout-label" htmlFor="borrower-name">
                Student / Borrower Name
              </label>
              <input
                id="borrower-name"
                className="checkout-input"
                type="text"
                placeholder="Enter name…"
                value={borrowerName}
                onChange={(e) => setBorrowerName(e.target.value)}
                list="borrower-suggestions"
                autoFocus
                autoComplete="off"
                maxLength={100}
              />
              <datalist id="borrower-suggestions">
                {borrowerSuggestions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <div className="checkout-form-btns">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCheckoutForm(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={!borrowerName.trim() || loading}>
                  Confirm Checkout
                </button>
              </div>
            </form>
          ) : (
            // All copies are out
            <div className="btn-secondary btn-full" style={{ textAlign: 'center', opacity: 0.7 }}>
              All copies are checked out
            </div>
          )}
        </div>

        {/* Synopsis */}
        {book.synopsis && (
          <details className="modal-synopsis">
            <summary>Synopsis</summary>
            <p>{book.synopsis}</p>
          </details>
        )}
      </div>
    </div>
  );
}
