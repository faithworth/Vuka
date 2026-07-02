/**
 * VukaMark — the Vuka Music brand mark.
 *
 * A ribbon "V" cradled by a thin moon ring, with a single point of light
 * at its base. The shape is the one source of truth for the logo — every
 * other brand component (VukaLogo, VukaLoader, favicon) is built on it.
 */
export const VUKA_MARK_PATH =
  'M12,11 C 7,34 22,58 45,83 C 47,86 53,86 55,83 C 78,58 93,34 88,11 ' +
  'L 73,11 C 80,31 68,52 50,71 C 32,52 20,31 27,11 Z';

export const VUKA_GREEN = '#A0E87C';
export const VUKA_GREEN_LIGHT = '#D4F5B8';
export const VUKA_GOLD = '#E8C87C';

interface VukaMarkProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Render the faint moon ring behind the mark. Default true. */
  ring?: boolean;
}

export default function VukaMark({ size = 24, className, style, ring = true }: VukaMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      style={style}
      role="img"
      aria-label="Vuka Music"
    >
      {ring && (
        <circle cx="50" cy="51" r="43" fill="none" stroke={VUKA_GREEN} strokeWidth="0.7" opacity="0.3" />
      )}
      <path d={VUKA_MARK_PATH} fill={VUKA_GREEN} />
      <circle cx="50" cy="87.5" r="3.4" fill={VUKA_GOLD} />
    </svg>
  );
}
