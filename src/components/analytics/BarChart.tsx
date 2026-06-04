'use client';
// ============================================================
// VUKA — Analytics BarChart (Phase 10)
// Pure SVG — supports stacked and grouped bars.
// ============================================================

import { useMemo } from 'react';

interface BarDataPoint {
  label: string;
  value: number;
  value2?: number;
  value3?: number;
}

interface BarChartProps {
  data: BarDataPoint[];
  colors?: [string, string?, string?];
  labels?: [string, string?, string?];
  height?: number;
  stacked?: boolean;
  formatValue?: (v: number) => string;
  horizontal?: boolean;
}

export function BarChart({
  data,
  colors = ['var(--sky)', 'var(--gold)', 'var(--green)'],
  labels,
  height = 200,
  stacked = false,
  formatValue = (v) => v.toLocaleString(),
}: BarChartProps) {
  const W = 600;
  const H = height;
  const PAD = { top: 12, right: 16, bottom: 40, left: 50 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const { bars, yLabels, xLabels } = useMemo(() => {
    if (!data.length) return { bars: [], yLabels: [], xLabels: [] };

    const maxV = stacked
      ? Math.max(...data.map((d) => d.value + (d.value2 ?? 0) + (d.value3 ?? 0)), 1)
      : Math.max(...data.flatMap((d) => [d.value, d.value2 ?? 0, d.value3 ?? 0]), 1);

    const totalBars = data.length;
    const seriesCount = stacked ? 1 : (data.some((d) => d.value3 !== undefined) ? 3 : data.some((d) => d.value2 !== undefined) ? 2 : 1);
    const groupGap = chartW / totalBars;
    const barGap = 3;
    const barW = stacked
      ? groupGap * 0.7
      : (groupGap * 0.85) / seriesCount - barGap;

    const yScale = (v: number) => chartH - (v / maxV) * chartH;

    const bars = data.map((d, i) => {
      const groupX = PAD.left + i * groupGap + groupGap * 0.075;
      const series: { x: number; y: number; w: number; h: number; color: string; v: number; si: number }[] = [];

      if (stacked) {
        let stackY = 0;
        const vals = [d.value, d.value2, d.value3].filter((v): v is number => v !== undefined);
        vals.forEach((v, si) => {
          const h = (v / maxV) * chartH;
          series.push({
            x: groupX,
            y: PAD.top + chartH - stackY - h,
            w: groupW(stacked, barW, groupGap),
            h,
            color: colors[si] ?? colors[0],
            v,
            si,
          });
          stackY += h;
        });
      } else {
        const vals = [d.value, d.value2, d.value3].filter((v): v is number => v !== undefined);
        vals.forEach((v, si) => {
          const h = (v / maxV) * chartH;
          series.push({
            x: groupX + si * (barW + barGap),
            y: PAD.top + chartH - h,
            w: barW,
            h,
            color: colors[si] ?? colors[0],
            v,
            si,
          });
        });
      }

      return { label: d.label, series };
    });

    const yLabels = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      y: PAD.top + chartH - t * chartH,
      value: t * maxV,
    }));

    const step = Math.max(1, Math.ceil(data.length / 8));
    const xLabels = data.map((d, i) => ({
      x: PAD.left + i * groupGap + groupGap / 2,
      label: d.label,
      show: i % step === 0 || i === data.length - 1,
    }));

    return { bars, yLabels, xLabels };
  }, [data, chartW, chartH, stacked]);

  function groupW(stacked: boolean, barW: number, groupGap: number) {
    return stacked ? groupGap * 0.7 : barW;
  }

  if (!data.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        No data
      </div>
    );
  }

  return (
    <div>
      {labels && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          {labels.map((l, i) => l && (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: colors[i] }} />
              {l}
            </div>
          ))}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} style={{ overflow: 'visible' }}>
        {/* Grid */}
        {yLabels.map((tick, i) => (
          <g key={i}>
            <line
              x1={PAD.left} y1={tick.y.toFixed(1)}
              x2={PAD.left + chartW} y2={tick.y.toFixed(1)}
              stroke="rgba(255,255,255,0.06)" strokeWidth="1"
            />
            <text
              x={PAD.left - 6} y={tick.y + 4}
              textAnchor="end" fontSize="10" fill="var(--text-muted)"
            >
              {tick.value >= 1000 ? `${(tick.value / 1000).toFixed(0)}k` : tick.value.toFixed(0)}
            </text>
          </g>
        ))}

        {/* Bars */}
        {bars.map((group, gi) =>
          group.series.map((bar, si) => (
            <g key={`${gi}-${si}`}>
              <rect
                x={bar.x.toFixed(1)} y={bar.y.toFixed(1)}
                width={Math.max(bar.w, 2).toFixed(1)} height={Math.max(bar.h, 0).toFixed(1)}
                rx="3" fill={bar.color} opacity="0.85"
                style={{ transition: 'opacity 0.2s' }}
              >
                <title>{group.label}: {formatValue(bar.v)}</title>
              </rect>
            </g>
          ))
        )}

        {/* X-axis labels */}
        {xLabels.map((l, i) => l.show && (
          <text key={i} x={l.x.toFixed(1)} y={PAD.top + chartH + 20}
            textAnchor="middle" fontSize="10" fill="var(--text-muted)">
            {l.label.length > 7 ? l.label.slice(0, 7) : l.label}
          </text>
        ))}

        {/* Baseline */}
        <line
          x1={PAD.left} y1={(PAD.top + chartH).toFixed(1)}
          x2={PAD.left + chartW} y2={(PAD.top + chartH).toFixed(1)}
          stroke="var(--border)" strokeWidth="1"
        />
      </svg>
    </div>
  );
}
