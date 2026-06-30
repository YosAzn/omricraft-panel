import React, { useState, useEffect } from 'react';
import { ArrowLeft, Play, Search, Check, Shield, Lock } from 'lucide-react';

import { TYPE_COLORS, SOFTWARE_TYPES, getInstallMethod, limitVersionsForType, isBukkitBased, isWorldgenDatapack, getClientLoader, isCoreIncompatible, collectRequiredIds, getRecommendedRamMb, isEolCore, forgeNeoForgeHint, modpackRamRecommendationMb, isPluginBoundBlocked } from '../lib/constants';
import { addonDesc } from '../lib/addonI18n';
import { isViaVersion } from '../lib/utils';
import ImageUploader from './ImageUploader';
import { ClientDownloadLink, RequirementsAccordion, CoreIncompatibleNote, ResourcePackInstallChoice, PluginBoundTag, ModpackPlayerRequirements } from './AddonClientExtras';
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
  // ids that were auto-selected as a dependency of another selection (for the
  // "added automatically" tag). A dep stays selected even if the parent is later
  // unchecked — the user can still manually uncheck the dep itself.
  const [autoSelected, setAutoSelected] = useState([]);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [difficulty, setDifficulty] = useState('normal');
  const [memoryMb, setMemoryMb] = useState(2048);
  // Tracks whether the user manually picked a RAM value. While false, switching the
  // core auto-snaps RAM to that core's recommendation; once the user touches the
  // selector we stop overriding their choice.
  const [ramTouched, setRamTouched] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [whitelistString, setWhitelistString] = useState('');
  // UX/legal acknowledgment only — gates the create button. The EULA itself is
  // auto-accepted server-side at provisioning (eula.txt); this is consent in the UI.
  const [eulaAccepted, setEulaAccepted] = useState(false);

  // State חדש לחיפוש תוספים
  const [addonSearch, setAddonSearch] = useState('');

  // Keep these lists in sync with AddonsTab.jsx (Bukkit family = plugins,
  // mod-loaders = mods; Mohist + Youer are hybrids → both). folia/mohist/neoforge were
  // previously dropped here, hiding valid addons in the create form. Youer = Mohist's
  // maintained NeoForge-hybrid successor, so it runs plugins AND mods like Mohist.
  const PLUGIN_SERVERS = ['paper', 'purpur', 'folia', 'mohist', 'youer'];
  const MOD_SERVERS = ['fabric', 'forge', 'neoforge', 'mohist', 'youer'];
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
      // Drop worldgen-overhaul datapacks on Bukkit (engine ignores them),
      // core-incompatible addons (Create on Fabric etc.) and plugin-bound packs on a
      // non-plugin core (no backing plugin can run there) — the VPS can't build them.
      return getInstallMethod(addon) === 'server' && !isWorldgenBlocked(addon) && !isCoreBlocked(addon) && !isPluginBoundCoreBlocked(addon);
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
  // Core-gating: addon has a compatibleCores allow-list that excludes the chosen core
  // (Sodium/C2ME → Fabric only; Create → Forge/NeoForge only). Greyed + non-selectable.
  const isCoreBlocked = (addon) => isCoreIncompatible(addon, software);
  // Phase 5d — a pluginBound resource pack (Custom Hats) needs a plugin-capable core;
  // blocked (greyed + non-selectable) on Vanilla + pure-mod loaders.
  const isPluginBoundCoreBlocked = (addon) => isPluginBoundBlocked(addon, software);

  // Only 'server' addons are selectable — client/manual show an info badge instead (no false promise).
  // Selecting an addon with `requires` also auto-selects each (transitive) server dep
  // and tags it "added automatically". Deselecting the parent leaves deps selected
  // (no silent orphan removal) — the user can manually uncheck a dep itself.
  const toggleSelection = (id) => {
    const addon = allAddons.find(a => a.id === id);
    if (getInstallMethod(addon) !== 'server') return;
    if (isWorldgenBlocked(addon)) return; // greyed on Bukkit — not selectable
    if (isCoreBlocked(addon)) return;     // greyed on incompatible core — not selectable
    if (isPluginBoundCoreBlocked(addon)) return; // greyed: plugin-bound pack on non-plugin core

    if (selectedAddons.includes(id)) {
      // Manual deselect of any addon (parent or dep): just remove it; drop its auto tag.
      setSelectedAddons(prev => prev.filter(a => a !== id));
      setAutoSelected(prev => prev.filter(a => a !== id));
      return;
    }

    // Select the addon + auto-add its server-installable, non-blocked deps.
    const deps = collectRequiredIds([id], allAddons).filter(depId => {
      const dep = allAddons.find(a => a.id === depId);
      return dep && getInstallMethod(dep) === 'server' && !dep.paid && !isWorldgenBlocked(dep) && !isCoreBlocked(dep);
    });
    setSelectedAddons(prev => [...new Set([...prev, id, ...deps])]);
    // Tag newly-added deps as auto (don't tag the parent, and don't tag a dep the
    // user had already selected manually).
    setAutoSelected(prev => {
      const newlyAuto = deps.filter(depId => !selectedAddons.includes(depId) && !prev.includes(depId));
      return [...new Set([...prev, ...newlyAuto])];
    });
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
  // Also snap RAM to the new core's recommendation — but only while the user hasn't
  // manually set a RAM value (don't override a deliberate choice).
  const handleSoftwareChange = (id) => {
    setSoftware(id);
    setSelectedAddons([]);
    setAutoSelected([]);
    const base = (versionMatrix[id] && versionMatrix[id].length) ? versionMatrix[id] : mcVersions;
    const list = limitVersionsForType(id, base);
    if (list.length && !list.includes(version)) setVersion(list[0]);
    if (!ramTouched) setMemoryMb(getRecommendedRamMb(id));
  };

  // Recommended RAM (MB → GB label) for the current core, surfaced in the selector.
  const recommendedRamMb = getRecommendedRamMb(software);
  const recommendedRamGb = Math.round(recommendedRamMb / 1024);
  // Forge vs NeoForge hint for the chosen core+version (null when no hint applies).
  const coreVersionHint = forgeNeoForgeHint(software, version);

  // --- Phase 5a — ViaVersion applies to PLUGIN-family cores only ---
  // ViaVersion translates vanilla packets, so cross-version joining works on Bukkit
  // family (Paper/Purpur/Folia) and the hybrids (Mohist/Youer, which run the plugin).
  // A PURE-MOD core (fabric/forge/neoforge — in MOD_SERVERS but NOT plugin-family)
  // can't use it: players must match the loader+version+mod files exactly.
  const pluginFamily = PLUGIN_SERVERS.includes(software);
  const pureModCore = MOD_SERVERS.includes(software) && !pluginFamily;
  // Vanilla is in NEITHER PLUGIN_SERVERS nor MOD_SERVERS, so it gets neither note above.
  // It has the SAME hard exact-version restriction as a mod server (no ViaVersion layer),
  // just without a loader/mod files — so it needs its own tailored guidance.
  // The three guards (pluginFamily / pureModCore / isVanilla) stay mutually exclusive.
  const isVanilla = software === 'vanilla';

  // --- Phase 5b/5c — modpack-aware notes + RAM ---
  // A modpack addon is selected, OR this is a mod-loader server (modpack territory).
  const modpackSelected = selectedAddons.some(id => {
    const a = allAddons.find(x => x.id === id);
    return a && a.type === 'modpacks';
  });
  const isModLoaderServer = MOD_SERVERS.includes(software);
  // Heaviest modpack RAM recommendation across the selected packs (0 when none).
  const modpackRamMb = modpackRamRecommendationMb(selectedAddons, allAddons, maxPlayers);
  // Warn (hint, not a block) when a modpack is selected and the chosen RAM is below
  // its weight+player-count recommendation. Respects the user's manual RAM choice —
  // it's only a warning, never an override.
  const modpackRamBelow = modpackRamMb > 0 && memoryMb < modpackRamMb;
  const modpackRamGb = Math.round(modpackRamMb / 1024);

  // Auto-sync the pre-selected RAM to the CURRENT recommendation — but ONLY while the
  // user hasn't manually picked a RAM value (ramTouched). Tracks the recommendation in
  // BOTH directions: the target is the heavier of the core recommendation and the modpack
  // recommendation, so lowering maxPlayers / deselecting a heavy pack also relaxes the
  // pre-selected RAM back down (no one-way over-allocation). The moment the user sets RAM
  // manually (ramTouched), this never overrides their choice; the below-recommendation
  // warning still covers a deliberate lower pick.
  useEffect(() => {
    if (ramTouched) return;
    const target = Math.max(recommendedRamMb, modpackRamMb);
    if (target !== memoryMb) setMemoryMb(target);
  }, [recommendedRamMb, modpackRamMb, ramTouched, memoryMb]);

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
                  className={`relative cursor-pointer border rounded-lg p-3 text-center transition-all flex flex-col items-center gap-1
                    ${software === sw.id ? 'bg-green-500/10 border-green-500 text-green-400 shadow-md' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}>
                  {/* EOL badge — flags an unmaintained core (Mohist). Stays selectable. */}
                  {sw.eol && (
                    <span className="absolute top-1 left-1 text-[8px] uppercase font-bold px-1 py-0.5 rounded border border-amber-500/40 text-amber-400 bg-amber-500/10 leading-none">
                      {t('eolBadge')}
                    </span>
                  )}
                  <div className="font-bold">{sw.name}</div>
                  <div className="text-[10px] uppercase opacity-70">{sw.type}</div>
                  {sw.desc && <div className="text-[9px] opacity-50 leading-tight mt-0.5">{sw.desc}</div>}
                </div>
              ))}
            </div>
            {/* EOL warning shown only when an EOL core is selected. */}
            {isEolCore(software) && (
              <p className="text-xs text-amber-400 mt-3 leading-relaxed">{t('mohistEolNote')}</p>
            )}
            {/* Youer is the recommended (non-EOL) hybrid successor to Mohist. */}
            {software === 'youer' && (
              <p className="text-xs text-green-400 mt-3 leading-relaxed">{t('youerNote')}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">{t('version')}</label>
              <select value={version} onChange={(e) => setVersion(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all">
                {typeVersions.map(v => <option key={v} value={v}>{v}{v === '1.21.4' ? ' (מומלץ)' : ''}</option>)}
              </select>
              {/* Phase 5a — ViaVersion is PLUGIN-family only (Paper/Purpur/Folia + the
                  Mohist/Youer hybrids that run the plugin). It translates vanilla packets,
                  so cross-version joining works there. */}
              {pluginFamily && (
                <>
                  <p className="text-xs text-blue-400 mt-2"
                    dangerouslySetInnerHTML={{ __html: t('viaVersionPluginNote') }} />
                  {isViaVersion(version) && (
                    <p className="text-xs text-zinc-500 mt-1"
                      dangerouslySetInnerHTML={{ __html: t('viaVersionPaperHint').replace('{version}', version) }} />
                  )}
                </>
              )}
              {/* Phase 5a — pure-mod core: ViaVersion does NOT apply. Players must match
                  the loader + MC version + mod files exactly to connect. */}
              {pureModCore && (
                <p className="text-xs text-amber-400 mt-2 leading-relaxed">{t('modServerNoViaVersion')}</p>
              )}
              {/* Phase 5a — vanilla: no ViaVersion plugin, no loader. Same exact-version
                  restriction as a mod server, so surface a vanilla-tailored note. */}
              {isVanilla && (
                <p className="text-xs text-amber-400 mt-2 leading-relaxed">{t('vanillaNoViaVersion')}</p>
              )}
              {/* Tell the creator up front what loader players will need on their PC —
                  only for modded types (vanilla/Bukkit need no client loader). */}
              {getClientLoader(software).needsLoader && (
                <div className="mt-3">
                  <ClientRequirements type={software} version={version} t={t} defaultOpen compact />
                </div>
              )}
              {/* Forge vs NeoForge soft hint by version (recommendation, not a block). */}
              {coreVersionHint === 'preferNeoForge' && (
                <p className="text-xs text-blue-400 mt-2 leading-relaxed">💡 {t('forgePreferNeoForge')}</p>
              )}
              {coreVersionHint === 'neoForgeUnavailable' && (
                <p className="text-xs text-amber-400 mt-2 leading-relaxed">⚠️ {t('neoForgeUnavailable')}</p>
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
              {/* Phase 5b — modpack/mod-loader servers are full multiplayer (clears the
                  common single-player confusion). Shown when a modpack is selected or the
                  core is a mod-loader. */}
              {(modpackSelected || isModLoaderServer) && (
                <p className="text-xs text-pink-400 mt-2 leading-relaxed">{t('modpackMultiplayerNote')}</p>
              )}
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
              <label className="block text-sm font-bold text-zinc-400 mb-2">
                זיכרון (RAM)
                <span className="ms-2 text-[11px] font-normal text-green-400">
                  {t('ramRecommendedLabel')}: {recommendedRamGb}GB
                </span>
              </label>
              <select value={memoryMb} onChange={(e) => { setRamTouched(true); setMemoryMb(Number(e.target.value)); }}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all">
                {/* 10GB/12GB added so a heavy-modpack recommendation (Phase 5c) is selectable. */}
                {[1024, 2048, 3072, 4096, 6144, 8192, 10240, 12288].map(mb => (
                  <option key={mb} value={mb}>
                    {Math.round(mb / 1024)} GB{mb === recommendedRamMb ? ` (${t('ramRecommendedLabel')})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-2">כמה זיכרון מוקצה לשרת. מודים/הרבה שחקנים → יותר. {t('ramModpackNote')}</p>
              {/* Phase 5c — soft warning when a selected modpack's weight+player-count
                  recommendation exceeds the chosen RAM. Hint only — never blocks creation. */}
              {modpackRamBelow && (
                <p className="text-xs text-amber-400 mt-2 leading-relaxed">
                  {t('modpackRamWarning').replace('{X}', modpackRamGb).replace('{N}', Math.max(1, Number(maxPlayers) || 1))}
                </p>
              )}
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
                    const coreBlocked = isCoreBlocked(a);
                    const pluginBoundBlocked = isPluginBoundCoreBlocked(a); // Phase 5d
                    const installable = installMethod === 'server' && !worldgenBlocked && !coreBlocked && !pluginBoundBlocked;
                    const greyed = worldgenBlocked || coreBlocked || pluginBoundBlocked;
                    const checked = selectedAddons.includes(a.id);
                    const autoAdded = checked && autoSelected.includes(a.id);
                    return (
                    <div key={a.id} onClick={() => toggleSelection(a.id)}
                      title={worldgenBlocked ? t('worldgenBukkitNote') : (pluginBoundBlocked ? t('pluginBoundCoreBlocked') : (installable ? undefined : (installMethod === 'client' ? t('clientInstallInfo') : (a.type === 'modpacks' ? t('modpackManualInfo') : t('manualInstallInfo')))))}
                      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${installable ? 'cursor-pointer' : 'cursor-default'} ${greyed ? 'opacity-50' : ''} ${checked ? 'bg-green-500/5 border-green-500/50' : 'bg-zinc-900 border-transparent hover:border-zinc-700'}`}>
                      {coreBlocked || pluginBoundBlocked ? (
                        // Addon's build doesn't exist for the chosen core, or a plugin-bound
                        // pack on a non-plugin core — neutral lock, not a recolor.
                        <span className="mt-0.5 w-5 h-5 rounded flex items-center justify-center border border-zinc-700 bg-zinc-800/40 text-zinc-500 flex-shrink-0">
                          <Lock size={12} />
                        </span>
                      ) : worldgenBlocked ? (
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
                          {autoAdded && (
                            <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded border border-green-500/30 text-green-400 bg-green-500/10 whitespace-nowrap">
                              {t('autoAddedTag')}
                            </span>
                          )}
                          {installMethod === 'client' && a.clientUrl && <ClientDownloadLink url={a.clientUrl} t={t} />}
                          {/* Manual DATAPACKS get a "download to PC" link when a source URL exists.
                              Modpacks are EXCLUDED — you don't download a modpack as a flat file; its
                              official page + app deep-links are provided by ModpackPlayerRequirements below. */}
                          {installMethod === 'manual' && a.type !== 'modpacks' && a.downloadUrl && <ClientDownloadLink url={a.downloadUrl} t={t} />}
                        </div>
                        <span className="text-xs text-zinc-400 mt-2 block leading-relaxed">{addonDesc(a.id, lang, a.desc)}</span>
                        {worldgenBlocked && (
                          <span className="text-[11px] text-amber-400/80 mt-1.5 block leading-relaxed">
                            {t('worldgenBukkitNote')}
                          </span>
                        )}
                        {coreBlocked && (
                          <span className="mt-1.5 block"><CoreIncompatibleNote addon={a} t={t} /></span>
                        )}
                        {/* Phase 5d — plugin-bound pack blocked on a non-plugin core. */}
                        {pluginBoundBlocked && (
                          <span className="text-[11px] text-amber-400/80 mt-1.5 block leading-relaxed">
                            {t('pluginBoundCoreBlocked')}
                          </span>
                        )}
                        {autoAdded && (
                          <span className="text-[11px] text-green-400/70 mt-1.5 block leading-relaxed">
                            {t('autoAddedByNote')}
                          </span>
                        )}
                        {!installable && !greyed && (
                          <span className="text-[11px] text-zinc-500 mt-1.5 block leading-relaxed">
                            {installMethod === 'client' ? t('clientInstallInfo') : (a.type === 'modpacks' ? t('modpackManualInfo') : t('manualInstallInfo'))}
                          </span>
                        )}
                        <RequirementsAccordion addon={a} allAddons={allAddons} t={t} lang={lang} addonDesc={addonDesc} />
                        {/* TASK 2 — plugin-bound RP warning (Custom Hats etc.); enriched on a plugin-capable core (Phase 5d). */}
                        <PluginBoundTag addon={a} allAddons={allAddons} t={t} software={software} />
                        {/* TASK 1 — server-RP vs PC-download choice for normal texture packs. */}
                        <ResourcePackInstallChoice addon={a} t={t} />
                        {/* TASK 3 — modpack: mod-loader the player needs + one-click install deep-links. */}
                        <ModpackPlayerRequirements addon={a} t={t} mcVersion={version} />
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
