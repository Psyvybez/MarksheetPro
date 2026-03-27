/** A book stored in the library */
export interface Book {
  isbn: string;
  isbn13: string;
  title: string;
  authors: string[];
  publisher: string;
  coverImage: string;
  synopsis: string;
  subjects: string[];
  datePublished: string;
  addedAt: string;
  copies: number;
}

/** A check-out / check-in transaction record */
export interface CheckoutRecord {
  id: string;
  isbn: string;
  bookTitle: string;
  borrowerName: string;
  checkedOutAt: string;
  dueDate: string;
  returnedAt?: string;
}

/** The three main views of the app */
export type AppView = 'dashboard' | 'library' | 'scanner';
