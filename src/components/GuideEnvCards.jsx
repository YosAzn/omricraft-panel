import React from 'react';
import { Puzzle, Cog, FileCode, Image, Sparkles, MonitorSmartphone } from 'lucide-react';
import { TYPE_COLORS } from '../lib/constants';

// ============================================================================
//  GuideEnvCards — the "3 families / 4 environments" gateway of the guide.
//  Four 3-D FLIP cards. Front = name + family one-liner (Vanilla also gets a
//  "classic" tag, no side badge). Back = cores + TWO add-on groups: what you
//  install ON THE SERVER (per environment) and what each PLAYER installs on
//  their own PC (universal — same on every card, Vanilla included).
//  In the site's zinc-950 / emerald-glass language. Each card carries its
//  environment's accent (Vanilla=white/zinc, Plugins=purple, Mods=blue,
//  Hybrid=amber). Pure CSS 3-D flip on hover; on touch / small screens the two
//  faces stack (no rotation); prefers-reduced-motion disables the 3-D anim.
//  No external libraries — one scoped <style> block (unique class `gec-*`).
// ============================================================================

// Addon-type chip: the type's NAME inside its tinted frame (the canonical
// "framed name" style — no lucide icon). `type` is the catalog type id so the
// colour matches the rest of the app.
function AddonChip({ type, label }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-bold ${TYPE_COLORS[type]}`}>
      {label}
    </span>
  );
}

// Player-side add-ons are UNIVERSAL — they install on the player's own PC and
// work on EVERY server type, Vanilla included (texture packs, shaders, client
// mods like Sodium / a mini-map). Same list on the back of every card, under
// the "install on the player" group. Kept as one shared const so all four
// cards read identically.
const PLAYER_CHIPS = [
  { type: 'textures', icon: Image, labelKey: 'guideChipResource' },
  { type: 'shaders', icon: Sparkles, labelKey: 'guideChipShader' },
  { type: 'client-mods', icon: MonitorSmartphone, labelKey: 'guideChipClientMod' },
];

// The four environments, in guide order. `accent` sets the card's border/tint;
// `cores` lists each core's display name + its guideCore<X>Short i18n key;
// `serverChips` are the on-the-SERVER add-on chips for this environment (type id
// + lucide icon + chip-label i18n key). The player-side chips are shared
// (PLAYER_CHIPS) since they're identical everywhere. `badgeKey: null` = no side
// badge (Vanilla installs nothing special on the server). Data mirrors the DATA
// spec + ADDON-SUPPORT table.
const ENVIRONMENTS = [
  {
    id: 'vanilla',
    accent: 'border-zinc-300/40 hover:border-zinc-200/70',
    titleKey: 'guideEnvVanillaTitle',
    classicTag: true, // Vanilla shows a white "classic" tag next to the name
    badgeKey: null, // no side badge — nothing special is installed on the server
    badgeClass: '',
    lineKey: 'guideEnvVanillaLine',
    cores: [{ name: 'Vanilla', shortKey: 'guideCoreVanillaShort' }],
    serverChips: [{ type: 'datapacks', icon: FileCode, labelKey: 'guideChipDatapack' }],
  },
  {
    id: 'plugins',
    accent: 'border-purple-500/40 hover:border-purple-400/70',
    titleKey: 'guideEnvPluginsTitle',
    badgeKey: 'guideEnvBadgeServer',
    badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-400/30',
    lineKey: 'guideEnvPluginsLine',
    cores: [
      { name: 'Paper', shortKey: 'guideCorePaperShort' },
      { name: 'Purpur', shortKey: 'guideCorePurpurShort' },
      { name: 'Folia', shortKey: 'guideCoreFoliaShort' },
    ],
    serverChips: [
      { type: 'plugins', icon: Puzzle, labelKey: 'guideChipPlugin' },
      { type: 'datapacks', icon: FileCode, labelKey: 'guideChipDatapack' },
    ],
  },
  {
    id: 'mods',
    accent: 'border-blue-500/40 hover:border-blue-400/70',
    titleKey: 'guideEnvModsTitle',
    badgeKey: 'guideEnvBadgeBoth',
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-400/30',
    lineKey: 'guideEnvModsLine',
    cores: [
      { name: 'Fabric', shortKey: 'guideCoreFabricShort' },
      { name: 'Quilt', shortKey: 'guideCoreQuiltShort' },
      { name: 'Forge', shortKey: 'guideCoreForgeShort' },
      { name: 'NeoForge', shortKey: 'guideCoreNeoForgeShort' },
    ],
    serverChips: [
      { type: 'mods', icon: Cog, labelKey: 'guideChipMod' },
      { type: 'modpacks', labelKey: 'guideChipModpack' },
      { type: 'datapacks', icon: FileCode, labelKey: 'guideChipDatapack' },
    ],
  },
  {
    id: 'hybrid',
    accent: 'border-amber-500/40 hover:border-amber-400/70',
    titleKey: 'guideEnvHybridTitle',
    badgeKey: 'guideEnvBadgeBridge',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
    lineKey: 'guideEnvHybridLine',
    cores: [
      { name: 'Mohist', shortKey: 'guideCoreMohistShort' },
      { name: 'Youer', shortKey: 'guideCoreYouerShort' },
    ],
    serverChips: [
      { type: 'plugins', icon: Puzzle, labelKey: 'guideChipPlugin' },
      { type: 'mods', icon: Cog, labelKey: 'guideChipMod' },
      { type: 'modpacks', labelKey: 'guideChipModpack' },
      { type: 'datapacks', icon: FileCode, labelKey: 'guideChipDatapack' },
    ],
  },
];

// Scoped flip-card CSS. `gec-flip` is the perspective host; `gec-inner` holds
// both faces in a shared 3-D space and rotates on hover. Faces are absolutely
// stacked + backface-hidden so only the up-facing one shows.
//   • hover:none (touch) OR narrow screen → no rotation; faces stack vertically
//     (front on top, back below) so everything stays readable without a flip.
//   • prefers-reduced-motion → the 3-D transform is disabled (same stacked view).
const FLIP_CSS = `
.gec-flip { perspective: 1500px; }
.gec-inner {
  position: relative;
  width: 100%;
  min-height: 19rem;
  transition: transform 0.5s ease;
  transform-style: preserve-3d;
  will-change: transform;
}
.gec-flip:hover .gec-inner,
.gec-flip:focus-within .gec-inner { transform: rotateY(180deg); }
.gec-face {
  position: absolute;
  inset: 0;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  display: flex;
  flex-direction: column;
}
.gec-back { transform: rotateY(180deg); }
@media (hover: none), (max-width: 640px) {
  .gec-inner { min-height: 0; transform: none !important; }
  .gec-face { position: relative; inset: auto; backface-visibility: visible; -webkit-backface-visibility: visible; }
  .gec-back { transform: none; margin-top: 0.75rem; }
  .gec-fliphint { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .gec-inner { transition: none; transform: none !important; }
  .gec-face { position: relative; inset: auto; backface-visibility: visible; -webkit-backface-visibility: visible; }
  .gec-back { transform: none; margin-top: 0.75rem; }
  .gec-fliphint { display: none; }
}
`;

// One flip card for an environment.
function EnvCard({ env, t }) {
  // Opaque card face (was bg-zinc-950/70) — the semi-transparent version let the
  // background decoration bleed through, which read as a blurry/murky card.
  const faceShell = `rounded-2xl border bg-zinc-900 p-5 h-full ${env.accent} transition-colors`;
  return (
    <div className="gec-flip" tabIndex={0}>
      <div className="gec-inner">
        {/* FRONT — name, then a badge UNDER it (classic tag for Vanilla, else the
            side badge) — same placement across all cards — + one-liner + flip hint */}
        <div className={`gec-face gec-front ${faceShell}`}>
          <h3 className="text-lg font-bold text-zinc-100 leading-tight mb-2">{t(env.titleKey)}</h3>
          {(env.classicTag || env.badgeKey) && (
            <span
              className={`self-start inline-flex px-2 py-0.5 rounded-md border text-[11px] font-bold mb-3 ${
                env.classicTag ? 'border-white/40 bg-white/10 text-white' : env.badgeClass
              }`}
            >
              {env.classicTag ? t('guideCoreClassic') : t(env.badgeKey)}
            </span>
          )}
          <p className="text-sm text-zinc-300 leading-relaxed">{t(env.lineKey)}</p>
          <p className="gec-fliphint mt-auto pt-3 text-[11px] text-zinc-500">{t('guideEnvFlipHint')}</p>
        </div>

        {/* BACK — the server types in this environment + EVERY add-on type it can
            use: what installs ON THE SERVER, and the universal player-side add-ons
            (textures / shaders / client mods) that work on every environment,
            Vanilla included. (Replaces the old summary table below the grid.) */}
        <div className={`gec-face gec-back ${faceShell} overflow-hidden`}>
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1.5">{t('guideEnvCoresLabel')}</p>
          <ul className="space-y-1 mb-3">
            {env.cores.map((c) => (
              <li key={c.name} className="text-[13px] text-zinc-300 leading-snug">
                <bdi className="font-bold text-zinc-100">{c.name}</bdi>
                <span className="text-zinc-400"> — {t(c.shortKey)}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1">{t('guideEnvTableServer')}</p>
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {env.serverChips.map((ch) => (
              <AddonChip key={ch.type} type={ch.type} label={t(ch.labelKey)} />
            ))}
          </div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1">{t('guideInstallColPc')}</p>
          <div className="flex flex-wrap gap-1.5">
            {PLAYER_CHIPS.map((ch) => (
              <AddonChip key={ch.type} type={ch.type} label={t(ch.labelKey)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// The 4-environment flip-card grid. Drop-in for the guide's server-families
// section. `t` is the i18n resolver.
export default function ServerEnvCards({ t }) {
  return (
    <>
      <style>{FLIP_CSS}</style>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {ENVIRONMENTS.map((env) => (
          <EnvCard key={env.id} env={env} t={t} />
        ))}
      </div>

      {/* The old summary table was dropped — each card's back now lists what
          installs on the server AND the universal player-side add-ons. This note
          stays as the one-line reminder of what "player-side" means. */}
      <p className="mt-4 text-[11px] text-zinc-500 leading-relaxed">{t('guidePlayerSideNote')}</p>
    </>
  );
}
