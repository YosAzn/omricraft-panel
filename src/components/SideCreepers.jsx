import React, { useEffect, useState } from 'react';

// Decorative Minecraft characters fixed to the LEFT and RIGHT of every page
// (panel + landing). One character per side; it RANDOMLY SWAPS every ~8s and
// replays its entrance on each swap. Left & right swap independently.
//
// The artwork is Yosef's faceted low-poly set (cut out of the source sheets with
// a soft alpha matte), which matches the crystal/facet language of the OmriCraft
// logo. It replaces the earlier hand-drawn neon SVG line-art.
//
// TRANSFORM LAYERING — each element owns exactly ONE transform, because a CSS
// animation on `transform` wipes any other transform on the same element:
//   .oc-side  → static position + right-side mirror   (no animation)
//   .oc-gait  → gait: walk cycle (translateX off-screen and back) or item sway
//   .oc-float → idle bob, translateY
//   .oc-scale → per-character size trim, static scale
//   img       → entrance, opacity + translateY + scale
//
// NON-INTRUSIVE by design (kept from the previous implementation):
//  - wrapper is fixed inset-0, pointer-events:none, z-index:0 (BEHIND all content,
//    which sits at z-index >= 10)
//  - lives in the dead gutter beside the centered 1152px content column, so it can
//    never overlap text or buttons
//  - hidden entirely below 1536px, where no gutter exists
//  - respects prefers-reduced-motion (static, fully visible)

import creeperGreen from '../assets/characters/creeper-green.webp';
import creeperTntTall from '../assets/characters/creeper-tnt-tall.webp';
import creeperTealTnt from '../assets/characters/creeper-teal-tnt.webp';
import creeperWhite from '../assets/characters/creeper-white.webp';
import stevePickaxe from '../assets/characters/steve-pickaxe.webp';
import horseWhite from '../assets/characters/horse-white.webp';
import wolfHearts from '../assets/characters/wolf-hearts.webp';
import sheepBlue from '../assets/characters/sheep-blue.webp';
import pigPink from '../assets/characters/pig-pink.webp';
import pigGold from '../assets/characters/pig-gold.webp';
import pigGreen from '../assets/characters/pig-green.webp';
import pigBlue from '../assets/characters/pig-blue.webp';
import pigPurple from '../assets/characters/pig-purple.webp';
import sheepRed from '../assets/characters/sheep-red.webp';
import mobSpider from '../assets/characters/mob-spider.webp';
import itemSwordDiamond from '../assets/characters/item-sword-diamond.webp';
import itemSwordNetherite from '../assets/characters/item-sword-netherite.webp';
import itemPickaxe from '../assets/characters/item-pickaxe.webp';
import itemPickaxePurple from '../assets/characters/item-pickaxe-purple.webp';
import itemPickaxeGray from '../assets/characters/item-pickaxe-gray.webp';
import itemAxe from '../assets/characters/item-axe.webp';
import itemTnt from '../assets/characters/item-tnt.webp';
import itemCreeperFace from '../assets/characters/item-creeper-face.webp';

// `glow`   — "r,g,b" triplet for the accent halo behind the art.
// `scale`  — evens out apparent size: the source art has mixed aspect ratios, so a
//            wide animal at gutter-width reads much smaller than a tall creeper.
// `motion` — 'hover' bobs gently in place; 'hold' stays put. Everything hovers for
//            now: Yosef found the simple in/out walk not lively enough and asked to
//            keep the calm hover until a PROPER free-walk is designed (a mob enters,
//            stops, "explores", wanders off behind the page, another turns up). The
//            'walk' gait + ocWalk keyframes are parked below, ready for that pass;
//            no roster entry uses 'walk' yet, so nothing walks.
// `weight` — relative odds of being picked. Items sit at 0.5 so they turn up now
//            and then rather than half the time.
const CHARACTERS = [
  { key: 'creeper-green',    src: creeperGreen,   glow: '34,197,94',   scale: 1.00, motion: 'hold' },
  { key: 'creeper-tnt-tall', src: creeperTntTall, glow: '34,197,94',   scale: 1.00, motion: 'hold' },
  { key: 'creeper-teal-tnt', src: creeperTealTnt, glow: '45,212,191',  scale: 1.10, motion: 'hold' },
  { key: 'creeper-white',    src: creeperWhite,   glow: '203,213,225', scale: 1.00, motion: 'hold' },

  { key: 'steve-pickaxe',    src: stevePickaxe,   glow: '56,189,248',  scale: 1.06, motion: 'hover' },
  { key: 'horse-white',      src: horseWhite,     glow: '226,232,240', scale: 1.16, motion: 'hover' },
  { key: 'wolf-hearts',      src: wolfHearts,     glow: '248,113,113', scale: 1.10, motion: 'hover' },
  { key: 'sheep-blue',       src: sheepBlue,      glow: '96,165,250',  scale: 1.06, motion: 'hover' },
  { key: 'sheep-red',        src: sheepRed,       glow: '248,113,113', scale: 1.08, motion: 'hover' },
  { key: 'mob-spider',       src: mobSpider,      glow: '248,113,113', scale: 1.30, motion: 'hover' },

  // Pigs in different colours — the same pig art, hue-recoloured (Yosef: "just
  // colour what exists"). Weighted a touch under 1 so five pigs don't flood the mix.
  { key: 'pig-pink',         src: pigPink,        glow: '249,168,212', scale: 1.12, motion: 'hover', weight: 0.7 },
  { key: 'pig-gold',         src: pigGold,        glow: '234,179,8',   scale: 1.12, motion: 'hover', weight: 0.7 },
  { key: 'pig-green',        src: pigGreen,       glow: '74,222,128',  scale: 1.12, motion: 'hover', weight: 0.7 },
  { key: 'pig-blue',         src: pigBlue,        glow: '96,165,250',  scale: 1.12, motion: 'hover', weight: 0.7 },
  { key: 'pig-purple',       src: pigPurple,      glow: '192,132,252', scale: 1.12, motion: 'hover', weight: 0.7 },

  { key: 'item-sword-diamond',   src: itemSwordDiamond,   glow: '45,212,191',  scale: 0.95, motion: 'hover', weight: 0.5 },
  { key: 'item-sword-netherite', src: itemSwordNetherite, glow: '167,139,250', scale: 0.95, motion: 'hover', weight: 0.5 },
  // Pickaxes carry a longer handle now (extended to match the real Minecraft
  // proportions Yosef referenced) — a touch smaller scale since they're taller.
  { key: 'item-pickaxe',         src: itemPickaxe,        glow: '45,212,191',  scale: 0.85, motion: 'hover', weight: 0.4 },
  { key: 'item-pickaxe-purple',  src: itemPickaxePurple,  glow: '167,139,250', scale: 0.85, motion: 'hover', weight: 0.4 },
  { key: 'item-pickaxe-gray',    src: itemPickaxeGray,    glow: '203,213,225', scale: 0.85, motion: 'hover', weight: 0.4 },
  { key: 'item-axe',             src: itemAxe,            glow: '45,212,191',  scale: 0.95, motion: 'hover', weight: 0.5 },
  { key: 'item-tnt',             src: itemTnt,            glow: '248,113,113', scale: 0.90, motion: 'hover', weight: 0.5 },
  { key: 'item-creeper-face',    src: itemCreeperFace,    glow: '34,197,94',   scale: 0.90, motion: 'hover', weight: 0.5 },
];

// Cumulative weights, built once — a weighted draw is just a binary-free scan over
// this, and it keeps the per-entry `weight` as the single place the odds live.
const CUM_WEIGHTS = CHARACTERS.reduce((acc, c) => {
  acc.push((acc[acc.length - 1] || 0) + (c.weight ?? 1));
  return acc;
}, []);
const TOTAL_WEIGHT = CUM_WEIGHTS[CUM_WEIGHTS.length - 1];

const SWAP_MS = 8000;

// Weighted random pick, avoiding `prev` so a swap is always visible.
function pickIdx(prev) {
  if (CHARACTERS.length <= 1) return 0;
  const r = Math.random() * TOTAL_WEIGHT;
  let i = CUM_WEIGHTS.findIndex((c) => r < c);
  if (i < 0) i = CHARACTERS.length - 1;
  return i === prev ? (i + 1) % CHARACTERS.length : i;
}

// Only the WALK gait is a class; 'hold'/'hover' get no gait animation (just the
// vertical .oc-float bob). No rotation anywhere — Yosef objected to spinning, not
// to walking, so the walk is back but the rotate swings are gone for good.
function motionClass(ch) {
  return ch.motion === 'walk' ? 'walk' : '';
}

// One rendered character. The entrance is gated on the image's own load event —
// starting it on mount would let the fade finish before the pixels arrive on a
// cold cache, which reads as a pop-in.
function Character({ ch }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="oc-scale" style={{ '--s': ch.scale }}>
      <img
        src={ch.src}
        alt=""
        aria-hidden="true"
        draggable="false"
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={`oc-char${loaded ? ' is-in' : ''}`}
        style={{ '--glow': ch.glow }}
      />
    </div>
  );
}

export default function SideCreepers() {
  // Independent indices per side; `tick` forces a remount even if the same index
  // lands twice, so the entrance always replays.
  const [left, setLeft] = useState(() => pickIdx(-1));
  const [right, setRight] = useState(() => pickIdx(-1));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Single shared interval drives both sides → one timer, not two.
    const id = setInterval(() => {
      setLeft((p) => pickIdx(p));
      setRight((p) => pickIdx(p));
      setTick((t) => t + 1);
    }, SWAP_MS);
    return () => clearInterval(id);
  }, []);

  const leftCh = CHARACTERS[left];
  const rightCh = CHARACTERS[right];

  return (
    <div className="side-creepers" aria-hidden="true">
      <style>{`
        .side-creepers {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          opacity: 0.68;
        }
        /* Sit in the dead gutter between the screen edge and the centered content
           column (max-w-6xl = 1152px → half 576px, +12px gap). The character's
           INNER edge stays ~12px off the text; extra width grows OUTWARD, clamped
           so it never runs off-screen and never covers content. Capped at 260px so
           the 440px-tall source art is never upscaled. */
        .side-creepers .oc-side {
          position: fixed;
          top: 50%;
          width: min(260px, calc(50vw - 596px));
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .side-creepers .oc-side.left {
          left: max(8px, calc(50vw - 588px - min(260px, calc(50vw - 596px))));
          transform: translateY(-50%);
        }
        .side-creepers .oc-side.right {
          right: max(8px, calc(50vw - 588px - min(260px, calc(50vw - 596px))));
          transform: translateY(-50%) scaleX(-1);
        }

        .side-creepers .oc-gait,
        .side-creepers .oc-float,
        .side-creepers .oc-scale { width: 100%; display: block; }
        .side-creepers .oc-scale { transform: scale(var(--s, 1)); }

        .side-creepers .oc-char {
          display: block;
          width: 100%;
          height: auto;
          max-height: 56vh;
          object-fit: contain;
          margin: 0 auto;
          /* grounding shadow + a faint accent halo in the character's own colour */
          filter:
            drop-shadow(0 10px 16px rgba(0,0,0,0.55))
            drop-shadow(0 0 26px rgba(var(--glow), 0.30));
          opacity: 0;
          transform: translateY(20px) scale(0.94);
        }
        /* entrance — runs once the bitmap has actually decoded */
        .side-creepers .oc-char.is-in {
          animation: ocEnter 0.85s cubic-bezier(.2,.75,.3,1) forwards;
        }
        @keyframes ocEnter {
          from { opacity: 0; transform: translateY(20px) scale(0.94); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }

        /* idle bob — every character breathes a little */
        .side-creepers .oc-float { animation: ocFloat 5.2s ease-in-out infinite; }
        @keyframes ocFloat {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-12px); }
        }

        /* WALK: the animal strolls outward past the screen edge, pauses off-screen,
           then walks back in — pure translateX, NO rotation. Both sides share the
           same negative translate; the right side's parent scaleX(-1) mirrors it, so
           each exits toward its own edge. Left & right run at different durations so
           they never step in lockstep. */
        .side-creepers .oc-side.left  .oc-gait.walk { animation: ocWalk 15s ease-in-out infinite; }
        .side-creepers .oc-side.right .oc-gait.walk { animation: ocWalk 17.5s ease-in-out 1.6s infinite; }
        @keyframes ocWalk {
          0%   { transform: translateX(0); }
          16%  { transform: translateX(0); }
          40%  { transform: translateX(-640px); }
          54%  { transform: translateX(-640px); }
          80%  { transform: translateX(0); }
          100% { transform: translateX(0); }
        }

        /* RESPONSIVE: below 1536px the gutter is too narrow to hold a character
           without crowding the text, so hide the layer entirely. */
        @media (max-width: 1535px) {
          .side-creepers { display: none; }
        }

        @media (prefers-reduced-motion: reduce) {
          .side-creepers .oc-float,
          .side-creepers .oc-gait { animation: none; transform: none; }
          .side-creepers .oc-char { opacity: 1; transform: none; animation: none; }
        }
      `}</style>

      <div className="oc-side left">
        <div className={`oc-gait ${motionClass(leftCh)}`}>
          <div className="oc-float">
            <Character key={`left-${left}-${tick}`} ch={leftCh} />
          </div>
        </div>
      </div>
      <div className="oc-side right">
        <div className={`oc-gait ${motionClass(rightCh)}`}>
          <div className="oc-float">
            <Character key={`right-${right}-${tick}`} ch={rightCh} />
          </div>
        </div>
      </div>
    </div>
  );
}
