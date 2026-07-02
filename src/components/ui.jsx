import React from 'react';

export function NavBtn({ active, onClick, icon, label }) {
  // Extra-slim top-nav button — py-0.5 + text-xs (≈half the previous py-1 height)
  // so the nav bar reads as a thin strip. Used exclusively by the top nav
  // (App.jsx), matched by the emerald "＋ שרת" create button (also py-0.5).
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-xs font-medium transition-all ${active ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
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
