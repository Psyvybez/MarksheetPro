import { useState, useCallback } from 'react';
import { useLibrary, type ManualBookInput } from './hooks/useLibrary';
import { Scanner } from './components/Scanner';
import { BookActionModal } from './components/BookActionModal';
import { LibraryView } from './components/LibraryView';
import { DashboardView } from './components/DashboardView';
import { NavBar } from './components/NavBar';
import { ManualBookModal } from './components/ManualBookModal';
import { SettingsModal } from './components/SettingsModal';
import type { AppView, Book } from './types';

export default function App() {
  const [view, setView] = useState<AppView>('dashboard');
  const [showScanner, setShowScanner] = useState(false);
  const [scannerMode, setScannerMode] = useState<'add' | 'search'>('add');
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualMode, setManualMode] = useState<'add' | 'edit'>('add');
  const [editBookId, setEditBookId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [initialManualData, setInitialManualData] = useState<Partial<ManualBookInput> | null>(null);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

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

      if (scannerMode === 'search') {
        setScanError('Book not found in your library.');
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
      setManualMode('add');
      setEditBookId(null);
      setShowManualAdd(true);
    },
    [library, scannerMode]
  );

  const handleNavChange = useCallback((next: AppView) => {
    if (next === 'scanner') {
      setScannerMode('add');
      setShowScanner(true);
    } else {
      setView(next);
    }
  }, []);

  const handleScanFromDash = useCallback(() => {
    setScannerMode('add');
    setShowScanner(true);
  }, []);

  const handleScanSearchFromLibrary = useCallback(() => {
    setScannerMode('search');
    setShowScanner(true);
  }, []);

  const handleManualAdd = useCallback(
    (input: ManualBookInput) => {
      const added = library.addManualBook(input);
      if (added) {
        setShowManualAdd(false);
        setManualMode('add');
        setEditBookId(null);
        setInitialManualData(null);
        setActiveBook(added);
      }
    },
    [library]
  );

  const handleManualSave = useCallback(
    (input: ManualBookInput) => {
      if (manualMode === 'edit') {
        const updated = library.updateBookDetails({
          ...input,
          originalIsbn: initialManualData?.isbn,
          originalIsbn13: initialManualData?.isbn13,
        });

        if (updated) {
          setShowManualAdd(false);
          setManualMode('add');
          setEditBookId(null);
          setInitialManualData(null);
          setActiveBook(updated);
        }
        return;
      }

      handleManualAdd(input);
    },
    [manualMode, library, initialManualData, handleManualAdd]
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
        <h1 className="app-title">THE BOOK NOOK</h1>
        <button
          className="header-settings-btn"
          onClick={() => setShowSettings(true)}
          aria-label="Open settings"
          title="Settings"
        >
          ⚙️
        </button>
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
            studentCards={library.studentCards}
            onReturnCheckout={handleReturn}
            onBookClick={(book) => setActiveBook(book)}
            onScanClick={handleScanFromDash}
            onScanSearchClick={handleScanSearchFromLibrary}
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
      {showScanner && <Scanner onScan={handleScan} onClose={() => setShowScanner(false)} mode={scannerMode} />}

      {/* Book action modal */}
      {activeBook && (
        <BookActionModal
          book={activeBook}
          status={activeStatus}
          loading={library.loading}
          borrowerSuggestions={borrowerSuggestions}
          onCheckout={handleCheckout}
          onReturn={handleReturn}
          onEdit={() => {
            setInitialManualData({
              title: activeBook.title,
              authors: activeBook.authors,
              publisher: activeBook.publisher,
              category: activeBook.category,
              genre: activeBook.genre,
              age: activeBook.age,
              binding: activeBook.binding,
              conditionCoverBindingIntegrity: activeBook.conditionCoverBindingIntegrity,
              conditionPageQuality: activeBook.conditionPageQuality,
              conditionOverallAppearance: activeBook.conditionOverallAppearance,
              isbn: activeBook.isbn,
              isbn13: activeBook.isbn13,
              synopsis: activeBook.synopsis,
              searchTags: activeBook.searchTags,
              datePublished: activeBook.datePublished,
              coverImage: activeBook.coverImage,
              copies: activeBook.copies,
            });
            setManualMode('edit');
            setEditBookId(activeBook.isbn13 || activeBook.isbn);
            setShowManualAdd(true);
            setActiveBook(null);
          }}
          onDelete={() => {
            const target = activeBook;
            if (!target) return;

            const confirmed = window.confirm(
              `Delete "${target.title}" from the library? This also removes its checkout history.`
            );
            if (!confirmed) return;

            library.removeBook(target.isbn13 || target.isbn);
            setActiveBook(null);
          }}
          onClose={() => {
            setActiveBook(null);
            library.setError(null);
          }}
        />
      )}

      {/* Manual add modal */}
      {showManualAdd && (
        <ManualBookModal
          mode={manualMode}
          originalBookId={editBookId ?? undefined}
          initialData={initialManualData ?? undefined}
          existingBooks={library.books}
          onSave={handleManualSave}
          onClose={() => {
            setShowManualAdd(false);
            setManualMode('add');
            setEditBookId(null);
            setInitialManualData(null);
          }}
        />
      )}

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          summary={{
            totalTitles: library.books.length,
            totalCopies: library.books.reduce((sum, book) => sum + book.copies, 0),
            activeLoans: library.checkouts.filter((checkout) => !checkout.returnedAt).length,
            studentCards: library.studentCards.length,
          }}
          onDataImported={() => {
            library.syncFromStorage();
            setActiveBook(null);
          }}
          onLoadDemoData={() => {
            library.seedDemoDataset();
            setActiveBook(null);
          }}
          onClearAllData={() => {
            library.clearAllData();
            setActiveBook(null);
          }}
          onClearCheckoutsOnly={() => {
            library.clearCheckoutsOnly();
            setActiveBook(null);
          }}
          onClose={() => {
            setShowSettings(false);
          }}
        />
      )}
    </div>
  );
}
