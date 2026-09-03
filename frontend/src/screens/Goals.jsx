import { useEffect, useState } from 'react';
import { useAuth } from '../state/AuthContext.jsx';
import { api } from '../lib/api.js';
import PinModal from '../components/PinModal.jsx';

export default function Goals() {
  const { token } = useAuth();
  const [goals, setGoals] = useState([]);
  
  const [createOpen, setCreateOpen] = useState(false);
  const [manageGoal, setManageGoal] = useState(null); // { id, name, mode: 'deposit'|'withdraw'|'auto-debit'|'edit' }
  const [pinOpen, setPinOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState(null); // () => Promise
  
  // Forms state
  const [amountInput, setAmountInput] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [targetInput, setTargetInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [recurringInput, setRecurringInput] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadGoals();
  }, [token]);

  async function loadGoals() {
    const d = await api.goals(token);
    setGoals(d.goals || []);
  }

  async function pause(id, status) {
    await api.patchGoal(token, id, { status });
    loadGoals();
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
      pin
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
        pin 
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

  return (
    <div className="panel">
      <div className="row-split">
        <h1>Goals</h1>
        <button className="btn btn-primary" onClick={openCreate} disabled={loading}>+ New Goal</button>
      </div>
      <p className="lede">Save up for your dreams automatically.</p>
      
      {errorMsg && <p className="error" style={{ color: 'red', marginTop: 10 }}>{errorMsg}</p>}
      {loading && <p style={{ marginTop: 10 }}>Loading...</p>}

      <div className="list">
        {goals.map((g) => (
          <article key={g.id} className="row-card">
            <div className="row-split">
              <h3>{g.name}</h3>
              <span className="cat-chip">{g.status}</span>
            </div>
            <p>
              {g.current_display} of {g.target_display} · due {g.target_date}
            </p>
            <p style={{ marginTop: 4 }}>Monthly Auto-Debit: {g.recurring_display}</p>
            <div className="progress" aria-hidden style={{ marginTop: 8 }}>
              <span style={{ width: `${g.progress_pct}%` }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-soft" onClick={() => openManage(g, 'deposit')}>Deposit</button>
              <button type="button" className="btn btn-soft" onClick={() => openManage(g, 'withdraw')}>Withdraw</button>
              <button type="button" className="btn btn-soft" onClick={() => openManage(g, 'auto-debit')}>Auto-Debit</button>
              <button type="button" className="btn btn-soft" onClick={() => openManage(g, 'edit')}>Edit</button>
              {g.status === 'active' ? (
                <button type="button" className="btn btn-soft" onClick={() => pause(g.id, 'paused')}>Pause</button>
              ) : (
                <button type="button" className="btn btn-soft" onClick={() => pause(g.id, 'active')}>Resume</button>
              )}
            </div>
          </article>
        ))}
        {!goals.length && <p className="empty">No goals yet. Create one to get started!</p>}
      </div>

      {createOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Create a New Goal</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 15 }}>
              <div className="field">
                <label>Goal Name</label>
                <input placeholder="e.g. Rent" value={nameInput} onChange={e => setNameInput(e.target.value)} />
              </div>
              <div className="field">
                <label>Target Amount (₦)</label>
                <input type="number" placeholder="0" value={targetInput} onChange={e => setTargetInput(e.target.value)} />
              </div>
              <div className="field">
                <label>Target Date</label>
                <input placeholder="YYYY-MM-DD" value={dateInput} onChange={e => setDateInput(e.target.value)} />
              </div>
              <div className="field">
                <label>Monthly Auto-Debit (₦) [Optional]</label>
                <input type="number" placeholder="0" value={recurringInput} onChange={e => setRecurringInput(e.target.value)} />
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
                  <label>Amount to Deposit (₦)</label>
                  <input type="number" placeholder="0" value={amountInput} onChange={e => setAmountInput(e.target.value)} />
                </div>
              )}
              {manageGoal.mode === 'withdraw' && (
                <div className="field">
                  <label>Amount to Withdraw (₦)</label>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <input style={{ flex: 1 }} placeholder="0 or type ALL" value={amountInput} onChange={e => setAmountInput(e.target.value)} />
                    <button className="btn btn-soft" onClick={() => setAmountInput('ALL')}>Max</button>
                  </div>
                </div>
              )}
              {manageGoal.mode === 'auto-debit' && (
                <div className="field">
                  <label>New Monthly Auto-Debit (₦)</label>
                  <input type="number" placeholder="0" value={recurringInput} onChange={e => setRecurringInput(e.target.value)} />
                </div>
              )}
              {manageGoal.mode === 'edit' && (
                <>
                  <div className="field">
                    <label>Goal Name</label>
                    <input placeholder="Name" value={nameInput} onChange={e => setNameInput(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Target Amount (₦)</label>
                    <input type="number" placeholder="0" value={targetInput} onChange={e => setTargetInput(e.target.value)} />
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
        />
      )}
    </div>
  );
}
