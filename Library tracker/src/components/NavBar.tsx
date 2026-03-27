import type { AppView } from '../types';

interface NavBarProps {
  currentView: AppView;
  onChange: (view: AppView) => void;
}

const TABS: { view: AppView; label: string; icon: string }[] = [
  { view: 'dashboard', label: 'Home', icon: '🏠' },
  { view: 'scanner', label: 'Scan', icon: '📷' },
  { view: 'library', label: 'Library', icon: '📚' },
];

export function NavBar({ currentView, onChange }: NavBarProps) {
  return (
    <nav className="nav-bar" role="navigation" aria-label="Main navigation">
      {TABS.map(({ view, label, icon }) => (
        <button
          key={view}
          className={`nav-tab ${currentView === view ? 'active' : ''}`}
          onClick={() => onChange(view)}
          aria-label={label}
          aria-current={currentView === view ? 'page' : undefined}
        >
          <span className="nav-icon">{icon}</span>
          <span className="nav-label">{label}</span>
        </button>
      ))}
    </nav>
  );
}
