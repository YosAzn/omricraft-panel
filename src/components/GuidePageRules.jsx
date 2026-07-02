import React from 'react';

// ============================================================================
//  GuidePageRules — the compatibility rules, RAM formula, overlapping
//  alternatives, resource-pack + modpack explainers. Data-driven, faithful to
//  the source summary. Separate file to keep each Guide module small.
// ============================================================================

// ---- Compatibility / "what needs what" rules (the exceptions that matter) --
const COMPAT_RULES = [
  { tone: 'amber', title: 'guideCompatCoreLockTitle', body: 'guideCompatCoreLockBody' },
  { tone: 'orange', title: 'guideCompatWorldgenTitle', body: 'guideCompatWorldgenBody' },
  { tone: 'purple', title: 'guideCompatDepsTitle', body: 'guideCompatDepsBody' },
  { tone: 'blue', title: 'guideCompatServerModsTitle', body: 'guideCompatServerModsBody' },
  { tone: 'teal', title: 'guideCompatItemsAdderTitle', body: 'guideCompatItemsAdderBody' },
  { tone: 'pink', title: 'guideCompatRpAloneTitle', body: 'guideCompatRpAloneBody' },
  { tone: 'blue', title: 'guideCompatSinytraTitle', body: 'guideCompatSinytraBody' },
  { tone: 'amber', title: 'guideCompatFoliaTitle', body: 'guideCompatFoliaBody' },
  { tone: 'sky', title: 'guideCompatViaVersionTitle', body: 'guideCompatViaVersionBody' },
  { tone: 'green', title: 'guideCompatVoiceChatTitle', body: 'guideCompatVoiceChatBody' },
];
const RULE_TONE = {
  amber: 'border-amber-500/30 bg-amber-500/[0.05]',
  orange: 'border-orange-500/30 bg-orange-500/[0.05]',
  purple: 'border-purple-500/30 bg-purple-500/[0.05]',
  blue: 'border-blue-500/30 bg-blue-500/[0.05]',
  teal: 'border-teal-500/30 bg-teal-500/[0.05]',
  pink: 'border-pink-500/30 bg-pink-500/[0.05]',
  sky: 'border-sky-500/30 bg-sky-500/[0.05]',
  green: 'border-emerald-500/30 bg-emerald-500/[0.05]',
};

export function CompatRules({ t }) {
  return (
    <>
      {/* The strict handshake sequence (slide-deck): 3 locks that MUST match
          on a mod server, + the easy way out (modpack launchers sync all 3). */}
      <div className="rounded-2xl border border-pink-500/30 bg-pink-500/[0.05] p-5 mb-6">
        <h3 className="font-bold text-zinc-100 mb-3">🔒 {t('guideSyncTitle')}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="rounded-xl bg-zinc-950/40 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-6 h-6 rounded-full bg-pink-500/20 text-pink-300 text-xs font-bold inline-flex items-center justify-center shrink-0">{n}</span>
                <h4 className="font-bold text-sm text-zinc-100 leading-tight">{t(`guideSync${n}Title`)}</h4>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">{t(`guideSync${n}Body`)}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm text-emerald-300 font-medium">💡 {t('guideSyncEasyWay')}</p>
      </div>

      {/* The rest of the rules (dependencies, core-locks, exceptions). */}
      <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wide mb-3">{t('guideSyncMoreRules')}</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {COMPAT_RULES.map((r) => (
          <div key={r.title} className={`rounded-xl border p-4 ${RULE_TONE[r.tone]}`}>
            <h4 className="font-bold text-zinc-100 mb-1">{t(r.title)}</h4>
            <p className="text-sm text-zinc-300 leading-relaxed">{t(r.body)}</p>
          </div>
        ))}
      </div>
    </>
  );
}

// ---- RAM rule-of-thumb table ----------------------------------------------
const RAM_ROWS = [
  { key: 'ram1', kind: 'guideRam1Kind', ram: 'guideRam1Ram' },
  { key: 'ram2', kind: 'guideRam2Kind', ram: 'guideRam2Ram' },
  { key: 'ram3', kind: 'guideRam3Kind', ram: 'guideRam3Ram' },
  { key: 'ram4', kind: 'guideRam4Kind', ram: 'guideRam4Ram' },
];

export function RamTable({ t }) {
  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/50">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wide">
              <th className="text-start p-3 font-bold">{t('guideRamHeadKind')}</th>
              <th className="text-start p-3 font-bold">{t('guideRamHeadRam')}</th>
            </tr>
          </thead>
          <tbody>
            {RAM_ROWS.map((r) => (
              <tr key={r.key} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
                <td className="p-3 align-top text-zinc-200 font-medium">{t(r.kind)}</td>
                <td className="p-3 align-top text-emerald-300 font-bold">{t(r.ram)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{t('guideRamNote')}</p>
    </>
  );
}

// ---- Overlapping alternatives: plugin (Paper) vs mod (Forge/Fabric) -------
const ALT_ROWS = [
  { key: 'alt1', role: 'guideAlt1Role', plugin: 'EssentialsX', mod: 'Essential Commands / FTB Essentials' },
  { key: 'alt2', role: 'guideAlt2Role', plugin: 'GriefPrevention / Lands', mod: 'FTB Chunks' },
  { key: 'alt3', role: 'guideAlt3Role', plugin: 'Dynmap / Pl3xMap', mod: 'BlueMap / JourneyMap' },
  { key: 'alt4', role: 'guideAlt4Role', plugin: 'WorldEdit', mod: 'WorldEdit (mod) / Axiom' },
  { key: 'alt5', role: 'guideAlt5Role', plugin: 'McMMO / Aurelium', mod: 'Project MMO' },
  { key: 'alt6', role: 'guideAlt6Role', plugin: 'ItemsAdder / Oraxen', mod: 'PolyMc' },
  { key: 'alt7', role: 'guideAlt7Role', plugin: 'ClearLag / Spark', mod: 'Lithium / FerriteCore' },
  { key: 'alt8', role: 'guideAlt8Role', plugin: 'Skoice', mod: 'Simple Voice Chat' },
];

export function AltTable({ t }) {
  return (
    <>
    <p className="mb-3 text-sm text-zinc-400 leading-relaxed">{t('guideAltIntro')}</p>
    <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/50">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wide">
            <th className="text-start p-3 font-bold">{t('guideAltHeadRole')}</th>
            <th className="text-start p-3 font-bold"><span className="text-purple-300">{t('guideAltHeadPlugin')}</span></th>
            <th className="text-start p-3 font-bold"><span className="text-blue-300">{t('guideAltHeadMod')}</span></th>
          </tr>
        </thead>
        <tbody>
          {ALT_ROWS.map((r) => (
            <tr key={r.key} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
              <td className="p-3 align-top text-zinc-200 font-medium">{t(r.role)}</td>
              <td className="p-3 align-top text-zinc-300">{r.plugin}</td>
              <td className="p-3 align-top text-zinc-300">{r.mod.startsWith('guide') ? t(r.mod) : r.mod}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

// ---- Resource-pack explainer ----------------------------------------------
export function ResourcePackInfo({ t }) {
  return (
    <div className="space-y-3 text-sm text-zinc-300 leading-relaxed">
      <p>{t('guideRpP1')}</p>
      <p>{t('guideRpP2')}</p>
      <p>{t('guideRpP3')}</p>
      {/* Server-side holography (slide-deck): look like mods with no mods. */}
      <p>{t('guideRpP4')}</p>
    </div>
  );
}

// ---- Modpack explainer ----------------------------------------------------
export function ModpackInfo({ t }) {
  return (
    <div className="space-y-3 text-sm text-zinc-300 leading-relaxed">
      <p>{t('guideMpP1')}</p>
      <p>{t('guideMpP2')}</p>
      <p>{t('guideMpP3')}</p>
    </div>
  );
}
