import React, { useState, useEffect } from 'react';
import {
  Server, Library, Shield, Sparkles, Boxes, Puzzle,
  Gift, SlidersHorizontal, ArrowRight, Plug, Gamepad2, LogIn, Users,
  Rocket, BookOpen, Layers3, GraduationCap, Plus
} from 'lucide-react';
import { getPublicStatsFn } from '../lib/api';
import { SERVER_TYPE_COUNT, ADDON_CATALOG_COUNT, roundedFloorPlus } from '../lib/constants';
import SideCreepers from './SideCreepers';
import LanguageSelector from './LanguageSelector';
import omricraftLogo from '../assets/omricraft-logo.png';
import omricraftLogoS from '../assets/omricraft-logo-s.png';
import omricraftFace from '../assets/omricraft-face.png';
import omricraftWordmark from '../assets/omricraft-wordmark.png';
import ocGuide from '../assets/oc-guide.png';
import ocGuideIcon from '../assets/oc-guide-icon.png';
// CTA button art — the same faceted set the top nav uses, so both rows match.
import dashboardSpider from '../assets/dashboard-spider.png';
import addonsSword from '../assets/addons-sword.png';
import guideWiseMan from '../assets/guide-wise-man.png';
import warroomTnt from '../assets/warroom-tnt.png';

// Public, no-auth-required landing page. The first thing a visitor sees.
// Matches (and elevates) the app's zinc-950 / emerald glass language.
//
// Props are all wired from App.jsx — this component owns NO state and NO auth
// logic of its own; it only calls back into the existing handlers.
export default function LandingPage({
  t, lang, setLang, isRtl,
  authUser, isAdmin, adminEmail,
  onCreate, onPlugins, onGuide, onOpenPanel, onHealth, onSignIn,
}) {
  const ArrowCta = isRtl ? ({ size }) => <ArrowRight size={size} className="rotate-180" /> : ArrowRight;

  // Public aggregate stats (server count + players online). Fetched on mount via
  // the PUBLIC getPublicStats callable. The big stat cards ALWAYS render (the two
  // static catalog facts are always true); the two LIVE numbers show a neutral "—"
  // until/unless the fetch succeeds — never a fabricated number, never blocks the page.
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let alive = true;
    getPublicStatsFn()
      .then(res => {
        const d = res?.data || res;
        if (alive && d && d.success) setStats(d);
      })
      .catch(e => { console.error('getPublicStats failed:', e); });
    return () => { alive = false; };
  }, []);

  // Live numbers — null until a successful fetch. Render as a dash when unavailable.
  const liveOk = !!(stats && stats.success);
  const serverCount  = liveOk && typeof stats.serverCount === 'number'  ? stats.serverCount  : null;
  const playersOnline = liveOk && typeof stats.playersOnline === 'number' ? stats.playersOnline : null;
  const fmtLive = (n) => (n === null ? '—' : n.toLocaleString());

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans overflow-x-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Atmospheric background — pure CSS, no deps */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(16,185,129,0.16),transparent_70%)]" />
        <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] bg-[size:46px_46px] [mask-image:radial-gradient(80%_60%_at_50%_0%,#000,transparent)]" />
        <div className="oc-orb absolute -top-24 start-[8%] h-72 w-72 rounded-full bg-emerald-500/20 blur-[90px]" />
        <div className="oc-orb-slow absolute top-[40%] end-[6%] h-80 w-80 rounded-full bg-green-600/10 blur-[100px]" />
      </div>

      {/* Faint edge decoration (fixed, z-0, pointer-events:none) behind landing content */}
      <SideCreepers />

      {/* keyframes scoped to the landing page */}
      <style>{`
        @keyframes oc-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
        @keyframes oc-rise { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        .oc-orb{animation:oc-float 9s ease-in-out infinite}
        .oc-orb-slow{animation:oc-float 13s ease-in-out infinite}
        .oc-rise{animation:oc-rise .7s cubic-bezier(.2,.7,.2,1) both}
        @media (prefers-reduced-motion: reduce){.oc-orb,.oc-orb-slow,.oc-rise{animation:none}}
      `}</style>

      <div className="relative z-10">
        {/* ===== TOP BAR ===== */}
        {/* Pinned physical LTR (dir="ltr") like the panel nav — the logo stays on
            the visual LEFT even in RTL languages; lang/auth group on the right. */}
        <header dir="ltr" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between gap-4">
          {/* Brand lockup: face + wordmark IMAGE (consistent with the hero, nav and
              footer). Replaces the old gradient text. */}
          <div className="flex items-center gap-1.5">
            <img src={omricraftFace} alt="" aria-hidden="true" className="h-[60px] w-auto" />
            <img src={omricraftWordmark} alt={t('appTitle')} className="h-[38px] w-auto drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]" style={{ position: 'relative', top: '6px' }} />
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <LanguageSelector
              lang={lang}
              setLang={setLang}
              title={t('language')}
              className="px-2.5 py-2 rounded-full hover:bg-zinc-800/60"
            />

            {authUser && (isAdmin || !authUser.isAnonymous) ? (
              <div className="flex items-center gap-2">
                {adminEmail && (
                  <span className="hidden md:inline text-xs text-emerald-400 font-bold max-w-[140px] truncate" title={adminEmail}>
                    {adminEmail}
                  </span>
                )}
                <button
                  onClick={onOpenPanel}
                  className="flex items-center gap-2 bg-crown hover:bg-crown-light text-white font-bold text-sm px-4 py-2 rounded-lg transition-all shadow-lg shadow-green-900/30"
                >
                  <SlidersHorizontal size={16} /> {t('landingOpenPanel')}
                </button>
              </div>
            ) : (
              <button
                onClick={onSignIn}
                className="flex items-center gap-2 text-emerald-400 hover:text-white transition-colors text-sm font-bold px-3.5 py-2 rounded-lg bg-zinc-800/80 hover:bg-emerald-600"
                title={t('adminSignIn')}
              >
                <LogIn size={16} /> <span>{t('landingSignIn')}</span>
              </button>
            )}
          </div>
        </header>

        {/* ===== HERO ===== */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 sm:pt-16 sm:pb-24 text-center">
          {/* FRAMELESS face emblem (Yosef's new art, no circular frame) floating on
              the page black, with the "OmriCraft" wordmark beneath it. */}
          <img
            src={omricraftFace}
            alt=""
            aria-hidden="true"
            className="oc-rise mx-auto mb-5 h-52 sm:h-64 lg:h-[300px] w-auto drop-shadow-[0_0_60px_rgba(16,185,129,0.4)]"
          />
          {/* Wordmark image (Yosef's new "OmriCraft" logo) replaces the gradient text;
              kept inside the h1 with alt text so the page still has its heading.
              Nudged right (position:left) so the bottom diamond sits under the face's
              centre — position, not transform, so it never fights the oc-rise anim. */}
          <h1 className="oc-rise mb-6" style={{ animationDelay: '60ms' }}>
            <img src={omricraftWordmark} alt={t('appTitle')}
                 className="mx-auto h-24 sm:h-28 lg:h-[134px] w-auto drop-shadow-[0_0_40px_rgba(16,185,129,0.35)]"
                 style={{ position: 'relative', left: '12px' }} />
          </h1>

          <p className="oc-rise text-2xl sm:text-3xl font-bold text-zinc-100 max-w-2xl mx-auto mb-4"
             style={{ animationDelay: '120ms' }}>
            {t('landingTagline')}
          </p>
          <p className="oc-rise text-base sm:text-lg text-zinc-400 max-w-xl mx-auto mb-10"
             style={{ animationDelay: '180ms' }}>
            {t('landingSubtitle')}
          </p>

          {/* All four CTAs share ONE size/shape — accent-tinted outline buttons.
              `items-stretch` keeps them the SAME HEIGHT even when a label wraps to
              two lines at a given width; `sm:min-w` keeps them the same width. Create
              is just the emerald-accented one (no loud gradient). */}
          {/* "How it works" is NOT one of the five destinations — it only scrolls
              further down this same page. It sits ABOVE the row as a quiet link so
              the five real destinations below read as one clean, even row. */}
          <div className="oc-rise flex justify-center mb-5" style={{ animationDelay: '215ms' }}>
            <a
              href="#how-it-works"
              className="group inline-flex items-center gap-2 text-sm sm:text-base font-bold text-zinc-400 hover:text-amber-100 transition-colors"
            >
              <BookOpen size={17} className="text-amber-300/80 group-hover:text-amber-200 transition-colors shrink-0" />
              <span className="border-b border-dashed border-zinc-700 group-hover:border-amber-500/50 pb-0.5">
                {t('landingHowItWorks')}
              </span>
            </a>
          </div>

          {/* PRIMARY DESTINATIONS — the same five, in the same order, as the panel's
              top nav: create · dashboard · add-ons · guide · war-room. DOM order is
              the single source of that order; the row follows the page direction, so
              in Hebrew "צור שרת" lands on the RIGHT exactly like the nav.
              War room is admin-only, matching the nav and the view guard in App.jsx. */}
          <div className="oc-rise flex flex-col sm:flex-row flex-wrap items-stretch justify-center gap-3.5"
               style={{ animationDelay: '240ms' }}>
            {/* Create — emerald accent (primary by colour, same footprint as the rest) */}
            <button
              onClick={onCreate}
              className="group w-full sm:w-auto sm:min-w-[190px] inline-flex items-center justify-center gap-2.5 text-emerald-50 text-lg font-bold px-7 py-4 rounded-2xl transition-all
                         border border-emerald-400/50 bg-emerald-500/20 hover:bg-emerald-500/30 hover:border-emerald-300/70
                         shadow-lg shadow-emerald-950/40 hover:-translate-y-0.5"
            >
              <Plus size={24} className="text-emerald-300 group-hover:text-emerald-200 transition-colors shrink-0" />
              <span>{t('landingCtaCreate')}</span>
            </button>

            {/* Dashboard — teal accent. Ungated, exactly like the nav's dashboard tab. */}
            <button
              onClick={onOpenPanel}
              className="group w-full sm:w-auto sm:min-w-[190px] inline-flex items-center justify-center gap-2.5 text-teal-50 text-lg font-bold px-7 py-4 rounded-2xl transition-all
                         border border-teal-500/40 bg-teal-500/15 hover:bg-teal-500/25 hover:border-teal-400/60
                         shadow-lg shadow-teal-950/40 hover:-translate-y-0.5"
            >
              <img src={dashboardSpider} alt="" className="h-8 w-auto object-contain shrink-0" />
              <span>{t('dashboard')}</span>
            </button>

            {/* Add-ons ("תוספים") — violet accent */}
            <button
              onClick={onPlugins}
              className="group w-full sm:w-auto sm:min-w-[190px] inline-flex items-center justify-center gap-2.5 text-violet-50 text-lg font-bold px-7 py-4 rounded-2xl transition-all
                         border border-violet-500/40 bg-violet-500/15 hover:bg-violet-500/25 hover:border-violet-400/60
                         shadow-lg shadow-violet-950/40 hover:-translate-y-0.5"
            >
              <img src={addonsSword} alt="" className="h-8 w-auto object-contain shrink-0" />
              <span>{t('repo')}</span>
            </button>

            {/* Guide — sky accent + the oc-guide sage icon */}
            <button
              onClick={onGuide}
              className="group w-full sm:w-auto sm:min-w-[190px] inline-flex items-center justify-center gap-2.5 text-sky-50 text-lg font-bold px-7 py-4 rounded-2xl transition-all
                         border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 hover:border-sky-400/60
                         shadow-lg shadow-sky-950/40 hover:-translate-y-0.5"
            >
              {/* wise-man art already faces LEFT in the source — never mirror it. */}
              <img src={guideWiseMan} alt="" className="h-8 w-auto object-contain shrink-0 opacity-95 group-hover:opacity-100 transition-opacity" />
              <span>{t('landingCtaGuide')}</span>
            </button>

            {/* War room ("חמ״ל") — rose accent. ADMIN ONLY: the health view is admin-
                gated in App.jsx (redirect + render guard), so showing it to anyone
                else would just bounce them straight back to the dashboard. */}
            {isAdmin && (
              <button
                onClick={onHealth}
                className="group w-full sm:w-auto sm:min-w-[190px] inline-flex items-center justify-center gap-2.5 text-rose-50 text-lg font-bold px-7 py-4 rounded-2xl transition-all
                           border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/25 hover:border-rose-400/60
                           shadow-lg shadow-rose-950/40 hover:-translate-y-0.5"
              >
                <img src={warroomTnt} alt="" className="h-8 w-auto object-contain shrink-0" />
                <span>{t('healthNav')}</span>
              </button>
            )}
          </div>
        </section>

        {/* ===== LIVE STAT CARDS (social proof) ===== */}
        {/* Two LIVE numbers (servers + players online) from getPublicStats, plus two
            always-true static catalog facts. Live numbers degrade to "—" on failure. */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
            <StatCard
              accent="emerald"
              icon={<Server size={28} />}
              value={fmtLive(serverCount)}
              label={t('landingStatsServers')}
            />
            <StatCard
              accent="sky"
              icon={<Users size={28} />}
              value={fmtLive(playersOnline)}
              label={t('landingStatsPlayers')}
              live
              liveLabel={t('landingStatsLive')}
            />
            <StatCard
              accent="amber"
              icon={<Boxes size={28} />}
              value={SERVER_TYPE_COUNT}
              label={t('landingStatsTypes')}
            />
            <StatCard
              accent="violet"
              icon={<Library size={28} />}
              value={roundedFloorPlus(ADDON_CATALOG_COUNT)}
              label={t('landingStatsAddons')}
            />
          </div>
        </section>

        {/* ===== WHY / FEATURES STRIP ===== */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">{t('landingWhyTitle')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <WhyItem icon={<Boxes size={20} />} title={t('landingWhyAll')} desc={t('landingWhyAllDesc')} />
            <WhyItem icon={<Puzzle size={20} />} title={t('landingWhyAddons')} desc={t('landingWhyAddonsDesc')} />
            <WhyItem icon={<Gift size={20} />} title={t('landingWhyFree')} desc={t('landingWhyFreeDesc')} />
            <WhyItem icon={<Shield size={20} />} title={t('landingWhyControl')} desc={t('landingWhyControlDesc')} />
          </div>
        </section>

        {/* ===== HOW IT WORKS ===== */}
        <section id="how-it-works" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24 scroll-mt-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">{t('landingHowItWorks')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <StepCard n="1" icon={<SlidersHorizontal size={22} />} title={t('landingStep1')} desc={t('landingStep1Desc')} />
            <StepCard n="2" icon={<Plug size={22} />} title={t('landingStep2')} desc={t('landingStep2Desc')} />
            <StepCard n="3" icon={<Gamepad2 size={22} />} title={t('landingStep3')} desc={t('landingStep3Desc')} />
          </div>

          <div className="mt-12 text-center">
            <button
              onClick={onCreate}
              className="group inline-flex items-center justify-center gap-2.5 text-emerald-50 text-lg font-bold px-8 py-4 rounded-2xl transition-all
                         border border-emerald-400/50 bg-emerald-500/20 hover:bg-emerald-500/30 hover:border-emerald-300/70 shadow-lg shadow-emerald-950/40 hover:-translate-y-0.5"
            >
              <Plus size={22} className="text-emerald-300 group-hover:text-emerald-200 transition-colors shrink-0" />
              <span>{t('landingGetStarted')}</span>
            </button>
          </div>
        </section>

        {/* ===== FOOTER ===== */}
        <footer className="border-t border-zinc-900">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2.5">
              <img src={omricraftFace} alt="" aria-hidden="true" className="h-9 w-auto" />
              <img src={omricraftWordmark} alt={t('appTitle')} className="h-6 w-auto opacity-90" />
            </div>
            <p className="text-zinc-500">{t('landingFooterCredit')}</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

// --- Sub-components (kept in-file: tiny, single-purpose, only used here) ---

// Per-accent class sets — full literal class names so Tailwind keeps them at build time.
const STAT_ACCENTS = {
  emerald: {
    hover: 'hover:border-emerald-500/40 hover:shadow-emerald-900/20',
    chip: 'bg-emerald-500/10 text-emerald-400',
    value: 'from-white to-emerald-300',
    watermark: 'text-emerald-500/[0.13]',
  },
  sky: {
    hover: 'hover:border-sky-500/40 hover:shadow-sky-900/20',
    chip: 'bg-sky-500/10 text-sky-400',
    value: 'from-white to-sky-300',
    watermark: 'text-sky-500/[0.13]',
  },
  amber: {
    hover: 'hover:border-amber-500/40 hover:shadow-amber-900/20',
    chip: 'bg-amber-500/10 text-amber-400',
    value: 'from-white to-amber-300',
    watermark: 'text-amber-500/[0.13]',
  },
  violet: {
    hover: 'hover:border-violet-500/40 hover:shadow-violet-900/20',
    chip: 'bg-violet-500/10 text-violet-400',
    value: 'from-white to-violet-300',
    watermark: 'text-violet-500/[0.13]',
  },
};

// Big bold social-proof stat card. `accent` colors the chip + value gradient + hover.
// `live` adds a pulsing dot + "live" label (kept emerald — it's a status, not a theme).
function StatCard({ icon, value, label, live, liveLabel, accent = 'emerald' }) {
  const a = STAT_ACCENTS[accent] || STAT_ACCENTS.emerald;
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6 hover:shadow-2xl transition-all ${a.hover}`}>
      {/* Enlarged, semi-transparent watermark of the same icon — cloned bigger, cropped in the corner */}
      <div className={`pointer-events-none absolute -bottom-5 -end-4 ${a.watermark} select-none`} aria-hidden="true">
        {React.cloneElement(icon, { size: 132, strokeWidth: 1.5 })}
      </div>
      <div className="relative flex items-center justify-between mb-3">
        <div className={`inline-flex p-3 rounded-xl ${a.chip}`}>{icon}</div>
        {live && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {liveLabel}
          </span>
        )}
      </div>
      <div className={`relative text-4xl sm:text-5xl font-black tracking-tighter leading-none bg-gradient-to-b ${a.value} bg-clip-text text-transparent`}>
        {value}
      </div>
      <p className="relative mt-2 text-sm text-zinc-400 leading-snug">{label}</p>
    </div>
  );
}

function WhyItem({ icon, title, desc }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 hover:border-zinc-700 transition-colors">
      <div className="inline-flex p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 mb-3">{icon}</div>
      <h3 className="font-bold mb-1.5">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
    </div>
  );
}

function StepCard({ n, icon, title, desc }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 hover:border-emerald-500/30 transition-colors">
      {/* BIG step number — bold ghost numeral, much larger than before */}
      <span className="absolute -top-2 end-3 text-[7rem] sm:text-[8rem] font-black text-zinc-800/70 select-none leading-none pointer-events-none">{n}</span>
      <div className="relative inline-flex p-3 rounded-xl bg-emerald-500/10 text-emerald-400 mb-4">{icon}</div>
      <h3 className="relative text-lg font-bold mb-1.5">{title}</h3>
      <p className="relative text-sm text-zinc-400 leading-relaxed">{desc}</p>
    </div>
  );
}
