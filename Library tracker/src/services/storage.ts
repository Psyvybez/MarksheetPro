import type { Book, CheckoutRecord, StudentCard } from '../types';

const BOOKS_KEY = 'lt_books';
const CHECKOUTS_KEY = 'lt_checkouts';
const API_KEY_KEY = 'lt_api_key';
const STUDENT_CARDS_KEY = 'lt_student_cards';

export interface LibraryBackup {
  version: 1;
  exportedAt: string;
  books: Book[];
  checkouts: CheckoutRecord[];
  studentCards: StudentCard[];
}

export function getBooks(): Book[] {
  try {
    const raw = localStorage.getItem(BOOKS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as Array<Book & { subjects?: string[] }>;
    return parsed.map((book) => ({
      ...book,
      searchTags: Array.isArray(book.searchTags) ? book.searchTags : Array.isArray(book.subjects) ? book.subjects : [],
    }));
  } catch {
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
  } catch {
    return [];
  }
}

export function saveCheckouts(checkouts: CheckoutRecord[]): void {
  localStorage.setItem(CHECKOUTS_KEY, JSON.stringify(checkouts));
}

export function getStoredApiKey(): string {
  return localStorage.getItem(API_KEY_KEY) ?? '';
}

export function saveApiKey(key: string): void {
  localStorage.setItem(API_KEY_KEY, key);
}

export function getStudentCards(): StudentCard[] {
  try {
    const raw = localStorage.getItem(STUDENT_CARDS_KEY);
    return raw ? (JSON.parse(raw) as StudentCard[]) : [];
  } catch {
    return [];
  }
}

export function saveStudentCards(cards: StudentCard[]): void {
  localStorage.setItem(STUDENT_CARDS_KEY, JSON.stringify(cards));
}

export function exportLibraryBackup(): LibraryBackup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    books: getBooks(),
    checkouts: getCheckouts(),
    studentCards: getStudentCards(),
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
}
