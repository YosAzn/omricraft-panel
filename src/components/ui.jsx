import React from 'react';

// Standard page header — a page emblem + the page title in ONE consistent style
// across the whole app (matches the add-ons page: a text-3xl bold h2). The emblem
// mirrors horizontally in RTL (he/ar). `sticky` pins it just under the top nav so
// it stays visible above scrolling page content.
export function PageHeader({ logo, title, desc, eyebrow, flip = false, sticky = false, glow }) {
  return (
    <div className={sticky
      ? 'sticky top-[52px] z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 mb-6 bg-zinc-950/85 backdrop-blur-md border-b border-zinc-800/70'
      : 'mb-6'}>
      <div className="flex items-center gap-3">
        {logo && (
          <img
            src={logo}
            alt=""
            aria-hidden="true"
            className={`h-11 sm:h-12 w-auto shrink-0 ${flip ? '-scale-x-100' : ''}`}
            style={glow ? { filter: `drop-shadow(0 0 16px ${glow})` } : undefined}
          />
        )}
        <div className="min-w-0">
          {eyebrow && <p className="text-sm text-emerald-400 font-bold mb-0.5 leading-none">{eyebrow}</p>}
          <h2 className="text-3xl font-bold leading-tight">{title}</h2>
          {desc && <p className="text-zinc-400 text-sm mt-0.5">{desc}</p>}
        </div>
      </div>
    </div>
  );
}

export function NavBtn({ active, onClick, icon, label }) {
  // Top-nav button — comfortable size (px-3 py-1.5 + text-sm). Used exclusively by
  // the top nav (App.jsx), matched by the green-outline "＋ שרת" create button.
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-transparent transition-all ${active ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
    >
      {icon} <span className="hidden md:inline">{label}</span>
    </button>
  );
}

export function TabBtn({ icon, label, active, onClick, badge }) {
  return (
    <button onClick={onClick} className={`flex items-center justify-between w-full p-3 rounded-lg font-medium transition-all whitespace-nowrap ${active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}>
      <div className="flex items-center gap-3">{icon} <span>{label}</span></div>
      {badge !== undefined && badge > 0 && <span className="bg-green-500/20 text-green-400 text-xs py-0.5 px-2 rounded-full font-bold">{badge}</span>}
    </button>
  );
}
