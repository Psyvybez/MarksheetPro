import { useState, useCallback } from 'react';
import { useLibrary, type ManualBookInput } from './hooks/useLibrary';
import { Scanner } from './components/Scanner';
import { BookActionModal } from './components/BookActionModal';
import { LibraryView } from './components/LibraryView';
import { DashboardView } from './components/DashboardView';
import { NavBar } from './components/NavBar';
import { ManualBookModal } from './components/ManualBookModal';
import { SettingsModal } from './components/SettingsModal';
import { getStoredApiKey } from './services/storage';
import type { AppView, Book } from './types';

export default function App() {
  const [view, setView] = useState<AppView>('dashboard');
  const [showScanner, setShowScanner] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [initialManualData, setInitialManualData] = useState<Partial<ManualBookInput> | null>(null);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(() => Boolean(getStoredApiKey().trim()));
  const [dismissedApiBanner, setDismissedApiBanner] = useState(false);

  const library = useLibrary();

  // After a successful scan: look up the book and open the appropriate modal
  const handleScan = useCallback(
    async (isbn: string) => {
      setShowScanner(false);
      setScanError(null);

      // Check if already in library
      const normalized = isbn.replace(/[^0-9X]/gi, '').toUpperCase();
      const existing = library.books.find(
        (b) =>
          b.isbn.replace(/[^0-9X]/gi, '').toUpperCase() === normalized ||
          b.isbn13.replace(/[^0-9X]/gi, '').toUpperCase() === normalized
      );

      if (existing) {
        setActiveBook(existing);
        return;
      }

      // Not found locally. Fetch metadata.
      const metadata = await library.fetchBookMetadata(isbn);
      if (metadata) {
        setInitialManualData({ ...metadata, copies: 1 });
      } else {
        setInitialManualData({
          isbn: isbn.length === 10 ? isbn : '',
          isbn13: isbn.length === 13 || isbn.length > 10 ? isbn : '',
          copies: 1,
        });
        setScanError('Could not find book online. Please enter details manually.');
      }
      setShowManualAdd(true);
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
    (input: ManualBookInput) => {
      const added = library.addManualBook(input);
      if (added) {
        setShowManualAdd(false);
        setInitialManualData(null);
        setActiveBook(added);
      }
    },
    [library]
  );

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
  const borrowerSuggestions = [
    ...new Set([
      ...library.checkouts.map((c) => c.borrowerName.trim()).filter(Boolean),
      ...library.studentCards.map((card) => card.studentName.trim()).filter(Boolean),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <h1 className="app-title">📚 Class Library</h1>
        <button
          className="header-settings-btn"
          onClick={() => setShowSettings(true)}
          aria-label="Open settings"
          title="Settings"
        >
          ⚙️
        </button>
      </header>

      {/* API key reminder */}
      {!hasApiKey && !dismissedApiBanner && (
        <div className="api-key-banner" role="status" aria-live="polite">
          <span>Add a Google Books API key for higher metadata lookup limits.</span>
          <div>
            <button
              onClick={() => {
                setShowSettings(true);
              }}
            >
              Add Key
            </button>
            <button onClick={() => setDismissedApiBanner(true)} style={{ marginLeft: '0.75rem' }}>
              Dismiss
            </button>
          </div>
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
            studentCards={library.studentCards}
            onReturnCheckout={handleReturn}
            onBookClick={(book) => setActiveBook(book)}
            onScanClick={handleScanFromDash}
            onManualAddClick={() => {
              setInitialManualData(null);
              setShowManualAdd(true);
            }}
            onAddStudentCard={library.addStudentCard}
            onUpdateStudentCard={library.updateStudentCard}
            onDeleteStudentCard={library.removeStudentCard}
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
          borrowerSuggestions={borrowerSuggestions}
          onCheckout={handleCheckout}
          onReturn={handleReturn}
          onClose={() => {
            setActiveBook(null);
            library.setError(null);
          }}
        />
      )}

      {/* Manual add modal */}
      {showManualAdd && (
        <ManualBookModal
          initialData={initialManualData ?? undefined}
          existingBooks={library.books}
          onSave={handleManualAdd}
          onClose={() => {
            setShowManualAdd(false);
            setInitialManualData(null);
          }}
        />
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          onDataImported={() => {
            library.syncFromStorage();
            setActiveBook(null);
          }}
          onLoadDemoData={() => {
            library.seedDemoDataset();
            setActiveBook(null);
          }}
          onClose={() => {
            setShowSettings(false);
            const keyExists = Boolean(getStoredApiKey().trim());
            setHasApiKey(keyExists);
            if (keyExists) setDismissedApiBanner(false);
          }}
        />
      )}
    </div>
  );
}
