import React from 'react';
import { changeDifficultyFn } from '../../lib/api';

export default function DifficultyControl({ server, updateServer, t }) {
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const handleChange = async (newDifficulty) => {
    setSaving(true); setSaved(false);
    updateServer({ difficulty: newDifficulty });
    try {
      await changeDifficultyFn({ serverId: server.id, difficulty: newDifficulty });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error('changeDifficulty error', e);
    }
    setSaving(false);
  };

  const current = server.difficulty || 'normal';
  const options = [
    { value: 'peaceful', color: 'bg-green-500/20 border-green-500 text-green-400' },
    { value: 'easy',     color: 'bg-blue-500/20 border-blue-500 text-blue-400' },
    { value: 'normal',   color: 'bg-yellow-500/20 border-yellow-500 text-yellow-400' },
    { value: 'hard',     color: 'bg-red-500/20 border-red-500 text-red-400' },
  ];

  return (
    <div>
      <label className="block text-sm text-zinc-400 mb-2 flex items-center gap-2">
        {t('difficulty')}
        {saving && <span className="text-xs text-zinc-500 animate-pulse">שומר...</span>}
        {saved && <span className="text-xs text-green-400">✓ נשמר</span>}
      </label>
      <div className="flex gap-2 flex-wrap">
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            disabled={saving}
            onClick={() => handleChange(opt.value)}
            className={`px-4 py-2 rounded-lg border font-bold text-sm transition-all disabled:opacity-50 ${
              current === opt.value ? opt.color : 'bg-zinc-950 border-zinc-700 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            {t(opt.value)}
          </button>
        ))}
      </div>
      <p className="text-xs text-zinc-500 mt-1">מעדכן את server.properties ושולח פקודה RCON לשרת פעיל</p>
    </div>
  );
}
