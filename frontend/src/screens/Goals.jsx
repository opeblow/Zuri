import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api, handleAuthError } from '../lib/api.js';
import PinModal from '../components/PinModal.jsx';

function enrichGoal(g) {
  const pct = g.target_amount_kobo
    ? Math.round(((g.current_amount_kobo || 0) / g.target_amount_kobo) * 100)
    : 0;
  return {
    ...g,
    progress_pct: pct,
    target_display: g.target_display || '\u20a6' + Number(g.target_amount_kobo / 100).toLocaleString(),
    current_display: g.current_display || '\u20a6' + Number((g.current_amount_kobo || 0) / 100).toLocaleString(),
    recurring_display: g.recurring_display || '\u20a6' + Number((g.recurring_amount_kobo || 0) / 100).toLocaleString(),
  };
}

export default function Goals() {
  const { token } = useAuth();
  const [goals, setGoals] = useState([]);
  const [activeTab, setActiveTab] = useState('active');
  const [selectedGoal, setSelectedGoal] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [manageGoal, setManageGoal] = useState(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [amountInput, setAmountInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [recurringInput, setRecurringInput] = useState('');
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [plannerTarget, setPlannerTarget] = useState('');
  const [plannerAmount, setPlannerAmount] = useState('');
  const [plannerMonths, setPlannerMonths] = useState('12');

  useEffect(() => {
    loadGoals();
  }, [token]);

  async function loadGoals() {
    if (!token) {
      setGoals([]);
      return;
    }
    try {
      const d = await api.goals(token);
      const raw = d.goals || [];
      if (raw.length) {
        setGoals(raw.map(enrichGoal));
      } else {
        setGoals([]);
      }
    } catch {
      setGoals([]);
    }
  }

  function requirePin(actionFn) {
    setPendingAction(() => actionFn);
    setPinOpen(true);
  }

  async function handlePinSubmit(pin) {
    setPinOpen(false);
    setLoading(true);
    setErrorMsg('');
    try {
      if (pendingAction) await pendingAction(pin);
      await loadGoals();
      setManageGoal(null);
      setCreateOpen(false);
    } catch (err) {
      setErrorMsg(err.message || 'Action failed');
    } finally {
      setLoading(false);
    }
  }

  function handleCreateGoal(pin) {
    return api.createGoal(token, {
      name: nameInput,
      target_amount_kobo: parseInt(targetInput, 10) * 100,
      target_date: dateInput || '2026-12-31',
      recurring_amount_kobo: parseInt(recurringInput || '0', 10) * 100,
      pin,
    });
  }

  function handleManageGoal(pin) {
    const amountKobo = parseInt(amountInput, 10) * 100;
    if (manageGoal.mode === 'deposit') {
      return api.depositGoal(token, manageGoal.id, { amount_kobo: amountKobo, pin });
    } else if (manageGoal.mode === 'withdraw') {
      return api.withdrawGoal(token, manageGoal.id, { amount_kobo: amountInput === 'ALL' ? 'ALL' : amountKobo, pin });
    } else if (manageGoal.mode === 'auto-debit' || manageGoal.mode === 'edit') {
      return api.patchGoal(token, manageGoal.id, {
        name: nameInput || undefined,
        target_amount_kobo: targetInput ? parseInt(targetInput, 10) * 100 : undefined,
        recurring_amount_kobo: recurringInput ? parseInt(recurringInput, 10) * 100 : undefined,
        pin,
      });
    }
  }

  function openCreate() {
    setNameInput('');
    setTargetInput('');
    setDateInput('');
    setRecurringInput('');
    setCreateOpen(true);
  }

  function openPlanner() {
    setPlannerTarget('');
    setPlannerAmount('');
    setPlannerMonths('12');
    setPlannerOpen(true);
  }

  function applyPlan() {
    const amount = Number(plannerAmount);
    const months = Number(plannerMonths);
    if (!plannerTarget.trim() || !amount || amount <= 0 || !months || months <= 0) return;
    setNameInput(plannerTarget.trim());
    setTargetInput(String(amount));
    setRecurringInput(String(Math.ceil(amount / months)));
    setDateInput('');
    setPlannerOpen(false);
    setCreateOpen(true);
  }

  function openManage(g, mode) {
    setManageGoal({ id: g.id, name: g.name, mode });
    setAmountInput('');
    if (mode === 'edit') {
      setNameInput(g.name);
      setTargetInput(g.target_amount_kobo ? String(g.target_amount_kobo / 100) : '');
    } else if (mode === 'auto-debit') {
      setRecurringInput(g.recurring_amount_kobo ? String(g.recurring_amount_kobo / 100) : '');
    }
  }

  const filtered = goals.filter((g) => {
    if (activeTab === 'active') return g.status === 'active';
    return g.status !== 'active';
  });

  const handleSelectGoal = useCallback((g) => {
    setSelectedGoal((prev) => (prev?.id === g.id ? null : g));
  }, []);

  return (
    <div className="goals-page">
      <div className="goals-header">
        <div className="goals-header-left">
          <h1 className="goals-title">Goals</h1>
          <p className="goals-subtitle">Plan ahead. Zuri will help you stay on track.</p>
        </div>
        <button className="btn btn-primary goals-new-btn" onClick={openCreate} disabled={loading}>
          <PlusIcon />
          New goal
        </button>
      </div>

      {errorMsg && <p className="error" style={{ marginBottom: 16 }}>{errorMsg}</p>}

      <div className="goals-tabs">
        <button
          className={`goals-tab${activeTab === 'active' ? ' active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          Active
          <span className="goals-tab-count">{goals.filter((g) => g.status === 'active').length}</span>
        </button>
        <button
          className={`goals-tab${activeTab === 'completed' ? ' active' : ''}`}
          onClick={() => setActiveTab('completed')}
        >
          Completed
          <span className="goals-tab-count">{goals.filter((g) => g.status !== 'active').length}</span>
        </button>
      </div>

      <div className="goals-layout">
        <div className="goals-list">
          {filtered.length === 0 && (
            <div className="goals-empty">
              <div className="goals-empty-icon">
                <GoalBullseyeIcon />
              </div>
              <p className="goals-empty-title">No {activeTab} goals</p>
              <p className="goals-empty-text">
                {activeTab === 'active'
                  ? 'Create a goal to start saving with purpose.'
                  : 'Completed goals will appear here.'}
              </p>
            </div>
          )}

          {filtered.map((g, i) => (
            <GoalCard
              key={g.id}
              goal={g}
              isSelected={selectedGoal?.id === g.id}
              isPrimary={i === 0 && activeTab === 'active'}
              onSelect={() => handleSelectGoal(g)}
              onManage={() => openManage(g, 'deposit')}
            />
          ))}
        </div>

        {selectedGoal && (
          <GoalDetailPanel
            goal={selectedGoal}
            onClose={() => setSelectedGoal(null)}
            onPauseGoal={() => {
              if (token) {
                requirePin((pin) => api.patchGoal(token, selectedGoal.id, { status: 'paused', pin }));
              }
            }}
          />
        )}
      </div>

      <div className="goals-cta">
        <div className="goals-cta-content">
          <div className="goals-cta-icon">
            <ZuriSparkIcon />
          </div>
          <div className="goals-cta-text">
            <h3 className="goals-cta-title">Let Zuri build a plan for you</h3>
            <p className="goals-cta-desc">Tell Zuri what you're saving for and when you need it.</p>
          </div>
        </div>
        <button className="btn btn-primary goals-cta-btn" onClick={openPlanner}>Plan for me</button>
      </div>

      {plannerOpen && (
        <div className="modal-backdrop" onClick={() => setPlannerOpen(false)}>
          <div className="modal goal-planner-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Plan a savings goal</h2>
            <p className="lede">Tell Zuri what you want and it will work out the pace.</p>
            <div className="field-group">
              <div className="field">
                <label>What are you saving for?</label>
                <input value={plannerTarget} onChange={(e) => setPlannerTarget(e.target.value)} placeholder="e.g. Car, rent, vacation" autoFocus />
              </div>
              <div className="field">
                <label>Target amount (₦)</label>
                <input type="number" min="1" value={plannerAmount} onChange={(e) => setPlannerAmount(e.target.value)} placeholder="0" />
              </div>
              <div className="field">
                <label>Save over (months)</label>
                <input type="number" min="1" value={plannerMonths} onChange={(e) => setPlannerMonths(e.target.value)} />
              </div>
            </div>
            {Number(plannerAmount) > 0 && Number(plannerMonths) > 0 && (
              <div className="goal-planner-breakdown">
                <span>Suggested monthly saving</span>
                <strong>₦{Math.ceil(Number(plannerAmount) / Number(plannerMonths)).toLocaleString()}</strong>
                <small>About ₦{Math.ceil(Number(plannerAmount) / Number(plannerMonths) / 4).toLocaleString()} per week</small>
              </div>
            )}
            <div className="row-split">
              <button className="btn btn-soft" onClick={() => setPlannerOpen(false)}>Cancel</button>
              <button className="btn btn-primary" disabled={!plannerTarget.trim() || Number(plannerAmount) <= 0 || Number(plannerMonths) <= 0} onClick={applyPlan}>Use this plan</button>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Create a New Goal</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 15 }}>
              <div className="field">
                <label>Goal Name</label>
                <input placeholder="e.g. Rent" value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
              </div>
              <div className="field">
                <label>Target Amount (\u20a6)</label>
                <input type="number" placeholder="0" value={targetInput} onChange={(e) => setTargetInput(e.target.value)} />
              </div>
              <div className="field">
                <label>Target Date</label>
                <input placeholder="YYYY-MM-DD" value={dateInput} onChange={(e) => setDateInput(e.target.value)} />
              </div>
              <div className="field">
                <label>Monthly saving target (\u20a6) [Optional]</label>
                <input type="number" placeholder="0" value={recurringInput} onChange={(e) => setRecurringInput(e.target.value)} />
              </div>
              <div className="row-split" style={{ marginTop: 10 }}>
                <button className="btn btn-soft" onClick={() => setCreateOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => requirePin(handleCreateGoal)}>Create Goal</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {manageGoal && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Manage {manageGoal.name}</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 15 }}>
              {manageGoal.mode === 'deposit' && (
                <div className="field">
                  <label>Amount to Deposit (\u20a6)</label>
                  <input type="number" placeholder="0" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} />
                </div>
              )}
              {manageGoal.mode === 'withdraw' && (
                <div className="field">
                  <label>Amount to Withdraw (\u20a6)</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input style={{ flex: 1 }} placeholder="0 or type ALL" value={amountInput} onChange={(e) => setAmountInput(e.target.value)} />
                    <button className="btn btn-soft" onClick={() => setAmountInput('ALL')}>Max</button>
                  </div>
                </div>
              )}
              {manageGoal.mode === 'auto-debit' && (
                <div className="field">
                  <label>New monthly saving target (\u20a6)</label>
                  <input type="number" placeholder="0" value={recurringInput} onChange={(e) => setRecurringInput(e.target.value)} />
                </div>
              )}
              {manageGoal.mode === 'edit' && (
                <>
                  <div className="field">
                    <label>Goal Name</label>
                    <input placeholder="Name" value={nameInput} onChange={(e) => setNameInput(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Target Amount (\u20a6)</label>
                    <input type="number" placeholder="0" value={targetInput} onChange={(e) => setTargetInput(e.target.value)} />
                  </div>
                </>
              )}
              <div className="row-split" style={{ marginTop: 10 }}>
                <button className="btn btn-soft" onClick={() => setManageGoal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={() => requirePin(handleManageGoal)}>Confirm</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {pinOpen && (
        <PinModal
          onClose={() => setPinOpen(false)}
          onConfirm={(pin) => handlePinSubmit(pin)}
          onAuthError={handleAuthError}
        />
      )}
    </div>
  );
}

function GoalCard({ goal, isSelected, isPrimary, onSelect, onManage }) {
  const g = goal;
  const hasTarget = g.recurring_amount_kobo > 0;

  return (
    <div
      className={`goal-card${isSelected ? ' selected' : ''}${isPrimary ? ' primary' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
    >
      <div className="goal-card-top">
        <div className="goal-card-info">
          <h3 className="goal-card-name">{g.name}</h3>
          <p className="goal-card-target">{g.target_display} target</p>
        </div>
        <div className="goal-card-pct-wrap">
          <span className="goal-card-pct">{g.progress_pct}%</span>
        </div>
      </div>

      <div className="goal-card-saved">
        <span className="goal-card-saved-label">{g.current_display} saved</span>
      </div>

      <div className="goal-card-bar">
        <div className="goal-card-bar-track">
          <div
            className="goal-card-bar-fill"
            style={{ width: `${Math.min(g.progress_pct, 100)}%` }}
          />
        </div>
      </div>

      <div className="goal-card-bottom">
        <div className="goal-card-meta">
          {hasTarget && (
            <span className="goal-card-recurring">{g.recurring_display} / month</span>
          )}
          {hasTarget && (
            <span className="goal-card-debit-status">
              <span className="goal-card-debit-dot" />
              Saving target set
            </span>
          )}
        </div>
        <button
          className="goal-card-manage"
          onClick={(e) => { e.stopPropagation(); onManage(); }}
        >
          Manage
        </button>
      </div>
    </div>
  );
}

function GoalDetailPanel({ goal, onClose, onPauseGoal }) {
  const g = goal;
  const hasTarget = g.recurring_amount_kobo > 0;
  const targetDate = g.target_date ? new Date(g.target_date).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }) : 'Not set';

  return (
    <div className="goal-detail-panel">
      <div className="goal-detail-header">
        <h2 className="goal-detail-name">{g.name}</h2>
        <button className="goal-detail-close" onClick={onClose} aria-label="Close detail panel">
          <CloseIcon />
        </button>
      </div>

      <div className="goal-detail-body">
        <div className="goal-detail-row">
          <span className="goal-detail-label">Target</span>
          <span className="goal-detail-value">{g.target_display}</span>
        </div>
        <div className="goal-detail-row">
          <span className="goal-detail-label">Target date</span>
          <span className="goal-detail-value">{targetDate}</span>
        </div>
        <div className="goal-detail-row">
          <span className="goal-detail-label">Monthly contribution</span>
          <span className="goal-detail-value">{g.recurring_display}</span>
        </div>
        <div className="goal-detail-row">
          <span className="goal-detail-label">Funding method</span>
          <span className="goal-detail-value">{hasTarget ? 'Self-logged, on a monthly pace' : 'Manual'}</span>
        </div>
        <div className="goal-detail-row">
          <span className="goal-detail-label">Status</span>
          <span className="goal-detail-value goal-detail-status-active">
            <span className="goal-detail-status-dot" />
            Active
          </span>
        </div>

        <div className="goal-detail-progress-section">
          <div className="goal-detail-progress-header">
            <span className="goal-detail-progress-label">Progress</span>
            <span className="goal-detail-progress-pct">{g.progress_pct}%</span>
          </div>
          <div className="goal-detail-bar">
            <div className="goal-detail-bar-track">
              <div
                className="goal-detail-bar-fill"
                style={{ width: `${Math.min(g.progress_pct, 100)}%` }}
              />
            </div>
          </div>
          <div className="goal-detail-progress-amounts">
            <span>{g.current_display}</span>
            <span>{g.target_display}</span>
          </div>
        </div>
      </div>

      {hasTarget && (
        <div className="goal-detail-footer">
          <button className="goal-detail-pause-btn" onClick={onPauseGoal}>
            Pause this goal
          </button>
        </div>
      )}
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

function GoalBullseyeIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function ZuriSparkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.09 6.26L20.18 10l-6.09 1.74L12 18l-2.09-6.26L3.82 10l6.09-1.74z" />
    </svg>
  );
}

