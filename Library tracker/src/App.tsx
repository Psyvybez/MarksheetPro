import { useState, useCallback } from 'react';
import { useLibrary } from './hooks/useLibrary';
import { getStoredApiKey } from './services/storage';
import { Scanner } from './components/Scanner';
import { BookActionModal } from './components/BookActionModal';
import { LibraryView } from './components/LibraryView';
import { DashboardView } from './components/DashboardView';
import { NavBar } from './components/NavBar';
import { SettingsModal } from './components/SettingsModal';
import type { AppView, Book } from './types';

export default function App() {
  const [apiKey, setApiKeyState] = useState(getStoredApiKey);
  const [view, setView] = useState<AppView>('dashboard');
  const [showSettings, setShowSettings] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const library = useLibrary(apiKey);

  // After a successful scan: look up the book and show the action modal
  const handleScan = useCallback(
    async (isbn: string) => {
      setShowScanner(false);
      setScanError(null);

      if (!apiKey) {
        setShowSettings(true);
        return;
      }

      const book = await library.lookupBook(isbn);
      if (book) {
        setActiveBook(book);
      } else {
        setScanError(library.error ?? 'Could not look up that barcode.');
      }
    },
    [apiKey, library],
  );

  const handleNavChange = useCallback((next: AppView) => {
    if (next === 'scanner') {
      setShowScanner(true);
    } else {
      setView(next);
    }
  }, []);

  const handleScanFromDash = useCallback(() => {
    if (!apiKey) {
      setShowSettings(true);
      return;
    }
    setShowScanner(true);
  }, [apiKey]);

  const handleSettingsClose = useCallback(() => {
    setApiKeyState(getStoredApiKey());
    setShowSettings(false);
  }, []);

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
    [activeBook, library],
  );

  const handleReturn = useCallback(
    (checkoutId: string) => {
      library.returnBook(checkoutId);
      if (activeBook) {
        const status = library.getBookStatus(activeBook.isbn13 || activeBook.isbn);
        if (status) setActiveBook(status.book);
      }
    },
    [activeBook, library],
  );

  const activeStatus = activeBook
    ? library.getBookStatus(activeBook.isbn13 || activeBook.isbn)
    : null;

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-title">📚 Class Library</h1>
        <button
          className="header-settings-btn"
          onClick={() => setShowSettings(true)}
          aria-label="Settings"
          title="Settings"
        >
          ⚙️
        </button>
      </header>

      {/* API key warning banner */}
      {!apiKey && (
        <div className="api-key-banner" role="alert">
          <span>⚠️ ISBNdb API key not set.</span>
          <button onClick={() => setShowSettings(true)}>Add Key</button>
        </div>
      )}

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
          />
        )}
      </main>

      {/* Bottom navigation */}
      <NavBar currentView={view} onChange={handleNavChange} />

      {/* Scanner overlay */}
      {showScanner && (
        <Scanner onScan={handleScan} onClose={() => setShowScanner(false)} />
      )}

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

      {/* Settings modal */}
      {showSettings && <SettingsModal onClose={handleSettingsClose} />}
    </div>
  );
}
