'use client';
// ============================================================
// VUKA — Analytics PeriodSelector (Phase 10)
// ============================================================
import { Lock } from 'lucide-react';

export type Period = '7d' | '30d' | '90d' | '12m';

const PERIODS: { value: Period; label: string; days: number }[] = [
  { value: '7d',  label: '7D',   days: 7   },
  { value: '30d', label: '30D',  days: 30  },
  { value: '90d', label: '90D',  days: 90  },
  { value: '12m', label: '12M',  days: 365 },
];

interface PeriodSelectorProps {
  value: Period;
  onChange: (p: Period, days: number) => void;
  /**
   * Periods the current plan can't use (e.g. 90D/12M on Free). Shown
   * disabled with a lock icon rather than hidden, so the control's width
   * doesn't shift once the plan check resolves. Clicking a locked option
   * routes to /pricing instead of changing the period.
   */
  lockedPeriods?: Period[];
}

export function PeriodSelector({ value, onChange, lockedPeriods = [] }: PeriodSelectorProps) {
  return (
    <div style={{
      display: 'flex',
      borderRadius: 10,
      overflow: 'hidden',
      border: '1px solid var(--border)',
    }}>
      {PERIODS.map((p) => {
        const isLocked = lockedPeriods.includes(p.value);
        return (
          <button
            key={p.value}
            onClick={() => isLocked ? (window.location.href = '/pricing') : onChange(p.value, p.days)}
            title={isLocked ? 'Upgrade to Pro to unlock this range' : undefined}
            style={{
              padding: '7px 14px',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 4,
              background: value === p.value && !isLocked ? 'var(--sky)' : 'var(--surface)',
              color: value === p.value && !isLocked ? 'white' : (isLocked ? 'var(--text-muted)' : 'var(--text-muted)'),
              opacity: isLocked ? 0.55 : 1,
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {isLocked && <Lock size={10} />}
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export { PERIODS };
