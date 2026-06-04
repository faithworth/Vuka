'use client';
// ============================================================
// VUKA — Analytics GeoHeatmap (Phase 10)
// Simplified country dot-map using lat/lng centroids.
// Full SVG world paths would be ~50kb; instead we render
// colored bubbles at country centroids sized by play count.
// ============================================================

interface GeoEntry {
  countryCode: string;
  countryName: string;
  count: number;
}

interface GeoHeatmapProps {
  data: GeoEntry[];
  color?: string;
}

// Approximate lat/lng centroids for common music markets
const COUNTRY_COORDS: Record<string, [number, number]> = {
  ZA: [-29, 25], NG: [10, 8], GH: [8, -2], KE: [1, 38],
  EG: [27, 30], TZ: [-6, 35], ET: [9, 40], UG: [1, 32],
  CI: [7.5, -5.5], SN: [14, -14], ZW: [-20, 30], MZ: [-18, 35],
  US: [38, -97], CA: [56, -106], GB: [54, -2], DE: [51, 10],
  FR: [46, 2], ES: [40, -4], IT: [42, 12], NL: [52, 5],
  AU: [-27, 133], NZ: [-41, 174], JP: [36, 138], KR: [37, 128],
  CN: [35, 105], IN: [21, 78], BR: [-10, -55], MX: [24, -102],
  AR: [-34, -64], CO: [4, -74], PT: [39, -8], SE: [60, 15],
  NO: [60, 8], DK: [56, 10], FI: [61, 26], PL: [52, 20],
  UA: [49, 32], RU: [60, 100], TR: [39, 35], SA: [24, 45],
  AE: [24, 54], IL: [31, 35], PK: [30, 70], BD: [24, 90],
  PH: [13, 122], ID: [-5, 120], MY: [2.5, 112], TH: [15, 101],
  VN: [16, 108], SG: [1.3, 103], TW: [24, 121], HK: [22, 114],
};

// Mercator-like projection
function toXY(lat: number, lng: number, w: number, h: number): [number, number] {
  const x = ((lng + 180) / 360) * w;
  const latRad = (lat * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + latRad / 2));
  const y = h / 2 - (w * mercN) / (2 * Math.PI);
  return [x, y];
}

// Simplified world outline paths (very rough, just for context)
const WORLD_OUTLINE_D =
  'M 0,85 L 600,85 M 0,170 L 600,170 M 0,255 L 600,255 M 0,340 L 600,340';

export function GeoHeatmap({ data, color = 'var(--sky)' }: GeoHeatmapProps) {
  const W = 600;
  const H = 300;

  if (!data.length) {
    return (
      <div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13, background: 'var(--surface2)', borderRadius: 12 }}>
        No geographic data yet
      </div>
    );
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  const bubbles = data
    .map((entry) => {
      const coords = COUNTRY_COORDS[entry.countryCode];
      if (!coords) return null;
      const [x, y] = toXY(coords[0], coords[1], W, H);
      const r = 4 + (entry.count / maxCount) * 22;
      return { ...entry, x, y, r };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.r - a!.r)); // draw large bubbles first

  const topCountries = [...data].sort((a, b) => b.count - a.count).slice(0, 5);

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H}
        style={{ background: 'var(--surface2)', borderRadius: 12, display: 'block' }}>

        {/* Latitude grid lines */}
        {[20, 40, 60, -20, -40].map((lat) => {
          const [, y] = toXY(lat, 0, W, H);
          return (
            <line key={lat} x1={0} y1={y.toFixed(1)} x2={W} y2={y.toFixed(1)}
              stroke="var(--border)" strokeWidth="0.5" opacity="0.4" />
          );
        })}
        {/* Longitude grid lines */}
        {[-120, -60, 0, 60, 120].map((lng) => {
          const [x] = toXY(0, lng, W, H);
          return (
            <line key={lng} x1={x.toFixed(1)} y1={0} x2={x.toFixed(1)} y2={H}
              stroke="var(--border)" strokeWidth="0.5" opacity="0.4" />
          );
        })}

        {/* Bubbles */}
        {bubbles.map((b) => b && (
          <g key={b.countryCode}>
            <circle
              cx={b.x.toFixed(1)} cy={b.y.toFixed(1)}
              r={b.r.toFixed(1)}
              fill={color}
              fillOpacity={0.15 + 0.55 * (b.count / maxCount)}
              stroke={color}
              strokeOpacity={0.4 + 0.5 * (b.count / maxCount)}
              strokeWidth="1"
            >
              <title>{b.countryName}: {b.count.toLocaleString()} plays</title>
            </circle>
            {b.r > 12 && (
              <text
                x={b.x.toFixed(1)} y={(b.y + 4).toFixed(1)}
                textAnchor="middle" fontSize="9"
                fill="var(--text)" fontWeight="600"
                style={{ pointerEvents: 'none' }}
              >
                {b.countryCode}
              </text>
            )}
          </g>
        ))}
      </svg>

      {/* Top countries list */}
      <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {topCountries.map((c, i) => (
          <div key={c.countryCode} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--surface2)', borderRadius: 8, padding: '6px 12px',
            border: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', minWidth: 14 }}>
              {i + 1}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text)' }}>{c.countryName || c.countryCode}</span>
            <span style={{ fontSize: 12, color: 'var(--sky)', fontWeight: 600 }}>{c.count.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
