import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useLibrary } from '../hooks/useLibrary';
import type { Book, CheckoutRecord, StudentCard } from '../types';

// ---- Module mocks -------------------------------------------------------

vi.mock('../services/cloudStorage', () => ({
  loadCloudLibraryState: vi.fn().mockResolvedValue(null),
  saveCloudLibraryState: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/catalog', () => ({
  lookupCatalogBook: vi.fn().mockReturnValue(null),
}));

vi.mock('../services/api', () => ({
  fetchGoogleBooksMetadata: vi.fn().mockResolvedValue(null),
}));

// ---- Test data factories ------------------------------------------------

function makeBook(overrides: Partial<Book> = {}): Book {
  return {
    isbn: '9780000000001',
    isbn13: '9780000000001',
    title: 'Test Book',
    authors: ['Test Author'],
    publisher: 'Test Publisher',
    category: 'Fiction',
    genre: 'General',
    age: 'Adult',
    binding: 'Paperback',
    conditionCoverBindingIntegrity: 'Good',
    conditionPageQuality: 'Good',
    conditionOverallAppearance: 'Good',
    coverImage: '',
    synopsis: '',
    searchTags: [],
    datePublished: '2024',
    addedAt: new Date().toISOString(),
    copies: 1,
    holds: [],
    ...overrides,
  };
}

function makeStudentCard(overrides: Partial<StudentCard> = {}): StudentCard {
  return {
    id: 'card-1',
    studentName: 'Alice Johnson',
    cardNumber: 'LIB-00001',
    isActive: true,
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeHold(overrides: Partial<Book['holds'][0]> = {}): Book['holds'][0] {
  return {
    id: `hold-${Math.random()}`,
    borrowerName: 'Hold User',
    requestedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ---- Setup helper -------------------------------------------------------

/**
 * Seeds localStorage and renders the hook, waiting for the async cloud
 * hydration effect to finish (it resolves to null in tests via the mock).
 */
async function setup(initialData: { books?: Book[]; studentCards?: StudentCard[] } = {}) {
  if (initialData.books) {
    localStorage.setItem('lt_books', JSON.stringify(initialData.books));
  }
  if (initialData.studentCards) {
    localStorage.setItem('lt_student_cards', JSON.stringify(initialData.studentCards));
  }

  const hook = renderHook(() => useLibrary());

  // Flush the cloud hydration promise so the hook is fully initialised.
  await act(async () => {});

  return hook;
}

// =========================================================================
// authenticateStudentCard
// =========================================================================

describe('authenticateStudentCard', () => {
  it('returns null with error when card number is empty', async () => {
    const { result } = await setup({ studentCards: [] });

    let authenticated: StudentCard | null = null;
    act(() => {
      authenticated = result.current.authenticateStudentCard('   ');
    });

    expect(authenticated).toBeNull();
    expect(result.current.error).toMatch(/required/i);
  });

  it('returns null with error when card number is not found', async () => {
    const { result } = await setup({ studentCards: [] });

    let authenticated: StudentCard | null = null;
    act(() => {
      authenticated = result.current.authenticateStudentCard('LIB-99999');
    });

    expect(authenticated).toBeNull();
    expect(result.current.error).toMatch(/not found/i);
  });

  it('returns null with error when card is inactive', async () => {
    const card = makeStudentCard({ isActive: false });
    const { result } = await setup({ studentCards: [card] });

    let authenticated: StudentCard | null = null;
    act(() => {
      authenticated = result.current.authenticateStudentCard('LIB-00001');
    });

    expect(authenticated).toBeNull();
    expect(result.current.error).toMatch(/inactive/i);
  });

  it('returns null with error when student name does not match', async () => {
    const card = makeStudentCard();
    const { result } = await setup({ studentCards: [card] });

    let authenticated: StudentCard | null = null;
    act(() => {
      authenticated = result.current.authenticateStudentCard('LIB-00001', 'Wrong Name');
    });

    expect(authenticated).toBeNull();
    expect(result.current.error).toMatch(/name does not match/i);
  });

  it('returns the card and clears error when credentials are valid', async () => {
    const card = makeStudentCard();
    const { result } = await setup({ studentCards: [card] });

    let authenticated: StudentCard | null = null;
    act(() => {
      authenticated = result.current.authenticateStudentCard('LIB-00001', 'Alice Johnson');
    });

    expect(authenticated).not.toBeNull();
    expect(authenticated!.id).toBe('card-1');
    expect(result.current.error).toBeNull();
  });

  it('authenticates without name validation when no name is provided', async () => {
    const card = makeStudentCard();
    const { result } = await setup({ studentCards: [card] });

    let authenticated: StudentCard | null = null;
    act(() => {
      authenticated = result.current.authenticateStudentCard('LIB-00001');
    });

    expect(authenticated).not.toBeNull();
  });

  it('is case-insensitive for the card number', async () => {
    const card = makeStudentCard({ cardNumber: 'LIB-00001' });
    const { result } = await setup({ studentCards: [card] });

    let authenticated: StudentCard | null = null;
    act(() => {
      authenticated = result.current.authenticateStudentCard('lib-00001');
    });

    expect(authenticated).not.toBeNull();
  });

  it('logs a sign-in reservation activity on success', async () => {
    const card = makeStudentCard();
    const { result } = await setup({ studentCards: [card] });

    act(() => {
      result.current.authenticateStudentCard('LIB-00001');
    });

    expect(result.current.reservationActivities).toHaveLength(1);
    expect(result.current.reservationActivities[0].type).toBe('sign-in');
    expect(result.current.reservationActivities[0].studentCardId).toBe('card-1');
    expect(result.current.reservationActivities[0].studentName).toBe('Alice Johnson');
  });

  it('does NOT log activity when authentication fails', async () => {
    const { result } = await setup({ studentCards: [] });

    act(() => {
      result.current.authenticateStudentCard('LIB-99999');
    });

    expect(result.current.reservationActivities).toHaveLength(0);
  });
});

// =========================================================================
// placeHold
// =========================================================================

describe('placeHold', () => {
  it('adds a hold to the book queue', async () => {
    const book = makeBook();
    const { result } = await setup({ books: [book] });

    act(() => {
      result.current.placeHold('9780000000001', 'Bob Smith');
    });

    expect(result.current.books[0].holds).toHaveLength(1);
    expect(result.current.books[0].holds[0].borrowerName).toBe('Bob Smith');
  });

  it('returns the created HoldRequest', async () => {
    const book = makeBook();
    const { result } = await setup({ books: [book] });

    let hold: ReturnType<typeof result.current.placeHold> = null;
    act(() => {
      hold = result.current.placeHold('9780000000001', 'Bob Smith');
    });

    expect(hold).not.toBeNull();
    expect(hold!.borrowerName).toBe('Bob Smith');
  });

  it('links the hold to a student card when one is provided', async () => {
    const book = makeBook();
    const card = makeStudentCard();
    const { result } = await setup({ books: [book], studentCards: [card] });

    act(() => {
      result.current.placeHold('9780000000001', 'Alice Johnson', card);
    });

    const hold = result.current.books[0].holds[0];
    expect(hold.studentCardId).toBe('card-1');
    expect(hold.studentCardNumber).toBe('LIB-00001');
  });

  it('prevents duplicate holds by the same card ID', async () => {
    const card = makeStudentCard();
    const book = makeBook({
      holds: [
        makeHold({
          id: 'hold-1',
          borrowerName: 'Alice Johnson',
          studentCardId: 'card-1',
          studentCardNumber: 'LIB-00001',
        }),
      ],
    });
    const { result } = await setup({ books: [book], studentCards: [card] });

    act(() => {
      result.current.placeHold('9780000000001', 'Alice Johnson', card);
    });

    expect(result.current.books[0].holds).toHaveLength(1);
    expect(result.current.error).toMatch(/already in the hold queue/i);
  });

  it('prevents duplicate holds by card number (case-insensitive)', async () => {
    const book = makeBook({
      holds: [makeHold({ id: 'hold-1', borrowerName: 'Alice Johnson', studentCardNumber: 'LIB-00001' })],
    });
    const { result } = await setup({ books: [book] });

    const altCard = makeStudentCard({ cardNumber: 'lib-00001' });
    act(() => {
      result.current.placeHold('9780000000001', 'Alice Johnson', altCard);
    });

    expect(result.current.books[0].holds).toHaveLength(1);
    expect(result.current.error).toMatch(/already in the hold queue/i);
  });

  it('allows a second student to join the same queue', async () => {
    const book = makeBook({ holds: [makeHold({ borrowerName: 'Alice' })] });
    const { result } = await setup({ books: [book] });

    act(() => {
      result.current.placeHold('9780000000001', 'Bob');
    });

    expect(result.current.books[0].holds).toHaveLength(2);
  });

  it('sets error and returns null when book is not found', async () => {
    const { result } = await setup({ books: [] });

    let hold: ReturnType<typeof result.current.placeHold> = 'sentinel' as unknown as null;
    act(() => {
      hold = result.current.placeHold('9780000000999', 'Bob Smith');
    });

    expect(hold).toBeNull();
    expect(result.current.error).toMatch(/book not found/i);
  });

  it('sets error and returns null when borrower name is empty', async () => {
    const book = makeBook();
    const { result } = await setup({ books: [book] });

    let hold: ReturnType<typeof result.current.placeHold> = 'sentinel' as unknown as null;
    act(() => {
      hold = result.current.placeHold('9780000000001', '   ');
    });

    expect(hold).toBeNull();
    expect(result.current.error).toMatch(/borrower name is required/i);
    expect(result.current.books[0].holds).toHaveLength(0);
  });

  it('clears the error on a successful hold placement', async () => {
    const book = makeBook();
    const { result } = await setup({ books: [book] });

    act(() => {
      result.current.placeHold('9780000000001', 'Bob Smith');
    });

    expect(result.current.error).toBeNull();
  });

  it('logs a reserve activity when a student card is provided', async () => {
    const book = makeBook();
    const card = makeStudentCard();
    const { result } = await setup({ books: [book], studentCards: [card] });

    act(() => {
      result.current.placeHold('9780000000001', 'Alice Johnson', card);
    });

    const activity = result.current.reservationActivities.find((a) => a.type === 'reserve');
    expect(activity).toBeDefined();
    expect(activity?.studentCardId).toBe('card-1');
    expect(activity?.bookTitle).toBe('Test Book');
    expect(activity?.bookIsbn).toBe('9780000000001');
  });

  it('does NOT log an activity when no student card is provided', async () => {
    const book = makeBook();
    const { result } = await setup({ books: [book] });

    act(() => {
      result.current.placeHold('9780000000001', 'Bob Smith');
    });

    expect(result.current.reservationActivities).toHaveLength(0);
  });

  it('limits each student card to 2 active reservations', async () => {
    const card = makeStudentCard();
    const books = [
      makeBook({ isbn: '9780000000001', isbn13: '9780000000001', title: 'Book 1' }),
      makeBook({ isbn: '9780000000002', isbn13: '9780000000002', title: 'Book 2' }),
      makeBook({ isbn: '9780000000003', isbn13: '9780000000003', title: 'Book 3' }),
    ];
    const { result } = await setup({ books, studentCards: [card] });

    act(() => {
      result.current.placeHold('9780000000001', 'Alice Johnson', card);
      result.current.placeHold('9780000000002', 'Alice Johnson', card);
    });

    let thirdHold: ReturnType<typeof result.current.placeHold> = null;
    act(() => {
      thirdHold = result.current.placeHold('9780000000003', 'Alice Johnson', card);
    });

    expect(thirdHold).toBeNull();
    expect(result.current.error).toMatch(/up to 2 books/i);
    expect(result.current.books[2].holds).toHaveLength(0);
  });
});

// =========================================================================
// cancelHold
// =========================================================================

describe('cancelHold', () => {
  it('removes the targeted hold from the queue', async () => {
    const book = makeBook({
      holds: [makeHold({ id: 'hold-1', borrowerName: 'Alice' }), makeHold({ id: 'hold-2', borrowerName: 'Bob' })],
    });
    const { result } = await setup({ books: [book] });

    act(() => {
      result.current.cancelHold('9780000000001', 'hold-1');
    });

    expect(result.current.books[0].holds).toHaveLength(1);
    expect(result.current.books[0].holds[0].id).toBe('hold-2');
  });

  it('leaves the queue unchanged when the hold ID does not exist', async () => {
    const book = makeBook({ holds: [makeHold({ id: 'hold-1', borrowerName: 'Alice' })] });
    const { result } = await setup({ books: [book] });

    act(() => {
      result.current.cancelHold('9780000000001', 'hold-nonexistent');
    });

    expect(result.current.books[0].holds).toHaveLength(1);
  });
});

// =========================================================================
// returnBook  (manual checkout required for waitlisted students)
// =========================================================================

describe('returnBook', () => {
  it('marks the checkout as returned', async () => {
    const book = makeBook();
    const { result } = await setup({ books: [book] });

    let record: CheckoutRecord | undefined;
    act(() => {
      record = result.current.checkoutBook('9780000000001', 'Test Book', 'Alice');
    });

    act(() => {
      result.current.returnBook(record!.id);
    });

    const returned = result.current.checkouts.find((c) => c.id === record!.id);
    expect(returned?.returnedAt).toBeDefined();
  });

  it('does not auto-assign the next hold as a new checkout when the queue has entries', async () => {
    const book = makeBook({
      copies: 1,
      holds: [makeHold({ id: 'hold-1', borrowerName: 'Bob Smith' })],
    });
    const { result } = await setup({ books: [book] });

    let record: CheckoutRecord | undefined;
    act(() => {
      record = result.current.checkoutBook('9780000000001', 'Test Book', 'Alice');
    });

    act(() => {
      result.current.returnBook(record!.id);
    });

    const bobCheckout = result.current.checkouts.find((c) => c.borrowerName === 'Bob Smith' && !c.returnedAt);
    expect(bobCheckout).toBeUndefined();
  });

  it('keeps the hold in the queue after return so staff can check out manually', async () => {
    const book = makeBook({
      copies: 1,
      holds: [makeHold({ id: 'hold-1', borrowerName: 'Bob Smith' })],
    });
    const { result } = await setup({ books: [book] });

    let record: CheckoutRecord | undefined;
    act(() => {
      record = result.current.checkoutBook('9780000000001', 'Test Book', 'Alice');
    });

    act(() => {
      result.current.returnBook(record!.id);
    });

    expect(result.current.books[0].holds).toHaveLength(1);
    expect(result.current.books[0].holds[0].id).toBe('hold-1');
  });

  it('preserves FIFO hold order when a copy is returned', async () => {
    const book = makeBook({
      copies: 1,
      holds: [makeHold({ id: 'hold-1', borrowerName: 'Bob' }), makeHold({ id: 'hold-2', borrowerName: 'Carol' })],
    });
    const { result } = await setup({ books: [book] });

    let record: CheckoutRecord | undefined;
    act(() => {
      record = result.current.checkoutBook('9780000000001', 'Test Book', 'Alice');
    });

    act(() => {
      result.current.returnBook(record!.id);
    });

    expect(result.current.books[0].holds).toHaveLength(2);
    expect(result.current.books[0].holds[0].id).toBe('hold-1');
    expect(result.current.books[0].holds[1].id).toBe('hold-2');
  });

  it('does not log auto-assigned activity on return', async () => {
    const card = makeStudentCard({ id: 'card-bob', cardNumber: 'LIB-00002', studentName: 'Bob Smith' });
    const book = makeBook({
      copies: 1,
      holds: [
        makeHold({
          id: 'hold-1',
          borrowerName: 'Bob Smith',
          studentCardId: 'card-bob',
          studentCardNumber: 'LIB-00002',
        }),
      ],
    });
    const { result } = await setup({ books: [book], studentCards: [card] });

    let record: CheckoutRecord | undefined;
    act(() => {
      record = result.current.checkoutBook('9780000000001', 'Test Book', 'Alice');
    });

    act(() => {
      result.current.returnBook(record!.id);
    });

    const activity = result.current.reservationActivities.find((a) => a.type === 'auto-assigned');
    expect(activity).toBeUndefined();
  });

  it('does NOT auto-assign and adds no extra checkout when queue is empty', async () => {
    const book = makeBook({ copies: 1, holds: [] });
    const { result } = await setup({ books: [book] });

    let record: CheckoutRecord | undefined;
    act(() => {
      record = result.current.checkoutBook('9780000000001', 'Test Book', 'Alice');
    });

    const countBefore = result.current.checkouts.length;

    act(() => {
      result.current.returnBook(record!.id);
    });

    // Only the existing record is in checkouts — no new one added.
    expect(result.current.checkouts.length).toBe(countBefore);
  });

  it('is a no-op for an unknown checkout ID', async () => {
    const book = makeBook();
    const { result } = await setup({ books: [book] });

    let record: CheckoutRecord | undefined;
    act(() => {
      record = result.current.checkoutBook('9780000000001', 'Test Book', 'Alice');
    });

    act(() => {
      result.current.returnBook('nonexistent-id');
    });

    // Original checkout is still active
    const checkout = result.current.checkouts.find((c) => c.id === record!.id);
    expect(checkout?.returnedAt).toBeUndefined();
  });

  it('does not auto-checkout any queued student even if later holds are eligible', async () => {
    const cardBob = makeStudentCard({ id: 'card-bob', cardNumber: 'LIB-00002', studentName: 'Bob Smith' });
    const cardCarol = makeStudentCard({ id: 'card-carol', cardNumber: 'LIB-00003', studentName: 'Carol Smith' });

    const primaryBook = makeBook({
      isbn: '9780000000001',
      isbn13: '9780000000001',
      title: 'Queued Book',
      copies: 1,
      holds: [
        makeHold({
          id: 'hold-bob',
          borrowerName: 'Bob Smith',
          studentCardId: 'card-bob',
          studentCardNumber: 'LIB-00002',
        }),
        makeHold({
          id: 'hold-carol',
          borrowerName: 'Carol Smith',
          studentCardId: 'card-carol',
          studentCardNumber: 'LIB-00003',
        }),
      ],
    });

    const secondaryBook = makeBook({
      isbn: '9780000000009',
      isbn13: '9780000000009',
      title: 'Other Book',
      copies: 1,
      holds: [],
    });

    const { result } = await setup({ books: [primaryBook, secondaryBook], studentCards: [cardBob, cardCarol] });

    // Bob already has one active checkout elsewhere.
    act(() => {
      result.current.checkoutBook('9780000000009', 'Other Book', 'Bob Smith');
    });

    let currentLoan: CheckoutRecord | undefined;
    act(() => {
      currentLoan = result.current.checkoutBook('9780000000001', 'Queued Book', 'Alice');
    });

    act(() => {
      result.current.returnBook(currentLoan!.id);
    });

    const carolCheckout = result.current.checkouts.find(
      (c) => c.borrowerName === 'Carol Smith' && c.bookTitle === 'Queued Book' && !c.returnedAt
    );
    expect(carolCheckout).toBeUndefined();

    expect(result.current.books[0].holds).toHaveLength(2);
    expect(result.current.books[0].holds[0].id).toBe('hold-bob');
    expect(result.current.books[0].holds[1].id).toBe('hold-carol');
  });
});

// =========================================================================
// getBookStatus
// =========================================================================

describe('getBookStatus', () => {
  it('returns null for an unknown ISBN', async () => {
    const { result } = await setup({ books: [] });
    expect(result.current.getBookStatus('9780000000999')).toBeNull();
  });

  it('returns correct availableCopies when all copies are checked out', async () => {
    const book = makeBook({ copies: 1 });
    const { result } = await setup({ books: [book] });

    act(() => {
      result.current.checkoutBook('9780000000001', 'Test Book', 'Alice');
    });

    const status = result.current.getBookStatus('9780000000001');
    expect(status?.availableCopies).toBe(0);
    expect(status?.isAvailable).toBe(false);
  });

  it('reports copies as available when no active checkouts exist', async () => {
    const book = makeBook({ copies: 3 });
    const { result } = await setup({ books: [book] });

    const status = result.current.getBookStatus('9780000000001');
    expect(status?.availableCopies).toBe(3);
    expect(status?.isAvailable).toBe(true);
  });

  it('returns holdQueue and nextHold from the book', async () => {
    const book = makeBook({
      holds: [makeHold({ id: 'hold-1', borrowerName: 'Alice' }), makeHold({ id: 'hold-2', borrowerName: 'Bob' })],
    });
    const { result } = await setup({ books: [book] });

    const status = result.current.getBookStatus('9780000000001');
    expect(status?.holdQueue).toHaveLength(2);
    expect(status?.nextHold?.id).toBe('hold-1');
  });

  it('returns an empty holdQueue and null nextHold when there are no holds', async () => {
    const book = makeBook({ holds: [] });
    const { result } = await setup({ books: [book] });

    const status = result.current.getBookStatus('9780000000001');
    expect(status?.holdQueue).toHaveLength(0);
    expect(status?.nextHold).toBeNull();
  });

  it('matches on isbn13 as well as isbn10', async () => {
    // Book stored with isbn10; lookup by isbn13 should still find it.
    const book = makeBook({ isbn: '0000000001', isbn13: '9780000000001' });
    const { result } = await setup({ books: [book] });

    expect(result.current.getBookStatus('9780000000001')).not.toBeNull();
  });
});
