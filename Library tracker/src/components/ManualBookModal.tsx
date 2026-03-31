import { useEffect, useMemo, useState } from 'react';
import type { ManualBookInput } from '../hooks/useLibrary';
import type { Book } from '../types';

const CATEGORY_OPTIONS = [
  'Biography',
  'Comics/Graphic Novel',
  'Fiction',
  'Magazine',
  'Non-Fiction',
  'Other',
  'Poetry',
  'Reference',
  'Textbook',
];

const GENRE_OPTIONS = [
  'Adventure',
  'Children',
  'Drama',
  'Fantasy',
  'Historical',
  'Horror',
  'Humor',
  'Mystery',
  'Other',
  'Romance',
  'Science Fiction',
  'Thriller',
  'Young Adult',
];

const BINDING_OPTIONS = ['Hardcover', 'Paperback', 'Spiral', 'Board Book', 'Digital/Printout', 'Other'];

const CONDITION_OPTIONS = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor', 'Damaged'];

const AGE_OPTIONS = [
  "Children's (0-5)",
  'Early Readers (6-8)',
  'Middle Grade (9-12)',
  'Teen (13-15)',
  'Young Adult (16+)',
  'Adult',
  'All Ages',
];

const MONTH_OPTIONS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR - 1899 }, (_, i) => String(CURRENT_YEAR - i));

function getDaysInMonth(year: string, month: string): number {
  if (!year || !month) return 31;
  return new Date(Number(year), Number(month), 0).getDate();
}

interface ManualBookModalProps {
  initialData?: Partial<ManualBookInput>;
  existingBooks: Book[];
  onSave: (input: ManualBookInput) => void;
  onClose: () => void;
}

function normalizeIsbn(value: string): string {
  return value.replace(/[^0-9X]/gi, '').toUpperCase();
}

export function ManualBookModal({ initialData, existingBooks, onSave, onClose }: ManualBookModalProps) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [authors, setAuthors] = useState(initialData?.authors?.join(', ') || '');
  const [publisher, setPublisher] = useState(initialData?.publisher || '');
  const [category, setCategory] = useState(initialData?.category || '');
  const [genre, setGenre] = useState(initialData?.genre || '');
  const [age, setAge] = useState(initialData?.age || '');
  const [binding, setBinding] = useState(initialData?.binding || '');
  const [conditionCoverBindingIntegrity, setConditionCoverBindingIntegrity] = useState(initialData?.conditionCoverBindingIntegrity || '');
  const [conditionPageQuality, setConditionPageQuality] = useState(initialData?.conditionPageQuality || '');
  const [conditionOverallAppearance, setConditionOverallAppearance] = useState(initialData?.conditionOverallAppearance || '');
  const [isbn, setIsbn] = useState(initialData?.isbn || '');
  const [isbn13, setIsbn13] = useState(initialData?.isbn13 || '');
  const [searchTags, setSearchTags] = useState(initialData?.searchTags?.join(', ') || '');
  
  const initialDate = initialData?.datePublished || '';
  const [publishedYear, setPublishedYear] = useState(initialDate.split('-')[0] || '');
  const [publishedMonth, setPublishedMonth] = useState(initialDate.split('-')[1] || '');
  const [publishedDay, setPublishedDay] = useState(initialDate.split('-')[2] || '');
  
  const [synopsis, setSynopsis] = useState(initialData?.synopsis || '');
  const [copies, setCopies] = useState(String(initialData?.copies || '1'));
  const [coverImage] = useState(initialData?.coverImage || '');
  const [duplicateConfirmed, setDuplicateConfirmed] = useState(false);

  const duplicateMatch = useMemo(() => {
    const candidate10 = normalizeIsbn(isbn);
    const candidate13 = normalizeIsbn(isbn13);
    if (!candidate10 && !candidate13) return null;

    return (
      existingBooks.find((book) => {
        const book10 = normalizeIsbn(book.isbn);
        const book13 = normalizeIsbn(book.isbn13);
        return (
          (candidate10 && (candidate10 === book10 || candidate10 === book13)) ||
          (candidate13 && (candidate13 === book10 || candidate13 === book13))
        );
      }) ?? null
    );
  }, [isbn, isbn13, existingBooks]);

  useEffect(() => {
    setDuplicateConfirmed(false);
  }, [isbn, isbn13, title]);

  const dayCount = getDaysInMonth(publishedYear, publishedMonth);
  const dayOptions = Array.from({ length: dayCount }, (_, i) => String(i + 1).padStart(2, '0'));

  const datePublished =
    publishedYear && publishedMonth && publishedDay ? `${publishedYear}-${publishedMonth}-${publishedDay}` : '';

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    if (duplicateMatch && !duplicateConfirmed) {
      setDuplicateConfirmed(true);
      return;
    }

    const payload: ManualBookInput = {
      title,
      authors: authors
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      publisher,
      category,
      genre,
      age,
      binding,
      conditionCoverBindingIntegrity,
      conditionPageQuality,
      conditionOverallAppearance,
      isbn,
      isbn13,
      coverImage,
      searchTags: searchTags
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
      datePublished,
      synopsis,
      copies: Number(copies) || 1,
    };

    onSave(payload);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Add a book manually">
      <div className="modal-sheet">
        <button className="modal-close-btn" onClick={onClose} aria-label="Close manual add form">
          ✕
        </button>
        <h2 className="modal-title">Add Book Manually</h2>

        <form className="manual-form" onSubmit={handleSubmit}>
          {duplicateMatch && (
            <div className={`duplicate-warning ${duplicateConfirmed ? 'confirmed' : ''}`} role="alert">
              <strong>Duplicate ISBN detected:</strong> this ISBN already exists for "{duplicateMatch.title}".
              {duplicateConfirmed ? ' Saving will merge copies into that existing record.' : ' Press save again to confirm merge.'}
            </div>
          )}

          <div className="manual-form-grid">
            <label className="manual-label" htmlFor="manual-title">
              Title *
            </label>
            <input
              id="manual-title"
              className="checkout-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Book title"
              required
            />

            <label className="manual-label" htmlFor="manual-authors">
              Authors
            </label>
            <input
              id="manual-authors"
              className="checkout-input"
              value={authors}
              onChange={(e) => setAuthors(e.target.value)}
              placeholder="Comma-separated names"
            />

            <label className="manual-label" htmlFor="manual-publisher">
              Publisher
            </label>
            <input
              id="manual-publisher"
              className="checkout-input"
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              placeholder="Publisher"
            />

            <label className="manual-label" htmlFor="manual-category">
              Category
            </label>
            <select
              id="manual-category"
              className="checkout-input"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Select category</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <label className="manual-label" htmlFor="manual-genre">
              Genre
            </label>
            <select
              id="manual-genre"
              className="checkout-input"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            >
              <option value="">Select genre</option>
              {GENRE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <label className="manual-label" htmlFor="manual-age">
              Age
            </label>
            <select
              id="manual-age"
              className="checkout-input"
              value={age}
              onChange={(e) => setAge(e.target.value)}
            >
              <option value="">Select age range</option>
              {AGE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <label className="manual-label" htmlFor="manual-binding">
              Binding
            </label>
            <select
              id="manual-binding"
              className="checkout-input"
              value={binding}
              onChange={(e) => setBinding(e.target.value)}
            >
              <option value="">Select binding</option>
              {BINDING_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <label className="manual-label" htmlFor="manual-isbn">
              ISBN-10
            </label>
            <input
              id="manual-isbn"
              className="checkout-input"
              value={isbn}
              onChange={(e) => setIsbn(e.target.value)}
              placeholder="e.g. 0439708184"
            />

            <label className="manual-label" htmlFor="manual-isbn13">
              ISBN-13
            </label>
            <input
              id="manual-isbn13"
              className="checkout-input"
              value={isbn13}
              onChange={(e) => setIsbn13(e.target.value)}
              placeholder="e.g. 9780439708180"
            />

            <label className="manual-label" htmlFor="manual-copies">
              Copies
            </label>
            <input
              id="manual-copies"
              className="checkout-input"
              type="number"
              min={1}
              max={50}
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
            />

            <label className="manual-label" htmlFor="manual-search-tags">
              Search Tags
            </label>
            <input
              id="manual-search-tags"
              className="checkout-input"
              value={searchTags}
              onChange={(e) => setSearchTags(e.target.value)}
              placeholder="Comma-separated search tags"
            />

            <label className="manual-label" htmlFor="manual-date">
              Publish Date
            </label>
            <div id="manual-date" className="manual-date-row" role="group" aria-label="Publish Date">
              <select
                className="checkout-input"
                value={publishedMonth}
                onChange={(e) => {
                  setPublishedMonth(e.target.value);
                  if (publishedDay && Number(publishedDay) > getDaysInMonth(publishedYear, e.target.value)) {
                    setPublishedDay('');
                  }
                }}
              >
                <option value="">Month</option>
                {MONTH_OPTIONS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>

              <select className="checkout-input" value={publishedDay} onChange={(e) => setPublishedDay(e.target.value)}>
                <option value="">Day</option>
                {dayOptions.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>

              <select
                className="checkout-input"
                value={publishedYear}
                onChange={(e) => {
                  setPublishedYear(e.target.value);
                  if (publishedDay && Number(publishedDay) > getDaysInMonth(e.target.value, publishedMonth)) {
                    setPublishedDay('');
                  }
                }}
              >
                <option value="">Year</option>
                {YEAR_OPTIONS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <label className="manual-label" htmlFor="manual-synopsis">
              Synopsis
            </label>
            <textarea
              id="manual-synopsis"
              className="checkout-input manual-textarea"
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="Optional short description"
            />

            <label className="manual-label" htmlFor="manual-cover-condition">
              Condition of the Book [Cover/Binding Integrity]
            </label>
            <select
              id="manual-cover-condition"
              className="checkout-input"
              value={conditionCoverBindingIntegrity}
              onChange={(e) => setConditionCoverBindingIntegrity(e.target.value)}
            >
              <option value="">Select condition</option>
              {CONDITION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <label className="manual-label" htmlFor="manual-page-condition">
              Condition of the Book [Page Quality (Tears, Stains)]
            </label>
            <select
              id="manual-page-condition"
              className="checkout-input"
              value={conditionPageQuality}
              onChange={(e) => setConditionPageQuality(e.target.value)}
            >
              <option value="">Select condition</option>
              {CONDITION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <label className="manual-label" htmlFor="manual-overall-condition">
              Condition of the Book [Overall Appearance]
            </label>
            <select
              id="manual-overall-condition"
              className="checkout-input"
              value={conditionOverallAppearance}
              onChange={(e) => setConditionOverallAppearance(e.target.value)}
            >
              <option value="">Select condition</option>
              {CONDITION_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="modal-actions" style={{ marginTop: '1rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={!title.trim()}>
              {duplicateMatch && duplicateConfirmed ? 'Save and Merge Copies' : 'Save Book'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
