import React from 'react';
import { Puzzle, Cog, FileCode, Image } from 'lucide-react';
import { TYPE_COLORS } from '../lib/constants';

// ============================================================================
//  GuideEnvCards — the "3 families / 4 environments" gateway of the guide.
//  Four 3-D FLIP cards (front = name + tagline, back = cores + addon-type chips)
//  in the site's zinc-950 / emerald-glass language. Each card carries its
//  environment's accent (Vanilla=white/zinc, Plugins=purple, Mods=blue,
//  Hybrid=amber). Pure CSS 3-D flip on hover; on touch / small screens the two
//  faces stack (no rotation); prefers-reduced-motion disables the 3-D anim.
//  No external libraries — one scoped <style> block (unique class `gec-*`).
// ============================================================================

// Addon-type chip: lucide icon + label, tinted with the type's own TYPE_COLORS.
// `type` is the catalog type id so the colour matches the rest of the app.
function AddonChip({ type, icon: Icon, label }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold ${TYPE_COLORS[type]}`}>
      <Icon size={12} /> {label}
    </span>
  );
}

// The four environments, in guide order. `accent` sets the card's border/tint;
// `cores` lists each core's display name + its guideCore<X>Short i18n key;
// `chips` are the addon-type chips shown on the back (type id + lucide icon +
// chip-label i18n key). Data mirrors the DATA spec + ADDON-SUPPORT table.
const ENVIRONMENTS = [
  {
    id: 'vanilla',
    accent: 'border-zinc-300/40 hover:border-zinc-200/70',
    titleKey: 'guideEnvVanillaTitle',
    classicTag: true, // Vanilla shows a white "classic" tag next to the name
    badgeKey: 'guideEnvBadgeServer',
    badgeClass: 'bg-zinc-500/15 text-zinc-200 border-zinc-400/30',
    lineKey: 'guideEnvVanillaLine',
    cores: [{ name: 'Vanilla', shortKey: 'guideCoreVanillaShort' }],
    chips: [{ type: 'datapacks', icon: FileCode, labelKey: 'guideChipDatapack' }],
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
    chips: [
      { type: 'plugins', icon: Puzzle, labelKey: 'guideChipPlugin' },
      { type: 'datapacks', icon: FileCode, labelKey: 'guideChipDatapack' },
      { type: 'textures', icon: Image, labelKey: 'guideChipResource' },
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
    chips: [
      { type: 'mods', icon: Cog, labelKey: 'guideChipMod' },
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
    chips: [
      { type: 'plugins', icon: Puzzle, labelKey: 'guideChipPlugin' },
      { type: 'mods', icon: Cog, labelKey: 'guideChipMod' },
      { type: 'datapacks', icon: FileCode, labelKey: 'guideChipDatapack' },
      { type: 'textures', icon: Image, labelKey: 'guideChipResource' },
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
.gec-flip { perspective: 1200px; }
.gec-inner {
  position: relative;
  width: 100%;
  min-height: 13rem;
  transition: transform 0.5s ease;
  transform-style: preserve-3d;
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
  const faceShell = `rounded-2xl border bg-zinc-950/70 p-5 h-full ${env.accent} transition-colors`;
  return (
    <div className="gec-flip" tabIndex={0}>
      <div className="gec-inner">
        {/* FRONT — name + side badge + one-liner + flip hint */}
        <div className={`gec-face gec-front ${faceShell}`}>
          <div className="flex items-center flex-wrap gap-2 mb-2">
            <h3 className="text-lg font-black text-zinc-100 leading-tight">{t(env.titleKey)}</h3>
            {env.classicTag && (
              <span className="px-2 py-0.5 rounded text-[11px] font-bold border border-white/40 bg-white/10 text-white">
                {t('guideCoreClassic')}
              </span>
            )}
          </div>
          <span className={`self-start inline-flex px-2 py-0.5 rounded-md border text-[11px] font-bold mb-3 ${env.badgeClass}`}>
            {t(env.badgeKey)}
          </span>
          <p className="text-sm text-zinc-300 leading-relaxed">{t(env.lineKey)}</p>
          <p className="gec-fliphint mt-auto pt-3 text-[11px] text-zinc-500">{t('guideEnvFlipHint')}</p>
        </div>

        {/* BACK — cores list + addon-type chips */}
        <div className={`gec-face gec-back ${faceShell} overflow-y-auto`}>
          <div className="mb-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1.5">{t('guideEnvCoresLabel')}</p>
            <ul className="space-y-1">
              {env.cores.map((c) => (
                <li key={c.name} className="text-sm text-zinc-300 leading-snug">
                  <span className="font-bold text-zinc-100">{c.name}</span>
                  <span className="text-zinc-400"> — {t(c.shortKey)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500 mb-1.5">{t('guideEnvAddonsLabel')}</p>
            <div className="flex flex-wrap gap-1.5">
              {env.chips.map((ch) => (
                <AddonChip key={ch.type} type={ch.type} icon={ch.icon} label={t(ch.labelKey)} />
              ))}
            </div>
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
    </>
  );
}
