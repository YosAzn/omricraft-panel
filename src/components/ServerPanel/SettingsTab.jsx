import React from 'react';
import { Shield, MessageCircle } from 'lucide-react';
import {
  updateServerPropertiesFn, updateServerIconFn, setServerPrivacyFn,
  changeServerTypeFn, changeServerVersionFn, updateServerMemoryFn
} from '../../lib/api';
import { SOFTWARE_TYPES, limitVersionsForType, isCoreIncompatible, isBukkitBased, isWorldgenDatapack } from '../../lib/constants';
import { isViaVersion } from '../../lib/utils';
import ImageUploader from '../ImageUploader';
import DifficultyControl from './DifficultyControl';
import OpsEditor from './OpsEditor';
import WhitelistEditor from './WhitelistEditor';

export default function SettingsTab({ server, onDelete, updateServer, t, mcVersions, versionMatrix = {}, allAddons = [] }) {
  // Version list filtered to what THIS server's software type actually supports,
  // then capped to versions the core actually publishes builds for (e.g. Youer →
  // 1.21.1 only, Mohist → 1.20.1 only) so the selector never offers a version whose
  // jar download will fail.
  const baseTypeVersions = (versionMatrix[server.software] && versionMatrix[server.software].length)
    ? versionMatrix[server.software]
    : mcVersions;
  const typeVersions = limitVersionsForType(server.software, baseTypeVersions);
  // The server's CURRENT version may not be in the capped list (e.g. a legacy
  // version, or one the core no longer publishes). If so, the <select> would render
  // blank — so flag it and surface it as a disabled "(current/legacy)" option below.
  const currentVersionMissing = !!(server.version && !typeVersions.includes(server.version));
  const applyServerProperty = async (field, value) => {
    try {
      const res = await updateServerPropertiesFn({ serverId: server.id, properties: { [field]: value } });
      if (!res.data?.success) throw new Error(res.data?.error || t('settingsUnknownError'));
    } catch(e) {
      console.error('updateServerProperties error:', e);
      alert(`${t('settingsUpdateError')}: ${e.message}`);
    }
  };

  const [versionSaving, setVersionSaving] = React.useState(false);
  const [typeSaving, setTypeSaving] = React.useState(false);

  // Software types the user may switch TO from Settings. forge/neoforge/vanilla
  // are intentionally excluded — the manager-api rejects them (no reliable
  // Velocity modern-forwarding mod → unjoinable server).
  const CHANGEABLE_TYPES = ['paper', 'purpur', 'folia', 'mohist', 'youer', 'fabric'];
  const changeableSoftware = SOFTWARE_TYPES.filter(sw => CHANGEABLE_TYPES.includes(sw.id));
  const BUKKIT_FAMILY = ['paper', 'purpur', 'folia', 'mohist', 'youer'];
  const isCrossFamily = (a, b) =>
    (BUKKIT_FAMILY.includes(a) && b === 'fabric') ||
    (a === 'fabric' && BUKKIT_FAMILY.includes(b));

  // Real software/type change: swaps the jar AND rewrites the Velocity
  // forwarding config for the target family on the VPS, then restarts.
  const handleTypeChange = async (newType) => {
    const prevType = server.software;
    const prevVersion = server.version;
    if (!newType || newType === prevType) return;

    // Pick a version valid for the target type (newest from the matrix), then apply
    // the per-type cap (e.g. Youer → 1.21.1 only, Mohist → 1.20.1 only) so we never
    // switch to a version whose jar download will fail for that core.
    const baseTargetList = (versionMatrix[newType] && versionMatrix[newType].length)
      ? versionMatrix[newType]
      : (mcVersions || []);
    const targetList = limitVersionsForType(newType, baseTargetList);
    const newVersion = (targetList.includes(prevVersion)) ? prevVersion : (targetList[0] || prevVersion);

    // Addons already installed that become incompatible with the target core:
    // either core-gated (compatibleCores excludes newType) or a worldgen datapack
    // moving onto a Bukkit-family core (Bukkit ignores datapack worldgen). These are
    // named in the warning and pruned from the optimistic installedAddons so the UI
    // doesn't keep showing them as "installed" on a core that can't run them.
    const stale = (server.installedAddons || [])
      .map(id => allAddons.find(a => a.id === id))
      .filter(Boolean)
      .filter(a => isCoreIncompatible(a, newType) || (isBukkitBased(newType) && isWorldgenDatapack(a)));
    const staleIds = new Set(stale.map(a => a.id));

    const newName = (SOFTWARE_TYPES.find(s => s.id === newType) || {}).name || newType;
    let warn = t('settingsTypeWarnIntro', { newName }) + `\n` +
      `• ${t('settingsTypeWarnRestart')}\n` +
      `• ${t('settingsTypeWarnVersion', { newVersion })}\n`;
    if (isCrossFamily(prevType, newType)) {
      warn += `• ${t('settingsTypeWarnCrossFamily')}\n`;
    }
    if (newType === 'fabric') {
      warn += `• ${t('settingsTypeWarnFabricProxy')}\n`;
    }
    if (stale.length) {
      const names = stale.map(a => a.name || a.id).join(', ');
      warn += `• ${t('settingsTypeWarnStale', { newName, names })}\n`;
    }
    warn += `\n${t('settingsTypeWarnWorldSafe')}`;
    if (!window.confirm(warn)) return;

    setTypeSaving(true);
    const prevInstalledAddons = server.installedAddons;
    const optimistic = { software: newType, version: newVersion };
    if (staleIds.size) {
      optimistic.installedAddons = (server.installedAddons || []).filter(id => !staleIds.has(id));
    }
    updateServer(optimistic); // optimistic
    try {
      const res = await changeServerTypeFn({ serverId: server.id, type: newType, version: newVersion });
      if (!res.data?.success) throw new Error(res.data?.error || t('settingsTypeChangeFailed'));
    } catch (e) {
      console.error('changeServerType error:', e);
      const rollback = { software: prevType, version: prevVersion };
      if (staleIds.size) rollback.installedAddons = prevInstalledAddons; // restore pruned addons
      updateServer(rollback); // rollback
      alert(`${t('settingsTypeChangeError')}: ${e.message}`);
    } finally {
      setTypeSaving(false);
    }
  };

  // Real version change: swaps the jar on the VPS and restarts the server.
  const handleVersionChange = async (newVersion) => {
    const prevVersion = server.version;
    if (!newVersion || newVersion === prevVersion) return;
    if (!window.confirm(t('settingsVersionConfirm'))) return;
    setVersionSaving(true);
    updateServer({ version: newVersion }); // optimistic
    try {
      const res = await changeServerVersionFn({ serverId: server.id, version: newVersion, type: server.software });
      if (!res.data?.success) throw new Error(res.data?.error || t('settingsVersionChangeFailed'));
    } catch (e) {
      console.error('changeServerVersion error:', e);
      updateServer({ version: prevVersion }); // rollback
      alert(`${t('settingsVersionChangeError')}: ${e.message}`);
    } finally {
      setVersionSaving(false);
    }
  };

  // RAM editing: writes memoryMb to servers.json (effective on next restart).
  const handleMemoryChange = async (newMemoryMb) => {
    const prev = server.memoryMb || 2048;
    if (!newMemoryMb || newMemoryMb === prev) return;
    updateServer({ memoryMb: newMemoryMb }); // optimistic
    try {
      const res = await updateServerMemoryFn({ serverId: server.id, memoryMb: newMemoryMb });
      if (!res.data?.success) throw new Error(res.data?.error || t('settingsRamChangeFailed'));
    } catch (e) {
      console.error('updateServerMemory error:', e);
      updateServer({ memoryMb: prev }); // rollback
      alert(`${t('settingsRamChangeError')}: ${e.message}`);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in max-w-2xl">
      <div>
        <h3 className="text-xl font-bold mb-4 border-b border-zinc-800 pb-2">{t('basicSettings')}</h3>
        <div className="flex flex-col sm:flex-row gap-6 mb-6">
           <div className="flex-shrink-0">
             <label className="block text-sm text-zinc-400 mb-2 text-center">{t('serverIcon')}</label>
             <ImageUploader
               iconUrl={server.icon}
               setIconUrl={async (newUrl) => {
                 const prevIcon = server.icon;
                 updateServer({ icon: newUrl });
                 if (newUrl && server.id) {
                   try {
                     const res = await updateServerIconFn({ serverId: server.id, icon: newUrl });
                     if (!res.data?.success) throw new Error(res.data?.error || 'Icon update failed');
                   } catch(e) {
                     console.error('updateServerIcon error:', e);
                     updateServer({ icon: prevIcon }); // rollback — keep Firestore and VPS in sync
                     alert(`${t('settingsIconError')}: ${e.message}`);
                   }
                 }
               }}
               t={t} size="sm"
             />
           </div>
           <div className="flex-1">
              <label className="block text-sm text-zinc-400 mb-1">{t('serverName')}</label>
              <input type="text" value={server.name} onChange={(e) => updateServer({ name: e.target.value })} onFocus={(e) => e.target.select()} onBlur={(e) => applyServerProperty('name', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600" />
           </div>
        </div>

        <div className="space-y-4">
          {/* Server software (type) — editable post-creation. Reuses the same
              software cards as the create form. */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
            <label className="block text-sm text-zinc-400 mb-2 flex items-center gap-2">
              {t('software')}
              {typeSaving && <span className="text-xs text-zinc-500 animate-pulse">{t('settingsSwitchingType')}</span>}
            </label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {changeableSoftware.map(sw => (
                <div key={sw.id}
                  onClick={() => { if (!typeSaving) handleTypeChange(sw.id); }}
                  className={`cursor-pointer border rounded-lg p-2 text-center transition-all flex flex-col items-center gap-0.5
                    ${typeSaving ? 'opacity-50 pointer-events-none' : ''}
                    ${server.software === sw.id ? 'bg-green-500/10 border-green-500 text-green-400 shadow-md' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}>
                  <div className="font-bold text-sm">{sw.name}</div>
                  <div className="text-[10px] uppercase opacity-70">{sw.type}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              {t('settingsTypeHint')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1 flex items-center gap-2">
                {t('version')}
                {versionSaving && <span className="text-xs text-zinc-500 animate-pulse">{t('settingsSwitchingVersion')}</span>}
              </label>
              <select value={server.version} disabled={versionSaving} onChange={(e) => handleVersionChange(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600 disabled:opacity-50">
                {currentVersionMissing && <option value={server.version} disabled>{server.version} {t('settingsVersionLegacy')}</option>}
                {typeVersions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              {currentVersionMissing && (
                <p className="text-xs text-amber-400 mt-1">
                  {t('settingsVersionMissing', { version: server.version })}
                </p>
              )}
              <p className="text-xs text-blue-400 mt-1">
                {t('settingsViaVersionInfo')}
              </p>
              {isViaVersion(server.version) && (
                <p className="text-xs text-zinc-500 mt-1">
                  {t('settingsPaperContentInfo', { version: server.version })}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">{t('maxPlayers')}</label>
              <input type="number" value={server.maxPlayers} onChange={(e) => updateServer({ maxPlayers: parseInt(e.target.value) || 20 })} onBlur={(e) => applyServerProperty('maxPlayers', parseInt(e.target.value) || 20)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600" />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">{t('ram')}</label>
              <select value={server.memoryMb || 2048} onChange={(e) => handleMemoryChange(parseInt(e.target.value, 10))} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600">
                {[1024, 2048, 3072, 4096, 6144, 8192].map(mb => (
                  <option key={mb} value={mb}>{(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB ({mb} MB)</option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-1">{t('settingsRamHint')}</p>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">{t('gamemode')}</label>
              <select value={server.gamemode} onChange={(e) => { updateServer({ gamemode: e.target.value }); applyServerProperty('gamemode', e.target.value); }} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600">
                <option value="survival">{t('survival')}</option>
                <option value="creative">{t('creative')}</option>
                <option value="adventure">{t('adventure')}</option>
                <option value="spectator">{t('spectator')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">{t('worldType')}</label>
              {/* World type is locked after creation — Minecraft only reads level-type
                  on first world generation. Show it read-only to avoid lying to the user
                  (writing the property would have no effect on an existing world). */}
              <select value={server.worldType} disabled className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-500 outline-none cursor-not-allowed">
                <option value="default">{t('worldDefault')}</option>
                <option value="flat">{t('worldFlat')}</option>
                <option value="amplified">{t('worldAmplified')}</option>
                <option value="large_biomes">{t('worldLargeBiomes')}</option>
              </select>
              <p className="text-xs text-zinc-500 mt-1">🔒 {t('worldTypeLocked')}</p>
            </div>
          </div>
          <DifficultyControl server={server} updateServer={updateServer} t={t} />
          {/* Privacy toggle */}
          <div
            onClick={async () => {
              const newVal = !server.isPrivate;
              updateServer({ isPrivate: newVal });
              try {
                const res = await setServerPrivacyFn({ serverId: server.id, isPrivate: newVal });
                if (!res.data?.success) throw new Error(res.data?.error || 'Privacy update failed');
              } catch(e) {
                console.error('setServerPrivacy error:', e);
                updateServer({ isPrivate: !newVal }); // rollback
                alert(`${t('settingsPrivacyError')}: ${e.message}`);
              }
            }}
            className={`flex items-center justify-between rounded-xl p-4 cursor-pointer border transition-all ${server.isPrivate ? 'bg-yellow-500/10 border-yellow-500/40' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${server.isPrivate ? 'bg-yellow-500/20' : 'bg-zinc-800'}`}>
                <Shield size={18} className={server.isPrivate ? 'text-yellow-400' : 'text-zinc-500'} />
              </div>
              <div>
                <p className={`font-bold text-sm ${server.isPrivate ? 'text-yellow-400' : 'text-zinc-300'}`}>{server.isPrivate ? t('settingsPrivateServer') : t('settingsPublicServer')}</p>
                <p className="text-xs text-zinc-500">{server.isPrivate ? t('settingsPrivateHint') : t('settingsPublicHint')}</p>
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors relative ${server.isPrivate ? 'bg-yellow-500' : 'bg-zinc-700'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${server.isPrivate ? 'left-6' : 'left-1'}`} />
            </div>
          </div>

          <OpsEditor server={server} updateServer={updateServer} t={t} />

          {/* Whitelist players — only shown when server is private */}
          {server.isPrivate && (
            <WhitelistEditor server={server} updateServer={updateServer} t={t} />
          )}

          <div>
            <label className="block text-sm text-zinc-400 mb-1 flex items-center gap-2"><MessageCircle size={16} className="text-indigo-400" /> {t('discordWebhook')} <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full">{t('comingSoon')}</span></label>
            <input type="text" disabled placeholder="https://discord.com/api/webhooks/..." value={server.discordWebhook || ''} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-500 outline-none text-sm cursor-not-allowed" />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-xl font-bold mb-4 border-b border-zinc-800 pb-2 text-red-500">{t('dangerZone')}</h3>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5">
          <h4 className="font-bold text-red-500 mb-2">{t('deleteServer')}</h4>
          <p className="text-sm text-red-400/80 mb-4">{t('deleteServerDesc')}</p>
          <button onClick={onDelete} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-bold transition-colors">
            {t('deleteBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}
