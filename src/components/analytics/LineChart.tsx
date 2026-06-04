'use client';
// ============================================================
// VUKA — Analytics LineChart (Phase 10)
// Pure SVG — no external charting lib needed.
// ============================================================

import { useMemo } from 'react';

interface DataPoint {
  label: string;   // x-axis label (date, month, etc.)
  value: number;
  value2?: number; // optional second series
}

interface LineChartProps {
  data: DataPoint[];
  color?: string;
  color2?: string;
  label?: string;
  label2?: string;
  height?: number;
  formatValue?: (v: number) => string;
  showGrid?: boolean;
  showDots?: boolean;
  filled?: boolean;
}

export function LineChart({
  data,
  color = 'var(--sky)',
  color2 = 'var(--gold)',
  label,
  label2,
  height = 180,
  formatValue = (v) => v.toLocaleString(),
  showGrid = true,
  showDots = true,
  filled = true,
}: LineChartProps) {
  const W = 600;
  const H = height;
  const PAD = { top: 12, right: 16, bottom: 36, left: 48 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const { path, path2, fillPath, fillPath2, dots, dots2, xLabels, yLabels, maxV } = useMemo(() => {
    if (!data.length) return { path: '', path2: '', fillPath: '', fillPath2: '', dots: [], dots2: [], xLabels: [], yLabels: [], maxV: 1 };

    const vals = data.map((d) => d.value);
    const vals2 = data.map((d) => d.value2 ?? 0);
    const allVals = [...vals, ...vals2];
    const maxV = Math.max(...allVals, 1);
    const minV = 0;
    const range = maxV - minV || 1;

    const xScale = (i: number) => PAD.left + (i / Math.max(data.length - 1, 1)) * chartW;
    const yScale = (v: number) => PAD.top + chartH - ((v - minV) / range) * chartH;

    const buildPath = (vs: number[]) =>
      vs.map((v, i) => `${i === 0 ? 'M' : 'L'}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(' ');

    const buildFill = (vs: number[]) => {
      const last = vs.length - 1;
      const top = buildPath(vs);
      return `${top} L${xScale(last).toFixed(1)},${(PAD.top + chartH).toFixed(1)} L${PAD.left.toFixed(1)},${(PAD.top + chartH).toFixed(1)} Z`;
    };

    const dotsArr = data.map((d, i) => ({ x: xScale(i), y: yScale(d.value), v: d.value, label: d.label }));
    const dotsArr2 = data
      .filter((d) => d.value2 !== undefined)
      .map((d, i) => ({ x: xScale(i), y: yScale(d.value2!), v: d.value2!, label: d.label }));

    // x-axis labels (show at most 7)
    const step = Math.max(1, Math.ceil(data.length / 7));
    const xLabels = data
      .map((d, i) => ({ i, label: d.label, x: xScale(i) }))
      .filter((_, i) => i % step === 0 || i === data.length - 1);

    // y-axis labels (5 ticks)
    const yLabels = [0, 0.25, 0.5, 0.75, 1].map((t) => ({
      y: PAD.top + chartH - t * chartH,
      value: minV + t * range,
    }));

    return {
      path: buildPath(vals),
      path2: data.some((d) => d.value2 !== undefined) ? buildPath(vals2) : '',
      fillPath: buildFill(vals),
      fillPath2: data.some((d) => d.value2 !== undefined) ? buildFill(vals2) : '',
      dots: dotsArr,
      dots2: dotsArr2,
      xLabels,
      yLabels,
      maxV,
    };
  }, [data, chartW, chartH]);

  if (!data.length) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        No data
      </div>
    );
  }

  // SVG color helpers — inline gradient id must be unique per instance
  const gradId1 = `grad-${color.replace(/[^a-z0-9]/gi, '')}`;
  const gradId2 = `grad2-${color2.replace(/[^a-z0-9]/gi, '')}`;

  return (
    <div style={{ position: 'relative' }}>
      {(label || label2) && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
          {label && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              <span style={{ display: 'inline-block', width: 10, height: 3, borderRadius: 2, background: color }} />
              {label}
            </div>
          )}
          {label2 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              <span style={{ display: 'inline-block', width: 10, height: 3, borderRadius: 2, background: color2 }} />
              {label2}
            </div>
          )}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={height} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradId1} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          {path2 && (
            <linearGradient id={gradId2} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color2} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color2} stopOpacity="0" />
            </linearGradient>
          )}
        </defs>

        {/* Grid lines */}
        {showGrid && yLabels.map((tick, i) => (
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

        {/* Fill areas */}
        {filled && path2 && <path d={fillPath2} fill={`url(#${gradId2})`} />}
        {filled && <path d={fillPath} fill={`url(#${gradId1})`} />}

        {/* Lines */}
        {path2 && (
          <path d={path2} fill="none" stroke={color2} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        )}
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {/* Dots */}
        {showDots && dots.map((d, i) => (
          <circle key={i} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r="3.5" fill={color} stroke="var(--surface)" strokeWidth="2">
            <title>{d.label}: {formatValue(d.v)}</title>
          </circle>
        ))}
        {showDots && dots2.map((d, i) => (
          <circle key={i} cx={d.x.toFixed(1)} cy={d.y.toFixed(1)} r="3" fill={color2} stroke="var(--surface)" strokeWidth="2">
            <title>{d.label}: {formatValue(d.v)}</title>
          </circle>
        ))}

        {/* X-axis labels */}
        {xLabels.map((l) => (
          <text key={l.i} x={l.x.toFixed(1)} y={PAD.top + chartH + 20}
            textAnchor="middle" fontSize="10" fill="var(--text-muted)">
            {l.label.length > 6 ? l.label.slice(0, 6) : l.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
