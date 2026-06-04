'use client';
// ============================================================
// VUKA — Analytics PeriodSelector (Phase 10)
// ============================================================

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
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div style={{
      display: 'flex',
      borderRadius: 10,
      overflow: 'hidden',
      border: '1px solid var(--border)',
    }}>
      {PERIODS.map((p) => (
        <button
          key={p.value}
          onClick={() => onChange(p.value, p.days)}
          style={{
            padding: '7px 14px',
            fontSize: 12,
            fontWeight: 600,
            background: value === p.value ? 'var(--sky)' : 'var(--surface)',
            color: value === p.value ? 'white' : 'var(--text-muted)',
            border: 'none',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export { PERIODS };
