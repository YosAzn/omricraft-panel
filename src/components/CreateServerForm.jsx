import React, { useState } from 'react';
import { ArrowLeft, Play, Search, Check, Shield } from 'lucide-react';

import { TYPE_COLORS, SOFTWARE_TYPES, getInstallMethod, limitVersionsForType, isBukkitBased, isWorldgenDatapack, getClientLoader } from '../lib/constants';
import { addonDesc } from '../lib/addonI18n';
import { isViaVersion } from '../lib/utils';
import ImageUploader from './ImageUploader';
import { ClientDownloadLink, ClientDepsChooser } from './AddonClientExtras';
import ClientRequirements from './ClientRequirements';

export default function CreateServerForm({ onCancel, onCreate, allAddons, t, lang, userRole, isAdmin = false, mcVersions, versionMatrix = {}, isCreatingServer = false }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(null);
  const [software, setSoftware] = useState('paper');
  const [version, setVersion] = useState('1.21.4');
  const [gamemode, setGamemode] = useState('survival');
  const [worldType, setWorldType] = useState('default');
  const [opsString, setOpsString] = useState('');
  const [seed, setSeed] = useState('');
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [difficulty, setDifficulty] = useState('normal');
  const [memoryMb, setMemoryMb] = useState(2048);
  const [isPrivate, setIsPrivate] = useState(false);
  const [whitelistString, setWhitelistString] = useState('');
  // UX/legal acknowledgment only — gates the create button. The EULA itself is
  // auto-accepted server-side at provisioning (eula.txt); this is consent in the UI.
  const [eulaAccepted, setEulaAccepted] = useState(false);

  // State חדש לחיפוש תוספים
  const [addonSearch, setAddonSearch] = useState('');

  // Keep these lists in sync with AddonsTab.jsx (Bukkit family = plugins,
  // mod-loaders = mods; Mohist is hybrid → both). folia/mohist/neoforge were
  // previously dropped here, hiding valid addons in the create form.
  const PLUGIN_SERVERS = ['paper', 'purpur', 'folia', 'mohist'];
  const MOD_SERVERS = ['fabric', 'forge', 'neoforge', 'mohist'];
  const relevantAddons = allAddons.filter(a => {
    // Client-only groups (textures/shaders/client-mods) apply to ANY server — they
    // run on the player's PC, not the server, so they always show (with a client badge).
    if (a.type === 'textures' || a.type === 'shaders' || a.type === 'client-mods') return true;
    if (MOD_SERVERS.includes(software) && ['mods', 'modpacks'].includes(a.type)) return true;
    if (PLUGIN_SERVERS.includes(software) && a.type === 'plugins') return true;
    // Hide worldgen-overhaul datapacks (Terralith) unless the world type is 'default' —
    // they REPLACE the overworld, so on flat/amplified/large_biomes they would override
    // (and break) the chosen world type. The backend skips them too as a safety net.
    if (a.type === 'datapacks') return !(a.worldgenOverhaul && worldType !== 'default');
    return false;
  });

  // סינון התוספים לפי החיפוש
  const searchedAddons = relevantAddons.filter(a => {
    const localized = addonDesc(a.id, lang, a.desc) || '';
    const q = addonSearch.toLowerCase();
    return a.name.toLowerCase().includes(q) ||
      (a.desc && a.desc.toLowerCase().includes(q)) ||
      localized.toLowerCase().includes(q);
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const opsArray = opsString.split(',').map(o => o.trim()).filter(Boolean);
    const whitelistArray = isPrivate ? whitelistString.split(',').map(o => o.trim()).filter(Boolean) : [];
    // Honest install: only 'server' addons can actually be installed by create-server.sh.
    // client (textures) install on the player's game; manual (e.g. vanilla-tweaks) have no
    // hosted URL. Sending them would promise an install that never happens (same bug AddonsTab fixed).
    const serverInstallable = selectedAddons.filter(id => {
      const addon = allAddons.find(a => a.id === id);
      // Drop worldgen-overhaul datapacks on Bukkit — they'd be ignored by the engine.
      return getInstallMethod(addon) === 'server' && !isWorldgenBlocked(addon);
    });
    onCreate({
      name, icon, software, version, gamemode, worldType, ops: opsArray,
      seed: seed || undefined, installedAddons: serverInstallable, maxPlayers,
      difficulty, memoryMb, isPrivate, whitelistPlayers: whitelistArray
    });
  };

  // Worldgen-overhaul datapacks (Terralith etc.) don't work on Bukkit-based servers —
  // they need a Mojang-engine loader. On Bukkit we render them greyed + non-selectable.
  const bukkit = isBukkitBased(software);
  const isWorldgenBlocked = (addon) => bukkit && isWorldgenDatapack(addon);

  // Only 'server' addons are selectable — client/manual show an info badge instead (no false promise).
  const toggleSelection = (id) => {
    const addon = allAddons.find(a => a.id === id);
    if (getInstallMethod(addon) !== 'server') return;
    if (isWorldgenBlocked(addon)) return; // greyed on Bukkit — not selectable
    setSelectedAddons(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  // Version list is driven by the SELECTED software type. Each type's real API
  // supports a different set (Paper ≤ 1.21.x, Purpur/Fabric/Vanilla ship 26.x).
  // Fall back to the global Paper list if the matrix hasn't loaded for that type.
  const baseTypeVersions = (versionMatrix[software] && versionMatrix[software].length)
    ? versionMatrix[software]
    : mcVersions;
  // Apply per-type caps (e.g. Mohist → 1.20.1 only) so the selector never offers a
  // version whose jar download will fail. Unrestricted types are returned unchanged.
  const typeVersions = limitVersionsForType(software, baseTypeVersions);

  // When the type changes, if the current version isn't valid for it, snap to newest.
  const handleSoftwareChange = (id) => {
    setSoftware(id);
    setSelectedAddons([]);
    const base = (versionMatrix[id] && versionMatrix[id].length) ? versionMatrix[id] : mcVersions;
    const list = limitVersionsForType(id, base);
    if (list.length && !list.includes(version)) setVersion(list[0]);
  };

  // The create form is open to ALL signed-in users. Admins create directly; non-admins
  // submit a REQUEST (App.jsx routes the submit to requestServer based on isAdmin, and
  // the createServer function is admin-enforced server-side regardless). The submit
  // button label reflects which action will happen.
  const submitLabel = isCreatingServer
    ? (isAdmin ? 'יוצר עולם...' : '...')
    : (isAdmin ? t('create') : t('requestServerCta'));

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in duration-300 pb-10">
      <button onClick={onCancel} className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors">
        <ArrowLeft size={20} className="rtl:rotate-180" /> <span>{t('back')}</span>
      </button>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8 shadow-xl">
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-2 pb-4 border-b border-zinc-800">
           <Play size={24} className="text-green-500"/> {t('create')}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-8">

          <div className="flex flex-col sm:flex-row gap-6 items-start">
             <div className="flex-shrink-0">
               <label className="block text-sm font-bold text-zinc-400 mb-2 text-center">{t('serverIcon')}</label>
               <ImageUploader iconUrl={icon} setIconUrl={setIcon} t={t} size="lg" />
             </div>

             <div className="flex-1 w-full">
               <label className="block text-sm font-bold text-zinc-400 mb-2">{t('serverName')}</label>
               <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
                 placeholder="My Awesome Server" autoFocus
                 className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-4 text-white text-lg font-bold focus:outline-none focus:border-green-500 transition-all shadow-inner placeholder:text-zinc-600 placeholder:font-normal" />
               <p className="text-xs text-zinc-500 mt-2">זה השם שיופיע לשחקנים ברשימת השרתים בתוך המשחק.</p>
             </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
            <label className="block text-sm font-bold text-zinc-400 mb-3">{t('software')}</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SOFTWARE_TYPES.map(sw => (
                <div key={sw.id} onClick={() => handleSoftwareChange(sw.id)}
                  className={`cursor-pointer border rounded-lg p-3 text-center transition-all flex flex-col items-center gap-1
                    ${software === sw.id ? 'bg-green-500/10 border-green-500 text-green-400 shadow-md' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}>
                  <div className="font-bold">{sw.name}</div>
                  <div className="text-[10px] uppercase opacity-70">{sw.type}</div>
                  {sw.desc && <div className="text-[9px] opacity-50 leading-tight mt-0.5">{sw.desc}</div>}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">{t('version')}</label>
              <select value={version} onChange={(e) => setVersion(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all">
                {typeVersions.map(v => <option key={v} value={v}>{v}{v === '1.21.4' ? ' (מומלץ)' : ''}</option>)}
              </select>
              <p className="text-xs text-blue-400 mt-2">
                💡 ViaVersion מותקן אצלנו אוטומטית — שחקנים מ<b>כל</b> גרסת מיינקראפט (כולל 26.x) יכולים להיכנס לשרת הזה, בלי קשר לגרסת השרת.
              </p>
              {isViaVersion(version) && (
                <p className="text-xs text-zinc-500 mt-1">
                  שים לב: זו גרסה חדשה יותר ממה ש-Paper בנה. כאן תקבל את <b>התוכן</b> המלא של {version}. (Paper מוגבל ל-1.21.11; לתוכן 26.x בחר Purpur/Fabric.)
                </p>
              )}
              {/* Tell the creator up front what loader players will need on their PC —
                  only for modded types (vanilla/Bukkit need no client loader). */}
              {getClientLoader(software).needsLoader && (
                <div className="mt-3">
                  <ClientRequirements type={software} version={version} t={t} defaultOpen compact />
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">{t('gamemode')}</label>
              <select value={gamemode} onChange={(e) => setGamemode(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all">
                <option value="survival">{t('survival')}</option>
                <option value="creative">{t('creative')}</option>
                <option value="adventure">{t('adventure')}</option>
                <option value="spectator">{t('spectator')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">{t('worldType')}</label>
              <select value={worldType} onChange={(e) => setWorldType(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all">
                <option value="default">{t('worldDefault')}</option>
                <option value="flat">{t('worldFlat')}</option>
                <option value="amplified">{t('worldAmplified')}</option>
                <option value="large_biomes">{t('worldLargeBiomes')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">{t('seed')}</label>
              <input type="text" placeholder={t('seed')} value={seed} onChange={(e) => setSeed(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all placeholder:text-zinc-600" />
            </div>
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">{t('maxPlayers')}</label>
              <input type="number" min={1} max={100} value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">{t('difficulty')}</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all">
                <option value="peaceful">{t('peaceful')}</option>
                <option value="easy">{t('easy')}</option>
                <option value="normal">{t('normal')}</option>
                <option value="hard">{t('hard')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">זיכרון (RAM)</label>
              <select value={memoryMb} onChange={(e) => setMemoryMb(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all">
                <option value={1024}>1 GB</option>
                <option value={2048}>2 GB (מומלץ)</option>
                <option value={3072}>3 GB</option>
                <option value={4096}>4 GB</option>
              </select>
              <p className="text-xs text-zinc-500 mt-2">כמה זיכרון מוקצה לשרת. 2 GB מספיק לרוב; מודים/הרבה שחקנים → יותר.</p>
            </div>
          </div>

          {/* OP Players */}
          <div className="bg-zinc-950 border border-red-500/20 rounded-xl p-5">
             <label className="block text-sm font-bold text-red-400 mb-2">{t('opPlayers')}</label>
             <input type="text" placeholder={t('opPlayersDesc')} value={opsString} onChange={(e) => setOpsString(e.target.value)}
               className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-all placeholder:text-zinc-600" />
             <p className="text-xs text-zinc-500 mt-2">רק השחקנים ברשימה זו יוכלו להשתמש בפקודות ניהול בשרת.</p>
          </div>

          {/* Private / Public toggle + Whitelist (no gap between them) */}
          <div>
            <div
              onClick={() => setIsPrivate(p => !p)}
              className={`flex items-center justify-between rounded-xl p-4 cursor-pointer border transition-all ${isPrivate ? 'bg-yellow-500/10 border-yellow-500/40 rounded-b-none border-b-0' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600'}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isPrivate ? 'bg-yellow-500/20' : 'bg-zinc-800'}`}>
                  <Shield size={18} className={isPrivate ? 'text-yellow-400' : 'text-zinc-500'} />
                </div>
                <div>
                  <p className={`font-bold text-sm ${isPrivate ? 'text-yellow-400' : 'text-zinc-300'}`}>{isPrivate ? 'שרת פרטי' : 'שרת ציבורי'}</p>
                  <p className="text-xs text-zinc-500">{isPrivate ? 'רק שחקנים ב-Whitelist יוכלו להתחבר' : 'כל שחקן יכול להתחבר'}</p>
                </div>
              </div>
              <div className={`w-11 h-6 rounded-full transition-colors relative ${isPrivate ? 'bg-yellow-500' : 'bg-zinc-700'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${isPrivate ? 'left-6' : 'left-1'}`} />
              </div>
            </div>
            {isPrivate && (
              <div className="bg-yellow-500/5 border border-yellow-500/40 border-t-0 rounded-b-xl p-5">
                <label className="block text-sm font-bold text-yellow-400 mb-2">{t('whitelistPlayers')}</label>
                <input type="text" placeholder={t('whitelistPlayersDesc')} value={whitelistString} onChange={(e) => setWhitelistString(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-500 transition-all placeholder:text-zinc-600" />
                <p className="text-xs text-zinc-500 mt-2">שחקנים שלא ברשימה לא יוכלו להתחבר לשרת.</p>
              </div>
            )}
          </div>

          {relevantAddons.length > 0 && (
            <div className="space-y-4">
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <label className="block text-sm font-bold text-zinc-400">{t('selectAddons')} ({selectedAddons.length})</label>
                  <div className="relative w-full sm:w-64">
                    <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="חיפוש תוסף..."
                      value={addonSearch}
                      onChange={(e) => setAddonSearch(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pr-9 pl-3 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-600"
                    />
                  </div>
               </div>

               <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2 max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                 {searchedAddons.map(a => {
                    const installMethod = getInstallMethod(a); // 'server' | 'manual' | 'client'
                    const worldgenBlocked = isWorldgenBlocked(a);
                    const installable = installMethod === 'server' && !worldgenBlocked;
                    const checked = selectedAddons.includes(a.id);
                    return (
                    <div key={a.id} onClick={() => toggleSelection(a.id)}
                      title={worldgenBlocked ? t('worldgenBukkitNote') : (installable ? undefined : (installMethod === 'client' ? t('clientInstallInfo') : t('manualInstallInfo')))}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${installable ? 'cursor-pointer' : 'cursor-default'} ${worldgenBlocked ? 'opacity-50' : ''} ${checked ? 'bg-green-500/5 border-green-500/50' : 'bg-zinc-900 border-transparent hover:border-zinc-700'}`}>
                      {worldgenBlocked ? (
                        // Worldgen datapack on a Bukkit server — greyed, not selectable.
                        <span className="mt-0.5 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border flex-shrink-0 whitespace-nowrap border-zinc-700 text-zinc-500 bg-zinc-800/40">
                          {t('datapacks')}
                        </span>
                      ) : installable ? (
                        <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border flex-shrink-0 ${checked ? 'bg-green-600 border-green-600' : 'border-zinc-600'}`}>
                          {checked && <Check size={14} className="text-white"/>}
                        </div>
                      ) : (
                        // No checkbox for client/manual — they are NOT installed on the server. Avoid a false promise.
                        <span className={`mt-0.5 text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border flex-shrink-0 whitespace-nowrap ${installMethod === 'client' ? 'border-teal-500/30 text-teal-400 bg-teal-500/5' : 'border-zinc-600 text-zinc-400 bg-zinc-800/40'}`}>
                          {installMethod === 'client' ? t('clientSideBadge') : t('manualBadge')}
                        </span>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm block leading-none text-zinc-200">{a.name}</span>
                          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${TYPE_COLORS[a.type]}`}>
                            {t(a.type)}
                          </span>
                          {installMethod === 'client' && a.clientUrl && <ClientDownloadLink url={a.clientUrl} t={t} />}
                          {/* Manual items (e.g. datapacks/modpacks that can't auto-install) get the
                              same "download for your PC" link when a source URL exists. */}
                          {installMethod === 'manual' && a.downloadUrl && <ClientDownloadLink url={a.downloadUrl} t={t} />}
                        </div>
                        <span className="text-xs text-zinc-400 mt-2 block leading-relaxed">{addonDesc(a.id, lang, a.desc)}</span>
                        {worldgenBlocked && (
                          <span className="text-[11px] text-amber-400/80 mt-1.5 block leading-relaxed">
                            {t('worldgenBukkitNote')}
                          </span>
                        )}
                        {!installable && !worldgenBlocked && (
                          <span className="text-[11px] text-zinc-500 mt-1.5 block leading-relaxed">
                            {installMethod === 'client' ? t('clientInstallInfo') : t('manualInstallInfo')}
                          </span>
                        )}
                        {a.clientDeps && (
                          <ClientDepsChooser deps={a.clientDeps} allAddons={allAddons} t={t} lang={lang} addonDesc={addonDesc} />
                        )}
                      </div>
                    </div>
                    );
                 })}
                 {searchedAddons.length === 0 && <div className="col-span-full p-4 text-center text-zinc-600 text-sm">לא נמצאו תוספים התואמים לחיפוש.</div>}
               </div>
            </div>
          )}

          <hr className="border-zinc-800" />

          {/* EULA acceptance — required, gates creation (UX/legal acknowledgment only) */}
          <div
            onClick={() => setEulaAccepted(v => !v)}
            className={`flex items-start gap-3 rounded-xl p-4 cursor-pointer border transition-all ${eulaAccepted ? 'bg-green-500/10 border-green-500/40' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600'}`}
          >
            <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border flex-shrink-0 transition-colors ${eulaAccepted ? 'bg-green-600 border-green-600' : 'border-zinc-600'}`}>
              {eulaAccepted && <Check size={14} className="text-white" />}
            </div>
            <div className="min-w-0">
              <p className={`font-bold text-sm ${eulaAccepted ? 'text-green-400' : 'text-zinc-300'}`}>אני מקבל את תנאי ה-EULA של Minecraft *</p>
              <p className="text-xs text-zinc-500 mt-1">
                בהפעלת שרת אתה מסכים ל&rlm;{' '}
                <a
                  href="https://www.minecraft.net/en-us/eula"
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center text-green-400 hover:text-green-300 font-bold border border-green-500/30 bg-green-500/5 rounded px-1.5 py-0.5 transition-colors"
                >
                  תנאי השימוש של Mojang
                </a>
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onCancel} className="px-6 py-3 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
              {t('cancel')}
            </button>
            <button type="submit" disabled={isCreatingServer || !eulaAccepted} className="bg-green-600 hover:bg-green-500 text-white px-10 py-3 rounded-xl font-bold transition-all shadow-lg shadow-green-900/20 text-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <Play size={20} fill="currentColor"/> {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
