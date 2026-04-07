import { useMemo, useState } from 'react';
import type { ReservationActivity } from '../types';

interface ReservationActivityModalProps {
  activities: ReservationActivity[];
  onClose: () => void;
}

export function ReservationActivityModal({ activities, onClose }: ReservationActivityModalProps) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ReservationActivity['type']>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activities.filter((item) => {
      const matchesType = typeFilter === 'all' || item.type === typeFilter;
      const searchable =
        `${item.studentName} ${item.studentCardNumber} ${item.bookTitle ?? ''} ${item.bookIsbn ?? ''}`.toLowerCase();
      const matchesQuery = !q || searchable.includes(q);
      return matchesType && matchesQuery;
    });
  }, [activities, query, typeFilter]);

  const typeLabel = (type: ReservationActivity['type']) => {
    if (type === 'sign-in') return 'Sign In';
    if (type === 'view') return 'View';
    if (type === 'reserve') return 'Reserve';
    return 'Auto Assigned';
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Reservation activity">
      <div className="modal-sheet">
        <button className="modal-close-btn" onClick={onClose} aria-label="Close reservation activity">
          ✕
        </button>

        <h2 className="modal-title">Reservation Activity</h2>

        <div className="loan-toolbar">
          <input
            className="search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by student, card, title, or ISBN"
            aria-label="Search reservation activity"
          />
          <select
            className="search-input library-select"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value as 'all' | ReservationActivity['type'])}
            aria-label="Filter reservation activity"
          >
            <option value="all">All Activity Types</option>
            <option value="sign-in">Sign In</option>
            <option value="view">View</option>
            <option value="reserve">Reserve</option>
            <option value="auto-assigned">Auto Assigned</option>
          </select>
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state" style={{ paddingTop: '1rem', paddingBottom: '1rem' }}>
            <span className="empty-icon">🧾</span>
            <h3>No reservation activity</h3>
            <p>Student sign-ins, catalog views, and reservations will appear here.</p>
          </div>
        ) : (
          <ul className="loan-list">
            {filtered.map((item) => (
              <li key={item.id} className="loan-item">
                <div className="loan-item-info">
                  <span className="loan-item-title">{typeLabel(item.type)}</span>
                  <span className="loan-item-meta">
                    {item.studentName} • {item.studentCardNumber}
                  </span>
                  <span className="loan-item-meta">
                    {item.bookTitle
                      ? `${item.bookTitle}${item.bookIsbn ? ` • ${item.bookIsbn}` : ''}`
                      : 'No book attached'}
                  </span>
                  <span className="loan-item-meta">{new Date(item.at).toLocaleString()}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
