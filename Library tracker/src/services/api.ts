import type { ManualBookInput } from '../hooks/useLibrary';

function normalizePublishedDate(value?: string): string {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year) return '';
  const safeMonth = month ? month.padStart(2, '0') : '01';
  const safeDay = day ? day.padStart(2, '0') : '01';
  return `${year}-${safeMonth}-${safeDay}`;
}

export async function fetchGoogleBooksMetadata(
  isbn: string,
  apiKey?: string
): Promise<Partial<ManualBookInput> | null> {
  try {
    const buildLookupUrl = (includeKey: boolean) => {
      const url = new URL('https://www.googleapis.com/books/v1/volumes');
      url.searchParams.set('q', `isbn:${isbn}`);
      if (includeKey && apiKey) {
        url.searchParams.set('key', apiKey);
      }
      return url.toString();
    };

    let response = await fetch(buildLookupUrl(Boolean(apiKey)));
    if (!response.ok && apiKey) {
      // If the configured key is restricted or over quota, retry anonymously.
      response = await fetch(buildLookupUrl(false));
    }

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!data.items || data.items.length === 0) return null;

    const volumeInfo = data.items[0].volumeInfo;

    let isbn10 = '';
    let isbn13 = '';
    if (Array.isArray(volumeInfo.industryIdentifiers)) {
      for (const id of volumeInfo.industryIdentifiers) {
        if (id.type === 'ISBN_10') isbn10 = id.identifier;
        if (id.type === 'ISBN_13') isbn13 = id.identifier;
      }
    }

    return {
      title: volumeInfo.title || '',
      authors: volumeInfo.authors || [],
      publisher: volumeInfo.publisher || '',
      synopsis: volumeInfo.description || '',
      coverImage: volumeInfo.imageLinks?.thumbnail?.replace('http:', 'https:') || '',
      isbn: isbn10 || (isbn.length === 10 ? isbn : undefined),
      isbn13: isbn13 || (isbn.length >= 13 ? isbn : undefined),
      searchTags: volumeInfo.categories || [],
      datePublished: normalizePublishedDate(volumeInfo.publishedDate),
    };
  } catch (err) {
    console.error('Google Books API Error:', err);
    return null;
  }
}
