import { useState, useCallback } from 'react';
import type { Book, CheckoutRecord, StudentCard } from '../types';
import {
  getBooks,
  saveBooks,
  getCheckouts,
  saveCheckouts,
  getStoredApiKey,
  getStudentCards,
  saveStudentCards,
} from '../services/storage';
import { lookupCatalogBook } from '../services/catalog';
import { fetchGoogleBooksMetadata } from '../services/api';
import { fetchBookByIsbn } from '../services/isbndb';

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

function isSameIsbn(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return normalizeIsbn(a) === normalizeIsbn(b);
}

function normalizePublishedDate(value?: string): string {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year) return '';
  const safeMonth = month ? month.padStart(2, '0') : '01';
  const safeDay = day ? day.padStart(2, '0') : '01';
  return `${year}-${safeMonth}-${safeDay}`;
}

function catalogToBook(isbn: string, copies: number): Book | null {
  const catalogBook = lookupCatalogBook(isbn);
  if (!catalogBook) return null;
  return {
    isbn: normalizeIsbn(catalogBook.isbn),
    isbn13: normalizeIsbn(catalogBook.isbn13),
    title: catalogBook.title,
    authors: catalogBook.authors,
    publisher: catalogBook.publisher,
    category: catalogBook.category ?? '',
    genre: catalogBook.genre ?? '',
    age: catalogBook.age ?? '',
    binding: catalogBook.binding ?? '',
    conditionCoverBindingIntegrity: catalogBook.conditionCoverBindingIntegrity ?? '',
    conditionPageQuality: catalogBook.conditionPageQuality ?? '',
    conditionOverallAppearance: catalogBook.conditionOverallAppearance ?? '',
    coverImage: catalogBook.coverImage,
    synopsis: catalogBook.synopsis,
    searchTags: catalogBook.searchTags,
    datePublished: catalogBook.datePublished,
    addedAt: new Date().toISOString(),
    copies: Math.max(1, Math.floor(copies)),
  };
}

function generateStudentCardNumber(existingCards: StudentCard[]): string {
  const maxNumber = existingCards.reduce((maxValue, card) => {
    const match = card.cardNumber.match(/(\d+)$/);
    if (!match) return maxValue;
    const parsed = parseInt(match[1], 10);
    if (!Number.isFinite(parsed)) return maxValue;
    return Math.max(maxValue, parsed);
  }, 0);

  return `LIB-${String(maxNumber + 1).padStart(5, '0')}`;
}

export function useLibrary() {
  const [books, setBooks] = useState<Book[]>(getBooks);
  const [checkouts, setCheckouts] = useState<CheckoutRecord[]>(getCheckouts);
  const [studentCards, setStudentCards] = useState<StudentCard[]>(getStudentCards);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveStudentCardsState = useCallback((cards: StudentCard[]) => {
    setStudentCards(cards);
    saveStudentCards(cards);
  }, []);

  /** Look up a book online or in the local catalog. Useful for auto-filling the add manual form. */
  const fetchBookMetadata = useCallback(async (isbn: string): Promise<Partial<ManualBookInput> | null> => {
    setLoading(true);
    setError(null);
    try {
      const normalizedInput = normalizeIsbn(isbn);

      // 1. Try local built-in catalog first
      const raw = lookupCatalogBook(normalizedInput);
      if (raw) {
        return raw; // CatalogBook shape is compatible with Partial<ManualBookInput>
      }

      // 2. If user configured ISBNdb, try that before public fallback sources.
      const apiKey = getStoredApiKey().trim();
      if (apiKey) {
        try {
          const isbndbBook = await fetchBookByIsbn(normalizedInput, apiKey);
          if (isbndbBook) {
            return {
              title: isbndbBook.title || '',
              authors: isbndbBook.authors || [],
              publisher: isbndbBook.publisher || '',
              synopsis: isbndbBook.synopsis || '',
              coverImage: isbndbBook.image?.replace('http:', 'https:') || '',
              isbn:
                normalizeIsbn(isbndbBook.isbn || '') || (normalizedInput.length === 10 ? normalizedInput : undefined),
              isbn13:
                normalizeIsbn(isbndbBook.isbn13 || '') || (normalizedInput.length >= 13 ? normalizedInput : undefined),
              searchTags: isbndbBook.subjects || [],
              datePublished: normalizePublishedDate(isbndbBook.date_published),
            };
          }
        } catch (err) {
          console.warn('ISBNdb lookup failed, falling back to Google Books.', err);
        }
      }

      // 3. Fallback to searching Google Books online
      const internetData = await fetchGoogleBooksMetadata(normalizedInput);
      if (internetData) {
        return internetData;
      }

      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to look up book metadata');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

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
    const normalizedTarget = normalizeIsbn(isbn);
    setBooks((prev) => {
      const updated = prev.filter(
        (b) => normalizeIsbn(b.isbn) !== normalizedTarget && normalizeIsbn(b.isbn13) !== normalizedTarget
      );
      saveBooks(updated);
      return updated;
    });
    setCheckouts((prev) => {
      const updated = prev.filter((c) => normalizeIsbn(c.isbn) !== normalizedTarget);
      saveCheckouts(updated);
      return updated;
    });
  }, []);

  /** Check out a copy of a book to a borrower. Returns the new record. */
  const checkoutBook = useCallback((isbn: string, bookTitle: string, borrowerName: string): CheckoutRecord => {
    const normalizedIsbn = normalizeIsbn(isbn);
    const due = new Date();
    due.setDate(due.getDate() + 14); // 2-week loan period

    const record: CheckoutRecord = {
      id: crypto.randomUUID(),
      isbn: normalizedIsbn,
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
      const book = books.find((b) => isSameIsbn(b.isbn, isbn) || isSameIsbn(b.isbn13, isbn));
      if (!book) return null;

      const activeCheckouts = checkouts.filter(
        (c) => (isSameIsbn(c.isbn, book.isbn) || isSameIsbn(c.isbn, book.isbn13)) && !c.returnedAt
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

  /** Reload in-memory state from localStorage (useful after backup import). */
  const syncFromStorage = useCallback(() => {
    setBooks(getBooks());
    setCheckouts(getCheckouts());
    setStudentCards(getStudentCards());
  }, []);

  const addStudentCard = useCallback(
    (input: Omit<StudentCard, 'id' | 'cardNumber' | 'createdAt' | 'updatedAt'>): StudentCard => {
      const now = new Date().toISOString();
      const card: StudentCard = {
        id: crypto.randomUUID(),
        studentName: input.studentName.trim(),
        cardNumber: generateStudentCardNumber(studentCards),
        notes: input.notes?.trim() || '',
        isActive: input.isActive,
        createdAt: now,
        updatedAt: now,
      };

      saveStudentCardsState([...studentCards, card]);
      return card;
    },
    [studentCards, saveStudentCardsState]
  );

  const updateStudentCard = useCallback(
    (cardId: string, updates: Partial<Omit<StudentCard, 'id' | 'createdAt'>>): StudentCard | null => {
      const existing = studentCards.find((card) => card.id === cardId);
      if (!existing) return null;

      const updated: StudentCard = {
        ...existing,
        ...updates,
        studentName: (updates.studentName ?? existing.studentName).trim(),
        cardNumber: existing.cardNumber,
        notes: (updates.notes ?? existing.notes ?? '').trim(),
        updatedAt: new Date().toISOString(),
      };

      saveStudentCardsState(studentCards.map((card) => (card.id === cardId ? updated : card)));
      return updated;
    },
    [studentCards, saveStudentCardsState]
  );

  const removeStudentCard = useCallback(
    (cardId: string) => {
      saveStudentCardsState(studentCards.filter((card) => card.id !== cardId));
    },
    [studentCards, saveStudentCardsState]
  );

  /** Seed realistic demo data for testing dashboards, checkouts, and overdue workflows. */
  const seedDemoDataset = useCallback(() => {
    const demoBooks = [
      catalogToBook('9780439708180', 3),
      catalogToBook('9780142407332', 2),
      catalogToBook('9780061120084', 2),
      catalogToBook('9780743273565', 1),
      catalogToBook('9780812550702', 2),
      catalogToBook('9780060256654', 1),
    ].filter((book): book is Book => Boolean(book));

    const now = new Date();
    const daysFromNow = (days: number): string => {
      const date = new Date(now);
      date.setDate(date.getDate() + days);
      return date.toISOString();
    };

    const findDemoBook = (isbn13: string) => demoBooks.find((book) => book.isbn13 === isbn13);

    const demoCheckouts: CheckoutRecord[] = [
      {
        id: crypto.randomUUID(),
        isbn: '9780439708180',
        bookTitle: findDemoBook('9780439708180')?.title ?? "Harry Potter and the Sorcerer's Stone",
        borrowerName: 'Ava Johnson',
        checkedOutAt: daysFromNow(-18),
        dueDate: daysFromNow(-4),
      },
      {
        id: crypto.randomUUID(),
        isbn: '9780142407332',
        bookTitle: findDemoBook('9780142407332')?.title ?? 'The Lightning Thief',
        borrowerName: 'Liam Patel',
        checkedOutAt: daysFromNow(-10),
        dueDate: daysFromNow(4),
      },
      {
        id: crypto.randomUUID(),
        isbn: '9780061120084',
        bookTitle: findDemoBook('9780061120084')?.title ?? 'To Kill a Mockingbird',
        borrowerName: 'Noah Kim',
        checkedOutAt: daysFromNow(-15),
        dueDate: daysFromNow(-1),
      },
      {
        id: crypto.randomUUID(),
        isbn: '9780743273565',
        bookTitle: findDemoBook('9780743273565')?.title ?? 'The Great Gatsby',
        borrowerName: 'Sofia Martinez',
        checkedOutAt: daysFromNow(-3),
        dueDate: daysFromNow(11),
      },
      {
        id: crypto.randomUUID(),
        isbn: '9780812550702',
        bookTitle: findDemoBook('9780812550702')?.title ?? "Ender's Game",
        borrowerName: 'Ethan Brooks',
        checkedOutAt: daysFromNow(-20),
        dueDate: daysFromNow(-6),
        returnedAt: daysFromNow(-2),
      },
    ];

    saveBooks(demoBooks);
    saveCheckouts(demoCheckouts);
    setBooks(demoBooks);
    setCheckouts(demoCheckouts);
    setError(null);
  }, []);

  return {
    books,
    checkouts,
    studentCards,
    loading,
    error,
    setError,
    fetchBookMetadata,
    addManualBook,
    removeBook,
    checkoutBook,
    returnBook,
    getBookStatus,
    syncFromStorage,
    addStudentCard,
    updateStudentCard,
    removeStudentCard,
    seedDemoDataset,
  };
}
