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
// Proportions tuned toward classic Minecraft: a SQUARE head (118×118, centred on
// x≈340), a tall narrow torso beneath it, and two sturdy front legs (front-view
// creeper). Face = classic creeper mask (two square eyes + T-shaped mouth).
function CreeperBody({ scale = 1, dx = 0 }) {
  return (
    <g transform={`translate(${dx},0) scale(${scale})`}>
      {/* square head */}
      <rect className="ln d1" x="281" y="42" width="118" height="118" rx="7" />
      {/* tall narrow torso */}
      <rect className="ln d1" x="298" y="170" width="84" height="120" rx="6" />
      {/* two sturdy front legs, squarely under the torso */}
      <rect className="ln d2" x="300" y="290" width="36" height="52" rx="4" />
      <rect className="ln d2" x="344" y="290" width="36" height="52" rx="4" />
      {/* creeper face mask — two eyes + T-shaped mouth, centred on the square head */}
      <rect className="ln face d3" x="304" y="74" width="26" height="26" rx="3" />
      <rect className="ln face d3" x="350" y="74" width="26" height="26" rx="3" />
      <rect className="ln face d4" x="327" y="100" width="26" height="30" rx="3" />
      <rect className="ln face d5" x="313" y="114" width="16" height="34" rx="3" />
      <rect className="ln face d5" x="351" y="114" width="16" height="34" rx="3" />
    </g>
  );
}

// A single TNT block primitive (red line-art) drawn in its own local space
// (x150..270 / y88..208). `showLabel` toggles the "TNT" text — the multi-TNT
// pile omits the label on the smaller blocks so the cluster stays legible.
function TntBlock({ showLabel = true }) {
  return (
    <g>
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
      {showLabel && (
        <text className="tnt-label" x="195" y="169" textAnchor="middle">TNT</text>
      )}
    </g>
  );
}

// TNT block (red) — drawn next to the creeper's feet. Uses its OWN glow filter
// (passed in) so the red glow does not blend with the green body glow.
function Tnt({ tntGlowId }) {
  return (
    <g filter={`url(#${tntGlowId})`}>
      <TntBlock />
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
    // Tight frame around the creeper body (scaled legs reach ~x384) plus ONE small
    // TNT crate LOWERED to sit ON THE FLOOR at the creeper's feet (not floating up
    // beside the body). TntBlock local space is x150..270 / y88..208; at scale 0.55
    // it's a compact crate. translate(308,242): block-bottom (local y208) lands on
    // the floor (~y356, level with the scaled leg bottoms) and its left edge tucks
    // just right of the right leg. Generous top/bottom headroom for float + glow.
    viewBox: '258 4 240 362',
    render: ({ glowId, tntGlowId }) => (
      <>
        <g filter={`url(#${glowId})`} className="cfloat">
          <g transform="translate(340,198) scale(1.1) translate(-340,-198)">
            <CreeperBody />
          </g>
        </g>
        {/* ONE small TNT crate LOWERED onto the floor at the creeper's feet,
            bottom-aligned with the legs (~y356), just right of the right leg. */}
        <g className="cfloat" transform="translate(308,242) scale(0.55)">
          <Tnt tntGlowId={tntGlowId} />
        </g>
      </>
    ),
  },
  {
    key: 'creeper',
    stroke: '#22c55e',
    face: 'rgba(34,197,94,0.14)',
    // viewBox padded (esp. top) so the 1.1x scale + float + glow never clip the head
    viewBox: '260 4 158 362',
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
    walks: true,
    // BLOCKY Minecraft sheep (side view, like the reference): a big rounded-corner
    // rectangular WOOL body, a smaller SQUARE head jutting out at the front-lower
    // left with two ears, and 4 stubby legs (front pair under the head, back pair
    // under the tail). Frame x116..246 / y124..212 with float+glow headroom.
    viewBox: '104 84 158 172',
    render: ({ glowId }) => (
      <g filter={`url(#${glowId})`} className="cfloat">
        {/* big fluffy wool body — rounded rectangle */}
        <rect className="ln d1" x="150" y="128" width="96" height="58" rx="14" />
        {/* square head at the front, dropped below the body line */}
        <rect className="ln d2" x="118" y="150" width="40" height="42" rx="6" />
        {/* ears on top of the head */}
        <rect className="ln d2" x="120" y="142" width="10" height="10" rx="2" />
        <rect className="ln d2" x="146" y="142" width="10" height="10" rx="2" />
        {/* eyes */}
        <rect className="ln face d3" x="125" y="162" width="7" height="7" rx="1" />
        <rect className="ln face d3" x="143" y="162" width="7" height="7" rx="1" />
        {/* muzzle / mouth */}
        <line className="ln d3" x1="126" y1="182" x2="150" y2="182" />
        {/* 4 stubby legs — front pair (under head), back pair (under tail) */}
        <rect className="ln d4" x="160" y="186" width="14" height="26" rx="2" />
        <rect className="ln d4" x="182" y="186" width="14" height="26" rx="2" />
        <rect className="ln d4" x="216" y="186" width="14" height="26" rx="2" />
        <rect className="ln d4" x="230" y="186" width="14" height="26" rx="2" />
      </g>
    ),
  },
  {
    key: 'pig',
    stroke: '#f9a8d4',
    face: 'rgba(249,168,212,0.12)',
    walks: true,
    // BLOCKY Minecraft pig (side view, like the reference): a chunky rectangular
    // body, a square head with two pointed ears, a PROMINENT square SNOUT on the
    // front face (two nostrils — the pig's signature), and 4 legs. Content
    // x382..548 / y124..212; frame with headroom for the walk + float + glow.
    viewBox: '366 84 200 172',
    render: ({ glowId }) => (
      <g filter={`url(#${glowId})`} className="cfloat">
        {/* chunky body */}
        <rect className="ln d1" x="430" y="130" width="118" height="58" rx="10" />
        {/* square head */}
        <rect className="ln d2" x="398" y="138" width="42" height="50" rx="6" />
        {/* pointed ears on top of the head */}
        <path className="ln d2" d="M404,138 L410,124 L418,138 Z" />
        <path className="ln d2" d="M424,138 L432,124 L438,138 Z" />
        {/* eyes */}
        <rect className="ln face d3" x="410" y="150" width="7" height="7" rx="1" />
        <rect className="ln face d3" x="426" y="150" width="7" height="7" rx="1" />
        {/* prominent square snout on the front face + two nostrils */}
        <rect className="ln d3" x="382" y="152" width="22" height="28" rx="3" />
        <rect className="ln face d4" x="387" y="161" width="5" height="9" rx="1" />
        <rect className="ln face d4" x="395" y="161" width="5" height="9" rx="1" />
        {/* 4 legs */}
        <rect className="ln d4" x="440" y="188" width="15" height="24" rx="2" />
        <rect className="ln d4" x="464" y="188" width="15" height="24" rx="2" />
        <rect className="ln d4" x="504" y="188" width="15" height="24" rx="2" />
        <rect className="ln d4" x="526" y="188" width="15" height="24" rx="2" />
      </g>
    ),
  },
  {
    key: 'steve',
    stroke: '#eef2f7',
    face: 'rgba(238,242,247,0.10)',
    walks: true,
    // Tightened so Steve renders as large as the creeper. Content x180..332 /
    // y30..336; padded for the swinging arm/pickaxe + walk + float + glow so the
    // head & raised pickaxe never clip.
    viewBox: '158 6 184 348',
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
        {/* legs */}
        <rect className="ln d5" x="222" y="244" width="28" height="92" rx="4" />
        <rect className="ln d5" x="252" y="244" width="28" height="92" rx="4" />
        {/* raised arm + pickaxe — grouped so they swing together about the shoulder
            (transform-origin ~ 304,100, the top of the raised arm). */}
        <g className="steve-arm">
          {/* right arm (raised, holding pickaxe) */}
          <rect className="ln d2" x="290" y="92" width="28" height="76" rx="4" />
          {/* pickaxe — stick from the raised hand, angular head on top */}
          <line className="ln pick d3" x1="304" y1="100" x2="304" y2="40" />
          <path className="ln pick d4" d="M276,52 Q304,30 332,52" />
          <line className="ln pick d4" x1="276" y1="52" x2="284" y2="60" />
          <line className="ln pick d4" x1="332" y1="52" x2="324" y2="60" />
        </g>
      </g>
    ),
  },
  {
    key: 'multi-tnt',
    stroke: '#22c55e',
    face: 'rgba(34,197,94,0.14)',
    // A creeper SURROUNDED by 3 TNT crates at its feet (stays put — no walk).
    // CreeperBody is scaled 1.1x like the other creepers (legs land at ~x296..384,
    // floor ~y356). Three TntBlock instances (local x150..270 / y88..208) sit at the
    // base, all LOWERED so their bottoms rest on the floor: LEFT of the legs, RIGHT
    // of the legs, and one slightly FORWARD + a touch lower at center. All labelled.
    // Wide viewBox frames the whole base + glow headroom.
    viewBox: '156 0 328 392',
    render: ({ glowId, tntGlowId }) => (
      <>
        {/* TNT to the LEFT and RIGHT of the legs, bottoms on the floor (~y356) */}
        <g filter={`url(#${tntGlowId})`} className="cfloat">
          <g transform="translate(98,242) scale(0.55)">
            <TntBlock showLabel />
          </g>
          <g transform="translate(311,242) scale(0.55)">
            <TntBlock showLabel />
          </g>
        </g>
        {/* the creeper itself — same 1.1x enlargement as the other creepers */}
        <g filter={`url(#${glowId})`} className="cfloat">
          <g transform="translate(340,198) scale(1.1) translate(-340,-198)">
            <CreeperBody />
          </g>
        </g>
        {/* third TNT slightly FORWARD + a touch lower at center, over the legs */}
        <g filter={`url(#${tntGlowId})`} className="cfloat">
          <g transform="translate(210,248) scale(0.6)">
            <TntBlock showLabel />
          </g>
        </g>
      </>
    ),
  },
];

// Build the scoped CSS block once. Each figure namespaces its stroke/keyframes by
// its `key`; ids are uniquified per mount in the component below.
function figureCss(fig) {
  const k = fig.key;
  return `
    .oc-fig.${k} .ln:not(.tnt) {
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
        {(fig.key === 'creeper-tnt' || fig.key === 'multi-tnt') && (
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
          opacity: 0.4;
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
        /* Hug the centered content column (max-w-6xl = 1152px → half 576px): the
           figure sits in the gutter right next to the text with a ~12px gap — as
           central as possible — clamped so it never runs off-screen. */
        .side-creepers .oc-side.left {
          left: max(8px, calc(50vw - 778px));
          transform: translateY(-50%);
        }
        .side-creepers .oc-side.right {
          right: max(8px, calc(50vw - 778px));
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
        .side-creepers .ln.tnt {
          stroke: #f87171;
          stroke-dasharray: 720; stroke-dashoffset: 720;
          animation: ocDrawTnt 1.5s ease forwards, ocFlashTnt 4.6s ease-in-out 1.6s infinite;
        }
        @keyframes ocDrawTnt { to { stroke-dashoffset: 0; } }
        @keyframes ocFlashTnt { 0%,88%,100% { stroke: #f87171; } 93% { stroke: #fecaca; stroke-width: 3.9; } }
        .side-creepers .ln.streak { stroke-width: 1.4; opacity: 0.45; }

        .side-creepers .cfloat { animation: ocSideFloat 4.6s ease-in-out infinite; }

        /* WALK: the whole figure (the <svg>) translates HORIZONTALLY outward past
           the screen edge then walks back in, looping. Both sides use the same
           NEGATIVE local translate — the right side's parent scaleX(-1) flips it,
           so left exits to the screen-left and right exits to the screen-right.
           A subtle body rock is layered in for a walking feel. Left & right are
           staggered (different durations) so they don't step in lockstep. */
        /* Only WALKING figures (animals + Steve) walk off-screen and back. Creepers
           carry/are-surrounded-by TNT and must STAY PUT — they get the float bob
           only. The walk class is added to the side wrapper per current figure. */
        .side-creepers .oc-side.left.walk svg { animation: ocWalk 13s ease-in-out infinite; }
        .side-creepers .oc-side.right.walk svg { animation: ocWalk 15.5s ease-in-out 1.5s infinite; }

        /* staggered draw-in delays (drive both the draw + the flash) */
        .side-creepers .ln.d1 { animation-delay: 0s, 1.6s; }
        .side-creepers .ln.d2 { animation-delay: .16s, 1.74s; }
        .side-creepers .ln.d3 { animation-delay: .32s, 1.88s; }
        .side-creepers .ln.d4 { animation-delay: .46s, 2s; }
        .side-creepers .ln.d5 { animation-delay: .58s, 2.1s; }

        @keyframes ocSideFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-11px); } }

        /* Walk cycle: dwell in place (figure visible + drawing) → walk OUT past the
           edge → brief pause off-screen → walk BACK in → dwell. The small rotate
           swings give a stride/rock so it reads as walking, not sliding. */
        @keyframes ocWalk {
          0%   { transform: translateX(0) rotate(0deg); }
          14%  { transform: translateX(0) rotate(0deg); }
          18%  { transform: translateX(-30px) rotate(-2.2deg); }
          24%  { transform: translateX(-130px) rotate(2.2deg); }
          30%  { transform: translateX(-260px) rotate(-2.2deg); }
          38%  { transform: translateX(-680px) rotate(0deg); }
          52%  { transform: translateX(-680px) rotate(0deg); }
          60%  { transform: translateX(-260px) rotate(2.2deg); }
          66%  { transform: translateX(-130px) rotate(-2.2deg); }
          72%  { transform: translateX(-30px) rotate(2.2deg); }
          78%  { transform: translateX(0) rotate(0deg); }
          100% { transform: translateX(0) rotate(0deg); }
        }

        /* Steve swings his raised arm + pickaxe about the shoulder (mining). */
        .side-creepers .steve-arm {
          transform-box: fill-box;
          transform-origin: 50% 100%;
          animation: ocSteveArm 1.45s ease-in-out infinite;
        }
        @keyframes ocSteveArm {
          0%,100% { transform: rotate(-9deg); }
          50%     { transform: rotate(11deg); }
        }

        /* per-figure stroke colours, draw + flash keyframes, label fade */
        ${FIGURES.map(figureCss).join('\n')}

        /* RESPONSIVE: full size >= 1536px; scaled down on 1280–1536px;
           completely HIDDEN below 1280px so it can never cover content. */
        /* The content column is a fixed 1152px (max-w-6xl); a ~190px figure fits in
           the side gutter without covering text only on wide screens. Below 1536px
           the gutter is too narrow, so hide it entirely — never cover the text. */
        @media (max-width: 1535px) {
          .side-creepers { display: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .side-creepers .cfloat { animation: none; }
          /* no walking off-screen, no arm swing → fully static when reduced */
          .side-creepers .oc-side.left svg,
          .side-creepers .oc-side.right svg { animation: none; transform: none; }
          .side-creepers .steve-arm { animation: none; }
        }
      `}</style>

      <div className={`oc-side left${leftFig.walks ? ' walk' : ''}`}>
        <Figure key={`left-${left}-${tick}`} fig={leftFig} side="l" />
      </div>
      <div className={`oc-side right${rightFig.walks ? ' walk' : ''}`}>
        <Figure key={`right-${right}-${tick}`} fig={rightFig} side="r" />
      </div>
    </div>
  );
}
