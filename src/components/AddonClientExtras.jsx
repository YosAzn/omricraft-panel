import React, { useState } from 'react';
import { ChevronDown, ExternalLink, Check, Lock, Server, Monitor, AlertTriangle, Rocket } from 'lucide-react';
import {
  getInstallMethod, resolveRequires, compatibleCoresLabel,
  canPcDownloadRP, modrinthModpackUri, curseforgeInstallUri,
} from '../lib/constants';
import ClientRequirements from './ClientRequirements';

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

// TASK 2 — Prominent "plugin-bound" tag for resource packs whose items only exist
// via a plugin (Custom Hats / ItemsAdder-style). A bare RP can't add the items, so
// we warn loudly and (when `suggestsPlugin` is set) name the plugin that does.
// Pure presentational; shown only for addon.pluginBound packs.
export function PluginBoundTag({ addon, allAddons, t }) {
  if (!addon?.pluginBound) return null;
  const sugg = addon.suggestsPlugin
    ? (allAddons || []).find(a => a.id === addon.suggestsPlugin)
    : null;
  return (
    <div className="mt-2 w-full flex items-start gap-2 text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
      <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
      <div className="text-xs leading-relaxed">
        <span className="font-bold uppercase tracking-wide me-1">{t('pluginBoundTag')}</span>
        {t('pluginBoundNote')}
        {sugg && (
          <span className="block mt-1 text-amber-200/90">
            {t('pluginBoundSuggest')} <b>{sugg.name}</b>
            {sugg.buyUrl && (
              <>{' '}
                <a
                  href={sugg.buyUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 font-bold text-amber-300 hover:text-amber-200 underline decoration-dotted"
                >
                  {sugg.name} <ExternalLink size={11} />
                </a>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// TASK 1 — Resource-pack install CHOICE accordion. For a server-applied texture
// pack we let the user choose how it behaves:
//   (a) server-resource-pack — auto-push to every player (recommended for communities)
//   (b) download to PC — the same .zip used locally (hidden for plugin-bound packs,
//       since a bare RP can't add their items).
// Inline slide-down (NO popup), matching the rest of the catalog. Read-only guidance
// — the actual server.properties wiring happens server-side on install.
export function ResourcePackInstallChoice({ addon, t }) {
  const [open, setOpen] = useState(false);
  if (addon?.type !== 'textures' || getInstallMethod(addon) !== 'server') return null;
  const pcOk = canPcDownloadRP(addon);
  const pcUrl = addon.clientUrl || addon.downloadUrl
    || (addon.modrinthSlug ? `https://modrinth.com/resourcepack/${addon.modrinthSlug}` : null);

  return (
    <div className="mt-2 w-full">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="flex items-center gap-1.5 text-[11px] font-bold text-teal-400 hover:text-teal-300 transition-colors"
      >
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        {t('rpInstallChoiceTitle')}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5 ps-2 border-s border-teal-500/20 animate-in slide-in-from-top-2 duration-200">
          {/* Option A — server-resource-pack (always available, recommended). */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-2">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <Server size={13} className="text-teal-400" />
              <span className="text-xs font-bold text-zinc-200">{t('rpOptionServer')}</span>
              <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border border-green-500/30 text-green-400 bg-green-500/10">
                {t('recommendedBadge')}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 leading-relaxed">{t('rpOptionServerNote')}</p>
          </div>
          {/* Option B — download to PC (hidden when plugin-bound). */}
          {pcOk ? (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-2">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <Monitor size={13} className="text-teal-400" />
                <span className="text-xs font-bold text-zinc-200">{t('rpOptionPc')}</span>
              </div>
              <p className="text-[11px] text-zinc-500 leading-relaxed mb-1.5">{t('rpOptionPcNote')}</p>
              {pcUrl && <ClientDownloadLink url={pcUrl} t={t} />}
            </div>
          ) : (
            <p className="text-[11px] text-amber-400/80 leading-relaxed ps-1">{t('rpPcUnavailable')}</p>
          )}
        </div>
      )}
    </div>
  );
}

// TASK 3 — Modpack player-side requirements: the mod-LOADER (which loader + exact MC
// version players must install — reuses ClientRequirements) PLUS one-click install
// deep-links into the Modrinth / CurseForge desktop apps. Missing ids are omitted
// gracefully; an official-page link + "get the app" fallback always render.
// Inline slide-down (NO popup). `mcVersion` lets a modpack-type server state the
// version even when the modpack entry doesn't carry one.
export function ModpackPlayerRequirements({ addon, t, mcVersion }) {
  const [open, setOpen] = useState(false);
  if (addon?.type !== 'modpacks') return null;

  const loader = addon.loader || null;
  const version = mcVersion || addon.mcVersion || '';
  const mrUri = modrinthModpackUri(addon.modrinthSlug);
  const cfUri = curseforgeInstallUri(addon.curseforgeId);
  const officialUrl = addon.downloadUrl
    || (addon.modrinthSlug ? `https://modrinth.com/modpack/${addon.modrinthSlug}` : null);

  return (
    <div className="mt-2 w-full">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="flex items-center gap-1.5 text-[11px] font-bold text-pink-400 hover:text-pink-300 transition-colors"
      >
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        {t('modpackPlayerReqTitle')}
      </button>
      {open && (
        <div className="mt-1.5 space-y-2 ps-2 border-s border-pink-500/20 animate-in slide-in-from-top-2 duration-200">
          {/* 1) Mod loader the player must install on their PC (reuses ClientRequirements). */}
          {loader && (
            <ClientRequirements type={loader} version={version} t={t} defaultOpen compact />
          )}
          {/* 2) One-click install deep-links + official page / get-the-app fallback. */}
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-2">
            <p className="text-[11px] font-bold text-zinc-300 mb-1.5">{t('modpackInstallTitle')}</p>
            <div className="flex flex-wrap gap-1.5">
              {cfUri && (
                <a
                  href={cfUri}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-orange-300 hover:text-orange-200 border border-orange-500/30 bg-orange-500/10 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap"
                >
                  <Rocket size={11} /> {t('modpackInstallCf')}
                </a>
              )}
              {mrUri && (
                <a
                  href={mrUri}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-green-300 hover:text-green-200 border border-green-500/30 bg-green-500/10 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap"
                >
                  <Rocket size={11} /> {t('modpackInstallMr')}
                </a>
              )}
              {officialUrl && (
                <a
                  href={officialUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-zinc-300 hover:text-white border border-zinc-600 bg-zinc-800/40 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap"
                >
                  {t('modpackOfficialPage')} <ExternalLink size={11} />
                </a>
              )}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1.5 leading-relaxed">
              {t('modpackGetApp')}{' '}
              <a href="https://www.curseforge.com/download/app" target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} className="text-zinc-400 hover:text-zinc-200 underline decoration-dotted">CurseForge</a>
              {' / '}
              <a href="https://modrinth.com/app" target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} className="text-zinc-400 hover:text-zinc-200 underline decoration-dotted">Modrinth</a>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
