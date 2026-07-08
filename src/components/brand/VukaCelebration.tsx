'use client';

import { VUKA_GREEN, VUKA_GREEN_LIGHT, VUKA_GOLD } from './VukaMark';

interface VukaCelebrationProps {
  /** 'hero' = full detail with crate, confetti & notes. 'badge' = compact, calmer loop for corners/nav. */
  variant?: 'hero' | 'badge';
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * VukaCelebration — a fan hululating (ululating) and dancing over a record
 * they just bought from a Vuka stand. Built entirely from the brand mark's
 * palette so it reads as "Vuka" even in motion: accent-green figure, gold
 * sound & confetti accents, dark stage.
 */
export default function VukaCelebration({
  variant = 'hero',
  size,
  className,
  style,
}: VukaCelebrationProps) {
  const isHero = variant === 'hero';
  const dim = size ?? (isHero ? 320 : 108);

  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 240 240"
      className={`vuka-cel ${isHero ? 'vuka-cel--hero' : 'vuka-cel--badge'} ${className ?? ''}`}
      style={style}
      role="img"
      aria-label="Illustration of a fan celebrating a vinyl bought from Vuka"
    >
      {/* ── ground shadow ── */}
      <ellipse cx="118" cy="205" rx="46" ry="8" fill="#000" opacity="0.35" />

      {isHero && (
        <>
          {/* ── crate / stand nod ── */}
          <g opacity="0.55">
            <rect x="150" y="188" width="46" height="20" rx="2" fill="none" stroke={VUKA_GOLD} strokeWidth="1.4" />
            <line x1="150" y1="196" x2="196" y2="196" stroke={VUKA_GOLD} strokeWidth="1" opacity="0.6" />
            <circle cx="160" cy="192" r="7" fill="none" stroke={VUKA_GREEN} strokeWidth="1.2" />
            <circle cx="172" cy="192" r="7" fill="none" stroke={VUKA_GREEN} strokeWidth="1.2" />
            <circle cx="184" cy="192" r="7" fill="none" stroke={VUKA_GREEN} strokeWidth="1.2" />
          </g>
        </>
      )}

      {/* ── whole rig bounces to the beat ── */}
      <g className="vuka-cel-rig">
        {/* ── sound / ululation rings, bursting from the mouth ── */}
        <g transform="translate(97,54)">
          <circle className="vuka-cel-ring vuka-cel-ring--1" r="6" fill="none" stroke={VUKA_GOLD} strokeWidth="2" />
          <circle className="vuka-cel-ring vuka-cel-ring--2" r="6" fill="none" stroke={VUKA_GOLD} strokeWidth="2" />
          <circle className="vuka-cel-ring vuka-cel-ring--3" r="6" fill="none" stroke={VUKA_GOLD} strokeWidth="2" />
        </g>

        {/* ── back leg (planted) ── */}
        <g className="vuka-cel-leg-back" style={{ transformOrigin: '113px 143px' }}>
          <path d="M113,143 C108,160 100,175 93,196" stroke={VUKA_GREEN} strokeWidth="10" strokeLinecap="round" fill="none" />
        </g>

        {/* ── front leg (kicking) ── */}
        <g className="vuka-cel-leg-front" style={{ transformOrigin: '117px 143px' }}>
          <path d="M117,143 C132,158 145,168 154,182" stroke={VUKA_GREEN_LIGHT} strokeWidth="10" strokeLinecap="round" fill="none" />
        </g>

        {/* ── torso ── */}
        <path d="M99,86 C96,108 100,128 115,145 C127,128 130,106 122,84 Z" fill={VUKA_GREEN} />

        {/* ── ululating arm (hand fluttering near mouth) ── */}
        <g className="vuka-cel-arm-mouth" style={{ transformOrigin: '101px 92px' }}>
          <path d="M101,92 C92,84 90,72 94,60" stroke={VUKA_GREEN} strokeWidth="9" strokeLinecap="round" fill="none" />
          <circle className="vuka-cel-hand-flutter" cx="94" cy="58" r="6.5" fill={VUKA_GREEN_LIGHT} />
        </g>

        {/* ── raised arm, holding the record up like a trophy ── */}
        <g className="vuka-cel-arm-vinyl" style={{ transformOrigin: '119px 90px' }}>
          <path d="M119,90 C132,78 140,62 143,44" stroke={VUKA_GREEN} strokeWidth="9" strokeLinecap="round" fill="none" />

          {/* the bought vinyl */}
          <g className="vuka-cel-vinyl" transform="translate(143,34)">
            <circle r="21" fill="#141414" stroke={VUKA_GOLD} strokeWidth="1" />
            <circle r="16" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            <circle r="11" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
            <circle r="6" fill={VUKA_GOLD} />
            <circle r="1.6" fill="#141414" />
            <rect x="-15" y="-9" width="10" height="3" rx="1.2" fill="rgba(255,255,255,0.35)" transform="rotate(-30)" />
          </g>
        </g>

        {/* ── head, tipped back mid-call ── */}
        <g className="vuka-cel-head" style={{ transformOrigin: '108px 82px' }}>
          <circle cx="108" cy="66" r="15" fill={VUKA_GREEN} />
        </g>
      </g>

      {isHero && (
        <>
          {/* ── floating notes ── */}
          <g className="vuka-cel-note vuka-cel-note--1" fill={VUKA_GOLD}>
            <circle cx="60" cy="80" r="3.4" />
            <rect x="62.6" y="55" width="2" height="26" />
          </g>
          <g className="vuka-cel-note vuka-cel-note--2" fill={VUKA_GREEN_LIGHT}>
            <circle cx="180" cy="110" r="3" />
            <rect x="182.3" y="88" width="1.8" height="24" />
          </g>

          {/* ── confetti ── */}
          {[
            { x: 55, y: 130, c: VUKA_GOLD, n: 1 },
            { x: 190, y: 70, c: VUKA_GREEN, n: 2 },
            { x: 70, y: 45, c: VUKA_GREEN_LIGHT, n: 3 },
            { x: 175, y: 150, c: VUKA_GOLD, n: 4 },
            { x: 45, y: 165, c: VUKA_GREEN, n: 5 },
            { x: 165, y: 40, c: VUKA_GREEN_LIGHT, n: 6 },
          ].map((p) => (
            <rect
              key={p.n}
              className={`vuka-cel-confetti vuka-cel-confetti--${p.n}`}
              x={p.x}
              y={p.y}
              width="5"
              height="5"
              rx="1"
              fill={p.c}
            />
          ))}
        </>
      )}

      <style>{`
        .vuka-cel-rig {
          animation: vukaCelBounce 1.1s ease-in-out infinite;
          transform-origin: 118px 205px;
        }
        @keyframes vukaCelBounce {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-9px) rotate(2deg); }
        }

        .vuka-cel-leg-front {
          animation: vukaCelKick 1.1s ease-in-out infinite;
        }
        @keyframes vukaCelKick {
          0%, 100% { transform: rotate(-6deg); }
          50% { transform: rotate(16deg); }
        }
        .vuka-cel-leg-back {
          animation: vukaCelKickBack 1.1s ease-in-out infinite;
        }
        @keyframes vukaCelKickBack {
          0%, 100% { transform: rotate(4deg); }
          50% { transform: rotate(-8deg); }
        }

        .vuka-cel-arm-vinyl {
          animation: vukaCelRaise 1.1s ease-in-out infinite;
        }
        @keyframes vukaCelRaise {
          0%, 100% { transform: rotate(-4deg); }
          50% { transform: rotate(6deg); }
        }
        .vuka-cel-vinyl {
          animation: vukaCelSpin 2.4s linear infinite;
        }
        @keyframes vukaCelSpin {
          from { transform: translate(143px,34px) rotate(0deg); }
          to   { transform: translate(143px,34px) rotate(360deg); }
        }

        .vuka-cel-arm-mouth {
          animation: vukaCelUlulateArm 1.1s ease-in-out infinite;
        }
        @keyframes vukaCelUlulateArm {
          0%, 100% { transform: rotate(3deg); }
          50% { transform: rotate(-9deg); }
        }
        .vuka-cel-hand-flutter {
          animation: vukaCelFlutter 0.16s ease-in-out infinite;
          transform-origin: 94px 58px;
        }
        @keyframes vukaCelFlutter {
          0%, 100% { transform: rotate(-14deg) scale(1); }
          50% { transform: rotate(14deg) scale(1.06); }
        }

        .vuka-cel-head {
          animation: vukaCelHead 1.1s ease-in-out infinite;
        }
        @keyframes vukaCelHead {
          0%, 100% { transform: rotate(-5deg); }
          50% { transform: rotate(7deg); }
        }

        .vuka-cel-ring {
          transform-origin: 0 0;
          opacity: 0;
        }
        .vuka-cel-ring--1 { animation: vukaCelRing 1.1s ease-out infinite; }
        .vuka-cel-ring--2 { animation: vukaCelRing 1.1s ease-out infinite 0.37s; }
        .vuka-cel-ring--3 { animation: vukaCelRing 1.1s ease-out infinite 0.74s; }
        @keyframes vukaCelRing {
          0% { transform: scale(0.5); opacity: 0.9; }
          80% { opacity: 0; }
          100% { transform: scale(2.6); opacity: 0; }
        }

        .vuka-cel-note { opacity: 0; }
        .vuka-cel-note--1 { animation: vukaCelFloat 3.2s ease-in infinite; }
        .vuka-cel-note--2 { animation: vukaCelFloat 3.2s ease-in infinite 1.4s; }
        @keyframes vukaCelFloat {
          0% { opacity: 0; transform: translateY(0) rotate(0deg); }
          15% { opacity: 0.9; }
          85% { opacity: 0.3; }
          100% { opacity: 0; transform: translateY(-46px) rotate(14deg); }
        }

        .vuka-cel-confetti {
          transform-origin: center;
          opacity: 0;
        }
        .vuka-cel-confetti--1 { animation: vukaCelConfetti 2.6s ease-in infinite 0.1s; }
        .vuka-cel-confetti--2 { animation: vukaCelConfetti 2.6s ease-in infinite 0.6s; }
        .vuka-cel-confetti--3 { animation: vukaCelConfetti 2.6s ease-in infinite 1.1s; }
        .vuka-cel-confetti--4 { animation: vukaCelConfetti 2.6s ease-in infinite 0.3s; }
        .vuka-cel-confetti--5 { animation: vukaCelConfetti 2.6s ease-in infinite 1.6s; }
        .vuka-cel-confetti--6 { animation: vukaCelConfetti 2.6s ease-in infinite 0.85s; }
        @keyframes vukaCelConfetti {
          0% { opacity: 0; transform: translateY(0) rotate(0deg); }
          10% { opacity: 1; }
          100% { opacity: 0; transform: translateY(34px) rotate(220deg); }
        }

        .vuka-cel--badge .vuka-cel-rig { animation-duration: 1.6s; }
        .vuka-cel--badge .vuka-cel-vinyl { animation-duration: 3.4s; }

        @media (prefers-reduced-motion: reduce) {
          .vuka-cel * { animation: none !important; }
          .vuka-cel-ring { opacity: 0 !important; }
        }
      `}</style>
    </svg>
  );
}
