import React, { useState } from 'react';
import {
  Layers, X, Plus, UploadCloud, Link as LinkIcon, Search,
  Package, Palette, Star, Trash2, Download, Check, Sparkles, ExternalLink, Loader2
} from 'lucide-react';

import { TYPE_COLORS } from '../lib/constants';
import { addonDesc } from '../lib/addonI18n';
import { suggestModpackFn } from '../lib/api';

export default function GlobalRepository({ allAddons, customAddons, onAdd, onDelete, t, lang, userRole }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showModpackForm, setShowModpackForm] = useState(false);
  const [selectedAddon, setSelectedAddon] = useState(null);
  
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState('mods');
  const [fileUrl, setFileUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const [mpName, setMpName] = useState('');
  const [mpDesc, setMpDesc] = useState('');
  const [mpSelectedMods, setMpSelectedMods] = useState([]);

  // --- Quick Add State ---
  const [quickAdd, setQuickAdd] = useState(false);
  const [qaName, setQaName] = useState('');
  const [qaDesc, setQaDesc] = useState('');
  const [qaType, setQaType] = useState('mods');
  const [qaUrl, setQaUrl] = useState('');

  // --- Modpack Builder (admin AI/heuristic) State ---
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderTheme, setBuilderTheme] = useState('');
  const [builderModel, setBuilderModel] = useState('free'); // 'free' | 'gemini'
  const [builderLoading, setBuilderLoading] = useState(false);
  const [builderError, setBuilderError] = useState('');
  const [builderResult, setBuilderResult] = useState(null); // { mods, usedFallback, ... } | null
  const [builderSearched, setBuilderSearched] = useState(false);

  const handleBuildList = async () => {
    if (!builderTheme.trim() || builderLoading) return;
    setBuilderLoading(true);
    setBuilderError('');
    setBuilderResult(null);
    setBuilderSearched(true);
    try {
      const res = await suggestModpackFn({ theme: builderTheme.trim(), model: builderModel, mcVersion: '1.21.11' });
      const data = res?.data;
      if (!data?.success) throw new Error(data?.error || 'הבקשה נכשלה');
      setBuilderResult(data);
    } catch (e) {
      console.error('Modpack Builder failed:', e);
      setBuilderError(e?.message || String(e));
    } finally {
      setBuilderLoading(false);
    }
  };

  // Turn the suggested Modrinth mods into a custom modpack. Each suggested mod is
  // first registered as a custom addon (stable id from its slug), mirroring the
  // existing Quick-Add → onAdd flow, then a modpack referencing those ids is added.
  const handleCreateModpackFromSuggestions = () => {
    const mods = builderResult?.mods || [];
    if (!mods.length) return;
    const ids = mods.map(m => {
      const id = `c_mr_${m.slug}`;
      onAdd({
        id,
        name: m.title,
        desc: m.description || `מוד מ-Modrinth (${m.slug})`,
        type: 'mods',
        fileUrl: m.url,
        downloads: typeof m.downloads === 'number' ? m.downloads.toLocaleString() : 'Custom'
      });
      return id;
    });
    const themeLabel = builderResult?.theme || builderTheme.trim();
    onAdd({
      name: `Modpack: ${themeLabel}`.slice(0, 60),
      desc: `${mods.length} מודים מ-Modrinth סביב הנושא "${themeLabel}"`,
      type: 'modpacks',
      includedAddons: ids,
      downloads: 'Custom'
    });
    // Reset the builder after creating the pack.
    setBuilderResult(null);
    setBuilderSearched(false);
    setBuilderTheme('');
    setShowBuilder(false);
  };

  const filtered = allAddons.filter(a => {
    const localized = addonDesc(a.id, lang, a.desc) || '';
    const q = search.toLowerCase();
    return (filter === 'all' || a.type === filter) &&
      (a.name.toLowerCase().includes(q) ||
       (a.desc || '').toLowerCase().includes(q) ||
       localized.toLowerCase().includes(q));
  });

  const handleAdd = (e) => {
    e.preventDefault();
    onAdd({
      name: newName,
      desc: newDesc,
      type: newType,
      fileName: selectedFile?.name,
      fileUrl: fileUrl,
      downloads: 'Custom'
    });
    setNewName(''); setNewDesc(''); setFileUrl(''); setSelectedFile(null); setShowAddForm(false);
  };

  const handleQuickAddSubmit = () => {
    if (!qaName) return;
    const newId = `c_${Math.random().toString(36).substring(7)}`;
    onAdd({
        id: newId,
        name: qaName,
        desc: qaDesc || 'נוסף דרך יצירת מודפאק',
        type: qaType,
        fileUrl: qaUrl,
        downloads: 'Custom'
    });
    setMpSelectedMods(prev => [...prev, newId]); // מסמן אוטומטית את התוסף במודפאק
    setQuickAdd(false);
    setQaName(''); setQaDesc(''); setQaUrl('');
  };

  const handleAddModpack = (e) => {
    e.preventDefault();
    if(mpSelectedMods.length === 0) return;
    
    onAdd({
      name: mpName,
      desc: mpDesc,
      type: 'modpacks',
      includedAddons: mpSelectedMods,
      downloads: 'Custom'
    });
    setMpName(''); setMpDesc(''); setMpSelectedMods([]); setShowModpackForm(false);
  };

  const toggleMpMod = (id) => {
    setMpSelectedMods(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="animate-in fade-in duration-300">
       <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold mb-2">{t('repo')}</h2>
          <p className="text-zinc-400 max-w-lg">{t('globalRepoDesc')}</p>
        </div>
        {userRole === 'admin' && (
          <div className="flex gap-2">
            <button
              onClick={() => { setShowBuilder(!showBuilder); setShowModpackForm(false); setShowAddForm(false); }}
              className={`px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all border ${showBuilder ? 'bg-purple-600 text-white border-purple-500' : 'bg-zinc-900 border-purple-500/40 hover:border-purple-500 text-purple-300'}`}
            >
              <Sparkles size={18}/> <span className="hidden sm:inline">{t('modpackBuilder')}</span>
            </button>
            <button
              onClick={() => { setShowModpackForm(!showModpackForm); setShowAddForm(false); setShowBuilder(false); }}
              className={`px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all border ${showModpackForm ? 'bg-zinc-800 text-white border-zinc-700' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 text-zinc-300'}`}
            >
              <Layers size={18}/> <span className="hidden sm:inline">{t('createModpack')}</span>
            </button>
            <button
              onClick={() => { setShowAddForm(!showAddForm); setShowModpackForm(false); setShowBuilder(false); }}
              className="bg-green-600 hover:bg-green-500 text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all shadow-lg"
            >
              {showAddForm ? <X size={20}/> : <Plus size={20} />} <span className="hidden sm:inline">{showAddForm ? t('cancel') : t('addCustomAddon')}</span>
            </button>
          </div>
        )}
      </div>

      {userRole === 'admin' && showBuilder && (
        <div className="bg-zinc-900 border border-purple-500/30 rounded-xl p-5 mb-6 animate-in slide-in-from-top-4 shadow-[0_0_15px_rgba(168,85,247,0.12)]">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={20} className="text-purple-400" />
            <h3 className="font-bold text-purple-300">{t('modpackBuilder')}</h3>
          </div>
          <p className="text-xs text-zinc-400 mb-4">{t('modpackBuilderDesc')}</p>

          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <input
              value={builderTheme}
              onChange={e => setBuilderTheme(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleBuildList(); }}
              placeholder={t('builderThemePlaceholder')}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none focus:border-purple-500"
            />
            <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
              {['free', 'gemini'].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setBuilderModel(m)}
                  className={`px-3 py-1.5 rounded-md text-sm font-bold transition-all whitespace-nowrap ${builderModel === m ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                >
                  {m === 'free' ? t('builderModelFree') : t('builderModelGemini')}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={handleBuildList}
              disabled={!builderTheme.trim() || builderLoading}
              className="bg-purple-600 hover:bg-purple-500 text-white px-5 py-2 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {builderLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              {builderLoading ? t('building') : t('buildList')}
            </button>
          </div>

          {builderError && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">{builderError}</div>
          )}

          {builderResult?.usedFallback && (
            <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">{t('geminiFallbackNote')}</div>
          )}

          {builderResult && (builderResult.mods?.length || 0) > 0 && (
            <>
              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 max-h-72 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {builderResult.mods.map(m => (
                  <div key={m.slug} className="flex items-start justify-between gap-2 p-2 rounded-md border border-transparent hover:border-zinc-800 hover:bg-zinc-900 transition-colors">
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{m.title}</div>
                      <p className="text-[11px] text-zinc-400 line-clamp-2">{m.description}</p>
                      <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                        <Download size={11} /> {typeof m.downloads === 'number' ? m.downloads.toLocaleString() : m.downloads} {t('builderDownloads')}
                      </div>
                    </div>
                    <a href={m.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-purple-400 hover:text-purple-300 flex-shrink-0 p-1" title={m.url}>
                      <ExternalLink size={15} />
                    </a>
                  </div>
                ))}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCreateModpackFromSuggestions}
                  className="bg-pink-600 hover:bg-pink-500 text-white px-5 py-2 rounded-lg font-bold flex items-center gap-2"
                >
                  <Layers size={18} /> {t('createModpackFromThese')}
                </button>
              </div>
            </>
          )}

          {builderSearched && !builderLoading && !builderError && builderResult && (builderResult.mods?.length || 0) === 0 && (
            <div className="text-center text-zinc-500 py-6 text-sm">{t('builderNoResults')}</div>
          )}
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleAdd} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6 animate-in slide-in-from-top-4">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
             <div>
                <label className="block text-xs text-zinc-400 mb-1">{t('addonName')}</label>
                <input required value={newName} onChange={e=>setNewName(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none focus:border-green-500" />
             </div>
             <div>
                <label className="block text-xs text-zinc-400 mb-1">{t('addonDesc')}</label>
                <input required value={newDesc} onChange={e=>setNewDesc(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none focus:border-green-500" />
             </div>
             <div>
                <label className="block text-xs text-zinc-400 mb-1">סוג התוסף</label>
                <select value={newType} onChange={e=>setNewType(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none focus:border-green-500">
                  <option value="mods">{t('mods')}</option>
                  <option value="plugins">{t('plugins')}</option>
                  <option value="datapacks">{t('datapacks')}</option>
                  <option value="textures">{t('textures')}</option>
                </select>
             </div>
           </div>

           {/* File upload removed: the bytes were never uploaded anywhere (no Storage / no
               VPS) — only the filename string was kept, so the dropzone was a NO-OP that
               implied an upload. A custom addon is a LIBRARY REFERENCE (URL) only. */}
           <div className="mb-4 pt-4 border-t border-zinc-800">
             <label className="block text-xs text-zinc-400 mb-1 font-bold flex items-center gap-1"><LinkIcon size={14}/> {t('orLink')}</label>
             <input type="url" placeholder="https://modrinth.com/..." value={fileUrl} onChange={e=>setFileUrl(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-green-500" />
             <p className="text-[11px] text-zinc-500 mt-1">התוסף נשמר כהפניה בספרייה הגלובלית. להתקנה אוטומטית בשרת — השתמש בקטלוג המובנה (Modrinth); תוסף מותאם מותקן ידנית.</p>
           </div>
           
           <div className="flex justify-end mt-4">
             <button type="submit" className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-bold w-full md:w-auto">{t('save')}</button>
           </div>
        </form>
      )}

      {showModpackForm && (
        <form onSubmit={handleAddModpack} className="bg-zinc-900 border border-pink-500/30 rounded-xl p-5 mb-6 animate-in slide-in-from-top-4 shadow-[0_0_15px_rgba(236,72,153,0.1)]">
           <h3 className="font-bold text-pink-400 mb-4 flex items-center gap-2"><Layers size={20}/> {t('createModpack')}</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
             <div>
                <label className="block text-xs text-zinc-400 mb-1">{t('addonName')}</label>
                <input required value={mpName} onChange={e=>setMpName(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none focus:border-pink-500" />
             </div>
             <div>
                <label className="block text-xs text-zinc-400 mb-1">{t('addonDesc')}</label>
                <input required value={mpDesc} onChange={e=>setMpDesc(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none focus:border-pink-500" />
             </div>
           </div>

           <div>
              <div className="flex justify-between items-center mb-2">
                 <label className="block text-xs text-zinc-400">{t('selectModsForPack')} ({mpSelectedMods.length} נבחרו)</label>
                 <button type="button" onClick={() => setQuickAdd(!quickAdd)} className="text-xs font-bold text-pink-400 hover:text-pink-300 flex items-center gap-1 transition-colors">
                    <Plus size={14}/> תוסף חסר במאגר? הוסף עכשיו
                 </button>
              </div>

              {quickAdd && (
                 <div className="bg-zinc-950 p-4 rounded-xl border border-pink-500/30 mb-3 animate-in fade-in">
                    <h4 className="text-xs font-bold text-pink-400 mb-3">הוספה מהירה למאגר</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                       <input placeholder="שם התוסף" value={qaName} onChange={e=>setQaName(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500" />
                       <select value={qaType} onChange={e=>setQaType(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500">
                          <option value="mods">{t('mods')}</option>
                          <option value="plugins">{t('plugins')}</option>
                          <option value="datapacks">{t('datapacks')}</option>
                          <option value="textures">{t('textures')}</option>
                       </select>
                       <input placeholder="תיאור קצר (אופציונלי)" value={qaDesc} onChange={e=>setQaDesc(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500 sm:col-span-2" />
                       <input placeholder="קישור להורדה" value={qaUrl} onChange={e=>setQaUrl(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500 sm:col-span-2" />
                    </div>
                    <button type="button" onClick={handleQuickAddSubmit} className="bg-pink-600 hover:bg-pink-500 text-white text-xs px-4 py-2 rounded-lg font-bold w-full transition-colors">שמור במאגר וסמן במודפאק</button>
                 </div>
              )}

              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1">
                 {allAddons.filter(a => a.type !== 'modpacks').map(a => (
                    <div key={a.id} onClick={() => toggleMpMod(a.id)} className="flex items-center gap-3 p-2 hover:bg-zinc-900 rounded-md cursor-pointer border border-transparent hover:border-zinc-800 transition-colors">
                      <div className={`w-4 h-4 rounded flex items-center justify-center border flex-shrink-0 ${mpSelectedMods.includes(a.id) ? 'bg-pink-600 border-pink-600' : 'border-zinc-600'}`}>
                        {mpSelectedMods.includes(a.id) && <Check size={12} className="text-white"/>}
                      </div>
                      <div className="truncate">
                        <span className="font-bold text-sm">{a.name}</span>
                        <span className="text-[10px] text-zinc-500 ml-2">{t(a.type)}</span>
                      </div>
                    </div>
                 ))}
               </div>
           </div>
           
           <div className="flex justify-end mt-4">
             <button type="submit" disabled={mpSelectedMods.length === 0} className="bg-pink-600 hover:bg-pink-500 text-white px-6 py-2 rounded-lg font-bold w-full md:w-auto disabled:opacity-50">{t('save')}</button>
           </div>
        </form>
      )}

      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 overflow-x-auto">
          {['all', 'mods', 'plugins', 'datapacks', 'modpacks', 'textures'].map(f => (
            <button 
              key={f} 
              onClick={() => setFilter(f)} 
              className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all whitespace-nowrap ${filter === f ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {t(f) || f}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-80">
          <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 rtl:right-3 rtl:left-auto" />
          <input 
            type="text" placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl w-full py-2.5 pr-10 pl-4 text-white focus:outline-none focus:border-zinc-700 placeholder:text-zinc-600"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(a => {
          const isCustom = customAddons.some(c => c.id === a.id);
          const badgeStyle = TYPE_COLORS[a.type] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
          
          let IconComp = Package;
          if (a.type === 'modpacks') IconComp = Layers;
          if (a.type === 'textures') IconComp = Palette;

          return (
            <div key={a.id} onClick={() => setSelectedAddon(a)} className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center justify-between group hover:border-zinc-700 transition-all cursor-pointer">
              <div className="flex items-center gap-4 overflow-hidden">
                <div className="w-12 h-12 flex-shrink-0 bg-zinc-950 rounded-lg flex items-center justify-center border border-zinc-800 relative">
                  <IconComp size={20} className={isCustom ? "text-green-400" : (a.type==='textures' ? "text-teal-500" : "text-zinc-400")} />
                  {isCustom && (a.fileUrl || a.fileName) && <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-zinc-950" title="קובץ מקושר" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                     <h4 className="font-bold truncate">{a.name}</h4>
                     <span className={`flex-shrink-0 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${badgeStyle}`}>
                        {t(a.type) || a.type}
                     </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">{addonDesc(a.id, lang, a.desc)}</p>
                  
                  <div className="flex items-center gap-1 text-[11px] text-yellow-500 mt-2">
                    <Star size={12} fill="currentColor"/>
                    <span className="font-bold">{a.rating || '5.0'}</span>
                    <span className="text-zinc-500">({a.reviews || 0})</span>
                  </div>
                </div>
              </div>
              {isCustom && userRole === 'admin' && (
                <button onClick={(e) => { e.stopPropagation(); onDelete(a.id); }} className="text-zinc-600 hover:text-red-500 p-2 transition-colors">
                  <Trash2 size={16}/>
                </button>
              )}
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <div className="text-center text-zinc-500 py-12">{t('noResults')}</div>}

      {/* Popup Modal for Addon Details */}
      {selectedAddon && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-in fade-in" onClick={() => setSelectedAddon(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center border border-zinc-800 bg-zinc-950`}>
                  <Package size={28} className="text-green-500" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{selectedAddon.name}</h3>
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border inline-block mt-1 ${TYPE_COLORS[selectedAddon.type]}`}>
                    {t(selectedAddon.type) || selectedAddon.type}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedAddon(null)} className="text-zinc-500 hover:text-white"><X size={24}/></button>
            </div>
            
            <p className="text-zinc-300 text-sm leading-relaxed mb-6 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
              {addonDesc(selectedAddon.id, lang, selectedAddon.desc)}
            </p>

            <div className="flex items-center justify-between text-sm text-zinc-400 mb-6 px-2">
              <div className="flex items-center gap-1"><Download size={16}/> {selectedAddon.downloads} הורדות</div>
              <div className="flex items-center gap-1 text-yellow-500"><Star size={16} fill="currentColor"/> {selectedAddon.rating} מדורג</div>
            </div>

            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
              <p className="text-green-400 font-bold mb-1">איך מתקינים?</p>
              <p className="text-zinc-400 text-xs leading-relaxed">מאגר זה משמש כספרייה עולמית בלבד. <br/>כדי להתקין את התוסף, היכנס ל"השרתים שלנו" -&gt; "ניהול שרת" -&gt; "תוספים וטקסטורות" ולחץ על "התקן".</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
