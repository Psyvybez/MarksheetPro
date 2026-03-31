import { useMemo, useState } from 'react';
import type { StudentCard } from '../types';

interface StudentCardsModalProps {
  cards: StudentCard[];
  onAddCard: (input: Omit<StudentCard, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateCard: (cardId: string, updates: Partial<Omit<StudentCard, 'id' | 'createdAt'>>) => void;
  onDeleteCard: (cardId: string) => void;
  onClose: () => void;
}

interface CardFormState {
  studentName: string;
  cardNumber: string;
  gradeLevel: string;
  homeroom: string;
  notes: string;
  isActive: boolean;
}

const EMPTY_FORM: CardFormState = {
  studentName: '',
  cardNumber: '',
  gradeLevel: '',
  homeroom: '',
  notes: '',
  isActive: true,
};

export function StudentCardsModal({ cards, onAddCard, onUpdateCard, onDeleteCard, onClose }: StudentCardsModalProps) {
  const [query, setQuery] = useState('');
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [form, setForm] = useState<CardFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const sortedCards = useMemo(() => [...cards].sort((a, b) => a.studentName.localeCompare(b.studentName)), [cards]);

  const filteredCards = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedCards;

    return sortedCards.filter((card) => {
      return (
        card.studentName.toLowerCase().includes(q) ||
        card.cardNumber.toLowerCase().includes(q) ||
        (card.gradeLevel || '').toLowerCase().includes(q) ||
        (card.homeroom || '').toLowerCase().includes(q)
      );
    });
  }, [query, sortedCards]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingCardId(null);
    setError(null);
  };

  const handleEdit = (card: StudentCard) => {
    setEditingCardId(card.id);
    setForm({
      studentName: card.studentName,
      cardNumber: card.cardNumber,
      gradeLevel: card.gradeLevel || '',
      homeroom: card.homeroom || '',
      notes: card.notes || '',
      isActive: card.isActive,
    });
    setError(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const studentName = form.studentName.trim();
    const cardNumber = form.cardNumber.trim();
    if (!studentName || !cardNumber) {
      setError('Student name and card number are required.');
      return;
    }

    const duplicate = cards.find(
      (card) => card.cardNumber.toLowerCase() === cardNumber.toLowerCase() && card.id !== editingCardId
    );
    if (duplicate) {
      setError('Card number already exists.');
      return;
    }

    if (editingCardId) {
      onUpdateCard(editingCardId, {
        studentName,
        cardNumber,
        gradeLevel: form.gradeLevel,
        homeroom: form.homeroom,
        notes: form.notes,
        isActive: form.isActive,
      });
    } else {
      onAddCard({
        studentName,
        cardNumber,
        gradeLevel: form.gradeLevel,
        homeroom: form.homeroom,
        notes: form.notes,
        isActive: form.isActive,
      });
    }

    resetForm();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Student library cards">
      <div className="modal-sheet">
        <button className="modal-close-btn" onClick={onClose} aria-label="Close student cards">
          ✕
        </button>

        <h2 className="modal-title">Student Library Cards</h2>

        <div className="loan-toolbar" style={{ marginBottom: '0.75rem' }}>
          <input
            className="search-input"
            type="search"
            placeholder="Search by student, card number, grade, or homeroom"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search student cards"
          />
        </div>

        <form onSubmit={handleSubmit} className="checkout-form" style={{ marginBottom: '1rem' }}>
          <div className="manual-form-grid">
            <label className="manual-label" htmlFor="card-student-name">
              Student Name
            </label>
            <input
              id="card-student-name"
              className="checkout-input"
              type="text"
              value={form.studentName}
              onChange={(e) => setForm((prev) => ({ ...prev, studentName: e.target.value }))}
              placeholder="Student full name"
              maxLength={120}
              required
            />

            <label className="manual-label" htmlFor="card-number">
              Card Number
            </label>
            <input
              id="card-number"
              className="checkout-input"
              type="text"
              value={form.cardNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, cardNumber: e.target.value }))}
              placeholder="ex: LIB-10042"
              maxLength={40}
              required
            />

            <label className="manual-label" htmlFor="card-grade-level">
              Grade Level
            </label>
            <input
              id="card-grade-level"
              className="checkout-input"
              type="text"
              value={form.gradeLevel}
              onChange={(e) => setForm((prev) => ({ ...prev, gradeLevel: e.target.value }))}
              placeholder="ex: Grade 7"
              maxLength={30}
            />

            <label className="manual-label" htmlFor="card-homeroom">
              Homeroom
            </label>
            <input
              id="card-homeroom"
              className="checkout-input"
              type="text"
              value={form.homeroom}
              onChange={(e) => setForm((prev) => ({ ...prev, homeroom: e.target.value }))}
              placeholder="ex: 7A"
              maxLength={30}
            />

            <label className="manual-label" htmlFor="card-notes">
              Notes
            </label>
            <textarea
              id="card-notes"
              className="checkout-input manual-textarea"
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Optional notes"
              maxLength={240}
            />

            <label className="loan-overdue-toggle" style={{ marginTop: '0.25rem' }}>
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
              />
              <span>Card is active</span>
            </label>
          </div>

          {error && (
            <p className="settings-error" role="alert">
              {error}
            </p>
          )}

          <div className="checkout-form-btns" style={{ marginTop: '0.5rem' }}>
            {editingCardId && (
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                Cancel Edit
              </button>
            )}
            <button type="submit" className="btn btn-primary">
              {editingCardId ? 'Update Card' : 'Add Card'}
            </button>
          </div>
        </form>

        {filteredCards.length === 0 ? (
          <div className="empty-state" style={{ paddingTop: '1rem', paddingBottom: '1rem' }}>
            <span className="empty-icon">🪪</span>
            <h3>No cards found</h3>
            <p>Add your first student card to start managing borrower IDs.</p>
          </div>
        ) : (
          <ul className="loan-list">
            {filteredCards.map((card) => (
              <li key={card.id} className="loan-item">
                <div className="loan-item-info">
                  <span className="loan-item-title">
                    {card.studentName} {!card.isActive && <span style={{ color: '#dc2626' }}>(Inactive)</span>}
                  </span>
                  <span className="loan-item-meta">Card: {card.cardNumber}</span>
                  {(card.gradeLevel || card.homeroom) && (
                    <span className="loan-item-meta">
                      {[card.gradeLevel, card.homeroom].filter(Boolean).join(' • ')}
                    </span>
                  )}
                  {card.notes && <span className="loan-item-meta">{card.notes}</span>}
                </div>
                <div className="checkout-form-btns" style={{ width: 'auto' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => handleEdit(card)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      const confirmed = window.confirm(`Delete card for ${card.studentName}?`);
                      if (confirmed) onDeleteCard(card.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
