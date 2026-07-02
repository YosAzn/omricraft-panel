import React from 'react';

// ============================================================================
//  GuidePageRules — the compatibility rules, RAM formula, overlapping
//  alternatives, resource-pack + modpack explainers. Data-driven, faithful to
//  the source summary. Separate file to keep each Guide module small.
// ============================================================================

// ---- Compatibility / "what needs what" rules -------------------------------
// Only the real exceptions — the cases that force something extra or different.
// Trivial/conceptual rules (server-side mods, the Sinytra bridge) were dropped:
// they explain a concept already covered by the environment taxonomy + AltTable,
// not a "you must do X differently" gotcha.
const COMPAT_RULES = [
  { tone: 'amber', title: 'guideCompatCoreLockTitle', body: 'guideCompatCoreLockBody' },
  { tone: 'orange', title: 'guideCompatWorldgenTitle', body: 'guideCompatWorldgenBody' },
  { tone: 'purple', title: 'guideCompatDepsTitle', body: 'guideCompatDepsBody' },
  { tone: 'teal', title: 'guideCompatItemsAdderTitle', body: 'guideCompatItemsAdderBody' },
  { tone: 'pink', title: 'guideCompatRpAloneTitle', body: 'guideCompatRpAloneBody' },
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
                <h4 className="font-bold text-sm text-zinc-100 leading-tight"><bdi>{t(`guideSync${n}Title`)}</bdi></h4>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed"><bdi>{t(`guideSync${n}Body`)}</bdi></p>
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
            {/* bdi keeps English core/add-on names (Paper, Fabric…) from being
                reordered by the surrounding Hebrew/RTL text */}
            <h4 className="font-bold text-zinc-100 mb-1"><bdi>{t(r.title)}</bdi></h4>
            <p className="text-sm text-zinc-300 leading-relaxed"><bdi>{t(r.body)}</bdi></p>
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
  // Folia note is optional: render it only once the copy layer defines the
  // key (otherwise translate() would echo the raw key string).
  const folia = t('guideRamFolia');
  const hasFolia = folia && folia !== 'guideRamFolia';
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
                {/* core names stay LTR inside RTL text so bidi can't reorder them */}
                <td className="p-3 align-top text-zinc-200 font-medium"><bdi>{t(r.kind)}</bdi></td>
                <td className="p-3 align-top text-emerald-300 font-bold"><bdi>{t(r.ram)}</bdi></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasFolia && (
        <p className="mt-3 text-sm text-amber-300/90 leading-relaxed">
          <bdi>{folia}</bdi>
        </p>
      )}
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
    <p className="mb-4 text-sm text-zinc-400 leading-relaxed">{t('guideAltIntro')}</p>

    {/* Two-column migration matrix (slide-deck): plugins (Paper) on one side,
        mods (Forge/Fabric) on the other. Each row = a parallel pair with a
        connector between them + the role as the pair's label. */}
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
      {/* Column headers */}
      <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 items-center pb-3 mb-2 border-b border-zinc-800 text-xs uppercase tracking-wide font-bold">
        <div className="text-center text-purple-300"><bdi>{t('guideAltHeadPlugin')}</bdi></div>
        <div className="w-8" aria-hidden="true"></div>
        <div className="text-center text-blue-300"><bdi>{t('guideAltHeadMod')}</bdi></div>
      </div>

      <div className="space-y-2.5">
        {ALT_ROWS.map((r) => (
          <div key={r.key}>
            {/* role label = what this pair does */}
            <div className="text-[11px] text-zinc-500 font-medium text-center mb-1">{t(r.role)}</div>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 items-stretch">
              {/* plugin side */}
              <div dir="ltr" className="rounded-xl border border-purple-500/25 bg-purple-500/[0.06] px-3 py-2.5 text-sm text-zinc-200 flex items-center justify-center text-center min-h-[44px]">
                {r.plugin}
              </div>
              {/* connector — bidirectional (RTL-safe: symmetric symbol) */}
              <div className="flex items-center justify-center text-zinc-500 text-lg font-bold select-none" aria-hidden="true">⇄</div>
              {/* mod side */}
              <div dir="ltr" className="rounded-xl border border-blue-500/25 bg-blue-500/[0.06] px-3 py-2.5 text-sm text-zinc-200 flex items-center justify-center text-center min-h-[44px]">
                {r.mod.startsWith('guide') ? t(r.mod) : r.mod}
              </div>
            </div>
          </div>
        ))}
      </div>
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
