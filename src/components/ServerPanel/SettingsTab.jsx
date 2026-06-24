import React from 'react';
import { Shield, MessageCircle } from 'lucide-react';
import {
  updateServerPropertiesFn, updateServerIconFn, setServerPrivacyFn,
  changeServerTypeFn, changeServerVersionFn, updateServerMemoryFn
} from '../../lib/api';
import { SOFTWARE_TYPES } from '../../lib/constants';
import { isViaVersion } from '../../lib/utils';
import ImageUploader from '../ImageUploader';
import DifficultyControl from './DifficultyControl';
import OpsEditor from './OpsEditor';
import WhitelistEditor from './WhitelistEditor';

export default function SettingsTab({ server, onDelete, updateServer, t, mcVersions, versionMatrix = {} }) {
  // Version list filtered to what THIS server's software type actually supports.
  const typeVersions = (versionMatrix[server.software] && versionMatrix[server.software].length)
    ? versionMatrix[server.software]
    : mcVersions;
  const applyServerProperty = async (field, value) => {
    try {
      const res = await updateServerPropertiesFn({ serverId: server.id, properties: { [field]: value } });
      if (!res.data?.success) throw new Error(res.data?.error || 'שגיאה לא ידועה');
    } catch(e) {
      console.error('updateServerProperties error:', e);
      alert(`שגיאה בעדכון הגדרות: ${e.message}`);
    }
  };

  const [versionSaving, setVersionSaving] = React.useState(false);
  const [typeSaving, setTypeSaving] = React.useState(false);

  // Software types the user may switch TO from Settings. forge/neoforge/vanilla
  // are intentionally excluded — the manager-api rejects them (no reliable
  // Velocity modern-forwarding mod → unjoinable server).
  const CHANGEABLE_TYPES = ['paper', 'purpur', 'folia', 'mohist', 'fabric'];
  const changeableSoftware = SOFTWARE_TYPES.filter(sw => CHANGEABLE_TYPES.includes(sw.id));
  const BUKKIT_FAMILY = ['paper', 'purpur', 'folia', 'mohist'];
  const isCrossFamily = (a, b) =>
    (BUKKIT_FAMILY.includes(a) && b === 'fabric') ||
    (a === 'fabric' && BUKKIT_FAMILY.includes(b));

  // Real software/type change: swaps the jar AND rewrites the Velocity
  // forwarding config for the target family on the VPS, then restarts.
  const handleTypeChange = async (newType) => {
    const prevType = server.software;
    const prevVersion = server.version;
    if (!newType || newType === prevType) return;

    // Pick a version valid for the target type (newest from the matrix).
    const targetList = (versionMatrix[newType] && versionMatrix[newType].length)
      ? versionMatrix[newType]
      : (mcVersions || []);
    const newVersion = (targetList.includes(prevVersion)) ? prevVersion : (targetList[0] || prevVersion);

    const newName = (SOFTWARE_TYPES.find(s => s.id === newType) || {}).name || newType;
    let warn = `שינוי סוג השרת ל-${newName} יבצע את הפעולות הבאות:\n` +
      `• השרת יופעל מחדש (downtime קצר).\n` +
      `• גרסת השרת תיקבע ל-${newVersion}.\n`;
    if (isCrossFamily(prevType, newType)) {
      warn += `• ⚠️ הפלאגינים/מודים הקיימים לא יעברו! מעבר בין Bukkit (paper/purpur/folia/mohist) ל-Fabric (מודים) הוא מעבר משפחה — תצטרך להתקין מחדש את התוספות המתאימות לסוג החדש.\n`;
    }
    if (newType === 'fabric') {
      warn += `• יותקן אוטומטית FabricProxy-Lite (נדרש כדי שהשחקנים יוכלו להתחבר דרך הפרוקסי שלנו).\n`;
    }
    warn += `\nהעולם (world) לא ייפגע. להמשיך?`;
    if (!window.confirm(warn)) return;

    setTypeSaving(true);
    updateServer({ software: newType, version: newVersion }); // optimistic
    try {
      const res = await changeServerTypeFn({ serverId: server.id, type: newType, version: newVersion });
      if (!res.data?.success) throw new Error(res.data?.error || 'שינוי סוג השרת נכשל');
    } catch (e) {
      console.error('changeServerType error:', e);
      updateServer({ software: prevType, version: prevVersion }); // rollback
      alert(`שגיאה בשינוי סוג השרת: ${e.message}`);
    } finally {
      setTypeSaving(false);
    }
  };

  // Real version change: swaps the jar on the VPS and restarts the server.
  const handleVersionChange = async (newVersion) => {
    const prevVersion = server.version;
    if (!newVersion || newVersion === prevVersion) return;
    if (!window.confirm('שינוי גרסה יוריד גרסה חדשה ויפעיל מחדש את השרת. להמשיך?')) return;
    setVersionSaving(true);
    updateServer({ version: newVersion }); // optimistic
    try {
      const res = await changeServerVersionFn({ serverId: server.id, version: newVersion, type: server.software });
      if (!res.data?.success) throw new Error(res.data?.error || 'שינוי הגרסה נכשל');
    } catch (e) {
      console.error('changeServerVersion error:', e);
      updateServer({ version: prevVersion }); // rollback
      alert(`שגיאה בשינוי הגרסה: ${e.message}`);
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
      if (!res.data?.success) throw new Error(res.data?.error || 'עדכון ה-RAM נכשל');
    } catch (e) {
      console.error('updateServerMemory error:', e);
      updateServer({ memoryMb: prev }); // rollback
      alert(`שגיאה בעדכון ה-RAM: ${e.message}`);
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
                     alert(`שגיאה בעדכון הלוגו: ${e.message}`);
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
              {typeSaving && <span className="text-xs text-zinc-500 animate-pulse">מחליף סוג שרת...</span>}
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
              שינוי הסוג מפעיל מחדש את השרת. מעבר בין Bukkit (paper/purpur/folia/mohist) ל-Fabric לא מעביר את הפלאגינים/מודים.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1 flex items-center gap-2">
                {t('version')}
                {versionSaving && <span className="text-xs text-zinc-500 animate-pulse">מחליף גרסה...</span>}
              </label>
              <select value={server.version} disabled={versionSaving} onChange={(e) => handleVersionChange(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600 disabled:opacity-50">
                {typeVersions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <p className="text-xs text-blue-400 mt-1">
                💡 ViaVersion מותקן אצלנו — שחקנים מ<b>כל</b> גרסה (כולל 26.x) מתחברים לשרת הזה.
              </p>
              {isViaVersion(server.version) && (
                <p className="text-xs text-zinc-500 mt-1">
                  זו גרסה חדשה מ-Paper — כאן יש תוכן {server.version} מלא (לתוכן 26.x בחר Purpur/Fabric).
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
              <p className="text-xs text-zinc-500 mt-1">נכנס לתוקף בהפעלה הבאה (מקסימום כולל ~12000MB לכל השרתים)</p>
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
                alert(`שגיאה בשינוי פרטיות השרת: ${e.message}`);
              }
            }}
            className={`flex items-center justify-between rounded-xl p-4 cursor-pointer border transition-all ${server.isPrivate ? 'bg-yellow-500/10 border-yellow-500/40' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${server.isPrivate ? 'bg-yellow-500/20' : 'bg-zinc-800'}`}>
                <Shield size={18} className={server.isPrivate ? 'text-yellow-400' : 'text-zinc-500'} />
              </div>
              <div>
                <p className={`font-bold text-sm ${server.isPrivate ? 'text-yellow-400' : 'text-zinc-300'}`}>{server.isPrivate ? 'שרת פרטי' : 'שרת ציבורי'}</p>
                <p className="text-xs text-zinc-500">{server.isPrivate ? 'רק שחקנים ב-Whitelist יוכלו להתחבר' : 'כל שחקן יכול להתחבר'}</p>
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors relative ${server.isPrivate ? 'bg-yellow-500' : 'bg-zinc-700'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${server.isPrivate ? 'left-6' : 'left-1'}`} />
            </div>
          </div>

          <OpsEditor server={server} updateServer={updateServer} />

          {/* Whitelist players — only shown when server is private */}
          {server.isPrivate && (
            <WhitelistEditor server={server} updateServer={updateServer} />
          )}

          <div>
            <label className="block text-sm text-zinc-400 mb-1 flex items-center gap-2"><MessageCircle size={16} className="text-indigo-400" /> {t('discordWebhook')} <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full">בקרוב</span></label>
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
