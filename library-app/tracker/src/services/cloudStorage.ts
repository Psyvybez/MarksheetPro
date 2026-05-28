import type { Book, CheckoutRecord, StudentCard, ReservationActivity } from '../types';
import { supabase } from './supabase';

const CLOUD_TABLE = 'library_tracker_state';
const LOCAL_TEACHER_ID_KEY = 'library_tracker_teacher_id';

export interface CloudLibraryState {
  books: Book[];
  checkouts: CheckoutRecord[];
  studentCards: StudentCard[];
  reservationActivity: ReservationActivity[];
}

function getTeacherIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null;

  try {
    const params = new URLSearchParams(window.location.search);
    const teacher = params.get('teacher');
    return teacher ? teacher.trim() : null;
  } catch {
    return null;
  }
}

function isStudentPortalContext(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.endsWith('/student.html');
}

function ensureBookArray(value: unknown): Book[] {
  if (!Array.isArray(value)) return [];
  return (value as Book[]).map((book) => ({
    ...book,
    holds: Array.isArray(book.holds) ? book.holds : [],
  }));
}

function ensureCheckoutArray(value: unknown): CheckoutRecord[] {
  return Array.isArray(value) ? (value as CheckoutRecord[]) : [];
}

function ensureStudentCardArray(value: unknown): StudentCard[] {
  return Array.isArray(value) ? (value as StudentCard[]) : [];
}

function ensureReservationActivityArray(value: unknown): ReservationActivity[] {
  return Array.isArray(value) ? (value as ReservationActivity[]) : [];
}

export async function getCurrentUserId(): Promise<string | null> {
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

export function getLocalTeacherId(): string {
  try {
    const existing = localStorage.getItem(LOCAL_TEACHER_ID_KEY);
    if (existing) return existing;

    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    localStorage.setItem(LOCAL_TEACHER_ID_KEY, generated);
    return generated;
  } catch {
    return 'local-anonymous';
  }
}

export async function getTeacherIdForLinks(): Promise<string> {
  const userId = await getCurrentUserId();
  if (userId) return userId;
  return getLocalTeacherId();
}

export async function loadCloudLibraryState(): Promise<CloudLibraryState | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const requestedTeacherId = getTeacherIdFromUrl();
  if (isStudentPortalContext() && requestedTeacherId && requestedTeacherId !== userId) {
    console.warn('Teacher scope mismatch. Ignoring cloud load for this URL context.');
    return null;
  }

  const { data, error } = await supabase
    .from(CLOUD_TABLE)
    .select('books, checkouts, student_cards, reservation_activity')
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
    reservationActivity: ensureReservationActivityArray(data.reservation_activity),
  };
}

export async function saveCloudLibraryState(input: CloudLibraryState): Promise<boolean> {
  const userId = await getCurrentUserId();
  if (!userId) return false;

  const requestedTeacherId = getTeacherIdFromUrl();
  if (isStudentPortalContext() && requestedTeacherId && requestedTeacherId !== userId) {
    console.warn('Teacher scope mismatch. Ignoring cloud save for this URL context.');
    return false;
  }

  const { error } = await supabase.from(CLOUD_TABLE).upsert(
    {
      user_id: userId,
      books: input.books,
      checkouts: input.checkouts,
      student_cards: input.studentCards,
      reservation_activity: input.reservationActivity,
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
