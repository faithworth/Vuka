'use client';
// ============================================================
// VUKA — Analytics StatCard (Phase 10)
// ============================================================

import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color?: string;
  change?: number;   // percentage change (positive = up, negative = down)
  subLabel?: string;
}

export function StatCard({ label, value, icon: Icon, color = 'var(--sky)', change, subLabel }: StatCardProps) {
  const changePositive = change !== undefined && change >= 0;
  const absChange = change !== undefined ? Math.abs(change) : 0;

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 16,
      padding: '20px 20px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: `${color}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icon size={16} style={{ color }} />
        </div>
        {change !== undefined && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 3,
            fontSize: 11, fontWeight: 600,
            color: changePositive ? 'var(--green)' : 'var(--red)',
          }}>
            <span>{changePositive ? '↑' : '↓'}</span>
            <span>{absChange.toFixed(1)}%</span>
          </div>
        )}
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color, fontFamily: 'IBM Plex Mono, monospace', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
      {subLabel && <div style={{ fontSize: 11, color: 'var(--text-muted)', opacity: 0.7 }}>{subLabel}</div>}
    </div>
  );
}
