import { useState, useCallback } from 'react';
import type { Book, CheckoutRecord } from '../types';
import { getBooks, saveBooks, getCheckouts, saveCheckouts } from '../services/storage';
import { lookupCatalogBook } from '../services/catalog';

export interface BookStatus {
  book: Book;
  activeCheckouts: CheckoutRecord[];
  availableCopies: number;
  isAvailable: boolean;
}

export interface ManualBookInput {
  title: string;
  authors: string[];
  publisher?: string;
  category?: string;
  genre?: string;
  age?: string;
  binding?: string;
  conditionCoverBindingIntegrity?: string;
  conditionPageQuality?: string;
  conditionOverallAppearance?: string;
  isbn?: string;
  isbn13?: string;
  synopsis?: string;
  searchTags?: string[];
  datePublished?: string;
  coverImage?: string;
  copies?: number;
}

function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9X]/gi, '').toUpperCase();
}

export function useLibrary() {
  const [books, setBooks] = useState<Book[]>(getBooks);
  const [checkouts, setCheckouts] = useState<CheckoutRecord[]>(getCheckouts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Look up a book by ISBN (local library first, then built-in catalog). */
  const lookupBook = useCallback(
    async (isbn: string): Promise<Book | null> => {
      const normalizedInput = normalizeIsbn(isbn);
      const existing = books.find(
        (b) => normalizeIsbn(b.isbn) === normalizedInput || normalizeIsbn(b.isbn13) === normalizedInput
      );
      if (existing) return existing;

      setLoading(true);
      setError(null);
      try {
        const raw = lookupCatalogBook(normalizedInput);
        if (!raw) {
          setError('Book not found in local catalog. Add it to src/services/catalog.ts to enable this ISBN.');
          return null;
        }

        return {
          isbn: raw.isbn || normalizedInput,
          isbn13: raw.isbn13 || normalizedInput,
          title: raw.title,
          authors: raw.authors ?? [],
          publisher: raw.publisher ?? 'Unknown',
          category: raw.category ?? '',
          genre: raw.genre ?? '',
          age: raw.age ?? '',
          binding: raw.binding ?? '',
          conditionCoverBindingIntegrity: raw.conditionCoverBindingIntegrity ?? '',
          conditionPageQuality: raw.conditionPageQuality ?? '',
          conditionOverallAppearance: raw.conditionOverallAppearance ?? '',
          coverImage: raw.coverImage ?? '',
          synopsis: raw.synopsis ?? '',
          searchTags: raw.searchTags ?? [],
          datePublished: raw.datePublished ?? '',
          addedAt: '',
          copies: 0,
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to look up book in local catalog');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [books]
  );

  /** Add a book to the library (increments copies if ISBN already exists). */
  const addBook = useCallback(
    async (isbn: string): Promise<Book | null> => {
      setLoading(true);
      setError(null);
      try {
        const normalizedInput = normalizeIsbn(isbn);
        const raw = lookupCatalogBook(normalizedInput);
        if (!raw) {
          setError('Book not found in local catalog. Add it to src/services/catalog.ts to enable this ISBN.');
          return null;
        }

        const newBook: Book = {
          isbn: raw.isbn || normalizedInput,
          isbn13: raw.isbn13 || normalizedInput,
          title: raw.title,
          authors: raw.authors ?? [],
          publisher: raw.publisher ?? 'Unknown',
          category: raw.category ?? '',
          genre: raw.genre ?? '',
          age: raw.age ?? '',
          binding: raw.binding ?? '',
          conditionCoverBindingIntegrity: raw.conditionCoverBindingIntegrity ?? '',
          conditionPageQuality: raw.conditionPageQuality ?? '',
          conditionOverallAppearance: raw.conditionOverallAppearance ?? '',
          coverImage: raw.coverImage ?? '',
          synopsis: raw.synopsis ?? '',
          searchTags: raw.searchTags ?? [],
          datePublished: raw.datePublished ?? '',
          addedAt: new Date().toISOString(),
          copies: 1,
        };

        let result = newBook;
        setBooks((prev) => {
          const match = prev.find((b) => b.isbn13 === newBook.isbn13 || b.isbn === newBook.isbn);
          if (match) {
            result = { ...match, copies: match.copies + 1 };
            const updated = prev.map((b) => (b.isbn === match.isbn ? result : b));
            saveBooks(updated);
            return updated;
          }
          const updated = [...prev, newBook];
          saveBooks(updated);
          return updated;
        });

        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to add book from local catalog');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /** Add a custom/manual book directly from form input. */
  const addManualBook = useCallback((input: ManualBookInput): Book | null => {
    const title = input.title.trim();
    if (!title) {
      setError('Book title is required.');
      return null;
    }

    const isbn10 = normalizeIsbn(input.isbn ?? '');
    const isbn13 = normalizeIsbn(input.isbn13 ?? '');
    const canonicalId = isbn13 || isbn10 || `MANUAL-${Date.now()}`;
    const copies = Math.max(1, Math.floor(input.copies ?? 1));

    const newBook: Book = {
      isbn: isbn10 || canonicalId,
      isbn13: isbn13 || canonicalId,
      title,
      authors: input.authors.filter(Boolean),
      publisher: input.publisher?.trim() || 'Unknown',
      category: input.category?.trim() || '',
      genre: input.genre?.trim() || '',
      age: input.age?.trim() || '',
      binding: input.binding?.trim() || '',
      conditionCoverBindingIntegrity: input.conditionCoverBindingIntegrity?.trim() || '',
      conditionPageQuality: input.conditionPageQuality?.trim() || '',
      conditionOverallAppearance: input.conditionOverallAppearance?.trim() || '',
      coverImage: input.coverImage?.trim() || '',
      synopsis: input.synopsis?.trim() || '',
      searchTags: (input.searchTags ?? []).filter(Boolean),
      datePublished: input.datePublished?.trim() || '',
      addedAt: new Date().toISOString(),
      copies,
    };

    let result = newBook;
    setBooks((prev) => {
      const match = prev.find(
        (b) =>
          normalizeIsbn(b.isbn13) === normalizeIsbn(newBook.isbn13) ||
          normalizeIsbn(b.isbn) === normalizeIsbn(newBook.isbn)
      );

      if (match) {
        result = { ...match, copies: match.copies + copies };
        const updated = prev.map((b) => (b.isbn === match.isbn ? result : b));
        saveBooks(updated);
        return updated;
      }

      const updated = [...prev, newBook];
      saveBooks(updated);
      return updated;
    });

    setError(null);
    return result;
  }, []);

  /** Remove a book entirely from the library (and all its checkouts). */
  const removeBook = useCallback((isbn: string) => {
    setBooks((prev) => {
      const updated = prev.filter((b) => b.isbn !== isbn && b.isbn13 !== isbn);
      saveBooks(updated);
      return updated;
    });
    setCheckouts((prev) => {
      const updated = prev.filter((c) => c.isbn !== isbn);
      saveCheckouts(updated);
      return updated;
    });
  }, []);

  /** Check out a copy of a book to a borrower. Returns the new record. */
  const checkoutBook = useCallback((isbn: string, bookTitle: string, borrowerName: string): CheckoutRecord => {
    const due = new Date();
    due.setDate(due.getDate() + 14); // 2-week loan period

    const record: CheckoutRecord = {
      id: crypto.randomUUID(),
      isbn,
      bookTitle,
      borrowerName: borrowerName.trim(),
      checkedOutAt: new Date().toISOString(),
      dueDate: due.toISOString(),
    };

    setCheckouts((prev) => {
      const updated = [...prev, record];
      saveCheckouts(updated);
      return updated;
    });

    return record;
  }, []);

  /** Return a checked-out book by checkout record ID. */
  const returnBook = useCallback((checkoutId: string) => {
    setCheckouts((prev) => {
      const updated = prev.map((c) => (c.id === checkoutId ? { ...c, returnedAt: new Date().toISOString() } : c));
      saveCheckouts(updated);
      return updated;
    });
  }, []);

  /** Get availability info for a given ISBN. Returns null if not in library. */
  const getBookStatus = useCallback(
    (isbn: string): BookStatus | null => {
      const book = books.find((b) => b.isbn === isbn || b.isbn13 === isbn);
      if (!book) return null;

      const activeCheckouts = checkouts.filter(
        (c) => (c.isbn === book.isbn || c.isbn === book.isbn13) && !c.returnedAt
      );

      return {
        book,
        activeCheckouts,
        availableCopies: Math.max(0, book.copies - activeCheckouts.length),
        isAvailable: activeCheckouts.length < book.copies,
      };
    },
    [books, checkouts]
  );

  return {
    books,
    checkouts,
    loading,
    error,
    setError,
    lookupBook,
    addBook,
    addManualBook,
    removeBook,
    checkoutBook,
    returnBook,
    getBookStatus,
  };
}
