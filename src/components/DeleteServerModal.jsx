import React, { useEffect } from 'react';
import { Trash2, Flame, X, MonitorSmartphone } from 'lucide-react';

// Delete-confirmation dialog (replaces the plain window.confirm on server delete).
// Two clearly-ranked actions:
//   [מחק (עם גיבוי)]  → onConfirm(false)  (SOFT delete: 30-day VPS backup, restorable)
//   [🔥 מחק לצמיתות]   → onConfirm(true)   (PERMANENT: no backup — guarded by a second window.confirm)
// For a MOD/modpack server (mod-family core) we add a line noting the client-side
// mods/modpack are untouched. App.jsx owns the state + the actual deleteServerFn call;
// this component is presentational (name + isModServer + callbacks only).
export default function DeleteServerModal({ open, name, isModServer, busy, onConfirm, onCancel, t }) {
  // Close on Escape (only when not mid-delete) — matches native-dialog affordance.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const displayName = name || '';
  const softLine = t('delModalSoftLine').replace('{name}', displayName);

  // The permanent action gets an EXTRA confirm before it fires (no backup = irreversible).
  const handlePermanent = () => {
    if (busy) return;
    if (window.confirm(t('delModalPermConfirm').replace('{name}', displayName))) {
      onConfirm(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => { if (!busy) onCancel(); }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <h3 className="text-lg font-bold flex items-center gap-2 text-red-400">
            <Trash2 size={20} /> {t('delModalTitle')}
          </h3>
          <button
            onClick={() => { if (!busy) onCancel(); }}
            disabled={busy}
            className="text-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-30"
            aria-label={t('delModalCancel')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-3">
          <p className="text-sm text-zinc-200 leading-relaxed">🗑️ {softLine}</p>
          {isModServer && (
            <p className="text-xs text-sky-300/90 bg-sky-500/10 border border-sky-500/20 rounded-lg px-3 py-2 flex items-start gap-2 leading-relaxed">
              <MonitorSmartphone size={15} className="flex-shrink-0 mt-0.5 text-sky-400" />
              <span>{t('delModalModNote')}</span>
            </p>
          )}
        </div>

        {/* Actions — SOFT is primary; PERMANENT is clearly secondary (muted, below). */}
        <div className="p-5 pt-0 space-y-2">
          <button
            onClick={() => { if (!busy) onConfirm(false); }}
            disabled={busy}
            className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Trash2 size={16} /> {t('delModalSoftBtn')}
          </button>
          <button
            onClick={handlePermanent}
            disabled={busy}
            className="w-full bg-transparent hover:bg-red-950/40 disabled:opacity-50 text-red-500/70 hover:text-red-400 border border-red-900/40 px-4 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <Flame size={14} /> {t('delModalPermBtn')}
          </button>
          <button
            onClick={() => { if (!busy) onCancel(); }}
            disabled={busy}
            className="w-full text-zinc-400 hover:text-zinc-200 disabled:opacity-30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {t('delModalCancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
