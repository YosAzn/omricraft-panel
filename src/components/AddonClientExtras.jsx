import React, { useState } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';

// Shared inline UI bits for the addon catalog (used by CreateServerForm + AddonsTab).
// Pure presentational — no network, no state beyond the local expand toggle.

// A small "Download ↗" link for a client-side item (links to its official page).
export function ClientDownloadLink({ url, t }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-400 hover:text-teal-300 border border-teal-500/30 bg-teal-500/5 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap"
    >
      {t('clientDownload')} <ExternalLink size={11} />
    </a>
  );
}

// Inline (NO popup) "pick one" dependency chooser shown beneath a pack that has
// clientDeps. Each option lists its client items with their download links; the
// recommended option gets a badge. Compact, expandable.
export function ClientDepsChooser({ deps, allAddons, t, lang, addonDesc }) {
  const [open, setOpen] = useState(false);
  if (!deps || deps.length === 0) return null;

  return (
    <div className="mt-2 w-full">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors"
      >
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        {t('requiresPickOne')}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5 ps-2 border-s border-amber-500/20">
          {deps.map((opt, i) => (
            <div key={opt.label || i} className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-2">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-bold text-zinc-200">{opt.label}</span>
                {opt.recommended && (
                  <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border border-green-500/30 text-green-400 bg-green-500/10">
                    {t('recommendedBadge')}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(opt.ids || []).map(id => {
                  const item = allAddons.find(a => a.id === id);
                  if (!item) return null;
                  return (
                    <span key={id} className="inline-flex items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded px-1.5 py-0.5">
                      <span
                        className="text-[11px] text-zinc-300"
                        title={addonDesc(item.id, lang, item.desc)}
                      >
                        {item.name}
                      </span>
                      {item.clientUrl && <ClientDownloadLink url={item.clientUrl} t={t} />}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
