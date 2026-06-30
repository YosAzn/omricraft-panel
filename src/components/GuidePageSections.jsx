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
const Maybe = () => <span className="text-amber-400 font-bold" title="חלקי / לא יציב">⚠</span>;

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
  { core: 'Vanilla',  fam: 'plugins', what: 'השרת הרשמי של Mojang, נקי', mods: false, plugins: false, who: 'משחק רגיל (רק Data Packs)' },
  { core: 'Paper',    fam: 'plugins', what: 'גרסה מואצת — "מלך הפלאגינים"', mods: false, plugins: true,  who: 'הישרדות / מיני-משחקים' },
  { core: 'Purpur',   fam: 'plugins', what: 'פיצול של Paper, מאות הגדרות', mods: false, plugins: true,  who: 'התאמה-אישית קיצונית' },
  { core: 'Folia',    fam: 'plugins', what: 'Paper מרובה-ליבות (multi-thread)', mods: false, plugins: 'maybe', who: 'שרתי-ענק 100+ (הרבה פלאגינים קורסים עליו)' },
  { core: 'Forge',    fam: 'mods', what: 'הוותיק והכבד — מודפאקים ענקיים', mods: true, plugins: false, who: 'RLCraft / SkyFactory (זללן RAM)' },
  { core: 'NeoForge', fam: 'mods', what: 'פיצול מודרני של Forge (1.20+)', mods: true, plugins: false, who: 'הסטנדרט החדש למודים' },
  { core: 'Fabric',   fam: 'mods', what: 'קל ומהיר, מתעדכן מיד', mods: true, plugins: false, who: 'מודים קלים / אופטימיזציה' },
  { core: 'Quilt',    fam: 'mods', what: 'פיצול קהילתי של Fabric', mods: true, plugins: false, who: 'תואם רוב מודי-Fabric', live: false },
  { core: 'Mohist',   fam: 'hybrid', what: 'מודים של Forge + פלאגינים יחד', mods: true, plugins: true, who: 'רק כשחייבים שילוב — לא יציב, EOL', eol: true },
  { core: 'Youer',    fam: 'hybrid', what: 'היברידי NeoForge — היורש המתוחזק של Mohist', mods: true, plugins: true, who: 'מודים + פלאגינים יחד (מומלץ על Mohist)' },
];

function Bool({ v }) {
  if (v === true) return <Yes />;
  if (v === 'maybe') return <Maybe />;
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
              <td className="p-3 align-top text-zinc-300">{r.what}</td>
              <td className="p-3 align-top text-center"><Bool v={r.mods} /></td>
              <td className="p-3 align-top text-center"><Bool v={r.plugins} /></td>
              <td className="p-3 align-top text-zinc-400">{r.who}</td>
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
  { typeKey: 'mods',         name: 'Mod / Modpack', does: 'בלוקים / חיות / ממדים חדשים (שינוי עמוק)', where: 'שרת + מחשב', servers: 'Forge / NeoForge / Fabric / Quilt' },
  { typeKey: 'plugins',      name: 'Plugin',        does: 'פקודות, כלכלה, הגנות, הרשאות (בלי בלוקים חדשים)', where: 'שרת בלבד', servers: 'Paper / Purpur / Folia / Mohist / Youer' },
  { typeKey: 'datapacks',    name: 'Data Pack',     does: 'מתכונים / מבנים / משימות (ונילה רשמי)', where: 'שרת — world/datapacks', servers: 'כל שרת (כולל ונילה)' },
  { typeKey: 'modpacks',     name: 'Modpack',       does: 'חבילת מודים שלמה — שרת + כל שחקן', where: 'שרת + מחשב כל שחקן', servers: 'Forge / NeoForge / Fabric' },
  { typeKey: 'textures',     name: 'Resource Pack', does: 'מראה: בלוקים, צלילים, מודלים', where: 'מחשב (או דחיפה מהשרת)', servers: 'כל שרת' },
  { typeKey: 'shaders',      name: 'Shaders',       does: 'תאורה / צללים ריאליסטיים', where: 'מחשב בלבד', servers: 'דורש Iris (Fabric) / Oculus (Forge)' },
  { typeKey: 'client-mods',  name: 'Client Mods',   does: 'מיני-מפה, FPS, Sodium', where: 'מחשב בלבד', servers: 'השרת לא יודע מזה' },
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
                  {r.name}
                </span>
              </td>
              <td className="p-3 align-top text-zinc-300">{r.does}</td>
              <td className="p-3 align-top text-zinc-400">{r.where}</td>
              <td className="p-3 align-top text-zinc-400">{r.servers}</td>
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
  { icon: '🧩', tone: 'purple', path: 'plugins/', title: 'פלאגינים', body: 'קובצי .jar בתיקיית plugins של השרת. רק על ליבות תומכות-פלאגינים (Paper/Purpur/Folia/Mohist/Youer). ProtocolLib וספריות הן גם .jar כאן — לא datapack.' },
  { icon: '📜', tone: 'orange', path: 'world/datapacks/', title: 'דאטה-פאקים', body: 'נכנסים לתיקיית world/datapacks. עובדים על כל שרת — כולל ונילה. Worldgen (Terralith/Tectonic) דורש עולם חדש ולא עובד על Paper/Purpur/Folia.' },
  { icon: '⚙️', tone: 'blue', path: 'mods/', title: 'מודים', body: 'קובצי .jar בתיקיית mods. רק על Forge/NeoForge/Fabric/Quilt. שינוי עמוק — בלוקים/חיות/ממדים. כל שחקן צריך את אותם מודים בדיוק.' },
  { icon: '💻', tone: 'teal', path: 'PC', title: 'מחשב השחקן', body: 'Shaders, מודי צד-לקוח (Sodium, מיני-מפה) ו-Resource Packs יושבים על מחשב השחקן. השרת לא יודע מהם. Resource Pack אפשר גם לדחוף מהשרת (server-resource-pack).' },
];
const INSTALL_TONE = {
  purple: 'border-purple-500/30 bg-purple-500/[0.06]',
  orange: 'border-orange-500/30 bg-orange-500/[0.06]',
  blue: 'border-blue-500/30 bg-blue-500/[0.06]',
  teal: 'border-teal-500/30 bg-teal-500/[0.06]',
};

export function InstallLocationCards() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {INSTALL_CARDS.map((c) => (
        <div key={c.path} className={`rounded-2xl border p-5 ${INSTALL_TONE[c.tone]}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{c.icon}</span>
            <div>
              <h4 className="font-bold text-zinc-100 leading-tight">{c.title}</h4>
              <code className="text-xs text-zinc-400">{c.path}</code>
            </div>
          </div>
          <p className="text-sm text-zinc-300 leading-relaxed">{c.body}</p>
        </div>
      ))}
    </div>
  );
}
