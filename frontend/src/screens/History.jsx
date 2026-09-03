import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api, formatNaira } from '../lib/api.js';

const FILTERS = ['All', 'Income', 'Transfers', 'Bills', 'Lifestyle', 'Shopping'];

function groupByDate(txs) {
  const groups = [];
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterdayStr = new Date(now.getTime() - 86400000).toDateString();

  const map = {};
  for (const tx of txs) {
    const d = new Date(tx.occurred_at);
    const key = d.toDateString();
    if (!map[key]) map[key] = { date: d, key, items: [] };
    map[key].items.push(tx);
  }

  for (const g of Object.values(map)) {
    if (g.key === todayStr) {
      g.label = 'Today';
    } else if (g.key === yesterdayStr) {
      g.label = 'Yesterday';
    } else {
      g.label = g.date.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' });
    }
    groups.push(g);
  }

  groups.sort((a, b) => b.date - a.date);
  return groups;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-NG', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function maskName(name) {
  return name;
}

function normalizeTransaction(tx) {
  const category = String(tx.category || '').toLowerCase();
  return {
    ...tx,
    category: category === 'income' || tx.direction === 'credit' ? 'Income'
      : category === 'transfers' || category === 'family' ? 'Transfers'
      : category === 'bills' ? 'Bills'
      : category === 'lifestyle' || category === 'entertainment' || category === 'transport' ? 'Lifestyle'
      : category === 'shopping' ? 'Shopping' : tx.category || 'Other',
    direction: tx.direction === 'credit' || tx.direction === 'inbound' ? 'inbound' : 'outbound',
    occurred_at: tx.occurred_at || tx.timestamp,
    narration: tx.narration || tx.category || 'Transaction',
  };
}

const CATEGORY_ICONS = {
  Income: IncomeIcon,
  Transport: TransportIcon,
  Family: FamilyIcon,
  Entertainment: EntertainmentIcon,
  Shopping: ShoppingIcon,
  Bills: BillsIcon,
  Lifestyle: LifestyleIcon,
};

export default function History() {
  const { token } = useAuth();
  const [rows, setRows] = useState([]);
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedTx, setSelectedTx] = useState(null);
  const [recatOpen, setRecatOpen] = useState(false);
  const detailRef = useRef(null);

  const load = useCallback(async () => {
    if (!token) {
      setRows([]);
      return;
    }
    try {
      const d = await api.transactions(token);
      const raw = d.transactions || [];
      setRows(raw.map(normalizeTransaction));
    } catch {
      setRows([]);
    }
  }, [token]);

  useEffect(() => {
    load();
    window.addEventListener('zuri_refresh', load);
    window.addEventListener('zuri_proactive_message', load);
    return () => {
      window.removeEventListener('zuri_refresh', load);
      window.removeEventListener('zuri_proactive_message', load);
    };
  }, [load]);

  const filtered = rows.filter((tx) => {
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Income') return tx.direction === 'inbound';
    if (activeFilter === 'Transfers') return tx.category === 'Transfers';
    if (activeFilter === 'Bills') return tx.category === 'Bills';
    if (activeFilter === 'Lifestyle') return tx.category === 'Lifestyle';
    if (activeFilter === 'Shopping') return tx.category === 'Shopping';
    return true;
  });

  const groups = groupByDate(filtered);

  function handleSelectTx(tx) {
    setSelectedTx((prev) => (prev?.id === tx.id ? null : tx));
    setRecatOpen(false);
  }

  const CatIcon = selectedTx ? CATEGORY_ICONS[selectedTx.category] || CategoryIcon : CategoryIcon;

  return (
    <div className="transactions-page">
      <div className="transactions-header">
        <div className="transactions-header-left">
          <h1 className="transactions-title">Transactions</h1>
          <p className="transactions-subtitle">Your latest activity.</p>
        </div>
        <button className="transactions-filter-btn">
          <FilterIcon />
          Filters
        </button>
      </div>

      <div className="transactions-filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`transactions-filter${activeFilter === f ? ' active' : ''}`}
            onClick={() => setActiveFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="transactions-layout">
        <div className="transactions-list">
          {groups.length === 0 && (
            <div className="transactions-empty">
              <div className="transactions-empty-icon">
                <ActivityIcon />
              </div>
              <p className="transactions-empty-title">No transactions</p>
              <p className="transactions-empty-text">Your activity will appear here.</p>
            </div>
          )}

          {groups.map((group) => (
            <div key={group.key} className="transactions-group">
              <div className="transactions-group-label">{group.label}</div>
              {group.items.map((tx) => (
                <div
                  key={tx.id}
                  className={`transactions-row${selectedTx?.id === tx.id ? ' selected' : ''}`}
                  onClick={() => handleSelectTx(tx)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectTx(tx); } }}
                >
                  <div className="transactions-row-icon-wrap">
                    <TxCategoryIcon category={tx.category} />
                  </div>

                  <div className="transactions-row-info">
                    <div className="transactions-row-name">{maskName(tx.counterparty_name)}</div>
                    <div className="transactions-row-meta">
                      <span className="transactions-row-narration">{tx.narration}</span>
                      <span className="transactions-row-dot">·</span>
                      <span className="transactions-row-time">{formatTime(tx.occurred_at)}</span>
                    </div>
                  </div>

                  <div className="transactions-row-right">
                    <span className={`transactions-row-amount ${tx.direction === 'inbound' ? 'inbound' : 'outbound'}`}>
                      {tx.direction === 'inbound' ? '+' : '-'} {formatNaira(tx.amount_kobo)}
                    </span>
                    <span className="transactions-row-chip">{tx.category}</span>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {selectedTx && (
          <div className="transactions-detail" ref={detailRef}>
            <div className="transactions-detail-header">
              <h2 className="transactions-detail-name">{selectedTx.counterparty_name}</h2>
              <button className="transactions-detail-close" onClick={() => { setSelectedTx(null); setRecatOpen(false); }} aria-label="Close">
                <CloseIcon />
              </button>
            </div>

            <div className="transactions-detail-body">
              <div className={`transactions-detail-amount ${selectedTx.direction === 'inbound' ? 'inbound' : 'outbound'}`}>
                {selectedTx.direction === 'inbound' ? '+' : '-'} {formatNaira(selectedTx.amount_kobo)}
              </div>

              <div className="transactions-detail-rows">
                <div className="transactions-detail-row">
                  <span className="transactions-detail-label">Date</span>
                  <span className="transactions-detail-value">
                    {new Date(selectedTx.occurred_at).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}, {formatTime(selectedTx.occurred_at)}
                  </span>
                </div>
                <div className="transactions-detail-row">
                  <span className="transactions-detail-label">Category</span>
                  <span className="transactions-detail-value">{selectedTx.category}</span>
                </div>
                <div className="transactions-detail-row">
                  <span className="transactions-detail-label">Status</span>
                  <span className="transactions-detail-value transactions-detail-settled">
                    <span className="transactions-detail-settled-dot" />
                    Settled
                  </span>
                </div>
              </div>

              <div className="transactions-detail-category-section">
                <div className="transactions-detail-section-header">
                  <span className="transactions-detail-section-label">Category</span>
                  <button
                    className="transactions-detail-recat-btn"
                    onClick={() => setRecatOpen(!recatOpen)}
                  >
                    Recategorise
                  </button>
                </div>
                {recatOpen ? (
                  <div className="transactions-detail-recat-options">
                    {['Income', 'Transport', 'Family', 'Entertainment', 'Shopping', 'Bills', 'Lifestyle'].map((c) => (
                      <button
                        key={c}
                        className={`transactions-detail-recat-option${selectedTx.category === c ? ' active' : ''}`}
                        onClick={() => { setRecatOpen(false); }}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="transactions-detail-current-cat">
                    <TxCategoryIcon category={selectedTx.category} />
                    <span>{selectedTx.category}</span>
                  </div>
                )}
              </div>

              <p className="transactions-detail-note">
                Zuri categorises transactions automatically. You can change a category when needed.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="transactions-cta">
        <div className="transactions-cta-content">
          <div className="transactions-cta-icon">
            <MicIcon />
          </div>
          <div className="transactions-cta-text">
            <h3 className="transactions-cta-title">Ask Zuri about your spending</h3>
            <p className="transactions-cta-desc">"How much did I spend on transport this month?"</p>
          </div>
        </div>
        <button className="transactions-cta-mic" aria-label="Ask Zuri">
          <MicIcon />
        </button>
      </div>
    </div>
  );
}

function TxCategoryIcon({ category }) {
  const icons = {
    Income: { bg: 'var(--dash-accent-light)', color: 'var(--dash-accent)', Icon: IncomeIcon },
    Transport: { bg: 'var(--dash-bg)', color: 'var(--dash-text-secondary)', Icon: TransportIcon },
    Family: { bg: 'var(--dash-accent-light)', color: 'var(--dash-accent)', Icon: FamilyIcon },
    Entertainment: { bg: 'var(--dash-bg)', color: 'var(--dash-text-secondary)', Icon: EntertainmentIcon },
    Shopping: { bg: 'var(--dash-bg)', color: 'var(--dash-text-secondary)', Icon: ShoppingIcon },
    Bills: { bg: 'var(--dash-bg)', color: 'var(--dash-text-secondary)', Icon: BillsIcon },
    Lifestyle: { bg: 'var(--dash-bg)', color: 'var(--dash-text-secondary)', Icon: LifestyleIcon },
  };
  const { bg, color, Icon } = icons[category] || { bg: 'var(--dash-bg)', color: 'var(--dash-text-secondary)', Icon: CategoryIcon };
  return (
    <div className="transactions-cat-icon" style={{ background: bg, color }}>
      <Icon />
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="1" width="6" height="11" rx="3" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function CategoryIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
    </svg>
  );
}

function IncomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function TransportIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" rx="2" />
      <path d="M16 8h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="13.5" cy="18.5" r="2.5" />
    </svg>
  );
}

function FamilyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function EntertainmentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" />
      <polygon points="10 8 16 12 10 16 10 8" />
    </svg>
  );
}

function ShoppingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  );
}

function BillsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function LifestyleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
