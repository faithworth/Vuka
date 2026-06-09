/**
 * VerifiedBadge — platform-style filled checkmark circle in Vuka green.
 * Inline SVG so it renders exactly like Spotify/YouTube verified marks:
 * a solid coloured disc with a white checkmark path inside.
 *
 * Usage:  <VerifiedBadge size={22} />
 */
export function VerifiedBadge({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Verified"
      role="img"
      className={className}
      style={{ flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }}
    >
      {/* Solid green disc */}
      <circle cx="11" cy="11" r="11" fill="#A0E87C" />
      {/* White checkmark — same proportions Spotify uses */}
      <path
        d="M6.5 11.2L9.6 14.3L15.5 8"
        stroke="white"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default VerifiedBadge;
