import React from 'react';
import { TYPE_COLORS } from '../lib/constants';

// ============================================================================
//  GuidePageSections — the heavy, data-driven tables & cards for the Guide.
//  Kept separate from GuidePage.jsx so each file stays small + single-purpose.
//  Content is faithful to the source summary (mc_guide.txt). Tables, not walls
//  of text. All copy is primarily Hebrew (the source language); headings are
//  bilingual via the `t()` keys passed down from GuidePage.
// ============================================================================

// ---- shared cell helpers --------------------------------------------------
const Yes = () => <span className="text-emerald-400 font-bold">✓</span>;
const No = () => <span className="text-zinc-600 font-bold">—</span>;
const Maybe = ({ title }) => <span className="text-amber-400 font-bold" title={title}>⚠</span>;

// family accent (matches the create-form server-type "type" field)
const FAMILY_ACCENT = {
  plugins: 'border-purple-500/30 bg-purple-500/[0.06]',
  mods: 'border-blue-500/30 bg-blue-500/[0.06]',
  hybrid: 'border-amber-500/30 bg-amber-500/[0.06]',
};
const FAMILY_CHIP = {
  plugins: 'bg-purple-500/15 text-purple-300',
  mods: 'bg-blue-500/15 text-blue-300',
  hybrid: 'bg-amber-500/15 text-amber-300',
};

// ---------------------------------------------------------------------------
//  (א) Server-core comparison table — every live core + Quilt (info-only).
//  mods/plugins booleans map to ✓ / ⚠ / —; `live:false` rows are marked.
// ---------------------------------------------------------------------------
const CORE_ROWS = [
  { core: 'Vanilla',  fam: 'plugins', what: 'guideCoreVanillaWhat', mods: false, plugins: false, who: 'guideCoreVanillaWho' },
  { core: 'Paper',    fam: 'plugins', what: 'guideCorePaperWhat', mods: false, plugins: true,  who: 'guideCorePaperWho' },
  { core: 'Purpur',   fam: 'plugins', what: 'guideCorePurpurWhat', mods: false, plugins: true,  who: 'guideCorePurpurWho' },
  { core: 'Folia',    fam: 'plugins', what: 'guideCoreFoliaWhat', mods: false, plugins: 'maybe', who: 'guideCoreFoliaWho' },
  { core: 'Forge',    fam: 'mods', what: 'guideCoreForgeWhat', mods: true, plugins: false, who: 'guideCoreForgeWho' },
  { core: 'NeoForge', fam: 'mods', what: 'guideCoreNeoForgeWhat', mods: true, plugins: false, who: 'guideCoreNeoForgeWho' },
  { core: 'Fabric',   fam: 'mods', what: 'guideCoreFabricWhat', mods: true, plugins: false, who: 'guideCoreFabricWho' },
  { core: 'Quilt',    fam: 'mods', what: 'guideCoreQuiltWhat', mods: true, plugins: false, who: 'guideCoreQuiltWho', live: false },
  { core: 'Mohist',   fam: 'hybrid', what: 'guideCoreMohistWhat', mods: true, plugins: true, who: 'guideCoreMohistWho', eol: true },
  { core: 'Youer',    fam: 'hybrid', what: 'guideCoreYouerWhat', mods: true, plugins: true, who: 'guideCoreYouerWho' },
];

function Bool({ v, maybeTitle }) {
  if (v === true) return <Yes />;
  if (v === 'maybe') return <Maybe title={maybeTitle} />;
  return <No />;
}

export function ServerTypesTable({ t, notOfferedLabel }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/50">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wide">
            <th className="text-start p-3 font-bold">{t('guideColCore')}</th>
            <th className="text-start p-3 font-bold">{t('guideColWhat')}</th>
            <th className="text-center p-3 font-bold">{t('guideColMods')}</th>
            <th className="text-center p-3 font-bold">{t('guideColPlugins')}</th>
            <th className="text-start p-3 font-bold">{t('guideColFor')}</th>
          </tr>
        </thead>
        <tbody>
          {CORE_ROWS.map((r) => (
            <tr key={r.core} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
              <td className="p-3 align-top">
                <span className="font-bold text-zinc-100">{r.core}</span>
                <span className={`ms-2 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${FAMILY_CHIP[r.fam]}`}>
                  {t(r.fam === 'plugins' ? 'guideFamilyPlugins' : r.fam === 'mods' ? 'guideFamilyMods' : 'guideFamilyHybrid')}
                </span>
                {r.eol && <span className="ms-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-300">EOL</span>}
                {r.live === false && (
                  <span className="ms-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-zinc-700/60 text-zinc-300">{notOfferedLabel}</span>
                )}
              </td>
              <td className="p-3 align-top text-zinc-300">{t(r.what)}</td>
              <td className="p-3 align-top text-center"><Bool v={r.mods} maybeTitle={t('guideMaybeTitle')} /></td>
              <td className="p-3 align-top text-center"><Bool v={r.plugins} maybeTitle={t('guideMaybeTitle')} /></td>
              <td className="p-3 align-top text-zinc-400">{t(r.who)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
//  Install-location cards — server folders vs player PC.
// ---------------------------------------------------------------------------
const INSTALL_CARDS = [
  { icon: '🧩', tone: 'purple', path: 'plugins/', title: 'guideInstallPluginsTitle', body: 'guideInstallPluginsBody' },
  { icon: '📜', tone: 'orange', path: 'world/datapacks/', title: 'guideInstallDataTitle', body: 'guideInstallDataBody' },
  { icon: '⚙️', tone: 'blue', path: 'mods/', title: 'guideInstallModsTitle', body: 'guideInstallModsBody' },
  { icon: '💻', tone: 'teal', path: 'PC', title: 'guideInstallPcTitle', body: 'guideInstallPcBody' },
];
const INSTALL_TONE = {
  purple: 'border-purple-500/30 bg-purple-500/[0.06]',
  orange: 'border-orange-500/30 bg-orange-500/[0.06]',
  blue: 'border-blue-500/30 bg-blue-500/[0.06]',
  teal: 'border-teal-500/30 bg-teal-500/[0.06]',
};

export function InstallLocationCards({ t }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {INSTALL_CARDS.map((c) => (
        <div key={c.path} className={`rounded-2xl border p-5 ${INSTALL_TONE[c.tone]}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{c.icon}</span>
            <div>
              <h4 className="font-bold text-zinc-100 leading-tight">{t(c.title)}</h4>
              <code className="text-xs text-zinc-400">{c.path}</code>
            </div>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">{t(c.body)}</p>
        </div>
      ))}
    </div>
  );
}
