import { useState, useCallback } from 'react';
import { useLibrary } from './hooks/useLibrary';
import { Scanner } from './components/Scanner';
import { BookActionModal } from './components/BookActionModal';
import { LibraryView } from './components/LibraryView';
import { DashboardView } from './components/DashboardView';
import { NavBar } from './components/NavBar';
import { ManualBookModal } from './components/ManualBookModal';
import type { AppView, Book } from './types';

export default function App() {
  const [view, setView] = useState<AppView>('dashboard');
  const [showScanner, setShowScanner] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const library = useLibrary();

  // After a successful scan: look up the book and show the action modal
  const handleScan = useCallback(
    async (isbn: string) => {
      setShowScanner(false);
      setScanError(null);

      const book = await library.lookupBook(isbn);
      if (book) {
        setActiveBook(book);
      } else {
        setScanError(library.error ?? 'Could not look up that barcode.');
      }
    },
    [library]
  );

  const handleNavChange = useCallback((next: AppView) => {
    if (next === 'scanner') {
      setShowScanner(true);
    } else {
      setView(next);
    }
  }, []);

  const handleScanFromDash = useCallback(() => {
    setShowScanner(true);
  }, []);

  const handleManualAdd = useCallback(
    (input: {
      title: string;
      authors: string[];
      publisher?: string;
      isbn?: string;
      isbn13?: string;
      synopsis?: string;
      searchTags?: string[];
      datePublished?: string;
      coverImage?: string;
      copies?: number;
    }) => {
      const added = library.addManualBook(input);
      if (added) {
        setShowManualAdd(false);
        setActiveBook(added);
      }
    },
    [library]
  );

  const handleAddToLibrary = useCallback(async () => {
    if (!activeBook) return;
    const isbn = activeBook.isbn13 || activeBook.isbn;
    const added = await library.addBook(isbn);
    if (added) {
      setActiveBook(added);
    }
  }, [activeBook, library]);

  const handleCheckout = useCallback(
    (borrowerName: string) => {
      if (!activeBook) return;
      library.checkoutBook(activeBook.isbn13 || activeBook.isbn, activeBook.title, borrowerName);
      // Refresh status: re-fetch from updated books/checkouts
      const status = library.getBookStatus(activeBook.isbn13 || activeBook.isbn);
      if (status) setActiveBook(status.book);
      else setActiveBook({ ...activeBook });
    },
    [activeBook, library]
  );

  const handleReturn = useCallback(
    (checkoutId: string) => {
      library.returnBook(checkoutId);
      if (activeBook) {
        const status = library.getBookStatus(activeBook.isbn13 || activeBook.isbn);
        if (status) setActiveBook(status.book);
      }
    },
    [activeBook, library]
  );

  const activeStatus = activeBook ? library.getBookStatus(activeBook.isbn13 || activeBook.isbn) : null;

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-title">📚 Class Library</h1>
      </header>

      {/* Scan error banner */}
      {scanError && (
        <div className="error-banner" role="alert">
          <span>{scanError}</span>
          <button onClick={() => setScanError(null)}>✕</button>
        </div>
      )}

      {/* Main content */}
      <main className="app-main">
        {view === 'dashboard' && (
          <DashboardView
            books={library.books}
            checkouts={library.checkouts}
            onScanClick={handleScanFromDash}
            onLibraryClick={() => setView('library')}
          />
        )}
        {view === 'library' && (
          <LibraryView
            books={library.books}
            checkouts={library.checkouts}
            onBookClick={(book) => setActiveBook(book)}
            onScanClick={handleScanFromDash}
            onManualAddClick={() => setShowManualAdd(true)}
          />
        )}
      </main>

      {/* Bottom navigation */}
      <NavBar currentView={view} onChange={handleNavChange} />

      {/* Scanner overlay */}
      {showScanner && <Scanner onScan={handleScan} onClose={() => setShowScanner(false)} />}

      {/* Book action modal */}
      {activeBook && (
        <BookActionModal
          book={activeBook}
          status={activeStatus}
          loading={library.loading}
          onAddToLibrary={handleAddToLibrary}
          onCheckout={handleCheckout}
          onReturn={handleReturn}
          onClose={() => {
            setActiveBook(null);
            library.setError(null);
          }}
        />
      )}

      {/* Manual add modal */}
      {showManualAdd && <ManualBookModal onSave={handleManualAdd} onClose={() => setShowManualAdd(false)} />}
    </div>
  );
}
