import { useMemo, useState } from 'react';
import type { StudentCard } from '../types';
import { DigitalCardViewer } from './DigitalCardViewer';

interface StudentCardsModalProps {
  cards: StudentCard[];
  onAddCard: (input: Omit<StudentCard, 'id' | 'cardNumber' | 'createdAt' | 'updatedAt'>) => void;
  onUpdateCard: (cardId: string, updates: Partial<Omit<StudentCard, 'id' | 'createdAt'>>) => void;
  onDeleteCard: (cardId: string) => void;
  onClose: () => void;
}

interface CardFormState {
  studentName: string;
  notes: string;
  isActive: boolean;
}

const EMPTY_FORM: CardFormState = {
  studentName: '',
  notes: '',
  isActive: true,
};

export function StudentCardsModal({ cards, onAddCard, onUpdateCard, onDeleteCard, onClose }: StudentCardsModalProps) {
  const [query, setQuery] = useState('');
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [viewingCardId, setViewingCardId] = useState<string | null>(null);
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
        (card.notes || '').toLowerCase().includes(q)
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
      notes: card.notes || '',
      isActive: card.isActive,
    });
    setError(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const studentName = form.studentName.trim();
    if (!studentName) {
      setError('Student name is required.');
      return;
    }

    if (editingCardId) {
      onUpdateCard(editingCardId, {
        studentName,
        notes: form.notes,
        isActive: form.isActive,
      });
    } else {
      onAddCard({
        studentName,
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
            placeholder="Search by student, card number, or notes"
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

            <p className="settings-hint">Card number is auto-generated when adding a new student card.</p>

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
                  {card.notes && <span className="loan-item-meta">{card.notes}</span>}
                </div>
                <div className="checkout-form-btns" style={{ width: 'auto' }}>
                  <button type="button" className="btn btn-primary" onClick={() => setViewingCardId(card.id)}>
                    Generate
                  </button>
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

      {viewingCardId && (
        <DigitalCardViewer
          card={cards.find((c) => c.id === viewingCardId)!}
          onClose={() => setViewingCardId(null)}
        />
      )}
    </div>
  );
}
