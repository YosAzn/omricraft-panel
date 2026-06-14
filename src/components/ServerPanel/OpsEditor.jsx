import React from 'react';
import { updateServerOpsFn } from '../../lib/api';

export default function OpsEditor({ server, updateServer }) {
  const [opsText, setOpsText] = React.useState((server.ops || []).join(', '));
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const handleSave = async () => {
    const ops = opsText.split(',').map(o => o.trim()).filter(Boolean);
    setSaving(true);
    setSaved(false);
    updateServer({ ops });
    try {
      const res = await updateServerOpsFn({ serverId: server.id, ops });
      if (!res.data?.success) throw new Error(res.data?.error || 'Ops update failed');
    } catch(e) {
      console.error('updateServerOps error:', e);
      setSaved(false);
      alert(`שגיאה בעדכון OPs: ${e.message}`);
      return;
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <label className="block text-sm text-zinc-400 mb-1">שחקני OP (מנהלים)</label>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Omri, Notch, Steve"
          value={opsText}
          onChange={e => { setOpsText(e.target.value); setSaved(false); }}
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600 text-sm"
        />
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 rounded-lg text-sm font-bold transition-colors bg-green-600 hover:bg-green-500 text-white disabled:opacity-50 whitespace-nowrap"
        >
          {saving ? '...' : saved ? '✓ נשמר' : 'החל בשרת'}
        </button>
      </div>
      <p className="text-xs text-zinc-500 mt-1">הפרד בפסיקים. לוחץ "החל בשרת" כותב ops.json ושולח RCON</p>
    </div>
  );
}
