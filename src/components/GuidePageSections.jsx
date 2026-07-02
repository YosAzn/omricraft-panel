import React from 'react';
import { Puzzle, Wrench, ScrollText, Image as ImageIcon } from 'lucide-react';
import { TYPE_COLORS } from '../lib/constants';

// ============================================================================
//  GuidePageSections — the heavy, data-driven tables & cards for the Guide.
//  Kept separate from GuidePage.jsx so each file stays small + single-purpose.
//  Content is faithful to the source summary (mc_guide.txt). Tables, not walls
//  of text. All copy is primarily Hebrew (the source language); headings are
//  bilingual via the `t()` keys passed down from GuidePage.
// ============================================================================

// family accent (matches the create-form server-type "type" field). 'vanilla' is
// its own zinc/white group — the classic, standing entirely on its own.
const FAMILY_ACCENT = {
  vanilla: 'border-zinc-300/30 bg-zinc-100/[0.04]',
  plugins: 'border-purple-500/30 bg-purple-500/[0.06]',
  mods: 'border-blue-500/30 bg-blue-500/[0.06]',
  hybrid: 'border-amber-500/30 bg-amber-500/[0.06]',
};
const FAMILY_CHIP = {
  vanilla: 'bg-zinc-100/10 text-zinc-50',
  plugins: 'bg-purple-500/15 text-purple-300',
  mods: 'bg-blue-500/15 text-blue-300',
  hybrid: 'bg-amber-500/15 text-amber-300',
};

// ---- add-on-type chips (which add-ons a core can install) --------------------
// Each add-on TYPE → its lucide icon + the TYPE_COLORS class used for the chip.
// `typeKey` maps to the real ADDON_TYPES id so colours stay in sync everywhere.
const ADDON_TYPE_CHIP = {
  plugin:   { icon: Puzzle,     typeKey: 'plugins',   labelKey: 'guideChipPlugin' },
  mod:      { icon: Wrench,     typeKey: 'mods',      labelKey: 'guideChipMod' },
  datapack: { icon: ScrollText, typeKey: 'datapacks', labelKey: 'guideChipDatapack' },
  resource: { icon: ImageIcon,  typeKey: 'textures',  labelKey: 'guideChipResource' },
};

// Per-core ADDON-SUPPORT — which add-on TYPES each core can install. Single source
// of truth (mirrors the create-form gating). Keyed by the core display name.
const CORE_ADDON_SUPPORT = {
  Vanilla:  ['datapack'],
  Paper:    ['plugin', 'datapack', 'resource'],
  Purpur:   ['plugin', 'datapack', 'resource'],
  Folia:    ['plugin', 'datapack', 'resource'],
  Fabric:   ['mod', 'datapack'],
  Quilt:    ['mod', 'datapack'],
  Forge:    ['mod', 'datapack'],
  NeoForge: ['mod', 'datapack'],
  Mohist:   ['plugin', 'mod', 'datapack', 'resource'],
  Youer:    ['plugin', 'mod', 'datapack', 'resource'],
};

// A small add-on-type chip (icon + label, tinted by its TYPE_COLORS class).
function AddonChip({ typeId, t }) {
  const meta = ADDON_TYPE_CHIP[typeId];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold ${TYPE_COLORS[meta.typeKey]}`}>
      <Icon size={11} strokeWidth={2.5} aria-hidden="true" />
      {t(meta.labelKey)}
    </span>
  );
}

// ---------------------------------------------------------------------------
//  (א) Server-core comparison table — every live core + Quilt (info-only).
//  mods/plugins booleans map to ✓ / ⚠ / —; `live:false` rows are marked.
// ---------------------------------------------------------------------------
// Rows are ORDERED by group (the slide-deck model): plugin cores first, then
// the modding engines (light Fabric/Quilt before heavy Forge/NeoForge), then
// the hybrids as a warned tail. A header row is emitted whenever `fam` changes.
const CORE_ROWS = [
  { core: 'Vanilla',  fam: 'vanilla', what: 'guideCoreVanillaWhat', mods: false, plugins: false, who: 'guideCoreVanillaWho' },
  { core: 'Paper',    fam: 'plugins', what: 'guideCorePaperWhat', mods: false, plugins: true,  who: 'guideCorePaperWho' },
  { core: 'Purpur',   fam: 'plugins', what: 'guideCorePurpurWhat', mods: false, plugins: true,  who: 'guideCorePurpurWho' },
  { core: 'Folia',    fam: 'plugins', what: 'guideCoreFoliaWhat', mods: false, plugins: 'maybe', who: 'guideCoreFoliaWho' },
  { core: 'Fabric',   fam: 'mods', what: 'guideCoreFabricWhat', mods: true, plugins: false, who: 'guideCoreFabricWho' },
  { core: 'Quilt',    fam: 'mods', what: 'guideCoreQuiltWhat', mods: true, plugins: false, who: 'guideCoreQuiltWho', live: false },
  { core: 'Forge',    fam: 'mods', what: 'guideCoreForgeWhat', mods: true, plugins: false, who: 'guideCoreForgeWho' },
  { core: 'NeoForge', fam: 'mods', what: 'guideCoreNeoForgeWhat', mods: true, plugins: false, who: 'guideCoreNeoForgeWho' },
  { core: 'Mohist',   fam: 'hybrid', what: 'guideCoreMohistWhat', mods: true, plugins: true, who: 'guideCoreMohistWho', eol: true },
  { core: 'Youer',    fam: 'hybrid', what: 'guideCoreYouerWhat', mods: true, plugins: true, who: 'guideCoreYouerWho' },
];

// Group header per family — title + the one-line "what it means for players".
const CORE_GROUP_META = {
  vanilla: { titleKey: 'guideGroupVanillaTitle', descKey: 'guideCoreVanillaWho' },
  plugins: { titleKey: 'guideFamilyPlugins', descKey: 'guideFamPluginsTagline' },
  mods: { titleKey: 'guideGroupModsTitle', descKey: 'guideFamModsTagline' },
  hybrid: { titleKey: 'guideFamilyHybrid', descKey: 'guideFamHybridWarn' },
};

// The 4 environment groups in slide-deck order — each becomes one bordered block
// with a vertical axis-label on its side (like a chart-series title).
const CORE_FAMILIES = ['vanilla', 'plugins', 'mods', 'hybrid'];

// One environment group = a bordered block (family colour) with a vertical
// axis-label on its physical side (like a chart-series title) + a compact table
// of that family's cores. `isRtl` flips the axis reading direction (bottom→top in
// Hebrew). Optional — falls back to the document direction so the existing call
// signature `<ServerTypesTable t=… notOfferedLabel=… />` keeps working untouched.
function FamilyBlock({ fam, rows, t, notOfferedLabel, isRtl }) {
  const meta = CORE_GROUP_META[fam];
  const isVanilla = fam === 'vanilla';
  // vertical-rl reads top→bottom; rotate 180° so Hebrew reads bottom→top. LTR
  // keeps the natural top→bottom orientation.
  const axisStyle = { writingMode: 'vertical-rl', transform: isRtl ? 'rotate(180deg)' : 'none' };
  return (
    <div className={`rounded-2xl border ${FAMILY_ACCENT[fam]} overflow-hidden`}>
      <div className="flex items-stretch">
        {/* Vertical axis-label (chart-series title) — hidden on small screens. */}
        <div className={`hidden sm:flex items-center justify-center shrink-0 px-1.5 py-3 border-e ${FAMILY_ACCENT[fam]}`}>
          <span
            style={axisStyle}
            className={`text-xs font-black tracking-wide leading-none ${isVanilla ? 'text-zinc-100' : ''}`}
          >
            <span className={`px-1.5 py-0.5 rounded ${FAMILY_CHIP[fam]}`}>{t(meta.titleKey)}</span>
          </span>
        </div>
        <div className="flex-1 min-w-0">
          {/* Mobile group title (replaces the vertical axis under 640px). */}
          <div className="sm:hidden px-3 pt-3">
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${FAMILY_CHIP[fam]}`}>{t(meta.titleKey)}</span>
            <span className="ms-2 text-[11px] text-zinc-400">{t(meta.descKey)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-zinc-800/70 text-zinc-400 text-[11px] uppercase tracking-wide">
                  <th className="text-start p-2.5 font-bold">{t('guideColCore')}</th>
                  <th className="text-start p-2.5 font-bold w-1/4">{t('guideColWhat')}</th>
                  <th className="text-start p-2.5 font-bold">{t('guideColUse')}</th>
                  <th className="text-start p-2.5 font-bold">{t('guideColFor')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.core} className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/20 transition-colors">
                    <td className="p-2.5 align-top">
                      <span className={`font-bold ${isVanilla ? 'text-zinc-50' : 'text-zinc-100'}`}>{r.core}</span>
                      {r.eol && <span className="ms-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-300">EOL</span>}
                      {r.live === false && (
                        <span className="ms-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-700/60 text-zinc-300">{notOfferedLabel}</span>
                      )}
                    </td>
                    <td className={`p-2.5 align-top ${isVanilla ? 'text-zinc-200' : 'text-zinc-300'}`}>{t(r.what)}</td>
                    <td className="p-2.5 align-top">
                      <div className="flex flex-wrap gap-1">
                        {(CORE_ADDON_SUPPORT[r.core] || []).map((typeId) => (
                          <AddonChip key={typeId} typeId={typeId} t={t} />
                        ))}
                      </div>
                    </td>
                    <td className="p-2.5 align-top text-zinc-400">{t(r.who)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ServerTypesTable({ t, notOfferedLabel, isRtl }) {
  // Fall back to the live document direction when the caller doesn't pass isRtl
  // (keeps the existing 2-arg call site working without a GuidePage change).
  const rtl = typeof isRtl === 'boolean'
    ? isRtl
    : (typeof document !== 'undefined' && document.dir === 'rtl');
  return (
    <div className="space-y-4">
      {CORE_FAMILIES.map((fam) => {
        const rows = CORE_ROWS.filter((r) => r.fam === fam);
        if (rows.length === 0) return null;
        return (
          <FamilyBlock
            key={fam}
            fam={fam}
            rows={rows}
            t={t}
            notOfferedLabel={notOfferedLabel}
            isRtl={rtl}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
//  (ב) Add-on types table — the 6+1 live taxonomy, colored by TYPE_COLORS.
//  `typeKey` maps to the real ADDON_TYPES group so colors stay in sync.
// ---------------------------------------------------------------------------
const ADDON_ROWS = [
  { typeKey: 'mods',         name: 'guideAddonModsName', does: 'guideAddonModsDoes', where: 'guideAddonModsWhere', servers: 'guideAddonModsServers' },
  { typeKey: 'plugins',      name: 'Plugin',        does: 'guideAddonPluginsDoes', where: 'guideAddonPluginsWhere', servers: 'guideAddonPluginsServers' },
  { typeKey: 'datapacks',    name: 'Data Pack',     does: 'guideAddonDataDoes', where: 'guideAddonDataWhere', servers: 'guideAddonDataServers' },
  { typeKey: 'modpacks',     name: 'Modpack',       does: 'guideAddonModpackDoes', where: 'guideAddonModpackWhere', servers: 'guideAddonModpackServers' },
  { typeKey: 'textures',     name: 'Resource Pack', does: 'guideAddonRpDoes', where: 'guideAddonRpWhere', servers: 'guideAddonRpServers' },
  { typeKey: 'shaders',      name: 'Shaders',       does: 'guideAddonShadersDoes', where: 'guideAddonShadersWhere', servers: 'guideAddonShadersServers' },
  { typeKey: 'client-mods',  name: 'Client Mods',   does: 'guideAddonClientDoes', where: 'guideAddonClientWhere', servers: 'guideAddonClientServers' },
];

export function AddonTypesTable({ t }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/50">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wide">
            <th className="text-start p-3 font-bold">{t('guideColAddon')}</th>
            <th className="text-start p-3 font-bold">{t('guideColDoes')}</th>
            <th className="text-start p-3 font-bold">{t('guideColWhere')}</th>
            <th className="text-start p-3 font-bold">{t('guideColServers')}</th>
          </tr>
        </thead>
        <tbody>
          {ADDON_ROWS.map((r) => (
            <tr key={r.name} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
              <td className="p-3 align-top">
                <span className={`inline-block px-2 py-1 rounded-md border text-xs font-bold ${TYPE_COLORS[r.typeKey]}`}>
                  {r.name.startsWith('guide') ? t(r.name) : r.name}
                </span>
              </td>
              <td className="p-3 align-top text-zinc-300">{t(r.does)}</td>
              <td className="p-3 align-top text-zinc-400">{t(r.where)}</td>
              <td className="p-3 align-top text-zinc-400">{t(r.servers)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
//  Install-location columns — the slide-deck three-lane model: grouped by WHO
//  needs the file (server only / both sides / player's PC only). Same info as
//  the old 4 cards, re-bucketed.
// ---------------------------------------------------------------------------
const INSTALL_COLUMNS = [
  {
    tone: 'purple', icon: '🖥️', title: 'guideInstallColServer', sub: 'guideInstallColServerSub', badge: 'guideEnvBadgeServer',
    items: [
      { icon: '🧩', path: 'plugins/', title: 'guideInstallPluginsTitle', body: 'guideInstallPluginsBody' },
      { icon: '📜', path: 'world/datapacks/', title: 'guideInstallDataTitle', body: 'guideInstallDataBody' },
      { icon: '🖼️', path: 'server-resource-pack', title: 'guideInstallServerRpTitle', body: 'guideInstallServerRp' },
    ],
  },
  {
    tone: 'blue', icon: '🔁', title: 'guideInstallColBoth', sub: 'guideInstallColBothSub', badge: 'guideEnvBadgeBoth',
    items: [
      { icon: '⚙️', path: 'mods/', title: 'guideInstallModsTitle', body: 'guideInstallModsBody' },
    ],
  },
  {
    tone: 'teal', icon: '💻', title: 'guideInstallColPc', sub: 'guideInstallColPcSub', badge: 'guideEnvBadgeClient',
    items: [
      { icon: '✨', path: 'PC', title: 'guideInstallPcTitle', body: 'guideInstallPcBody' },
    ],
  },
];
const INSTALL_TONE = {
  purple: 'border-purple-500/30 bg-purple-500/[0.06]',
  blue: 'border-blue-500/30 bg-blue-500/[0.06]',
  teal: 'border-teal-500/30 bg-teal-500/[0.06]',
};
// Side-badge pill colour per lane (matches the card tone).
const INSTALL_BADGE = {
  purple: 'bg-purple-500/15 text-purple-200',
  blue: 'bg-blue-500/15 text-blue-200',
  teal: 'bg-teal-500/15 text-teal-200',
};

export function InstallLocationCards({ t }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {INSTALL_COLUMNS.map((col) => (
        <div key={col.title} className={`rounded-2xl border p-5 ${INSTALL_TONE[col.tone]}`}>
          <div className="mb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="font-bold text-zinc-100 leading-tight">
                <span className="me-1.5">{col.icon}</span>{t(col.title)}
              </h4>
              {col.badge && (
                <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${INSTALL_BADGE[col.tone]}`}>
                  {t(col.badge)}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">{t(col.sub)}</p>
          </div>
          <div className="space-y-3">
            {col.items.map((it) => (
              <div key={it.path} className="rounded-lg bg-zinc-950/40 p-3">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-lg">{it.icon}</span>
                  <span className="font-bold text-sm text-zinc-100">{t(it.title)}</span>
                  <code className="text-[11px] text-zinc-500" dir="ltr">{it.path}</code>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">{t(it.body)}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
