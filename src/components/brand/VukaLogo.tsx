'use client';

import { VUKA_MARK_PATH, VUKA_GREEN, VUKA_GOLD, VUKA_GREEN_LIGHT } from './VukaMark';

interface VukaLogoProps {
  size?: number;
  /** Show the "Vuka Music" wordmark next to the mark. Default true. */
  withWordmark?: boolean;
  /** Slow moonlight sweep across the mark. Default true — set false in dense lists. */
  animated?: boolean;
  className?: string;
  wordmarkClassName?: string;
}

let uid = 0;

export default function VukaLogo({
  size = 32,
  withWordmark = true,
  animated = true,
  className,
  wordmarkClassName,
}: VukaLogoProps) {
  const clipId = `vuka-clip-${uid++}`;

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.28 }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        role="img"
        aria-label="Vuka Music"
        style={{ flexShrink: 0 }}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={VUKA_MARK_PATH} />
          </clipPath>
        </defs>
        <circle cx="50" cy="51" r="43" fill="none" stroke={VUKA_GREEN} strokeWidth="0.7" opacity="0.3" />
        <path d={VUKA_MARK_PATH} fill={VUKA_GREEN} />
        {animated && (
          <g clipPath={`url(#${clipId})`}>
            <rect x="-30" y="0" width="34" height="100" fill={VUKA_GREEN_LIGHT} className="vuka-sweep" />
          </g>
        )}
        <circle cx="50" cy="87.5" r="3.4" fill={VUKA_GOLD} />
      </svg>
      {withWordmark && (
        <span
          className={wordmarkClassName}
          style={{
            fontFamily: 'var(--font-display, Syne, sans-serif)',
            fontWeight: 700,
            fontSize: size * 0.62,
            letterSpacing: '-0.01em',
            color: 'var(--color-text-primary, #F5F5F5)',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          Vuka <span style={{ color: VUKA_GREEN }}>Music</span>
        </span>
      )}
    </span>
  );
}
