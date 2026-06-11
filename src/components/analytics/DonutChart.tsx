'use client';
// ============================================================
// VUKA — Analytics DonutChart (Phase 10)
// ============================================================

import { useMemo } from 'react';

interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
  formatValue?: (v: number) => string;
}

export function DonutChart({
  data,
  size = 180,
  thickness = 38,
  centerLabel,
  centerValue,
  formatValue = (v) => v.toLocaleString(),
}: DonutChartProps) {
  const { slices, total } = useMemo(() => {
    const total = data.reduce((s, d) => s + d.value, 0) || 1;
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 12;
    const ir = r - thickness;

    let angle = -Math.PI / 2;
    const slices = data.map((d) => {
      const frac = d.value / total;
      const sweep = frac * 2 * Math.PI;
      const startA = angle;
      const endA = angle + sweep;
      angle = endA;

      const x1 = cx + r * Math.cos(startA);
      const y1 = cy + r * Math.sin(startA);
      const x2 = cx + r * Math.cos(endA);
      const y2 = cy + r * Math.sin(endA);
      const ix1 = cx + ir * Math.cos(endA);
      const iy1 = cy + ir * Math.sin(endA);
      const ix2 = cx + ir * Math.cos(startA);
      const iy2 = cy + ir * Math.sin(startA);

      const large = sweep > Math.PI ? 1 : 0;

      const path = sweep < 0.001
        ? ''
        : `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)} L${ix1.toFixed(2)},${iy1.toFixed(2)} A${ir},${ir} 0 ${large} 0 ${ix2.toFixed(2)},${iy2.toFixed(2)} Z`;

      return { ...d, path, frac };
    });

    return { slices, total };
  }, [data, size, thickness]);

  const cx = size / 2;
  const cy = size / 2;

  return (
    <div>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
          {/* Background ring */}
          <circle cx={cx} cy={cy} r={size / 2 - 12 - thickness / 2}
            fill="none" stroke="var(--surface2)" strokeWidth={thickness} />

          {slices.map((s, i) => (
            <path key={i} d={s.path} fill={s.color} opacity="0.9">
              <title>{s.label}: {formatValue(s.value)} ({(s.frac * 100).toFixed(1)}%)</title>
            </path>
          ))}

          {/* Center text */}
          {centerValue && (
            <>
              <text x={cx} y={cy - 6} textAnchor="middle" fontSize="16"
                fontWeight="700" fill="var(--text)" fontFamily="IBM Plex Mono, monospace">
                {centerValue}
              </text>
              {centerLabel && (
                <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10"
                  fill="var(--text-muted)">
                  {centerLabel}
                </text>
              )}
            </>
          )}
        </svg>

        {/* Legend */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          {slices.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%',
                background: s.color, flexShrink: 0,
              }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {s.label}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                    {(s.frac * 100).toFixed(1)}%
                  </span>
                </div>
                <div style={{ marginTop: 3, height: 3, borderRadius: 2, background: 'var(--surface2)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 2, background: s.color, width: `${s.frac * 100}%`, transition: 'width 0.6s ease' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
