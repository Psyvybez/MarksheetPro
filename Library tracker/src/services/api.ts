import type { ManualBookInput } from '../hooks/useLibrary';

export async function fetchGoogleBooksMetadata(isbn: string): Promise<Partial<ManualBookInput> | null> {
  try {
    const response = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn)}`);
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.items || data.items.length === 0) return null;

    const vol = data.items[0].volumeInfo;

    let isbn10 = '';
    let isbn13 = '';
    if (vol.industryIdentifiers) {
      for (const id of vol.industryIdentifiers) {
        if (id.type === 'ISBN_10') isbn10 = id.identifier;
        if (id.type === 'ISBN_13') isbn13 = id.identifier;
      }
    }

    let datePublished = '';
    if (vol.publishedDate) {
      const parts = vol.publishedDate.split('-');
      const y = parts[0];
      const m = parts[1] ? parts[1].padStart(2, '0') : '01';
      const d = parts[2] ? parts[2].padStart(2, '0') : '01';
      if (y) datePublished = `${y}-${m}-${d}`;
    }

    return {
      title: vol.title || '',
      authors: vol.authors || [],
      publisher: vol.publisher || '',
      synopsis: vol.description || '',
      coverImage: vol.imageLinks?.thumbnail?.replace('http:', 'https:') || '',
      isbn: isbn10 || (isbn.length === 10 ? isbn : undefined),
      isbn13: isbn13 || (isbn.length === 13 || isbn.length > 10 ? isbn : undefined),
      searchTags: vol.categories || [],
      datePublished,
    };
  } catch (err) {
    console.error('Google Books API Error:', err);
    return null;
  }
}
