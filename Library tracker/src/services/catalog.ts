export interface CatalogBook {
  isbn: string;
  isbn13: string;
  title: string;
  authors: string[];
  publisher: string;
  category?: string;
  genre?: string;
  age?: string;
  binding?: string;
  conditionCoverBindingIntegrity?: string;
  conditionPageQuality?: string;
  conditionOverallAppearance?: string;
  coverImage: string;
  synopsis: string;
  searchTags: string[];
  datePublished: string;
}

const CATALOG: CatalogBook[] = [
  {
    isbn: '0061120081',
    isbn13: '9780061120084',
    title: 'To Kill a Mockingbird',
    authors: ['Harper Lee'],
    publisher: 'Harper Perennial Modern Classics',
    coverImage: '',
    synopsis: 'A classic coming-of-age story centered on justice, empathy, and moral courage.',
    searchTags: ['Fiction', 'Classics'],
    datePublished: '2006-05-23',
  },
  {
    isbn: '0743273567',
    isbn13: '9780743273565',
    title: 'The Great Gatsby',
    authors: ['F. Scott Fitzgerald'],
    publisher: 'Scribner',
    coverImage: '',
    synopsis: 'A portrait of ambition, wealth, and illusion in the Jazz Age.',
    searchTags: ['Fiction', 'Classics'],
    datePublished: '2004-09-30',
  },
  {
    isbn: '0141439513',
    isbn13: '9780141439518',
    title: 'Pride and Prejudice',
    authors: ['Jane Austen'],
    publisher: 'Penguin Classics',
    coverImage: '',
    synopsis: 'A witty and enduring novel about love, family, and social expectations.',
    searchTags: ['Fiction', 'Classics', 'Romance'],
    datePublished: '2002-12-31',
  },
  {
    isbn: '0439708184',
    isbn13: '9780439708180',
    title: 'Harry Potter and the Sorcerer\'s Stone',
    authors: ['J.K. Rowling'],
    publisher: 'Scholastic',
    coverImage: '',
    synopsis: 'A young wizard discovers friendship, courage, and magic at Hogwarts.',
    searchTags: ['Fantasy', 'Young Adult'],
    datePublished: '1998-09-01',
  },
  {
    isbn: '0618640150',
    isbn13: '9780618640157',
    title: 'The Hobbit',
    authors: ['J.R.R. Tolkien'],
    publisher: 'Mariner Books',
    coverImage: '',
    synopsis: 'Bilbo Baggins sets out on an unexpected adventure across Middle-earth.',
    searchTags: ['Fantasy', 'Classics'],
    datePublished: '2006-09-18',
  },
  {
    isbn: '0307474275',
    isbn13: '9780307474278',
    title: 'The Hunger Games',
    authors: ['Suzanne Collins'],
    publisher: 'Scholastic Press',
    coverImage: '',
    synopsis: 'A dystopian survival story where one girl challenges a brutal system.',
    searchTags: ['Young Adult', 'Science Fiction'],
    datePublished: '2010-07-03',
  },
  {
    isbn: '0064400557',
    isbn13: '9780064400558',
    title: 'Charlotte\'s Web',
    authors: ['E.B. White'],
    publisher: 'HarperCollins',
    coverImage: '',
    synopsis: 'A friendship between a pig and a spider teaches empathy and kindness.',
    searchTags: ['Children', 'Classics'],
    datePublished: '2001-10-02',
  },
  {
    isbn: '0545010225',
    isbn13: '9780545010221',
    title: 'Harry Potter and the Deathly Hallows',
    authors: ['J.K. Rowling'],
    publisher: 'Scholastic',
    coverImage: '',
    synopsis: 'The final battle against dark forces brings Harry\'s journey to its climax.',
    searchTags: ['Fantasy', 'Young Adult'],
    datePublished: '2009-07-07',
  },
  {
    isbn: '0316769487',
    isbn13: '9780316769488',
    title: 'The Catcher in the Rye',
    authors: ['J.D. Salinger'],
    publisher: 'Little, Brown and Company',
    coverImage: '',
    synopsis: 'A teenager\'s voice captures alienation and vulnerability in postwar America.',
    searchTags: ['Fiction', 'Classics'],
    datePublished: '2001-01-30',
  },
  {
    isbn: '1524763136',
    isbn13: '9781524763138',
    title: 'Becoming',
    authors: ['Michelle Obama'],
    publisher: 'Crown',
    coverImage: '',
    synopsis: 'A memoir reflecting on family, service, and finding one\'s voice.',
    searchTags: ['Biography', 'Memoir'],
    datePublished: '2018-11-13',
  },
];

function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9X]/gi, '').toUpperCase();
}

export function lookupCatalogBook(isbn: string): CatalogBook | null {
  const normalizedInput = normalizeIsbn(isbn);
  if (!normalizedInput) return null;

  const match = CATALOG.find((book) => {
    const isbn10 = normalizeIsbn(book.isbn);
    const isbn13 = normalizeIsbn(book.isbn13);
    return normalizedInput === isbn10 || normalizedInput === isbn13;
  });

  return match ?? null;
}
