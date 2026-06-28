import React from 'react';
import {
  Server, Globe, Library, Shield, Sparkles, Boxes, Puzzle,
  Gift, SlidersHorizontal, ArrowRight, MousePointerClick, Plug, Gamepad2, LogIn
} from 'lucide-react';

// Public, no-auth-required landing page. The first thing a visitor sees.
// Matches (and elevates) the app's zinc-950 / emerald glass language.
//
// Props are all wired from App.jsx — this component owns NO state and NO auth
// logic of its own; it only calls back into the existing handlers.
export default function LandingPage({
  t, lang, setLang, isRtl,
  authUser, isAdmin, adminEmail,
  onCreate, onPlugins, onOpenPanel, onSignIn,
}) {
  const ArrowCta = isRtl ? ({ size }) => <ArrowRight size={size} className="rotate-180" /> : ArrowRight;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans overflow-x-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Atmospheric background — pure CSS, no deps */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(16,185,129,0.16),transparent_70%)]" />
        <div className="absolute inset-0 opacity-[0.04] bg-[linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] bg-[size:46px_46px] [mask-image:radial-gradient(80%_60%_at_50%_0%,#000,transparent)]" />
        <div className="oc-orb absolute -top-24 start-[8%] h-72 w-72 rounded-full bg-emerald-500/20 blur-[90px]" />
        <div className="oc-orb-slow absolute top-[40%] end-[6%] h-80 w-80 rounded-full bg-green-600/10 blur-[100px]" />
      </div>

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
        <header className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-green-600 p-2 rounded-lg shadow-lg shadow-green-900/30">
              <Server size={22} className="text-white" />
            </div>
            <span className="text-xl font-black tracking-tight bg-gradient-to-l from-green-400 to-emerald-600 bg-clip-text text-transparent">
              {t('appTitle')}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setLang(lang === 'he' ? 'en' : 'he')}
              className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5 text-sm px-2.5 py-2 rounded-full hover:bg-zinc-800/60"
              title={t('language')}
            >
              <Globe size={16} />
              <span className="uppercase font-bold text-xs">{lang === 'he' ? 'EN' : 'HE'}</span>
            </button>

            {authUser && (isAdmin || !authUser.isAnonymous) ? (
              <div className="flex items-center gap-2">
                {adminEmail && (
                  <span className="hidden md:inline text-xs text-emerald-400 font-bold max-w-[140px] truncate" title={adminEmail}>
                    {adminEmail}
                  </span>
                )}
                <button
                  onClick={onOpenPanel}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white font-bold text-sm px-4 py-2 rounded-lg transition-all shadow-lg shadow-green-900/30"
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
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 sm:pt-20 sm:pb-24 text-center">
          <div className="oc-rise inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300 text-xs font-bold mb-8">
            <Sparkles size={14} /> {t('landingHeroBadge')}
          </div>

          <h1 className="oc-rise text-6xl sm:text-7xl lg:text-8xl font-black tracking-tighter leading-[0.95] mb-6"
              style={{ animationDelay: '60ms' }}>
            <span className="bg-gradient-to-b from-white via-emerald-100 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_40px_rgba(16,185,129,0.25)]">
              {t('appTitle')}
            </span>
          </h1>

          <p className="oc-rise text-2xl sm:text-3xl font-bold text-zinc-100 max-w-2xl mx-auto mb-4"
             style={{ animationDelay: '120ms' }}>
            {t('landingTagline')}
          </p>
          <p className="oc-rise text-base sm:text-lg text-zinc-400 max-w-xl mx-auto mb-10"
             style={{ animationDelay: '180ms' }}>
            {t('landingSubtitle')}
          </p>

          <div className="oc-rise flex flex-col sm:flex-row items-center justify-center gap-3"
               style={{ animationDelay: '240ms' }}>
            <button
              onClick={onCreate}
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2.5 bg-green-600 hover:bg-green-500 text-white text-lg font-bold px-8 py-4 rounded-2xl transition-all shadow-xl shadow-green-900/40 hover:shadow-green-700/40 hover:-translate-y-0.5"
            >
              {t('landingCtaCreate')}
              <ArrowCta size={20} />
            </button>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-zinc-300 hover:text-white text-lg font-bold px-8 py-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80 hover:border-zinc-700 transition-all"
            >
              {t('landingHowItWorks')}
            </a>
          </div>
        </section>

        {/* ===== FEATURE CTA CARDS ===== */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <CtaCard
              icon={<MousePointerClick size={22} />}
              title={t('landingCtaCreate')}
              desc={t('landingCtaCreateSub')}
              onClick={onCreate}
              Arrow={ArrowCta}
              primary
            />
            <CtaCard
              icon={<Library size={22} />}
              title={t('landingCtaPlugins')}
              desc={t('landingCtaPluginsSub')}
              onClick={onPlugins}
              Arrow={ArrowCta}
            />
            <CtaCard
              icon={<Boxes size={22} />}
              title={t('landingHowItWorks')}
              desc={t('landingCtaHowSub')}
              href="#how-it-works"
              Arrow={ArrowCta}
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
              className="inline-flex items-center justify-center gap-2.5 bg-green-600 hover:bg-green-500 text-white text-lg font-bold px-8 py-4 rounded-2xl transition-all shadow-xl shadow-green-900/40 hover:-translate-y-0.5"
            >
              {t('landingGetStarted')}
              <ArrowCta size={20} />
            </button>
          </div>
        </section>

        {/* ===== FOOTER ===== */}
        <footer className="border-t border-zinc-900">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
            <div className="flex items-center gap-2.5">
              <div className="bg-green-600/90 p-1.5 rounded-md"><Server size={16} className="text-white" /></div>
              <span className="font-black tracking-tight bg-gradient-to-l from-green-400 to-emerald-600 bg-clip-text text-transparent">
                {t('appTitle')}
              </span>
            </div>
            <p className="text-zinc-500">{t('landingFooterCredit')}</p>
          </div>
        </footer>
      </div>
    </div>
  );
}

// --- Sub-components (kept in-file: tiny, single-purpose, only used here) ---

function CtaCard({ icon, title, desc, onClick, href, Arrow, primary }) {
  const className =
    'group relative w-full text-start rounded-2xl border p-6 transition-all hover:-translate-y-1 ' +
    (primary
      ? 'border-emerald-500/30 bg-gradient-to-br from-emerald-600/15 to-zinc-900/60 hover:border-emerald-400/50 hover:shadow-2xl hover:shadow-emerald-900/30'
      : 'border-zinc-800 bg-zinc-900/60 hover:border-emerald-500/40 hover:shadow-2xl hover:shadow-emerald-900/20');

  const inner = (
    <>
      <div className={`inline-flex p-3 rounded-xl mb-4 ${primary ? 'bg-emerald-500/20 text-emerald-300' : 'bg-zinc-800 text-emerald-400'} group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-1.5 flex items-center gap-2">
        {title}
        <Arrow size={18} className="opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-emerald-400" />
      </h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
    </>
  );

  if (href) return <a href={href} className={className}>{inner}</a>;
  return <button onClick={onClick} className={className}>{inner}</button>;
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
    <div className="relative rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 hover:border-emerald-500/30 transition-colors">
      <span className="absolute top-5 end-5 text-5xl font-black text-zinc-800/80 select-none leading-none">{n}</span>
      <div className="inline-flex p-3 rounded-xl bg-emerald-500/10 text-emerald-400 mb-4">{icon}</div>
      <h3 className="text-lg font-bold mb-1.5">{title}</h3>
      <p className="text-sm text-zinc-400 leading-relaxed">{desc}</p>
    </div>
  );
}
