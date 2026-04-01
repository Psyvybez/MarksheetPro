import type { Book, CheckoutRecord, StudentCard } from '../types';
import { supabase } from './supabase';

const CLOUD_TABLE = 'library_tracker_state';

export interface CloudLibraryState {
  books: Book[];
  checkouts: CheckoutRecord[];
  studentCards: StudentCard[];
}

function ensureBookArray(value: unknown): Book[] {
  return Array.isArray(value) ? (value as Book[]) : [];
}

function ensureCheckoutArray(value: unknown): CheckoutRecord[] {
  return Array.isArray(value) ? (value as CheckoutRecord[]) : [];
}

function ensureStudentCardArray(value: unknown): StudentCard[] {
  return Array.isArray(value) ? (value as StudentCard[]) : [];
}

async function getCurrentUserId(): Promise<string | null> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.warn('Supabase session lookup failed:', error.message);
    return null;
  }

  return session?.user?.id ?? null;
}

export async function loadCloudLibraryState(): Promise<CloudLibraryState | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await supabase
    .from(CLOUD_TABLE)
    .select('books, checkouts, student_cards')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Failed to load cloud library state:', error.message);
    return null;
  }

  if (!data) return null;

  return {
    books: ensureBookArray(data.books),
    checkouts: ensureCheckoutArray(data.checkouts),
    studentCards: ensureStudentCardArray(data.student_cards),
  };
}

export async function saveCloudLibraryState(input: CloudLibraryState): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const { error } = await supabase.from(CLOUD_TABLE).upsert(
    {
      user_id: userId,
      books: input.books,
      checkouts: input.checkouts,
      student_cards: input.studentCards,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );

  if (error) {
    console.warn('Failed to save cloud library state:', error.message);
    return false;
  }

  return true;
}
