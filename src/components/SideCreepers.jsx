import React, { useEffect, useState } from 'react';

// Decorative neon line-art Minecraft figures fixed to the LEFT and RIGHT of every
// page (panel + landing). One figure per side; the figure RANDOMLY SWAPS every
// ~7s and RE-RUNS its draw-in animation on each swap. Left & right swap
// independently. Two visible instances only.
//
// REDRAW MECHANISM (React): each side keeps an index into FIGURES. A single
// shared interval bumps a tick; from the tick each side derives a fresh random
// index. The chosen figure is rendered with `key={side + '-' + idx + '-' + tick}`
// so React REMOUNTS the SVG on every swap → the CSS stroke-dasharray draw-in
// (which only plays once per mount) re-triggers from scratch.
//
// PERFORMANCE / NON-INTRUSIVE by design:
//  - wrapper is fixed inset-0, pointer-events:none, z-index:0 (BEHIND all content
//    which sits at z-index >= 10)
//  - opacity 0.2 (faint background decoration)
//  - hidden on screens < 1280px (can NEVER cover text/buttons on tablet/mobile)
//  - scaled down on 1280–1536px, full size >= 1536px
//  - respects prefers-reduced-motion (renders static, draw shown complete)
//  - moved INWARD from the screen edges (closer to the content column) but kept
//    in the dead gutter so it never overlaps the centered content
//
// SCOPING: every figure namespaces its animation/styling classes under its own
// `.oc-fig.<key>` selector, and every figure uses UNIQUE <filter> + @keyframes
// ids, so nothing leaks into global styles or collides in the DOM. The two live
// instances also pass a `side` suffix to keep glow-filter ids unique per side.

// ── Shared stroke styling helpers ──────────────────────────────────────────────
// Each figure's lines share one stroke colour. `face` fills get a faint tint.

// 1) Creeper (the original green body) — reused standalone and with TNT.
function CreeperBody({ scale = 1, dx = 0 }) {
  return (
    <g transform={`translate(${dx},0) scale(${scale})`}>
      <rect className="ln d1" x="278" y="42" width="124" height="112" rx="7" />
      <rect className="ln d1" x="286" y="166" width="108" height="128" rx="7" />
      <rect className="ln d2" x="292" y="302" width="44" height="42" rx="4" />
      <rect className="ln d2" x="344" y="302" width="44" height="42" rx="4" />
      <rect className="ln face d3" x="302" y="72" width="28" height="28" rx="3" />
      <rect className="ln face d3" x="350" y="72" width="28" height="28" rx="3" />
      <rect className="ln face d4" x="326" y="102" width="28" height="28" rx="3" />
      <rect className="ln face d5" x="312" y="116" width="16" height="32" rx="3" />
      <rect className="ln face d5" x="352" y="116" width="16" height="32" rx="3" />
    </g>
  );
}

// TNT block (red) — drawn next to the creeper's feet. Uses its OWN glow filter
// (passed in) so the red glow does not blend with the green body glow.
function Tnt({ tntGlowId }) {
  return (
    <g filter={`url(#${tntGlowId})`}>
      <rect className="ln tnt d2" x="150" y="118" width="90" height="90" rx="2" />
      <path className="ln tnt d3" d="M150,118 L180,88 L270,88 L240,118" />
      <path className="ln tnt d3" d="M240,118 L270,88 L270,178 L240,208" />
      <line className="ln tnt d4" x1="150" y1="150" x2="240" y2="150" />
      <line className="ln tnt d4" x1="150" y1="176" x2="240" y2="176" />
      {/* thin vertical streaks above the band */}
      <line className="ln tnt streak d5" x1="168" y1="120" x2="168" y2="148" />
      <line className="ln tnt streak d5" x1="186" y1="120" x2="186" y2="148" />
      <line className="ln tnt streak d5" x1="204" y1="120" x2="204" y2="148" />
      {/* thin vertical streaks below the band */}
      <line className="ln tnt streak d5" x1="168" y1="178" x2="168" y2="206" />
      <line className="ln tnt streak d5" x1="186" y1="178" x2="186" y2="206" />
      <line className="ln tnt streak d5" x1="222" y1="178" x2="222" y2="206" />
      <text className="tnt-label" x="195" y="169" textAnchor="middle">TNT</text>
    </g>
  );
}

// ── Figure registry ─────────────────────────────────────────────────────────────
// Each entry: key (scoped class + id prefix), stroke colour, faint face tint,
// viewBox, and a render fn that receives unique filter ids for this mount.
const FIGURES = [
  {
    key: 'creeper-tnt',
    stroke: '#22c55e',
    face: 'rgba(34,197,94,0.14)',
    // widen viewBox to the left so the TNT block (local x150..270) fits beside body
    viewBox: '120 28 290 326',
    render: ({ glowId, tntGlowId }) => (
      <>
        <g filter={`url(#${glowId})`} className="cfloat">
          <CreeperBody />
        </g>
        {/* TNT sits at the creeper's feet (its own coords, already in viewBox) */}
        <g className="cfloat" transform="translate(150,196) scale(0.62)">
          <Tnt tntGlowId={tntGlowId} />
        </g>
      </>
    ),
  },
  {
    key: 'creeper',
    stroke: '#22c55e',
    face: 'rgba(34,197,94,0.14)',
    viewBox: '266 30 148 326',
    // enlarged: scale the body up slightly around its centre
    render: ({ glowId }) => (
      <g filter={`url(#${glowId})`} className="cfloat">
        <g transform="translate(340,198) scale(1.1) translate(-340,-198)">
          <CreeperBody />
        </g>
      </g>
    ),
  },
  {
    key: 'sheep',
    stroke: '#eef2f7',
    face: 'rgba(238,242,247,0.10)',
    viewBox: '108 108 150 110',
    render: ({ glowId }) => (
      <g filter={`url(#${glowId})`} className="cfloat">
        {/* fluffy wool body */}
        <path
          className="ln d1"
          d="M150,186 L150,166 Q138,160 144,148 Q136,136 150,132 Q154,118 170,124 Q182,112 196,122 Q210,114 222,126 Q236,124 236,140 Q246,148 238,160 L238,186 Z"
        />
        {/* flat face head */}
        <rect className="ln d2" x="120" y="142" width="34" height="38" rx="7" />
        {/* ears */}
        <rect className="ln d2" x="120" y="135" width="9" height="9" />
        <rect className="ln d2" x="145" y="135" width="9" height="9" />
        {/* eyes */}
        <rect className="ln face d3" x="126" y="153" width="6" height="6" />
        <rect className="ln face d3" x="142" y="153" width="6" height="6" />
        {/* mouth */}
        <line className="ln d3" x1="128" y1="171" x2="146" y2="171" />
        {/* legs */}
        <rect className="ln d4" x="160" y="186" width="12" height="24" />
        <rect className="ln d4" x="184" y="186" width="12" height="24" />
        <rect className="ln d4" x="214" y="186" width="12" height="24" />
        <rect className="ln d4" x="232" y="186" width="12" height="24" />
      </g>
    ),
  },
  {
    key: 'pig',
    stroke: '#f9a8d4',
    face: 'rgba(249,168,212,0.12)',
    viewBox: '380 116 178 100',
    render: ({ glowId }) => (
      <g filter={`url(#${glowId})`} className="cfloat">
        {/* body */}
        <rect className="ln d1" x="430" y="132" width="120" height="54" rx="12" />
        {/* head */}
        <rect className="ln d2" x="402" y="138" width="42" height="46" rx="6" />
        {/* ears */}
        <path className="ln d2" d="M406,138 L414,124 L422,138" />
        <path className="ln d2" d="M426,138 L434,124 L442,138" />
        {/* eyes */}
        <rect className="ln face d3" x="412" y="147" width="6" height="6" />
        <rect className="ln face d3" x="428" y="147" width="6" height="6" />
        {/* snout */}
        <rect className="ln d3" x="384" y="154" width="24" height="22" rx="4" />
        <rect className="ln face d4" x="390" y="162" width="5" height="7" />
        <rect className="ln face d4" x="399" y="162" width="5" height="7" />
        {/* legs */}
        <rect className="ln d4" x="440" y="186" width="14" height="24" />
        <rect className="ln d4" x="466" y="186" width="14" height="24" />
        <rect className="ln d4" x="506" y="186" width="14" height="24" />
        <rect className="ln d4" x="528" y="186" width="14" height="24" />
      </g>
    ),
  },
  {
    key: 'steve',
    stroke: '#eef2f7',
    face: 'rgba(238,242,247,0.10)',
    viewBox: '150 30 200 326',
    render: ({ glowId }) => (
      <g filter={`url(#${glowId})`} className="cfloat">
        {/* head */}
        <rect className="ln d1" x="208" y="44" width="84" height="84" rx="4" />
        {/* eyes */}
        <rect className="ln face d3" x="224" y="74" width="16" height="16" rx="2" />
        <rect className="ln face d3" x="260" y="74" width="16" height="16" rx="2" />
        {/* nose */}
        <rect className="ln face d4" x="244" y="92" width="12" height="12" rx="2" />
        {/* mouth */}
        <line className="ln d4" x1="232" y1="114" x2="268" y2="114" />
        {/* torso */}
        <rect className="ln d2" x="216" y="140" width="68" height="96" rx="4" />
        {/* left arm (figure's left, hanging) */}
        <rect className="ln d2" x="180" y="142" width="30" height="92" rx="4" />
        {/* right arm (raised, holding pickaxe) */}
        <rect className="ln d2" x="290" y="92" width="28" height="76" rx="4" />
        {/* legs */}
        <rect className="ln d5" x="222" y="244" width="28" height="92" rx="4" />
        <rect className="ln d5" x="252" y="244" width="28" height="92" rx="4" />
        {/* pickaxe — stick from the raised hand, angular head on top */}
        <line className="ln pick d3" x1="304" y1="100" x2="304" y2="40" />
        <path className="ln pick d4" d="M276,52 Q304,30 332,52" />
        <line className="ln pick d4" x1="276" y1="52" x2="284" y2="60" />
        <line className="ln pick d4" x1="332" y1="52" x2="324" y2="60" />
      </g>
    ),
  },
];

// Build the scoped CSS block once. Each figure namespaces its stroke/keyframes by
// its `key`; ids are uniquified per mount in the component below.
function figureCss(fig) {
  const k = fig.key;
  return `
    .oc-fig.${k} .ln {
      stroke: ${fig.stroke};
      stroke-dasharray: 720;
      stroke-dashoffset: 720;
      animation: ocDraw-${k} 1.5s ease forwards, ocFlash-${k} 4.6s ease-in-out 1.6s infinite;
    }
    .oc-fig.${k} .face { fill: ${fig.face}; }
    .oc-fig.${k} .tnt-label {
      fill: #f87171; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-weight: 700; font-size: 16px; opacity: 0;
      animation: ocLabel-${k} .6s ease 1.1s forwards;
    }
    @keyframes ocDraw-${k} { to { stroke-dashoffset: 0; } }
    @keyframes ocLabel-${k} { to { opacity: .9; } }
    @keyframes ocFlash-${k} {
      0%,88%,100% { stroke: ${fig.stroke}; }
      93% { stroke: #ffffff; stroke-width: 4.3; }
    }
    @media (prefers-reduced-motion: reduce) {
      .oc-fig.${k} .ln { animation: none; stroke-dashoffset: 0; }
      .oc-fig.${k} .tnt-label { animation: none; opacity: .9; }
    }
  `;
}

// A single rendered figure. Remounting (via key) replays the draw-in.
function Figure({ fig, side }) {
  const glowId = `glow-${fig.key}-${side}`;
  const tntGlowId = `tntglow-${fig.key}-${side}`;
  return (
    <svg
      className={`oc-fig ${fig.key}`}
      viewBox={fig.viewBox}
      aria-hidden="true"
      focusable="false"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {fig.key === 'creeper-tnt' && (
          <filter id={tntGlowId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3.2" result="bt" />
            <feMerge>
              <feMergeNode in="bt" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        )}
      </defs>
      {fig.render({ glowId, tntGlowId })}
    </svg>
  );
}

const SWAP_MS = 7000;

// Pick a random figure index, optionally avoiding `prev` so a swap is visible.
function pickIdx(prev) {
  if (FIGURES.length <= 1) return 0;
  let i = Math.floor(Math.random() * FIGURES.length);
  if (i === prev) i = (i + 1) % FIGURES.length;
  return i;
}

export default function SideCreepers() {
  // Independent indices per side; `tick` forces remount even if same index lands.
  const [left, setLeft] = useState(() => pickIdx(-1));
  const [right, setRight] = useState(() => pickIdx(-1));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Single shared interval drives both sides → lightweight, one timer.
    const id = setInterval(() => {
      setLeft((p) => pickIdx(p));
      setRight((p) => pickIdx(p));
      setTick((t) => t + 1);
    }, SWAP_MS);
    return () => clearInterval(id);
  }, []);

  const leftFig = FIGURES[left];
  const rightFig = FIGURES[right];

  return (
    <div className="side-creepers" aria-hidden="true">
      <style>{`
        .side-creepers {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          opacity: 0.2;
        }
        .side-creepers .oc-side {
          position: fixed;
          top: 50%;
          width: 190px;
          height: auto;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        /* Moved INWARD from the edges (closer to the content column) but kept in
           the dead gutter so it never overlaps centered content. */
        .side-creepers .oc-side.left {
          left: 3vw;
          transform: translateY(-50%);
        }
        .side-creepers .oc-side.right {
          right: 3vw;
          transform: translateY(-50%) scaleX(-1);
        }
        .side-creepers svg {
          width: 100%;
          height: auto;
          max-height: 60vh;
          display: block;
        }

        .side-creepers .ln {
          fill: none;
          stroke-width: 3.4;
          stroke-linejoin: round;
          stroke-linecap: round;
        }
        .side-creepers .ln.tnt { stroke: #f87171; }
        .side-creepers .ln.streak { stroke-width: 1.4; opacity: 0.45; }

        .side-creepers .cfloat { animation: ocSideFloat 4.6s ease-in-out infinite; }

        /* staggered draw-in delays (drive both the draw + the flash) */
        .side-creepers .ln.d1 { animation-delay: 0s, 1.6s; }
        .side-creepers .ln.d2 { animation-delay: .16s, 1.74s; }
        .side-creepers .ln.d3 { animation-delay: .32s, 1.88s; }
        .side-creepers .ln.d4 { animation-delay: .46s, 2s; }
        .side-creepers .ln.d5 { animation-delay: .58s, 2.1s; }

        @keyframes ocSideFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-11px); } }

        /* per-figure stroke colours, draw + flash keyframes, label fade */
        ${FIGURES.map(figureCss).join('\n')}

        /* RESPONSIVE: full size >= 1536px; scaled down on 1280–1536px;
           completely HIDDEN below 1280px so it can never cover content. */
        @media (min-width: 1280px) and (max-width: 1535px) {
          .side-creepers .oc-side { width: 150px; }
          .side-creepers .oc-side.left { left: 1.5vw; }
          .side-creepers .oc-side.right { right: 1.5vw; }
        }
        @media (max-width: 1279px) {
          .side-creepers { display: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .side-creepers .cfloat { animation: none; }
        }
      `}</style>

      <div className="oc-side left">
        <Figure key={`left-${left}-${tick}`} fig={leftFig} side="l" />
      </div>
      <div className="oc-side right">
        <Figure key={`right-${right}-${tick}`} fig={rightFig} side="r" />
      </div>
    </div>
  );
}
