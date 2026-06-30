import React, { useState } from 'react';
import { ChevronDown, ExternalLink, Check, Lock } from 'lucide-react';
import { getInstallMethod, resolveRequires, compatibleCoresLabel } from '../lib/constants';

// Neutral "works on Fabric only" note shown when an addon's compatibleCores does
// NOT include the chosen server core. UX hint only — NOT a recolor of the addon's
// type badge. Uses a neutral amber note + lock affordance (matches worldgen note).
export function CoreIncompatibleNote({ addon, t }) {
  const cores = compatibleCoresLabel(addon);
  if (!cores) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-amber-400/80 leading-relaxed">
      <Lock size={11} /> {t('coreIncompatibleNote')} {cores} {t('coreIncompatibleOnly')}
    </span>
  );
}

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

// Small "auto-installed by the system" tag (per the guidance doc's
// "המערכת מתקינה אוטומטית" / "auto-installed").
function AutoInstalledTag({ t }) {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border border-green-500/30 text-green-400 bg-green-500/10 whitespace-nowrap">
      <Check size={9} /> {t('autoInstalledTag')}
    </span>
  );
}

// Lists the SERVER-side required plugins (addon.requires) that the system installs
// alongside the parent. Each row shows the dep name + an "auto-installed" tag.
// A manual-install dep (e.g. ProtocolLib, not on Modrinth) links to its source
// instead of claiming an auto-install (no false promise).
export function ServerDepsList({ addon, allAddons, t, lang, addonDesc }) {
  const deps = resolveRequires(addon, allAddons);
  if (deps.length === 0) return null;
  return (
    <div className="mt-2 w-full">
      <p className="text-[11px] font-bold text-green-400/90 mb-1.5">{t('autoInstalledDeps')}</p>
      <div className="space-y-1 ps-2 border-s border-green-500/20">
        {deps.map(dep => {
          const manual = getInstallMethod(dep) !== 'server';
          return (
            <div key={dep.id} className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-zinc-200" title={addonDesc(dep.id, lang, dep.desc)}>{dep.name}</span>
              {manual ? (
                // Manual dep (not on Modrinth) — link to its source, no auto-install claim.
                dep.downloadUrl || dep.clientUrl
                  ? <ClientDownloadLink url={dep.downloadUrl || dep.clientUrl} t={t} />
                  : <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border border-zinc-600 text-zinc-400 bg-zinc-800/40 whitespace-nowrap">{t('manualBadge')}</span>
              ) : (
                <AutoInstalledTag t={t} />
              )}
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">{t('depAutoInstallNote')}</p>
    </div>
  );
}

// Unified inline (NO popup) "Requirements" accordion for a card that has SERVER
// deps (addon.requires) and/or CLIENT deps (addon.clientDeps). One expand toggle
// reveals both: the auto-installed server-plugin list and the existing per-player
// "pick one" client chooser. Reuses ServerDepsList + ClientDepsChooser; no
// duplicated markup. Slide-down matches the rest of the catalog's accordions.
export function RequirementsAccordion({ addon, allAddons, t, lang, addonDesc }) {
  const [open, setOpen] = useState(false);
  const hasServerDeps = resolveRequires(addon, allAddons).length > 0;
  const hasClientDeps = Array.isArray(addon?.clientDeps) && addon.clientDeps.length > 0;
  if (!hasServerDeps && !hasClientDeps) return null;

  return (
    <div className="mt-2 w-full">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors"
      >
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        🔽 {t('requirementsTitle')}
      </button>
      {open && (
        <div className="mt-1.5 animate-in slide-in-from-top-2 duration-200">
          {hasServerDeps && (
            <ServerDepsList addon={addon} allAddons={allAddons} t={t} lang={lang} addonDesc={addonDesc} />
          )}
          {hasClientDeps && (
            <ClientDepsChooser deps={addon.clientDeps} allAddons={allAddons} t={t} lang={lang} addonDesc={addonDesc} startOpen />
          )}
        </div>
      )}
    </div>
  );
}

// Inline (NO popup) "pick one" dependency chooser shown beneath a pack that has
// clientDeps. Each option lists its client items with their download links; the
// recommended option gets a badge. Compact, expandable.
export function ClientDepsChooser({ deps, allAddons, t, lang, addonDesc, startOpen = false }) {
  const [open, setOpen] = useState(startOpen);
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
