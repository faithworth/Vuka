'use client';
import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import { Plus, Target, Trash2 } from 'lucide-react';

export default function DashboardGoalsPage() {
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', targetAmount: '', deadline: '' });

  useEffect(() => {
    fetch('/api/dashboard/goals')
      .then(r => r.json())
      .then(d => setGoals(Array.isArray(d.goals) ? d.goals : []))
      .catch(() => setGoals([]))
      .finally(() => setLoading(false));
  }, []);

  async function createGoal() {
    const res = await fetch('/api/dashboard/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, targetAmount: parseFloat(form.targetAmount) }),
    });
    if (res.ok) {
      const d = await res.json();
      setGoals(prev => [d.goal, ...prev]);
      setShowForm(false);
      setForm({ title: '', description: '', targetAmount: '', deadline: '' });
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Goals</h1>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white"
          style={{ background: 'var(--purple)' }}>
          <Plus className="w-4 h-4" /> New Goal
        </button>
      </div>

      {showForm && (
        <div className="p-5 rounded-xl border mb-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <h3 className="font-bold mb-4" style={{ color: 'var(--text)' }}>Create Goal</h3>
          <div className="space-y-3">
            <input placeholder="Goal title (e.g. Studio Session Fund)" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <textarea placeholder="Description (optional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm h-20 resize-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <input type="number" placeholder="Target amount (ZAR)" value={form.targetAmount} onChange={e => setForm(f => ({ ...f, targetAmount: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <input type="date" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
            <div className="flex gap-3">
              <button onClick={createGoal} className="px-4 py-2 rounded-lg font-bold text-white text-sm"
                style={{ background: 'var(--purple)' }}>Create Goal</button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg text-sm"
                style={{ color: 'var(--text-muted)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading && <p style={{ color: 'var(--text-muted)' }}>Just now…</p>}

      {!loading && goals.length === 0 && (
        <div className="text-center py-20 rounded-2xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
          <Target className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--purple-light)' }} />
          <p className="font-bold" style={{ color: 'var(--text)' }}>Nothing here yet, go create</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Set a funding goal for fans to support.</p>
        </div>
      )}

      <div className="space-y-4">
        {goals.map((goal: any) => {
          const pct = Math.min(100, (goal.currentAmount / goal.targetAmount) * 100);
          return (
            <div key={goal.id} className="p-5 rounded-xl border" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="font-bold" style={{ color: 'var(--text)' }}>{goal.title}</h3>
                  {goal.description && <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{goal.description}</p>}
                </div>
                {goal.deadline && (
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {new Date(goal.deadline).toLocaleDateString('en-ZA')}
                  </span>
                )}
              </div>
              <div className="h-3 rounded-full overflow-hidden mb-2" style={{ background: 'var(--surface2)' }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--purple), var(--purple-light))' }} />
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--purple-light)' }}>{formatCurrency(goal.currentAmount)} raised</span>
                <span style={{ color: 'var(--text-muted)' }}>{pct.toFixed(0)}% of {formatCurrency(goal.targetAmount)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
