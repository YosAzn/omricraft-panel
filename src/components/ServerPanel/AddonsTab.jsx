import React, { useState, useEffect } from 'react';
import {
  Package, RefreshCw, RefreshCcw, AlertCircle, X, Search,
  Star, Download, Layers, Palette, Sparkles, Boxes, Lock
} from 'lucide-react';
import { listFilesFn, removePluginJarFn, reloadPluginFn } from '../../lib/api';
import { TYPE_COLORS, getInstallMethod, isBukkitBased, isWorldgenDatapack, isCoreIncompatible, collectRequiredIds, compatibleCoresLabel } from '../../lib/constants';
import { addonDesc } from '../../lib/addonI18n';
import { ClientDownloadLink, RequirementsAccordion, CoreIncompatibleNote, ResourcePackInstallChoice, PluginBoundTag, ModpackPlayerRequirements } from '../AddonClientExtras';

export default function AddonsTab({ server, toggleAddon, t, lang, allAddons, userRole }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [warning, setWarning] = useState(null);
  const [installedPlugins, setInstalledPlugins] = useState([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [reloading, setReloading] = useState(false);

  const loadInstalledPlugins = () => {
    if (!server?.id) return;
    setPluginsLoading(true);
    listFilesFn({ serverId: server.id, path: 'plugins' })
      .then(res => {
        const d = res.data || res;
        if (d.success) {
          const jars = (d.entries || [])
            .filter(f => f.type === 'file' && f.name.endsWith('.jar'))
            .map(f => ({ name: f.name.replace(/\.jar$/i, ''), size: f.size, file: f.name }));
          setInstalledPlugins(jars);
        }
      })
      .catch((e) => { console.error('loadInstalledPlugins failed:', e); })
      .finally(() => setPluginsLoading(false));
  };

  const handleRemoveJar = async (jarFile) => {
    if (userRole !== 'admin') return;
    if (!window.confirm(`להסיר את ${jarFile}? השרת יצטרך הפעלה מחדש.`)) return;
    try {
      const res = await removePluginJarFn({ serverId: server.id, file: jarFile });
      const d = res.data || res;
      if (!d.success) throw new Error(d.error || 'שגיאה');
      loadInstalledPlugins();
      alert('הוסר. הפעל מחדש את השרת כדי שייכנס לתוקף.');
    } catch (e) {
      console.error('handleRemoveJar failed:', e);
      alert(`שגיאה: ${e.message}`);
    }
  };

  useEffect(() => {
    loadInstalledPlugins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server?.id]);

  const handleReloadPlugins = async () => {
    setReloading(true);
    try {
      const res = await reloadPluginFn({ serverId: server.id });
      const d = res.data || res;
      if (!d.success) throw new Error(d.error || 'שגיאה');
      loadInstalledPlugins();
      alert('Plugins נטענו מחדש בהצלחה');
    } catch (e) {
      alert(`שגיאה בטעינת Plugins: ${e.message}`);
    } finally {
      setReloading(false);
    }
  };

  // Bukkit-family servers all support plugins (Paper/Purpur/Folia/Mohist).
  // Mod-loaders use mods. Mohist is HYBRID → supports BOTH plugins and mods.
  const PLUGIN_SERVERS = ['paper', 'purpur', 'folia', 'mohist'];
  const MOD_SERVERS = ['fabric', 'forge', 'neoforge', 'mohist'];
  const relevantAddons = allAddons.filter(a => {
    // Client-only groups apply to ANY server (player-PC only) → always shown with a client badge.
    if (a.type === 'textures' || a.type === 'shaders' || a.type === 'client-mods') return true;
    if (MOD_SERVERS.includes(server.software) && ['mods', 'modpacks'].includes(a.type)) return true;
    if (PLUGIN_SERVERS.includes(server.software) && a.type === 'plugins') return true;
    if (a.type === 'datapacks') return true;
    return false;
  });

  const availableFilters = [{ id: 'all', name: t('all') || 'הכל' }];
  if (MOD_SERVERS.includes(server.software)) {
    availableFilters.push({ id: 'mods', name: t('mods') });
    availableFilters.push({ id: 'modpacks', name: t('modpacks') });
  }
  if (PLUGIN_SERVERS.includes(server.software)) availableFilters.push({ id: 'plugins', name: t('plugins') });
  availableFilters.push({ id: 'datapacks', name: t('datapacks') });
  availableFilters.push({ id: 'textures', name: t('textures') });
  availableFilters.push({ id: 'shaders', name: t('shaders') });
  availableFilters.push({ id: 'client-mods', name: t('client-mods') });

  const displayAddons = relevantAddons.filter(a => {
    const localized = addonDesc(a.id, lang, a.desc) || '';
    const q = search.toLowerCase();
    return (filter === 'all' || a.type === filter) &&
      (a.name.toLowerCase().includes(q) ||
       a.desc.toLowerCase().includes(q) ||
       localized.toLowerCase().includes(q));
  });

  // Worldgen-overhaul datapacks (Terralith etc.) don't work on Bukkit-based servers.
  const serverIsBukkit = isBukkitBased(server.software);
  const isWorldgenBlocked = (item) => serverIsBukkit && isWorldgenDatapack(item);
  // Core-gating: addon's compatibleCores allow-list excludes this server's core.
  const isCoreBlocked = (item) => isCoreIncompatible(item, server.software);

  const handleToggle = (item) => {
    const isInstalled = server.installedAddons.includes(item.id);

    // Block installing a worldgen datapack on Bukkit — the engine would ignore it.
    if (!isInstalled && isWorldgenBlocked(item)) {
      setWarning({ type: 'conflict', message: t('worldgenBukkitNote') });
      setTimeout(() => setWarning(null), 5000);
      return;
    }

    // Block installing an addon whose build doesn't exist for this server's core.
    if (!isInstalled && isCoreBlocked(item)) {
      setWarning({ type: 'conflict', message: `${t('coreIncompatibleNote')} ${compatibleCoresLabel(item)} ${t('coreIncompatibleOnly')}` });
      setTimeout(() => setWarning(null), 5000);
      return;
    }

    if (!isInstalled) {
      if (item.conflicts) {
        const conflict = item.conflicts.find(con => server.installedAddons.includes(con));
        if (conflict) {
          const conflictName = allAddons.find(a=>a.id === conflict)?.name;
          setWarning({ type: 'conflict', message: `${t('conflictError')} ${conflictName}` });
          setTimeout(() => setWarning(null), 5000);
          return;
        }
      }
      // Tell the user which server dependencies will be co-installed. The actual
      // auto-install (VPS + Firestore + rollback) happens centrally in
      // App.toggleAddonForServer, which resolves the same transitive dep set —
      // we must NOT call toggleAddon per dep here (it would double-install and
      // clobber the optimistic Firestore write). This is the UX notice only.
      const missingDeps = collectRequiredIds([item.id], allAddons)
        .filter(depId => !server.installedAddons.includes(depId))
        .map(depId => allAddons.find(a => a.id === depId))
        .filter(dep => dep && getInstallMethod(dep) === 'server' && !isWorldgenBlocked(dep) && !isCoreBlocked(dep));
      if (missingDeps.length > 0) {
        const names = missingDeps.map(d => d.name).join(', ');
        setWarning({ type: 'dependency', message: `${t('depAutoInstallNote')} (${names})` });
        setTimeout(() => setWarning(null), 6000);
      }
    }
    toggleAddon(item);
    // Refresh VPS jar list after a short delay to pick up the newly installed/removed plugin
    setTimeout(loadInstalledPlugins, 8000);
  };

  return (
    <div className="animate-in fade-in">
      {warning && (
        <div className={`p-4 rounded-xl mb-4 font-bold flex items-center justify-between ${warning.type === 'conflict' ? 'bg-red-500/20 text-red-300 border border-red-500/50' : 'bg-orange-500/20 text-orange-300 border border-orange-500/50'}`}>
          <div className="flex items-center gap-2"><AlertCircle size={18}/> {warning.message}</div>
          <button onClick={()=>setWarning(null)} className="p-1 hover:bg-black/20 rounded"><X size={16}/></button>
        </div>
      )}

      {/* VPS Installed Plugins — real .jar files from server */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-green-500" />
            <span className="font-bold text-sm">מותקן על השרת ({installedPlugins.length})</span>
            {pluginsLoading && <RefreshCw size={14} className="animate-spin text-zinc-500" />}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadInstalledPlugins}
              disabled={pluginsLoading}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
              title="רענן רשימה"
            >
              <RefreshCw size={14} className={pluginsLoading ? 'animate-spin' : ''} />
            </button>
            {userRole === 'admin' && (
              <button
                onClick={handleReloadPlugins}
                disabled={reloading || server.status !== 'online'}
                title={server.status !== 'online' ? 'השרת לא פעיל' : 'Reload Plugins (reload confirm)'}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm rounded-lg transition-colors"
              >
                <RefreshCcw size={14} className={reloading ? 'animate-spin' : ''} />
                {reloading ? 'טוען...' : 'Reload Plugins'}
              </button>
            )}
          </div>
        </div>
        {installedPlugins.length === 0 && !pluginsLoading ? (
          <p className="text-zinc-600 text-sm">לא נמצאו קבצי .jar בתיקיית plugins</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {installedPlugins.map(p => (
              <span key={p.file} className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs px-2.5 py-1 rounded-full">
                <Package size={11} className="text-green-500" />
                {p.name}
                {p.size > 0 && <span className="text-zinc-600">({(p.size / 1024).toFixed(0)}kb)</span>}
                {userRole === 'admin' && (
                  <button onClick={() => handleRemoveJar(p.file)} className="text-zinc-500 hover:text-red-400 ml-1" title="הסר">
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 overflow-x-auto">
          {availableFilters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all whitespace-nowrap ${filter === f.id ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {f.name}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-80">
          <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 rtl:right-3 rtl:left-auto" />
          <input type="text" placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-lg pr-10 pl-4 py-2 text-sm focus:outline-none focus:border-green-500 w-full placeholder:text-zinc-600" />
        </div>
      </div>

      <div className="space-y-3">
        {displayAddons.map(item => {
          const isInstalled = server.installedAddons.includes(item.id);
          const badgeStyle = TYPE_COLORS[item.type] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
          const installMethod = getInstallMethod(item); // 'server' | 'manual' | 'client'
          const worldgenBlocked = isWorldgenBlocked(item);
          const coreBlocked = isCoreBlocked(item);
          const greyed = worldgenBlocked || coreBlocked;

          let IconComp = Package;
          if (item.type === 'modpacks') IconComp = Layers;
          if (item.type === 'textures') IconComp = Palette;
          if (item.type === 'shaders') IconComp = Sparkles;
          if (item.type === 'client-mods') IconComp = Boxes;

          return (
            <div key={item.id} className={`bg-zinc-950 border border-zinc-800 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-zinc-700 transition-all ${greyed ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-zinc-900 rounded-lg flex items-center justify-center border border-zinc-800 flex-shrink-0 relative">
                  <IconComp size={24} className={isInstalled ? (item.type === 'textures' ? 'text-teal-500' : 'text-green-500') : 'text-zinc-600'} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-lg">{item.name}</h4>
                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${badgeStyle}`}>
                      {t(item.type) || item.type}
                    </span>
                    {item.paid && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                        💎 Premium
                      </span>
                    )}
                    {installMethod === 'client' && item.clientUrl && <ClientDownloadLink url={item.clientUrl} t={t} />}
                  </div>
                  <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{addonDesc(item.id, lang, item.desc)}</p>
                  {worldgenBlocked && (
                    <p className="text-[11px] text-amber-400/80 mt-1.5 leading-relaxed">{t('worldgenBukkitNote')}</p>
                  )}
                  {coreBlocked && (
                    <p className="mt-1.5"><CoreIncompatibleNote addon={item} t={t} /></p>
                  )}
                  <div className="flex items-center gap-1 text-[11px] text-yellow-500 mt-2">
                    <Star size={12} fill="currentColor"/>
                    <span className="font-bold">{item.rating || '5.0'}</span>
                    <span className="text-zinc-500">({item.reviews || 0})</span>
                  </div>
                  <RequirementsAccordion addon={item} allAddons={allAddons} t={t} lang={lang} addonDesc={addonDesc} />
                  {/* TASK 2 — plugin-bound RP warning (Custom Hats etc.). */}
                  <PluginBoundTag addon={item} allAddons={allAddons} t={t} />
                  {/* TASK 1 — server-RP vs PC-download choice for normal texture packs. */}
                  <ResourcePackInstallChoice addon={item} t={t} />
                  {/* TASK 3 — modpack: mod-loader the player needs + one-click install deep-links. */}
                  <ModpackPlayerRequirements addon={item} t={t} mcVersion={server.version} />
                </div>
              </div>
              {coreBlocked ? (
                // Addon's build doesn't exist for this server's core — neutral disabled state (lock, not a recolor).
                <span
                  title={`${t('coreIncompatibleNote')} ${compatibleCoresLabel(item)} ${t('coreIncompatibleOnly')}`}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs border whitespace-nowrap border-zinc-700 text-zinc-500 bg-zinc-800/40 cursor-not-allowed"
                >
                  <Lock size={13} /> {compatibleCoresLabel(item)} {t('coreIncompatibleOnly')}
                </span>
              ) : worldgenBlocked ? (
                // Worldgen datapack on Bukkit — not installable; show disabled state.
                <span
                  title={t('worldgenBukkitNote')}
                  className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs border whitespace-nowrap border-zinc-700 text-zinc-500 bg-zinc-800/40 cursor-not-allowed"
                >
                  {t('worldgenBukkitNote')}
                </span>
              ) : installMethod !== 'server' ? (
                // manual / client — לא ניתן להתקין דרך הפאנל; מציגים באדג' הסבר במקום כפתור.
                // אם יש downloadUrl (למשל modpack ב-Modrinth) — ה-badge הידני הופך לקישור אמיתי כדי שהמשתמש יגיע להתקנה ידנית.
                installMethod === 'manual' && item.downloadUrl ? (
                  <a
                    href={item.downloadUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    title={t('manualInstallInfo')}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs border whitespace-nowrap border-zinc-600 text-zinc-300 bg-zinc-800/40 hover:bg-zinc-700/60 hover:text-white transition-colors"
                  >
                    {t('manualBadge')} ↗
                  </a>
                ) : (
                  <span
                    title={installMethod === 'client' ? t('clientInstallInfo') : t('manualInstallInfo')}
                    className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs border whitespace-nowrap ${installMethod === 'client' ? 'border-teal-500/30 text-teal-400 bg-teal-500/5' : 'border-zinc-600 text-zinc-400 bg-zinc-800/40'}`}
                  >
                    {installMethod === 'client' ? t('clientSideBadge') : t('manualBadge')}
                  </span>
                )
              ) : userRole === 'admin' && (
                item.paid && !isInstalled ? (
                  item.buyUrl ? (
                    <a href={item.buyUrl} target="_blank" rel="noreferrer noopener" title="תוסף בתשלום — רכישה מהמקור הרשמי"
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-sm border border-yellow-500/30 text-yellow-400 bg-yellow-500/5 hover:bg-yellow-500/15 whitespace-nowrap">
                      💎 Premium — לרכישה
                    </a>
                  ) : (
                    <a href="#" onClick={e => e.preventDefault()} title="Premium plugin — התקן ידנית מהאתר הרשמי"
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-sm border border-yellow-500/30 text-yellow-400 bg-yellow-500/5 cursor-not-allowed whitespace-nowrap">
                      💎 Premium
                    </a>
                  )
                ) : (
                  <button onClick={() => handleToggle(item)} className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${isInstalled ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20' : 'bg-green-600 hover:bg-green-500 text-white'}`}>
                    {isInstalled ? t('uninstall') : <><Download size={16} /> {t('install')}</>}
                  </button>
                )
              )}
            </div>
          );
        })}
        {displayAddons.length === 0 && <div className="text-center text-zinc-500 py-12">{t('noResults')}</div>}
      </div>
    </div>
  );
}
