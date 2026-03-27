import { useState, useCallback } from 'react';
import type { Book, CheckoutRecord } from '../types';
import { getBooks, saveBooks, getCheckouts, saveCheckouts } from '../services/storage';
import { fetchBookByIsbn } from '../services/isbndb';

export interface BookStatus {
  book: Book;
  activeCheckouts: CheckoutRecord[];
  availableCopies: number;
  isAvailable: boolean;
}

export function useLibrary(apiKey: string) {
  const [books, setBooks] = useState<Book[]>(getBooks);
  const [checkouts, setCheckouts] = useState<CheckoutRecord[]>(getCheckouts);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Look up a book by ISBN (local first, then ISBNdb). Does NOT add it to the library. */
  const lookupBook = useCallback(
    async (isbn: string): Promise<Book | null> => {
      const norm = isbn.trim();
      const existing = books.find((b) => b.isbn === norm || b.isbn13 === norm);
      if (existing) return existing;

      setLoading(true);
      setError(null);
      try {
        const raw = await fetchBookByIsbn(norm, apiKey);
        return {
          isbn: raw.isbn ?? norm,
          isbn13: raw.isbn13 ?? norm,
          title: raw.title,
          authors: raw.authors ?? [],
          publisher: raw.publisher ?? 'Unknown',
          coverImage: raw.image ?? '',
          synopsis: raw.synopsis ?? '',
          subjects: raw.subjects ?? [],
          datePublished: raw.date_published ?? '',
          addedAt: '',
          copies: 0,
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch book');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [books, apiKey]
  );

  /** Add a book to the library (increments copies if ISBN already exists). */
  const addBook = useCallback(
    async (isbn: string): Promise<Book | null> => {
      setLoading(true);
      setError(null);
      try {
        const raw = await fetchBookByIsbn(isbn.trim(), apiKey);
        const newBook: Book = {
          isbn: raw.isbn ?? isbn,
          isbn13: raw.isbn13 ?? isbn,
          title: raw.title,
          authors: raw.authors ?? [],
          publisher: raw.publisher ?? 'Unknown',
          coverImage: raw.image ?? '',
          synopsis: raw.synopsis ?? '',
          subjects: raw.subjects ?? [],
          datePublished: raw.date_published ?? '',
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
        setError(err instanceof Error ? err.message : 'Failed to add book');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [apiKey]
  );

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
    removeBook,
    checkoutBook,
    returnBook,
    getBookStatus,
  };
}
