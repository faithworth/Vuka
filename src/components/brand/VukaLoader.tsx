'use client';

import { VUKA_MARK_PATH, VUKA_GREEN, VUKA_GOLD } from './VukaMark';

interface VukaLoaderProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Accessible label for screen readers. */
  label?: string;
  /** Centers the loader with generous padding, for full-section/page loading states. */
  fullscreen?: boolean;
}

function Mark({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className="vuka-pulse"
      role="img"
      aria-hidden="true"
    >
      <circle cx="50" cy="51" r="43" fill="none" stroke={VUKA_GREEN} strokeWidth="1" opacity="0.35" />
      <path d={VUKA_MARK_PATH} fill={VUKA_GREEN} />
      <circle cx="50" cy="87.5" r="3.4" fill={VUKA_GOLD} />
    </svg>
  );
}

export default function VukaLoader({
  size = 20,
  className,
  style,
  label = 'Loading',
  fullscreen = false,
}: VukaLoaderProps) {
  if (fullscreen) {
    return (
      <div
        className={className}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          width: '100%',
          ...style,
        }}
        role="status"
        aria-label={label}
      >
        <Mark size={size} />
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', verticalAlign: 'middle', ...style }}
      role="status"
      aria-label={label}
    >
      <Mark size={size} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
