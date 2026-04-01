import type { ManualBookInput } from '../hooks/useLibrary';

interface GoogleVolumeInfo {
  title?: string;
  authors?: string[];
  publisher?: string;
  description?: string;
  publishedDate?: string;
  categories?: string[];
  industryIdentifiers?: Array<{ type?: string; identifier?: string }>;
  imageLinks?: {
    smallThumbnail?: string;
    thumbnail?: string;
    small?: string;
    medium?: string;
    large?: string;
    extraLarge?: string;
  };
}

function normalizePublishedDate(value?: string): string {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  if (!year) return '';
  const safeMonth = month ? month.padStart(2, '0') : '01';
  const safeDay = day ? day.padStart(2, '0') : '01';
  return `${year}-${safeMonth}-${safeDay}`;
}

function toHttps(url?: string): string {
  if (!url) return '';
  return url.replace('http:', 'https:');
}

function getBestGoogleCoverImage(volumeInfo: GoogleVolumeInfo): string {
  const links = volumeInfo.imageLinks;
  if (!links) return '';

  return (
    toHttps(links.extraLarge) ||
    toHttps(links.large) ||
    toHttps(links.medium) ||
    toHttps(links.small) ||
    toHttps(links.thumbnail) ||
    toHttps(links.smallThumbnail) ||
    ''
  );
}

async function fetchOpenLibraryCover(isbnCandidates: string[]): Promise<string> {
  for (const isbn of isbnCandidates) {
    const normalized = isbn.trim();
    if (!normalized) continue;

    try {
      const url = new URL('https://openlibrary.org/api/books');
      url.searchParams.set('bibkeys', `ISBN:${normalized}`);
      url.searchParams.set('format', 'json');
      url.searchParams.set('jscmd', 'data');

      const response = await fetch(url.toString());
      if (!response.ok) continue;

      const data = (await response.json()) as Record<string, { cover?: Record<string, string> }>;
      const item = data[`ISBN:${normalized}`];
      if (!item?.cover) continue;

      const cover = item.cover.large || item.cover.medium || item.cover.small;
      if (cover) return toHttps(cover);
    } catch {
      // Ignore Open Library lookup errors and continue to next candidate.
    }
  }

  return '';
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

    const volumeInfo = data.items[0].volumeInfo as GoogleVolumeInfo;

    let isbn10 = '';
    let isbn13 = '';
    if (Array.isArray(volumeInfo.industryIdentifiers)) {
      for (const id of volumeInfo.industryIdentifiers) {
        if (id.type === 'ISBN_10' && id.identifier) isbn10 = id.identifier;
        if (id.type === 'ISBN_13' && id.identifier) isbn13 = id.identifier;
      }
    }

    const googleCoverImage = getBestGoogleCoverImage(volumeInfo);
    const fallbackCoverImage = googleCoverImage
      ? ''
      : await fetchOpenLibraryCover([isbn13 || '', isbn10 || '', isbn].filter(Boolean));

    return {
      title: volumeInfo.title || '',
      authors: volumeInfo.authors || [],
      publisher: volumeInfo.publisher || '',
      synopsis: volumeInfo.description || '',
      coverImage: googleCoverImage || fallbackCoverImage,
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
