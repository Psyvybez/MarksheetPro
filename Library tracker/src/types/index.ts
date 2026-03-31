/** A book stored in the library */
export interface Book {
  isbn: string;
  isbn13: string;
  title: string;
  authors: string[];
  publisher: string;
  category: string;
  genre: string;
  age: string;
  binding: string;
  conditionCoverBindingIntegrity: string;
  conditionPageQuality: string;
  conditionOverallAppearance: string;
  coverImage: string;
  synopsis: string;
  searchTags: string[];
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

/** A managed student library card profile */
export interface StudentCard {
  id: string;
  studentName: string;
  cardNumber: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** The three main views of the app */
export type AppView = 'dashboard' | 'library' | 'scanner';
