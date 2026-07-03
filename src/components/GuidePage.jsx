import React, { useEffect, useState } from 'react';
import {
  BookOpen, Server, Puzzle, FolderTree, ShieldCheck,
  Cpu, Repeat, ArrowUp, ArrowLeft, ArrowRight,
} from 'lucide-react';
import { AddonTypesTable, InstallLocationCards } from './GuidePageSections';
import { CompatRules, RamTable, AltTable } from './GuidePageRules';
import ServerEnvCards from './GuideEnvCards';

// ============================================================================
//  GuidePage — public, no-auth reference center (SEO + onboarding).
//  Renders the full server-&-addon guide from the user's summary doc, in the
//  app's zinc-950 / emerald glass language (matches LandingPage).
//
//  Stable section anchors let other components deep-link "read more →":
//    guide-server-families · guide-install-locations · guide-ram
//    guide-compatibility · guide-alternatives · guide-addon-types
//
//  `scrollToAnchor` (optional) — when set, the page scrolls to that anchor on
//  mount (the deep-link entry point). Heavy tables live in GuidePageSections /
//  GuidePageRules to keep this file small.
// ============================================================================

// Section registry — single source of truth for the TOC + anchors.
// `bigGlyph` (optional) — a literal character drawn as the card's oversized
// gray glyph instead of the lucide icon. When null/absent the section's lucide
// icon is used. Cards whose TITLE ends with "?" get a big "?" glyph automatically.
const SECTIONS = [
  // NOTE: the cores icon must NOT look addon-ish (boxes/puzzle are the addon
  // language) — Server keeps the server-vs-addon split visually distinct.
  // bigGlyph is null so the card shows the Server icon (the title is no longer
  // "the three families", so a literal "3" would be misleading).
  { id: 'guide-server-families', icon: Server, titleKey: 'guideSecFamiliesTitle', subKey: 'guideSecFamiliesSub', bigGlyph: null },
  { id: 'guide-install-locations', icon: FolderTree, titleKey: 'guideSecInstallTitle', subKey: 'guideSecInstallSub' },
  { id: 'guide-ram', icon: Cpu, titleKey: 'guideSecRamTitle', subKey: 'guideSecRamSub' },
  { id: 'guide-compatibility', icon: ShieldCheck, titleKey: 'guideSecCompatTitle', subKey: 'guideSecCompatSub' },
  { id: 'guide-alternatives', icon: Repeat, titleKey: 'guideSecAltTitle', subKey: 'guideSecAltSub' },
  { id: 'guide-addon-types', icon: Puzzle, titleKey: 'guideSecAddonTitle', subKey: 'guideSecAddonSub' },
];

// Titles may carry a "/" as a LOGICAL line break for the gallery cards; in
// one-line contexts (section heading, prev/next buttons) it flattens to a space.
const flatTitle = (s) => (typeof s === 'string' ? s.split('/').map((p) => p.trim()).join(' ') : s);

// A guide section shell: anchored heading + optional "back to top" + body.
function Section({ id, icon: Icon, title, sub, t, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <div className="inline-flex p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 shrink-0">
            <Icon size={20} />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 leading-tight">{flatTitle(title)}</h2>
            {sub && <p className="text-sm text-zinc-400 mt-0.5">{sub}</p>}
          </div>
        </div>
        <a href="#guide-top" className="hidden sm:inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-emerald-400 transition-colors shrink-0 mt-1">
          <ArrowUp size={13} /> {t('guideBackToTop')}
        </a>
      </div>
      {children}
    </section>
  );
}

// Render one section's shell + body by id. Bodies are unchanged — this is just
// the switchboard so the gallery can show a single topic at a time.
function renderSection(id, t) {
  switch (id) {
    case 'guide-server-families':
      return (
        <Section id="guide-server-families" icon={Server} title={t('guideSecFamiliesTitle')} sub={t('guideSecFamiliesSub')} t={t}>
          {/* Flip card per environment — rotates to reveal its server types with a
              tiny explanation each. The add-on chips are arranged in the small
              table + player-side note that live inside ServerEnvCards. */}
          <ServerEnvCards t={t} />
          <p className="mt-4 text-xs text-zinc-500">{t('guidePluginNote')}</p>
        </Section>
      );
    case 'guide-addon-types':
      return (
        <Section id="guide-addon-types" icon={Puzzle} title={t('guideSecAddonTitle')} sub={t('guideSecAddonSub')} t={t}>
          <AddonTypesTable t={t} />
        </Section>
      );
    case 'guide-install-locations':
      return (
        <Section id="guide-install-locations" icon={FolderTree} title={t('guideSecInstallTitle')} sub={t('guideSecInstallSub')} t={t}>
          <InstallLocationCards t={t} />
        </Section>
      );
    case 'guide-compatibility':
      return (
        <Section id="guide-compatibility" icon={ShieldCheck} title={t('guideSecCompatTitle')} sub={t('guideSecCompatSub')} t={t}>
          <CompatRules t={t} />
        </Section>
      );
    case 'guide-ram':
      return (
        <Section id="guide-ram" icon={Cpu} title={t('guideSecRamTitle')} sub={t('guideSecRamSub')} t={t}>
          <RamTable t={t} />
        </Section>
      );
    case 'guide-alternatives':
      return (
        <Section id="guide-alternatives" icon={Repeat} title={t('guideSecAltTitle')} sub={t('guideSecAltSub')} t={t}>
          <AltTable t={t} />
        </Section>
      );
    default:
      return null;
  }
}

export default function GuidePage({ t, isRtl, scrollToAnchor }) {
  // Click-to-open gallery: null = overview grid, otherwise a single section id.
  // A deep-link (openGuide('guide-ram')) opens that section directly.
  const [openSection, setOpenSection] = useState(
    scrollToAnchor && SECTIONS.some((s) => s.id === scrollToAnchor) ? scrollToAnchor : null
  );

  // Deep-link entry: whenever the requested anchor changes, open that section
  // (and jump to the top so the reader starts from the section heading).
  useEffect(() => {
    if (!scrollToAnchor) return;
    if (SECTIONS.some((s) => s.id === scrollToAnchor)) {
      setOpenSection(scrollToAnchor);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [scrollToAnchor]);

  const open = (id) => {
    setOpenSection(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openIndex = openSection ? SECTIONS.findIndex((s) => s.id === openSection) : -1;
  const prevSection = openIndex > 0 ? SECTIONS[openIndex - 1] : null;
  const nextSection = openIndex >= 0 && openIndex < SECTIONS.length - 1 ? SECTIONS[openIndex + 1] : null;

  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const FwdIcon = isRtl ? ArrowLeft : ArrowRight;

  return (
    <div id="guide-top" className="relative scroll-mt-24" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* ===== HEADER ===== */}
      <header className="mb-8">
        {/* "מדריך" badge — white text + white outline (the page title below it
            is just "שרתים ותוספים", so the badge carries the word "guide"). */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-white/40 bg-white/5 text-white text-xs font-bold mb-4">
          <BookOpen size={14} /> {t('guideNav')}
        </div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-100 mb-2">{t('guideTitle')}</h1>
        <p className="text-zinc-400 max-w-2xl">{t('guideSubtitle')}</p>
      </header>

      {openSection === null ? (
        /* ===== OVERVIEW — clickable card gallery (one card per topic) ===== */
        <>
          <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wide mb-4">{t('guidePickTopic')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {SECTIONS.map((s) => {
              const title = t(s.titleKey);
              // Oversized gray glyph, pinned to the PHYSICAL right of the card in
              // every language: a literal bigGlyph ("3") > a "?" for question
              // titles > the section's own lucide icon.
              const glyph = s.bigGlyph || (title.trim().endsWith('?') ? '?' : null);
              // The card shows the "?" as the big glyph, so the TITLE drops it
              // (section view keeps the full question form).
              const displayTitle = glyph === '?' ? title.trim().replace(/\?$/, '') : title;
              return (
                <button
                  key={s.id}
                  onClick={() => open(s.id)}
                  className="group relative overflow-hidden text-start rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 pt-16 min-h-[10rem] flex flex-col justify-end transition-all
                             hover:border-emerald-500/40 hover:bg-zinc-900/70 hover:-translate-y-0.5
                             hover:shadow-[0_10px_40px_-12px_rgba(16,185,129,0.5)]"
                >
                  {/* HUGE gray glyph spanning the FULL CARD HEIGHT on the right,
                      BEHIND the title (z-0; overflow-hidden crops it at the card
                      edge). No subtitle on the card — the section shows it. */}
                  <div aria-hidden="true" className="absolute z-0 inset-y-0 right-2 flex items-center text-zinc-700/80 group-hover:text-zinc-500 transition-colors select-none pointer-events-none">
                    {glyph
                      ? <span className="text-[150px] font-black leading-none">{glyph}</span>
                      : <s.icon size={140} strokeWidth={1.2} />}
                  </div>
                  {/* WHITE enlarged title, CENTERED horizontally, nudged a touch up
                      from the bottom, in front of the glyph — font-black to MATCH the
                      glyph's weight. A "/" in the title is a LOGICAL line break (e.g.
                      Hebrew line above the English line), not an inline slash. */}
                  <h3 className="relative z-10 w-full mb-1.5 text-center text-2xl sm:text-3xl font-black text-white leading-tight">
                    {displayTitle.includes('/')
                      ? displayTitle.split('/').map((part, i) => <span key={i} className="block">{part.trim()}</span>)
                      : displayTitle}
                  </h3>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        /* ===== OPEN — a single topic, with back + prev/next ===== */
        <>
          <button
            onClick={() => setOpenSection(null)}
            className="inline-flex items-center gap-2 mb-6 px-3.5 py-2 rounded-lg text-sm font-bold
                       border border-emerald-500/30 bg-emerald-500/10 text-emerald-300
                       hover:bg-emerald-500/20 hover:border-emerald-400/50 transition-colors"
          >
            <BackIcon size={16} /> {t('guideBackToAll')}
          </button>

          {renderSection(openSection, t)}

          {(prevSection || nextSection) && (
            <div className="mt-10 flex flex-col sm:flex-row items-stretch gap-3">
              {prevSection ? (
                <button
                  onClick={() => open(prevSection.id)}
                  className="group flex-1 flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-start hover:border-emerald-500/40 hover:bg-zinc-900/70 transition-all"
                >
                  <BackIcon size={18} className="text-emerald-400 shrink-0" />
                  <span className="font-bold text-zinc-200 group-hover:text-white transition-colors leading-tight">{flatTitle(t(prevSection.titleKey))}</span>
                </button>
              ) : <span className="flex-1" />}
              {nextSection ? (
                <button
                  onClick={() => open(nextSection.id)}
                  className="group flex-1 flex items-center justify-end gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-end hover:border-emerald-500/40 hover:bg-zinc-900/70 transition-all"
                >
                  <span className="font-bold text-zinc-200 group-hover:text-white transition-colors leading-tight">{flatTitle(t(nextSection.titleKey))}</span>
                  <FwdIcon size={18} className="text-emerald-400 shrink-0" />
                </button>
              ) : <span className="flex-1" />}
            </div>
          )}
        </>
      )}
    </div>
  );
}
