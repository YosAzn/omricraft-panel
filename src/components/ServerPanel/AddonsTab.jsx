import React, { useState, useEffect } from 'react';
import {
  Package, RefreshCw, RefreshCcw, AlertCircle, X, Search,
  Star, Download, Layers, Palette
} from 'lucide-react';
import { listFilesFn, removePluginJarFn, reloadPluginFn } from '../../lib/api';
import { TYPE_COLORS } from '../../lib/constants';

export default function AddonsTab({ server, toggleAddon, t, allAddons, userRole }) {
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

  const relevantAddons = allAddons.filter(a => {
    if (a.type === 'textures') return true;
    if (['fabric', 'forge'].includes(server.software) && ['mods', 'modpacks'].includes(a.type)) return true;
    if (server.software === 'paper' && a.type === 'plugins') return true;
    if (a.type === 'datapacks') return true;
    return false;
  });

  const availableFilters = [{ id: 'all', name: t('all') || 'הכל' }];
  if (['fabric', 'forge'].includes(server.software)) {
    availableFilters.push({ id: 'mods', name: t('mods') });
    availableFilters.push({ id: 'modpacks', name: t('modpacks') });
  }
  if (server.software === 'paper') availableFilters.push({ id: 'plugins', name: t('plugins') });
  availableFilters.push({ id: 'datapacks', name: t('datapacks') });
  availableFilters.push({ id: 'textures', name: t('textures') });

  const displayAddons = relevantAddons.filter(a =>
    (filter === 'all' || a.type === filter) &&
    (a.name.toLowerCase().includes(search.toLowerCase()) || a.desc.toLowerCase().includes(search.toLowerCase()))
  );

  const handleToggle = (item) => {
    const isInstalled = server.installedAddons.includes(item.id);

    if (!isInstalled) {
      if (item.requires) {
        const missing = item.requires.filter(req => !server.installedAddons.includes(req));
        if (missing.length > 0) {
          const missingNames = missing.map(m => allAddons.find(a=>a.id === m)?.name).join(', ');
          setWarning({ type: 'dependency', message: `${t('missingDependency')} ${missingNames}` });
          setTimeout(() => setWarning(null), 5000);
          return;
        }
      }
      if (item.conflicts) {
        const conflict = item.conflicts.find(con => server.installedAddons.includes(con));
        if (conflict) {
          const conflictName = allAddons.find(a=>a.id === conflict)?.name;
          setWarning({ type: 'conflict', message: `${t('conflictError')} ${conflictName}` });
          setTimeout(() => setWarning(null), 5000);
          return;
        }
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

          let IconComp = Package;
          if (item.type === 'modpacks') IconComp = Layers;
          if (item.type === 'textures') IconComp = Palette;

          return (
            <div key={item.id} className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-zinc-700 transition-all">
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
                  </div>
                  <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{item.desc}</p>
                  <div className="flex items-center gap-1 text-[11px] text-yellow-500 mt-2">
                    <Star size={12} fill="currentColor"/>
                    <span className="font-bold">{item.rating || '5.0'}</span>
                    <span className="text-zinc-500">({item.reviews || 0})</span>
                  </div>
                </div>
              </div>
              {userRole === 'admin' && (
                item.paid && !isInstalled ? (
                  <a href="#" onClick={e => e.preventDefault()} title="Premium plugin — התקן ידנית מהאתר הרשמי"
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-sm border border-yellow-500/30 text-yellow-400 bg-yellow-500/5 cursor-not-allowed whitespace-nowrap">
                    💎 Premium
                  </a>
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
