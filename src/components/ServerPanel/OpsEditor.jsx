import React from 'react';
import { updateServerOpsFn } from '../../lib/api';

export default function OpsEditor({ server, updateServer, t = (k) => k }) {
  const [opsText, setOpsText] = React.useState((server.ops || []).join(', '));
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const handleSave = async () => {
    const ops = opsText.split(',').map(o => o.trim()).filter(Boolean);
    const prevOps = server.ops || [];
    setSaving(true);
    setSaved(false);
    updateServer({ ops }); // optimistic
    try {
      const res = await updateServerOpsFn({ serverId: server.id, ops });
      if (!res.data?.success) throw new Error(res.data?.error || 'Ops update failed');
    } catch(e) {
      console.error('updateServerOps error:', e);
      setSaved(false);
      updateServer({ ops: prevOps }); // rollback — keep Firestore/VPS in sync
      setSaving(false); // was stuck before: return left saving=true → button disabled forever
      alert(`${t('opsUpdateError')}: ${e.message}`);
      return;
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <label className="block text-sm text-zinc-400 mb-1">{t('opsLabel')}</label>
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
          {saving ? '...' : saved ? t('commonSaved') : t('opsApply')}
        </button>
      </div>
      <p className="text-xs text-zinc-500 mt-1">{t('opsHint')}</p>
    </div>
  );
}
