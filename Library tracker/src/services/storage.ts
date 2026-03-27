import type { Book, CheckoutRecord } from '../types';

const BOOKS_KEY = 'lt_books';
const CHECKOUTS_KEY = 'lt_checkouts';
const API_KEY_KEY = 'lt_api_key';

export function getBooks(): Book[] {
  try {
    const raw = localStorage.getItem(BOOKS_KEY);
    return raw ? (JSON.parse(raw) as Book[]) : [];
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
