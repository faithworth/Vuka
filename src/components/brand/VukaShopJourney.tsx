'use client';

import { VUKA_GREEN, VUKA_GREEN_LIGHT, VUKA_GOLD } from './VukaMark';

interface VukaShopJourneyProps {
  width?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * VukaShopJourney — a little looping story: a fan walks over to the Vuka
 * stand, buys a record (and a pair of headphones), then dances his way back
 * to his friends to jam. Everything is built from real jointed limbs
 * (head / torso / two arms / two legs) that swing on a shared stage, so the
 * character actually walks the distance rather than bouncing in place.
 *
 * The whole story is one 14s loop. Position + story beats (buying, raising
 * the record, handing it to the turntable) are driven by keyframes synced
 * to that 14s timeline. Idle motions (leg stride, arm sway, head bob,
 * record spin, friends vibing) are separate always-on loops layered
 * underneath, so the character never looks frozen even mid-story-beat.
 */
export default function VukaShopJourney({ width = 720, className, style }: VukaShopJourneyProps) {
  const height = Math.round(width * 0.4);

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 800 320"
      className={`vsj ${className ?? ''}`}
      style={style}
      role="img"
      aria-label="A fan walks to the Vuka stand, buys a record and headphones, then dances back to jam with friends"
    >
      <g className="vsj-scene">
        {/* ── ground ── */}
        <line x1="20" y1="253" x2="780" y2="253" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />

        {/* ── friends' spot ── */}
        <g transform="translate(100,0)">
          <ellipse cx="0" cy="256" rx="72" ry="9" fill="#000" opacity="0.3" />
          {/* the record stool, empty until the record comes home */}
          <rect x="-24" y="230" width="48" height="15" rx="3" fill="#1A1A1A" stroke="rgba(255,255,255,0.18)" />
          <circle cx="0" cy="222" r="2.4" fill={VUKA_GOLD} />

          <g className="vsj-homevinyl" transform="translate(0,222)">
            <g className="vsj-homevinyl-spin">
              <circle r="17" fill="#141414" stroke={VUKA_GOLD} strokeWidth="1.2" />
              <circle r="12" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
              <circle r="4.5" fill={VUKA_GOLD} />
              <circle r="1.2" fill="#141414" />
            </g>
          </g>
        </g>

        {/* ── Vuka stand ── */}
        <g transform="translate(660,0)">
          <ellipse cx="0" cy="256" rx="90" ry="10" fill="#000" opacity="0.35" />
          <line x1="-62" y1="110" x2="-62" y2="205" stroke={VUKA_GREEN} strokeWidth="6" strokeLinecap="round" />
          <line x1="62" y1="110" x2="62" y2="205" stroke={VUKA_GREEN} strokeWidth="6" strokeLinecap="round" />

          {/* scalloped awning */}
          <g>
            {[-62, -37, -12, 13, 38].map((x, i) => (
              <polygon
                key={x}
                points={`${x},92 ${x + 25},92 ${x + 12.5},112`}
                fill={i % 2 === 0 ? VUKA_GREEN : VUKA_GOLD}
              />
            ))}
            <rect x="-62" y="86" width="124" height="8" rx="2" fill={VUKA_GREEN} />
          </g>

          <text x="0" y="72" textAnchor="middle" fontFamily="Syne, sans-serif" fontWeight={700} fontSize="24" fill={VUKA_GOLD}>
            VUKA
          </text>

          {/* counter */}
          <rect x="-70" y="196" width="140" height="16" rx="2" fill="#1A1A1A" stroke="rgba(255,255,255,0.15)" />
          {/* crates with vinyl peeking out */}
          <g opacity="0.8">
            <rect x="-55" y="212" width="30" height="16" rx="2" fill="none" stroke={VUKA_GOLD} strokeWidth="1.2" />
            <circle cx="-40" cy="210" r="6" fill="none" stroke={VUKA_GREEN} strokeWidth="1" />
            <rect x="25" y="212" width="30" height="16" rx="2" fill="none" stroke={VUKA_GOLD} strokeWidth="1.2" />
            <circle cx="40" cy="210" r="6" fill="none" stroke={VUKA_GREEN} strokeWidth="1" />
          </g>

          {/* shopkeeper, waist-up behind the counter */}
          <g className="vsj-keeper" style={{ transformOrigin: '0px 196px' }}>
            <circle cx="0" cy="160" r="12" fill={VUKA_GREEN_LIGHT} />
            <path d="M-11,196 C-12,180 -9,168 0,164 C9,168 12,180 11,196 Z" fill={VUKA_GREEN_LIGHT} />
          </g>
        </g>

        {/* ── friend A ── */}
        <g className="vsj-friendA" transform="translate(48,253)" style={{ transformOrigin: '0px 0px' }}>
          <path d="M-8,0 C-9,-24 -6,-40 0,-46 C6,-40 9,-24 8,0 Z" fill={VUKA_GOLD} />
          <circle cx="0" cy="-56" r="11" fill={VUKA_GOLD} />
          <line className="vsj-friendA-arm" x1="-7" y1="-38" x2="-15" y2="-20" stroke={VUKA_GOLD} strokeWidth="6" strokeLinecap="round" style={{ transformOrigin: '-7px -38px' }} />
          <line className="vsj-friendA-arm2" x1="7" y1="-38" x2="15" y2="-20" stroke={VUKA_GOLD} strokeWidth="6" strokeLinecap="round" style={{ transformOrigin: '7px -38px' }} />
        </g>

        {/* ── friend B ── */}
        <g className="vsj-friendB" transform="translate(158,253)" style={{ transformOrigin: '0px 0px' }}>
          <path d="M-8,0 C-9,-24 -6,-40 0,-46 C6,-40 9,-24 8,0 Z" fill={VUKA_GREEN_LIGHT} />
          <circle cx="0" cy="-56" r="11" fill={VUKA_GREEN_LIGHT} />
          <line className="vsj-friendB-arm" x1="-7" y1="-38" x2="-15" y2="-20" stroke={VUKA_GREEN_LIGHT} strokeWidth="6" strokeLinecap="round" style={{ transformOrigin: '-7px -38px' }} />
          <line className="vsj-friendB-arm2" x1="7" y1="-38" x2="15" y2="-20" stroke={VUKA_GREEN_LIGHT} strokeWidth="6" strokeLinecap="round" style={{ transformOrigin: '7px -38px' }} />
        </g>

        {/* ── the jam fx: rings + notes once everyone's dancing ── */}
        <g className="vsj-jamfx" transform="translate(100,180)">
          <circle className="vsj-ring vsj-ring--1" r="7" fill="none" stroke={VUKA_GOLD} strokeWidth="2" />
          <circle className="vsj-ring vsj-ring--2" r="7" fill="none" stroke={VUKA_GOLD} strokeWidth="2" />
          <g className="vsj-note vsj-note--1" fill={VUKA_GOLD}>
            <circle cx="-40" cy="10" r="4" />
            <rect x="-37.5" y="-16" width="2.4" height="26" />
          </g>
          <g className="vsj-note vsj-note--2" fill={VUKA_GREEN_LIGHT}>
            <circle cx="42" cy="0" r="3.6" />
            <rect x="44.2" y="-22" width="2.2" height="22" />
          </g>
        </g>

        {/* ── the protagonist ── */}
        <g className="vsj-walker-stage">
          <g className="vsj-walker-bounce">
            {/* legs */}
            <g className="vsj-leg-back" style={{ transformOrigin: '0px -40px' }}>
              <line x1="0" y1="-40" x2="-9" y2="0" stroke={VUKA_GREEN} strokeWidth="10" strokeLinecap="round" />
            </g>
            <g className="vsj-leg-front" style={{ transformOrigin: '0px -40px' }}>
              <line x1="0" y1="-40" x2="9" y2="0" stroke={VUKA_GREEN_LIGHT} strokeWidth="10" strokeLinecap="round" />
            </g>

            {/* torso */}
            <path d="M-9,-74 C-11,-58 -8,-46 0,-40 C8,-46 11,-58 9,-74 Z" fill={VUKA_GREEN} />

            {/* left arm — free, always swinging */}
            <g className="vsj-arm-left" style={{ transformOrigin: '0px -74px' }}>
              <line x1="0" y1="-74" x2="-11" y2="-46" stroke={VUKA_GREEN} strokeWidth="8" strokeLinecap="round" />
            </g>

            {/* right arm — the story arm: swings, reaches, then raises the record */}
            <g className="vsj-arm-right" style={{ transformOrigin: '0px -74px' }}>
              <line x1="0" y1="-74" x2="11" y2="-46" stroke={VUKA_GREEN} strokeWidth="8" strokeLinecap="round" />
              <g className="vsj-vinylhand" transform="translate(11,-46)">
                <g className="vsj-vinylhand-spin">
                  <circle r="15" fill="#141414" stroke={VUKA_GOLD} strokeWidth="1.2" />
                  <circle r="10" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
                  <circle r="4" fill={VUKA_GOLD} />
                  <circle r="1.1" fill="#141414" />
                </g>
              </g>
            </g>

            {/* head + headphones */}
            <g className="vsj-head" style={{ transformOrigin: '0px -74px' }}>
              <circle cx="0" cy="-92" r="13" fill={VUKA_GREEN} />
              <g className="vsj-headphones">
                <path d="M-12,-92 C-12,-104 12,-104 12,-92" fill="none" stroke={VUKA_GOLD} strokeWidth="2.4" strokeLinecap="round" />
                <circle cx="-12" cy="-89" r="4.2" fill={VUKA_GOLD} />
                <circle cx="12" cy="-89" r="4.2" fill={VUKA_GOLD} />
              </g>
            </g>
          </g>
        </g>

        {/* ── coin flourish at the counter ── */}
        <g className="vsj-coin" transform="translate(660,215)">
          <circle r="5" fill={VUKA_GOLD} />
        </g>
      </g>

      <style>{`
        .vsj-walker-stage {
          transform: translate(100px,253px);
          animation: vsjMove 14s ease-in-out infinite;
        }
        @keyframes vsjMove {
          0%   { transform: translate(100px,253px); }
          6%   { transform: translate(100px,253px); }
          30%  { transform: translate(650px,253px); }
          38%  { transform: translate(650px,253px); }
          40%  { transform: translate(650px,237px); }
          42%  { transform: translate(650px,253px); }
          44%  { transform: translate(650px,239px); }
          46%  { transform: translate(650px,253px); }
          74%  { transform: translate(100px,253px); }
          100% { transform: translate(100px,253px); }
        }

        .vsj-walker-bounce {
          animation: vsjBounce 0.9s ease-in-out infinite;
        }
        @keyframes vsjBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-5px); }
        }

        .vsj-leg-back { transform: rotate(18deg); animation: vsjLegBack 0.9s ease-in-out infinite; }
        @keyframes vsjLegBack {
          0%, 100% { transform: rotate(18deg); }
          50% { transform: rotate(-16deg); }
        }
        .vsj-leg-front { transform: rotate(-16deg); animation: vsjLegFront 0.9s ease-in-out infinite; }
        @keyframes vsjLegFront {
          0%, 100% { transform: rotate(-16deg); }
          50% { transform: rotate(18deg); }
        }

        .vsj-arm-left { transform: rotate(-20deg); animation: vsjArmLeft 0.9s ease-in-out infinite; }
        @keyframes vsjArmLeft {
          0%, 100% { transform: rotate(-20deg); }
          50% { transform: rotate(22deg); }
        }

        .vsj-arm-right {
          transform: rotate(8deg);
          animation: vsjArmRight 14s ease-in-out infinite;
        }
        @keyframes vsjArmRight {
          0%   { transform: rotate(8deg); }
          6%   { transform: rotate(8deg); }
          14%  { transform: rotate(-18deg); }
          22%  { transform: rotate(8deg); }
          28%  { transform: rotate(-18deg); }
          32%  { transform: rotate(26deg); }
          36%  { transform: rotate(50deg); }
          39%  { transform: rotate(-85deg); }
          55%  { transform: rotate(-72deg); }
          65%  { transform: rotate(-88deg); }
          73%  { transform: rotate(-74deg); }
          80%  { transform: rotate(-88deg); }
          90%  { transform: rotate(-72deg); }
          95%  { transform: rotate(-40deg); }
          98%  { transform: rotate(8deg); }
          100% { transform: rotate(8deg); }
        }

        .vsj-vinylhand {
          animation: vsjVinylHandFade 14s ease-in-out infinite;
        }
        @keyframes vsjVinylHandFade {
          0%   { opacity: 0; }
          37%  { opacity: 0; }
          39%  { opacity: 1; }
          73%  { opacity: 1; }
          75%  { opacity: 0; }
          100% { opacity: 0; }
        }
        .vsj-vinylhand-spin { animation: vsjSpin 2.2s linear infinite; }

        .vsj-homevinyl {
          animation: vsjHomeVinylFade 14s ease-in-out infinite;
        }
        @keyframes vsjHomeVinylFade {
          0%   { opacity: 0; }
          74%  { opacity: 0; }
          76%  { opacity: 1; }
          95%  { opacity: 1; }
          98%  { opacity: 0; }
          100% { opacity: 0; }
        }
        .vsj-homevinyl-spin { animation: vsjSpin 2.6s linear infinite; }
        @keyframes vsjSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .vsj-headphones {
          animation: vsjHeadphoneFade 14s ease-in-out infinite;
        }
        @keyframes vsjHeadphoneFade {
          0%   { opacity: 0; }
          37%  { opacity: 0; }
          39%  { opacity: 1; }
          96%  { opacity: 1; }
          99%  { opacity: 0; }
          100% { opacity: 0; }
        }

        .vsj-head { transform: rotate(-4deg); animation: vsjHead 0.9s ease-in-out infinite; }
        @keyframes vsjHead {
          0%, 100% { transform: rotate(-4deg); }
          50% { transform: rotate(5deg); }
        }

        .vsj-coin {
          animation: vsjCoin 14s ease-in-out infinite;
        }
        @keyframes vsjCoin {
          0%   { opacity: 0; transform: translate(660px,215px) scale(0.6); }
          29%  { opacity: 0; }
          31%  { opacity: 1; transform: translate(660px,215px) scale(1); }
          34%  { opacity: 1; transform: translate(672px,208px) scale(0.8); }
          36%  { opacity: 0; transform: translate(676px,204px) scale(0.5); }
          100% { opacity: 0; }
        }

        .vsj-keeper { animation: vsjKeeper 2.4s ease-in-out infinite; }
        @keyframes vsjKeeper {
          0%, 100% { transform: rotate(-2deg); }
          50% { transform: rotate(2deg); }
        }

        .vsj-friendA { animation: vsjSwayA 1.2s ease-in-out infinite; }
        .vsj-friendB { animation: vsjSwayB 1.2s ease-in-out infinite 0.3s; }
        @keyframes vsjSwayA {
          0%, 100% { transform: translate(48px,253px) rotate(-4deg); }
          50% { transform: translate(48px,253px) rotate(4deg); }
        }
        @keyframes vsjSwayB {
          0%, 100% { transform: translate(158px,253px) rotate(-4deg); }
          50% { transform: translate(158px,253px) rotate(4deg); }
        }
        .vsj-friendA-arm, .vsj-friendB-arm { animation: vsjFriendArm 1.2s ease-in-out infinite; }
        .vsj-friendA-arm2, .vsj-friendB-arm2 { animation: vsjFriendArm2 1.2s ease-in-out infinite; }
        @keyframes vsjFriendArm {
          0%, 100% { transform: rotate(-10deg); }
          50% { transform: rotate(20deg); }
        }
        @keyframes vsjFriendArm2 {
          0%, 100% { transform: rotate(10deg); }
          50% { transform: rotate(-20deg); }
        }

        .vsj-jamfx {
          animation: vsjJamFxFade 14s ease-in-out infinite;
        }
        @keyframes vsjJamFxFade {
          0%   { opacity: 0; }
          74%  { opacity: 0; }
          77%  { opacity: 1; }
          95%  { opacity: 1; }
          98%  { opacity: 0; }
          100% { opacity: 0; }
        }
        .vsj-ring { transform-origin: 0 0; opacity: 0; }
        .vsj-ring--1 { animation: vsjRing 1.3s ease-out infinite; }
        .vsj-ring--2 { animation: vsjRing 1.3s ease-out infinite 0.65s; }
        @keyframes vsjRing {
          0% { transform: scale(0.6); opacity: 0.9; }
          80% { opacity: 0; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        .vsj-note { opacity: 0; }
        .vsj-note--1 { animation: vsjFloat 2.8s ease-in infinite; }
        .vsj-note--2 { animation: vsjFloat 2.8s ease-in infinite 1.3s; }
        @keyframes vsjFloat {
          0% { opacity: 0; transform: translateY(0); }
          15% { opacity: 0.9; }
          85% { opacity: 0.3; }
          100% { opacity: 0; transform: translateY(-40px) rotate(10deg); }
        }

        @media (prefers-reduced-motion: reduce) {
          .vsj * { animation: none !important; }
          .vsj-vinylhand, .vsj-headphones, .vsj-homevinyl, .vsj-jamfx, .vsj-coin { opacity: 0 !important; }
        }
      `}</style>
    </svg>
  );
}
