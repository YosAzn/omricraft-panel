import React, { useState } from 'react';
import { Shield, X } from 'lucide-react';
import { updateWhitelistPlayersFn } from '../../lib/api';

export default function WhitelistEditor({ server, updateServer }) {
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const players = server.whitelistPlayers || [];

  const addPlayer = async () => {
    const name = input.trim();
    if (!name || players.includes(name)) { setInput(''); return; }
    const newList = [...players, name];
    setInput('');
    updateServer({ whitelistPlayers: newList });
    setSaving(true);
    try {
      await updateWhitelistPlayersFn({ serverId: server.id, players: newList });
    } catch(e) {
      console.error('updateWhitelistPlayers error:', e);
      updateServer({ whitelistPlayers: players }); // rollback — remove the player we just added
      alert(`שגיאה בהוספת שחקן ל-Whitelist: ${e.message}`);
    }
    setSaving(false);
  };

  const removePlayer = async (name) => {
    const newList = players.filter(p => p !== name);
    updateServer({ whitelistPlayers: newList });
    setSaving(true);
    try {
      await updateWhitelistPlayersFn({ serverId: server.id, players: newList });
    } catch(e) {
      console.error('updateWhitelistPlayers error:', e);
      updateServer({ whitelistPlayers: players }); // rollback — re-add the player we just removed
      alert(`שגיאה בהסרת שחקן מה-Whitelist: ${e.message}`);
    }
    setSaving(false);
  };

  return (
    <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Shield size={16} className="text-yellow-400" />
        <span className="text-sm font-bold text-yellow-400">ניהול Whitelist</span>
        {saving && <span className="text-xs text-zinc-500 animate-pulse">שומר...</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="הכנס שם שחקן..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addPlayer()}
          className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-yellow-500 transition-all"
          dir="ltr"
        />
        <button onClick={addPlayer} className="px-3 py-2 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 rounded-lg text-sm font-bold transition-colors">
          הוסף
        </button>
      </div>
      {players.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {players.map(p => (
            <div key={p} className="flex items-center gap-1.5 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm" dir="ltr">
              <span className="text-zinc-200">{p}</span>
              <button onClick={() => removePlayer(p)} className="text-zinc-500 hover:text-red-400 transition-colors ml-1">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-zinc-500">אין שחקנים ב-Whitelist — אף אחד לא יוכל להתחבר (מלבד OPs)</p>
      )}
    </div>
  );
}
