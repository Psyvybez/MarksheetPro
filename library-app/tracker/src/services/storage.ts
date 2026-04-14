import type { Book, CheckoutRecord, StudentCard, HoldRequest, ReservationActivity } from '../types';

const BOOKS_KEY = 'lt_books';
const CHECKOUTS_KEY = 'lt_checkouts';
const API_KEY_KEY = 'lt_api_key';
const STUDENT_CARDS_KEY = 'lt_student_cards';
const RESERVATION_ACTIVITY_KEY = 'lt_reservation_activity';
const DEFAULT_GOOGLE_BOOKS_API_KEY =
  import.meta.env.VITE_GOOGLE_BOOKS_API_KEY || 'AIzaSyDHdECKraePiwX0Ab0wuATJMm8zF-UGQ6U';

export interface LibraryBackup {
  version: 1;
  exportedAt: string;
  books: Book[];
  checkouts: CheckoutRecord[];
  studentCards: StudentCard[];
  reservationActivity: ReservationActivity[];
}

export function getBooks(): Book[] {
  try {
    const raw = localStorage.getItem(BOOKS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Array<Book & { subjects?: string[]; holds?: HoldRequest[] }>;
    return parsed.map((book) => ({
      ...book,
      searchTags: Array.isArray(book.searchTags) ? book.searchTags : Array.isArray(book.subjects) ? book.subjects : [],
      holds: Array.isArray(book.holds) ? book.holds : [],
    }));
  } catch (error) {
    console.warn('Failed to parse stored library books:', error);
    return [];
  }
}

export function saveBooks(books: Book[]): void {
  localStorage.setItem(BOOKS_KEY, JSON.stringify(books));
}

export function getCheckouts(): CheckoutRecord[] {
  try {
    const raw = localStorage.getItem(CHECKOUTS_KEY);
    return raw ? (JSON.parse(raw) as CheckoutRecord[]) : [];
  } catch (error) {
    console.warn('Failed to parse stored library checkouts:', error);
    return [];
  }
}

export function saveCheckouts(checkouts: CheckoutRecord[]): void {
  localStorage.setItem(CHECKOUTS_KEY, JSON.stringify(checkouts));
}

export function getStoredApiKey(): string {
  return localStorage.getItem(API_KEY_KEY) ?? DEFAULT_GOOGLE_BOOKS_API_KEY;
}

export function saveApiKey(key: string): void {
  localStorage.setItem(API_KEY_KEY, key);
}

export function getStudentCards(): StudentCard[] {
  try {
    const raw = localStorage.getItem(STUDENT_CARDS_KEY);
    return raw ? (JSON.parse(raw) as StudentCard[]) : [];
  } catch (error) {
    console.warn('Failed to parse stored student cards:', error);
    return [];
  }
}

export function saveStudentCards(cards: StudentCard[]): void {
  localStorage.setItem(STUDENT_CARDS_KEY, JSON.stringify(cards));
}

export function getReservationActivity(): ReservationActivity[] {
  try {
    const raw = localStorage.getItem(RESERVATION_ACTIVITY_KEY);
    return raw ? (JSON.parse(raw) as ReservationActivity[]) : [];
  } catch (error) {
    console.warn('Failed to parse reservation activity log:', error);
    return [];
  }
}

export function saveReservationActivity(activity: ReservationActivity[]): void {
  localStorage.setItem(RESERVATION_ACTIVITY_KEY, JSON.stringify(activity));
}

export function exportLibraryBackup(): LibraryBackup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    books: getBooks(),
    checkouts: getCheckouts(),
    studentCards: getStudentCards(),
    reservationActivity: getReservationActivity(),
  };
}

export function importLibraryBackup(input: unknown): void {
  if (!input || typeof input !== 'object') {
    throw new Error('Backup file is not a valid JSON object.');
  }

  const raw = input as Partial<LibraryBackup>;
  if (!Array.isArray(raw.books) || !Array.isArray(raw.checkouts)) {
    throw new Error('Backup file must include books and checkouts arrays.');
  }

  saveBooks(raw.books as Book[]);
  saveCheckouts(raw.checkouts as CheckoutRecord[]);
  saveStudentCards(Array.isArray(raw.studentCards) ? (raw.studentCards as StudentCard[]) : []);
  saveReservationActivity(
    Array.isArray(raw.reservationActivity) ? (raw.reservationActivity as ReservationActivity[]) : []
  );
}
