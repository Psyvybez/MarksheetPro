import { useState, useCallback, useEffect, useRef } from 'react';
import type { Book, CheckoutRecord, HoldRequest, ReservationActivity, StudentCard } from '../types';
import {
  getBooks,
  saveBooks,
  getCheckouts,
  saveCheckouts,
  getStoredApiKey,
  getStudentCards,
  getReservationActivity,
  saveStudentCards,
  saveReservationActivity,
} from '../services/storage';
import { loadCloudLibraryState, saveCloudLibraryState } from '../services/cloudStorage';
import { lookupCatalogBook } from '../services/catalog';
import { fetchGoogleBooksMetadata } from '../services/api';
import { sendBookAvailableNotice } from '../services/notifications';

const MAX_STUDENT_RESERVATIONS = 2;
const MAX_STUDENT_CHECKOUTS = 1;

export interface BookStatus {
  book: Book;
  activeCheckouts: CheckoutRecord[];
  availableCopies: number;
  isAvailable: boolean;
  holdQueue: HoldRequest[];
  nextHold: HoldRequest | null;
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

export interface BookUpdateInput extends ManualBookInput {
  originalIsbn?: string;
  originalIsbn13?: string;
}

function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9X]/gi, '').toUpperCase();
}

function isSameIsbn(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  return normalizeIsbn(a) === normalizeIsbn(b);
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
    holds: [],
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

function countActiveCheckoutsByBorrower(checkouts: CheckoutRecord[], borrowerName: string): number {
  const normalizedBorrower = borrowerName.trim().toLowerCase();
  if (!normalizedBorrower) return 0;

  return checkouts.filter((checkout) => {
    if (checkout.returnedAt) return false;
    return checkout.borrowerName.trim().toLowerCase() === normalizedBorrower;
  }).length;
}

export function useLibrary() {
  const [books, setBooks] = useState<Book[]>(getBooks);
  const [checkouts, setCheckouts] = useState<CheckoutRecord[]>(getCheckouts);
  const [studentCards, setStudentCards] = useState<StudentCard[]>(getStudentCards);
  const [reservationActivities, setReservationActivities] = useState<ReservationActivity[]>(getReservationActivity);
  const [cloudHydrated, setCloudHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stateSnapshotRef = useRef({ books, checkouts, studentCards, reservationActivities });

  useEffect(() => {
    let cancelled = false;

    const hydrateFromCloud = async () => {
      const cloud = await loadCloudLibraryState();
      if (cancelled) return;

      if (cloud) {
        setBooks(cloud.books);
        setCheckouts(cloud.checkouts);
        setStudentCards(cloud.studentCards);
        setReservationActivities(cloud.reservationActivity);
        saveBooks(cloud.books);
        saveCheckouts(cloud.checkouts);
        saveStudentCards(cloud.studentCards);
        saveReservationActivity(cloud.reservationActivity);
      }

      setCloudHydrated(true);
    };

    hydrateFromCloud();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    saveBooks(books);
    saveCheckouts(checkouts);
    saveStudentCards(studentCards);
    saveReservationActivity(reservationActivities);

    if (!cloudHydrated) return;

    // Debounce cloud writes while users are typing/editing forms.
    const timer = window.setTimeout(() => {
      saveCloudLibraryState({ books, checkouts, studentCards, reservationActivity: reservationActivities }).catch(
        (syncError) => {
          console.warn('Cloud sync failed:', syncError);
        }
      );
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [books, checkouts, studentCards, reservationActivities, cloudHydrated]);

  useEffect(() => {
    stateSnapshotRef.current = { books, checkouts, studentCards, reservationActivities };
  }, [books, checkouts, studentCards, reservationActivities]);

  useEffect(() => {
    if (!cloudHydrated) return;

    let cancelled = false;

    const syncFromCloudIfChanged = async () => {
      const cloud = await loadCloudLibraryState();
      if (cancelled || !cloud) return;

      const local = stateSnapshotRef.current;
      const localSnapshot = JSON.stringify({
        books: local.books,
        checkouts: local.checkouts,
        studentCards: local.studentCards,
        reservationActivity: local.reservationActivities,
      });

      const cloudSnapshot = JSON.stringify({
        books: cloud.books,
        checkouts: cloud.checkouts,
        studentCards: cloud.studentCards,
        reservationActivity: cloud.reservationActivity,
      });

      if (localSnapshot === cloudSnapshot) return;

      setBooks(cloud.books);
      setCheckouts(cloud.checkouts);
      setStudentCards(cloud.studentCards);
      setReservationActivities(cloud.reservationActivity);
      saveBooks(cloud.books);
      saveCheckouts(cloud.checkouts);
      saveStudentCards(cloud.studentCards);
      saveReservationActivity(cloud.reservationActivity);
    };

    const timer = window.setInterval(() => {
      void syncFromCloudIfChanged();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [cloudHydrated]);

  const appendReservationActivity = useCallback(
    (input: Omit<ReservationActivity, 'id' | 'at'> & { at?: string }): ReservationActivity => {
      const activity: ReservationActivity = {
        id: crypto.randomUUID(),
        at: input.at ?? new Date().toISOString(),
        ...input,
      };

      setReservationActivities((prev) => {
        const updated = [activity, ...prev].slice(0, 600);
        saveReservationActivity(updated);
        return updated;
      });

      return activity;
    },
    []
  );

  const authenticateStudentCard = useCallback(
    (cardNumber: string, studentName?: string): StudentCard | null => {
      const normalizedCard = cardNumber.trim().toLowerCase();
      if (!normalizedCard) {
        setError('Library card number is required.');
        return null;
      }

      const card = studentCards.find((entry) => entry.cardNumber.trim().toLowerCase() === normalizedCard);
      if (!card) {
        setError('Card not found. Please check your library card number.');
        return null;
      }

      if (!card.isActive) {
        setError('This library card is inactive. Please contact staff.');
        return null;
      }

      if (studentName?.trim()) {
        const normalizedName = studentName.trim().toLowerCase();
        if (card.studentName.trim().toLowerCase() !== normalizedName) {
          setError('Student name does not match the assigned library card.');
          return null;
        }
      }

      appendReservationActivity({
        type: 'sign-in',
        studentCardId: card.id,
        studentCardNumber: card.cardNumber,
        studentName: card.studentName,
      });
      setError(null);
      return card;
    },
    [studentCards, appendReservationActivity]
  );

  const trackBookViewByStudent = useCallback(
    (book: Book, studentCard: StudentCard) => {
      appendReservationActivity({
        type: 'view',
        studentCardId: studentCard.id,
        studentCardNumber: studentCard.cardNumber,
        studentName: studentCard.studentName,
        bookIsbn: book.isbn13 || book.isbn,
        bookTitle: book.title,
      });
    },
    [appendReservationActivity]
  );

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

      // 2. Search Google Books online (supports optional API key for higher quota)
      const apiKey = getStoredApiKey().trim();
      const internetData = await fetchGoogleBooksMetadata(normalizedInput, apiKey || undefined);
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
      holds: [],
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

  /** Update an existing book and keep related checkout records in sync. */
  const updateBookDetails = useCallback(
    (input: BookUpdateInput): Book | null => {
      const title = input.title.trim();
      if (!title) {
        setError('Book title is required.');
        return null;
      }

      const original10 = normalizeIsbn(input.originalIsbn ?? '');
      const original13 = normalizeIsbn(input.originalIsbn13 ?? '');

      const next10 = normalizeIsbn(input.isbn ?? '');
      const next13 = normalizeIsbn(input.isbn13 ?? '');
      const canonicalId = next13 || next10 || original13 || original10;

      if (!canonicalId) {
        setError('A valid ISBN is required to update this book.');
        return null;
      }

      const copies = Math.max(1, Math.floor(input.copies ?? 1));
      const index = books.findIndex(
        (book) =>
          (original10 && (normalizeIsbn(book.isbn) === original10 || normalizeIsbn(book.isbn13) === original10)) ||
          (original13 && (normalizeIsbn(book.isbn) === original13 || normalizeIsbn(book.isbn13) === original13))
      );

      if (index < 0) {
        setError('Could not find the selected book to update.');
        return null;
      }

      const existing = books[index];
      const updatedBook: Book = {
        ...existing,
        isbn: next10 || existing.isbn,
        isbn13: next13 || existing.isbn13,
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
        copies,
      };

      const nextBooks = [...books];
      nextBooks[index] = updatedBook;
      setBooks(nextBooks);
      saveBooks(nextBooks);

      const nextCheckoutIsbn = normalizeIsbn(updatedBook.isbn13 || updatedBook.isbn || canonicalId);
      setCheckouts((prev) => {
        const updated = prev.map((record) => {
          const recordIsbn = normalizeIsbn(record.isbn);
          if (
            recordIsbn === original10 ||
            recordIsbn === original13 ||
            recordIsbn === normalizeIsbn(updatedBook.isbn) ||
            recordIsbn === normalizeIsbn(updatedBook.isbn13)
          ) {
            return {
              ...record,
              isbn: nextCheckoutIsbn,
              bookTitle: updatedBook.title,
            };
          }
          return record;
        });
        saveCheckouts(updated);
        return updated;
      });

      setError(null);
      return updatedBook;
    },
    [books]
  );

  /** Place a borrower into the hold queue for a specific book. */
  const placeHold = useCallback(
    (
      isbn: string,
      borrowerName: string,
      studentCard?: Pick<StudentCard, 'id' | 'cardNumber' | 'studentName'>
    ): HoldRequest | null => {
      const normalizedTarget = normalizeIsbn(isbn);
      const trimmedName = borrowerName.trim();
      if (!trimmedName) {
        setError('Borrower name is required to place a hold.');
        return null;
      }

      // Validate and check for duplicates against current books state before
      // calling setBooks, so we can compute the result synchronously.
      const book = books.find(
        (b) => normalizeIsbn(b.isbn) === normalizedTarget || normalizeIsbn(b.isbn13) === normalizedTarget
      );
      if (!book) {
        setError('Book not found for hold request.');
        return null;
      }

      const queue = Array.isArray(book.holds) ? book.holds : [];
      const alreadyQueued = queue.some((entry) => {
        if (studentCard?.id && entry.studentCardId) return entry.studentCardId === studentCard.id;
        if (studentCard?.cardNumber && entry.studentCardNumber) {
          return entry.studentCardNumber.toLowerCase() === studentCard.cardNumber.toLowerCase();
        }
        return entry.borrowerName.toLowerCase() === trimmedName.toLowerCase();
      });

      if (alreadyQueued) {
        setError('This borrower is already in the hold queue for this book.');
        return null;
      }

      if (studentCard) {
        const activeReservations = books.reduce((count, entry) => {
          const queueEntries = Array.isArray(entry.holds) ? entry.holds : [];
          const matched = queueEntries.some(
            (hold) =>
              hold.studentCardId === studentCard.id ||
              (!!hold.studentCardNumber &&
                hold.studentCardNumber.toLowerCase() === studentCard.cardNumber.toLowerCase())
          );
          return count + (matched ? 1 : 0);
        }, 0);

        if (activeReservations >= MAX_STUDENT_RESERVATIONS) {
          setError(`Students can reserve up to ${MAX_STUDENT_RESERVATIONS} books at a time.`);
          return null;
        }
      }

      const hold: HoldRequest = {
        id: crypto.randomUUID(),
        borrowerName: trimmedName,
        studentCardId: studentCard?.id,
        studentCardNumber: studentCard?.cardNumber,
        requestedAt: new Date().toISOString(),
      };

      setBooks((prev) => {
        const updated = prev.map((b) => {
          const isMatch = normalizeIsbn(b.isbn) === normalizedTarget || normalizeIsbn(b.isbn13) === normalizedTarget;
          if (!isMatch) return b;
          const q = Array.isArray(b.holds) ? b.holds : [];
          return { ...b, holds: [...q, hold] };
        });
        saveBooks(updated);
        return updated;
      });

      if (studentCard) {
        appendReservationActivity({
          type: 'reserve',
          studentCardId: studentCard.id,
          studentCardNumber: studentCard.cardNumber,
          studentName: studentCard.studentName,
          bookIsbn: normalizedTarget,
          bookTitle: book.title,
        });
      }
      setError(null);
      return hold;
    },
    [appendReservationActivity, books]
  );

  /** Remove a hold request from a book's queue. */
  const cancelHold = useCallback((isbn: string, holdId: string) => {
    const normalizedTarget = normalizeIsbn(isbn);

    setBooks((prev) => {
      const updated = prev.map((book) => {
        const isMatch =
          normalizeIsbn(book.isbn) === normalizedTarget || normalizeIsbn(book.isbn13) === normalizedTarget;
        if (!isMatch) return book;

        return {
          ...book,
          holds: (book.holds ?? []).filter((entry) => entry.id !== holdId),
        };
      });

      saveBooks(updated);
      return updated;
    });
  }, []);

  const attachHoldNotificationContact = useCallback((isbn: string, holdId: string, contactId: string) => {
    const normalizedTarget = normalizeIsbn(isbn);
    const trimmedContactId = contactId.trim();
    if (!trimmedContactId) return;

    setBooks((prev) => {
      const updated = prev.map((book) => {
        const isMatch =
          normalizeIsbn(book.isbn) === normalizedTarget || normalizeIsbn(book.isbn13) === normalizedTarget;
        if (!isMatch) return book;

        return {
          ...book,
          holds: (book.holds ?? []).map((entry) =>
            entry.id === holdId
              ? {
                  ...entry,
                  notificationContactId: trimmedContactId,
                }
              : entry
          ),
        };
      });
      saveBooks(updated);
      return updated;
    });
  }, []);

  /** Check out a copy of a book to a borrower. Returns the new record. */
  const checkoutBook = useCallback((isbn: string, bookTitle: string, borrowerName: string): CheckoutRecord => {
    const normalizedIsbn = normalizeIsbn(isbn);
    const trimmedBorrower = borrowerName.trim();
    const due = new Date();
    due.setDate(due.getDate() + 14); // 2-week loan period

    const record: CheckoutRecord = {
      id: crypto.randomUUID(),
      isbn: normalizedIsbn,
      bookTitle,
      borrowerName: trimmedBorrower,
      checkedOutAt: new Date().toISOString(),
      dueDate: due.toISOString(),
    };

    // If the borrower had a queued hold, fulfill it automatically on checkout.
    setBooks((prev) => {
      const updated = prev.map((book) => {
        const isMatch = normalizeIsbn(book.isbn) === normalizedIsbn || normalizeIsbn(book.isbn13) === normalizedIsbn;
        if (!isMatch || !Array.isArray(book.holds) || book.holds.length === 0) return book;

        const holdIndex = book.holds.findIndex(
          (entry) => entry.borrowerName.toLowerCase() === trimmedBorrower.toLowerCase()
        );

        if (holdIndex < 0) return book;

        const nextHolds = [...book.holds];
        nextHolds.splice(holdIndex, 1);
        return {
          ...book,
          holds: nextHolds,
        };
      });

      saveBooks(updated);
      return updated;
    });

    setCheckouts((prev) => {
      const updated = [...prev, record];
      saveCheckouts(updated);
      return updated;
    });

    return record;
  }, []);

  /** Return a checked-out book by checkout record ID. */
  const returnBook = useCallback(
    (checkoutId: string) => {
      setCheckouts((prev) => {
        const target = prev.find((record) => record.id === checkoutId && !record.returnedAt);
        if (!target) return prev;

        const returnedAt = new Date().toISOString();
        const updated = prev.map((c) => (c.id === checkoutId ? { ...c, returnedAt } : c));

        const matchedBook = books.find(
          (book) =>
            normalizeIsbn(book.isbn) === normalizeIsbn(target.isbn) ||
            normalizeIsbn(book.isbn13) === normalizeIsbn(target.isbn)
        );

        const nextHold = (matchedBook?.holds ?? [])[0] ?? null;

        if (matchedBook && nextHold?.notificationContactId) {
          // Notify the next student that a copy is now available,
          // but require staff to perform the actual checkout manually.
          void sendBookAvailableNotice({
            contactId: nextHold.notificationContactId,
            studentName: nextHold.borrowerName,
            bookTitle: matchedBook.title,
          });
        }

        saveCheckouts(updated);
        return updated;
      });
    },
    [books]
  );

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
        holdQueue: book.holds ?? [],
        nextHold: (book.holds ?? [])[0] ?? null,
      };
    },
    [books, checkouts]
  );

  /** Reload in-memory state from localStorage (useful after backup import). */
  const syncFromStorage = useCallback(() => {
    setBooks(getBooks());
    setCheckouts(getCheckouts());
    setStudentCards(getStudentCards());
    setReservationActivities(getReservationActivity());
  }, []);

  const addStudentCard = useCallback(
    (input: Omit<StudentCard, 'id' | 'cardNumber' | 'createdAt' | 'updatedAt'>): StudentCard => {
      const now = new Date().toISOString();
      const card: StudentCard = {
        id: crypto.randomUUID(),
        studentName: input.studentName.trim(),
        cardNumber: generateStudentCardNumber(studentCards),
        grade: input.grade?.trim() || '',
        homeroom: input.homeroom?.trim() || '',
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
        grade: (updates.grade ?? existing.grade ?? '').trim(),
        homeroom: (updates.homeroom ?? existing.homeroom ?? '').trim(),
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

  const clearAllData = useCallback(() => {
    saveBooks([]);
    saveCheckouts([]);
    saveStudentCards([]);
    saveReservationActivity([]);
    setBooks([]);
    setCheckouts([]);
    setStudentCards([]);
    setReservationActivities([]);
    setError(null);
  }, []);

  const clearCheckoutsOnly = useCallback(() => {
    saveCheckouts([]);
    setCheckouts([]);
    setError(null);
  }, []);

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
    reservationActivities,
    loading,
    error,
    setError,
    fetchBookMetadata,
    addManualBook,
    updateBookDetails,
    removeBook,
    placeHold,
    cancelHold,
    attachHoldNotificationContact,
    checkoutBook,
    returnBook,
    authenticateStudentCard,
    trackBookViewByStudent,
    getBookStatus,
    syncFromStorage,
    clearAllData,
    clearCheckoutsOnly,
    addStudentCard,
    updateStudentCard,
    removeStudentCard,
    seedDemoDataset,
  };
}
