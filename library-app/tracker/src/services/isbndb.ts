const BASE_URL = 'https://api2.isbndb.com';

export interface IsbnDbBookRaw {
  isbn: string;
  isbn13: string;
  title: string;
  authors?: string[];
  publisher?: string;
  image?: string;
  synopsis?: string;
  subjects?: string[];
  date_published?: string;
}

/**
 * Fetch a book from ISBNdb by its ISBN-10 or ISBN-13.
 * Throws an error with a descriptive message on failure.
 */
export async function fetchBookByIsbn(isbn: string, apiKey: string): Promise<IsbnDbBookRaw> {
  // Basic sanitization — only allow digits and hyphens
  const sanitized = isbn.replace(/[^0-9X-]/gi, '');

  const response = await fetch(`${BASE_URL}/book/${encodeURIComponent(sanitized)}`, {
    headers: {
      Authorization: apiKey,
    },
  });

  if (response.status === 404) {
    throw new Error('Book not found in ISBNdb — check the ISBN and try again.');
  }
  if (!response.ok) {
    throw new Error(`ISBNdb error ${response.status}: ${response.statusText}`);
  }

  const data: { book: IsbnDbBookRaw } = await response.json();
  return data.book;
}
