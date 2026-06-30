import React, { useEffect } from 'react';
import {
  BookOpen, Boxes, Layers3, Puzzle, FolderTree, ShieldCheck,
  Cpu, Repeat, Image, Package, ArrowUp,
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

export default function GuidePage({ t, isRtl, scrollToAnchor }) {
  // Deep-link entry: scroll to the requested anchor on mount (and whenever it changes).
  useEffect(() => {
    if (!scrollToAnchor) return;
    const el = document.getElementById(scrollToAnchor);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [scrollToAnchor]);

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

      {/* ===== TABLE OF CONTENTS ===== */}
      <nav className="mb-10 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
        <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wide mb-3">{t('guideTocTitle')}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-800/60 transition-colors"
            >
              <s.icon size={16} className="text-emerald-400 shrink-0" />
              <span className="leading-tight">{t(s.titleKey)}</span>
            </a>
          ))}
        </div>
      </nav>

      <div className="space-y-12">
        {/* (א) THREE FAMILIES */}
        <Section id="guide-server-families" icon={Boxes} title={t('guideSecFamiliesTitle')} sub={t('guideSecFamiliesSub')} t={t}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <FamilyCard
              accent="border-purple-500/30 bg-purple-500/[0.06]"
              chip="bg-purple-500/15 text-purple-300"
              title={t('guideFamilyPlugins')}
              cores="Vanilla · Paper · Purpur · Folia"
              body="לא נוגעים בקבצי המשחק — מוסיפים פקודות, כלכלה, הגנות והרשאות בצד-השרת. השחקן נכנס עם לקוח ונילה רגיל, בלי להתקין כלום. «פורמט הפלאגינים» = Bukkit/Spigot API; Paper הוא פיצול של Spigot."
            />
            <FamilyCard
              accent="border-blue-500/30 bg-blue-500/[0.06]"
              chip="bg-blue-500/15 text-blue-300"
              title={t('guideFamilyMods')}
              cores="Forge · NeoForge · Fabric · (Quilt)"
              body="משנים את המשחק לעומק — בלוקים, חיות וממדים חדשים. דורשים שכל שחקן יתקין את אותו loader ואת אותם מודים בדיוק במחשבו. כבדים יותר על הזיכרון."
            />
            <FamilyCard
              accent="border-amber-500/30 bg-amber-500/[0.06]"
              chip="bg-amber-500/15 text-amber-300"
              title={t('guideFamilyHybrid')}
              cores="Mohist (EOL) · Youer"
              body="מריצים מודים של Forge/NeoForge ופלאגינים של Bukkit יחד — רק כשחייבים את השילוב. Mohist הוא EOL ולא יציב; Youer הוא היורש המתוחזק (NeoForge) ומומלץ עליו."
            />
          </div>
          <p className="mt-4 text-xs text-zinc-500">{t('guidePluginNote')}</p>
        </Section>

        {/* (ב) SERVER TYPES TABLE */}
        <Section id="guide-server-types" icon={Layers3} title={t('guideSecTypesTitle')} sub={t('guideSecTypesSub')} t={t}>
          <ServerTypesTable t={t} notOfferedLabel={t('guideNotOfferedBadge')} />
          <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{t('guideQuiltNote')}</p>
        </Section>

        {/* (ג) ADDON TYPES */}
        <Section id="guide-addon-types" icon={Puzzle} title={t('guideSecAddonTitle')} sub={t('guideSecAddonSub')} t={t}>
          <AddonTypesTable t={t} />
        </Section>

        {/* INSTALL LOCATIONS */}
        <Section id="guide-install-locations" icon={FolderTree} title={t('guideSecInstallTitle')} sub={t('guideSecInstallSub')} t={t}>
          <InstallLocationCards />
        </Section>

        {/* RESOURCE PACKS */}
        <Section id="guide-resource-packs" icon={Image} title={t('guideSecResourceTitle')} t={t}>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <ResourcePackInfo />
          </div>
        </Section>

        {/* MODPACKS */}
        <Section id="guide-modpacks" icon={Package} title={t('guideSecModpackTitle')} t={t}>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
            <ModpackInfo />
          </div>
        </Section>

        {/* COMPATIBILITY */}
        <Section id="guide-compatibility" icon={ShieldCheck} title={t('guideSecCompatTitle')} sub={t('guideSecCompatSub')} t={t}>
          <CompatRules />
        </Section>

        {/* RAM */}
        <Section id="guide-ram" icon={Cpu} title={t('guideSecRamTitle')} sub={t('guideSecRamSub')} t={t}>
          <RamTable />
        </Section>

        {/* ALTERNATIVES */}
        <Section id="guide-alternatives" icon={Repeat} title={t('guideSecAltTitle')} sub={t('guideSecAltSub')} t={t}>
          <AltTable />
        </Section>
      </div>
    </div>
  );
}
