import React from 'react';

export function NavBtn({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all ${active ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
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
