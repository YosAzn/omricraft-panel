import React from 'react';

// Decorative neon-green line-art Creepers fixed to the LEFT and RIGHT edges of
// every page (panel + landing). Pure CSS, no JS, no state — two SVG instances.
//
// PERFORMANCE / NON-INTRUSIVE by design:
//  - wrapper is fixed inset-0, pointer-events:none, z-index:0 (BEHIND all content)
//  - opacity 0.16 (faint background decoration)
//  - hidden on screens < 1280px (no clutter on tablet/mobile)
//  - respects prefers-reduced-motion (renders static, no animation)
//
// SCOPING: every animation/styling class (.cfloat/.ln/.face) is namespaced under
// the `.side-creepers` wrapper so it can NEVER leak into and clash with global
// styles or the landing page's own .ln/.face usage elsewhere.
//
// The two SVGs share identical geometry but use UNIQUE <filter> ids
// (cglow-l / cglow-r) so the glow filter definitions don't collide in the DOM.

// One Creeper instance. `glowId` makes the <filter> id unique per side.
function Creeper({ glowId }) {
  return (
    <svg viewBox="270 28 140 326" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id={glowId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${glowId})`}>
        <g className="cfloat">
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
      </g>
    </svg>
  );
}

export default function SideCreepers() {
  return (
    <div className="side-creepers" aria-hidden="true">
      <style>{`
        .side-creepers {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          opacity: 0.16;
        }
        .side-creepers .oc-creeper {
          position: fixed;
          top: 50%;
          width: 130px;
          height: auto;
        }
        .side-creepers .oc-creeper.left {
          left: 0;
          transform: translateY(-50%);
        }
        .side-creepers .oc-creeper.right {
          right: 0;
          transform: translateY(-50%) scaleX(-1);
        }
        .side-creepers svg { width: 100%; height: auto; display: block; }

        .side-creepers .cfloat { animation: ocFloat 4.6s ease-in-out infinite; }
        .side-creepers .ln {
          fill: none;
          stroke: #22c55e;
          stroke-width: 3.4;
          stroke-linejoin: round;
          stroke-linecap: round;
          stroke-dasharray: 680;
          stroke-dashoffset: 680;
          animation: ocDraw 1.5s ease forwards, ocFlash 4.6s ease-in-out 1.6s infinite;
        }
        .side-creepers .face { fill: rgba(34,197,94,0.14); }

        .side-creepers .ln.d1 { animation-delay: 0s, 1.6s; }
        .side-creepers .ln.d2 { animation-delay: .16s, 1.74s; }
        .side-creepers .ln.d3 { animation-delay: .32s, 1.88s; }
        .side-creepers .ln.d4 { animation-delay: .46s, 2s; }
        .side-creepers .ln.d5 { animation-delay: .58s, 2.1s; }

        @keyframes ocDraw { to { stroke-dashoffset: 0; } }
        @keyframes ocFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-11px); } }
        @keyframes ocFlash {
          0%,88%,100% { stroke: #22c55e; }
          93% { stroke: #dcfce7; stroke-width: 4.3; }
        }

        /* Hide on tablet/mobile — no clutter on small screens */
        @media (max-width: 1279px) {
          .side-creepers { display: none; }
        }

        /* Respect motion preference — show static, no animation */
        @media (prefers-reduced-motion: reduce) {
          .side-creepers .cfloat,
          .side-creepers .ln {
            animation: none;
          }
          .side-creepers .ln { stroke-dashoffset: 0; }
        }
      `}</style>

      <div className="oc-creeper left"><Creeper glowId="cglow-l" /></div>
      <div className="oc-creeper right"><Creeper glowId="cglow-r" /></div>
    </div>
  );
}
