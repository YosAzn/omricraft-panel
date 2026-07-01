import React, { useEffect, useState } from 'react';
import {
  BookOpen, Boxes, Layers3, Puzzle, FolderTree, ShieldCheck,
  Cpu, Repeat, Image, Package, ArrowUp, ArrowLeft, ArrowRight,
} from 'lucide-react';
import { ServerTypesTable, AddonTypesTable, InstallLocationCards } from './GuidePageSections';
import { CompatRules, RamTable, AltTable, ResourcePackInfo, ModpackInfo } from './GuidePageRules';

// ============================================================================
//  GuidePage — public, no-auth reference center (SEO + onboarding).
//  Renders the full server-&-addon guide from the user's summary doc, in the
//  app's zinc-950 / emerald glass language (matches LandingPage).
//
//  Stable section anchors let other components deep-link "read more →":
//    guide-server-families · guide-server-types · guide-addon-types
//    guide-install-locations · guide-compatibility · guide-ram
//    guide-alternatives · guide-resource-packs · guide-modpacks
//
//  `scrollToAnchor` (optional) — when set, the page scrolls to that anchor on
//  mount (the deep-link entry point). Heavy tables live in GuidePageSections /
//  GuidePageRules to keep this file small.
// ============================================================================

// Section registry — single source of truth for the TOC + anchors.
const SECTIONS = [
  { id: 'guide-server-families', icon: Boxes, titleKey: 'guideSecFamiliesTitle', subKey: 'guideSecFamiliesSub' },
  { id: 'guide-server-types', icon: Layers3, titleKey: 'guideSecTypesTitle', subKey: 'guideSecTypesSub' },
  { id: 'guide-addon-types', icon: Puzzle, titleKey: 'guideSecAddonTitle', subKey: 'guideSecAddonSub' },
  { id: 'guide-install-locations', icon: FolderTree, titleKey: 'guideSecInstallTitle', subKey: 'guideSecInstallSub' },
  { id: 'guide-resource-packs', icon: Image, titleKey: 'guideSecResourceTitle', subKey: null },
  { id: 'guide-modpacks', icon: Package, titleKey: 'guideSecModpackTitle', subKey: null },
  { id: 'guide-compatibility', icon: ShieldCheck, titleKey: 'guideSecCompatTitle', subKey: 'guideSecCompatSub' },
  { id: 'guide-ram', icon: Cpu, titleKey: 'guideSecRamTitle', subKey: 'guideSecRamSub' },
  { id: 'guide-alternatives', icon: Repeat, titleKey: 'guideSecAltTitle', subKey: 'guideSecAltSub' },
];

// One of the three server-core families, rendered as an intro card.
function FamilyCard({ accent, chip, title, cores, body }) {
  return (
    <div className={`rounded-2xl border p-5 ${accent}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`px-2 py-0.5 rounded text-xs font-bold ${chip}`}>{title}</span>
        <span className="text-xs text-zinc-400">{cores}</span>
      </div>
      <p className="text-sm text-zinc-300 leading-relaxed">{body}</p>
    </div>
  );
}

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
            <h2 className="text-xl sm:text-2xl font-bold text-zinc-100 leading-tight">{title}</h2>
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
        <Section id="guide-server-families" icon={Boxes} title={t('guideSecFamiliesTitle')} sub={t('guideSecFamiliesSub')} t={t}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FamilyCard
              accent="border-purple-500/30 bg-purple-500/[0.06]"
              chip="bg-purple-500/15 text-purple-300"
              title={t('guideFamilyPlugins')}
              cores="Vanilla · Paper · Purpur · Folia"
              body={t('guideFamPluginsBody')}
            />
            <FamilyCard
              accent="border-blue-500/30 bg-blue-500/[0.06]"
              chip="bg-blue-500/15 text-blue-300"
              title={t('guideFamilyMods')}
              cores="Forge · NeoForge · Fabric · (Quilt)"
              body={t('guideFamModsBody')}
            />
            <FamilyCard
              accent="border-amber-500/30 bg-amber-500/[0.06]"
              chip="bg-amber-500/15 text-amber-300"
              title={t('guideFamilyHybrid')}
              cores="Mohist (EOL) · Youer"
              body={t('guideFamHybridBody')}
            />
          </div>
          <p className="mt-4 text-xs text-zinc-500">{t('guidePluginNote')}</p>
        </Section>
      );
    case 'guide-server-types':
      return (
        <Section id="guide-server-types" icon={Layers3} title={t('guideSecTypesTitle')} sub={t('guideSecTypesSub')} t={t}>
          <ServerTypesTable t={t} notOfferedLabel={t('guideNotOfferedBadge')} />
          <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{t('guideQuiltNote')}</p>
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
    case 'guide-resource-packs':
      return (
        <Section id="guide-resource-packs" icon={Image} title={t('guideSecResourceTitle')} t={t}>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <ResourcePackInfo t={t} />
          </div>
        </Section>
      );
    case 'guide-modpacks':
      return (
        <Section id="guide-modpacks" icon={Package} title={t('guideSecModpackTitle')} t={t}>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <ModpackInfo t={t} />
          </div>
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
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-xs font-bold mb-4">
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
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => open(s.id)}
                className="group text-start rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5 transition-all
                           hover:border-emerald-500/40 hover:bg-zinc-900/70 hover:-translate-y-0.5
                           hover:shadow-[0_10px_40px_-12px_rgba(16,185,129,0.5)]"
              >
                <div className="inline-flex p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 mb-3 group-hover:bg-emerald-500/20 transition-colors">
                  <s.icon size={22} />
                </div>
                <h3 className="font-bold text-zinc-100 leading-tight mb-1 group-hover:text-white transition-colors">{t(s.titleKey)}</h3>
                {s.subKey && <p className="text-sm text-zinc-400 leading-relaxed">{t(s.subKey)}</p>}
              </button>
            ))}
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
                  <span className="font-bold text-zinc-200 group-hover:text-white transition-colors leading-tight">{t(prevSection.titleKey)}</span>
                </button>
              ) : <span className="flex-1" />}
              {nextSection ? (
                <button
                  onClick={() => open(nextSection.id)}
                  className="group flex-1 flex items-center justify-end gap-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-end hover:border-emerald-500/40 hover:bg-zinc-900/70 transition-all"
                >
                  <span className="font-bold text-zinc-200 group-hover:text-white transition-colors leading-tight">{t(nextSection.titleKey)}</span>
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
