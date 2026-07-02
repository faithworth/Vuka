/**
 * VerifiedBadge — pro platform-style verified mark.
 *
 * Shape: 8-point star seal (same geometry as YouTube, Spotify, X/Twitter).
 * Fill:  Vuka Music brand green (#A0E87C) with a darker stroke for depth.
 * Mark:  crisp white checkmark, same proportions as Spotify.
 *
 * Renders as a pure inline SVG — zero deps, pixel-perfect at any size.
 *
 * Usage:
 *   <VerifiedBadge size={24} />   ← inline next to artist name
 *   <VerifiedBadge size={32} />   ← profile hero
 */
export function VerifiedBadge({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Verified"
      role="img"
      className={className}
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}
    >
      {/*
        8-point star seal.
        Outer radius 11.5 (keeps a 0.5px visual margin inside 24×24 viewBox).
        Inner radius 7.8 — controls how sharp / rounded the notches feel.
        Rotated so the first point sits at 12 o'clock (−90°, i.e. start angle = −π/2).

        Points are pre-calculated:
          outer (r=11.5): angle = -90° + k×45°,  k = 0..7
          inner (r=7.8):  angle = -90° + k×45° + 22.5°,  k = 0..7
        cx=cy=12 (center of 24×24 viewBox)
      */}
      <polygon
        points="
          12,0.5
          14.14,4.83
          18.81,4.27
          17.35,8.86
          21.62,11.5
          17.35,14.14
          18.81,19.73
          14.14,19.17
          12,23.5
          9.86,19.17
          5.19,19.73
          6.65,14.14
          2.38,11.5
          6.65,8.86
          5.19,4.27
          9.86,4.83
        "
        fill="#A0E87C"
        stroke="#6BB84A"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      {/* White checkmark — same stroke weight as Spotify */}
      <path
        d="M7.8 12.1L10.6 14.9L16.2 9"
        stroke="white"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export default VerifiedBadge;
