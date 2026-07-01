import React, { useState, useCallback, useEffect } from 'react';
import {
  Trash2, ChevronDown, RefreshCw, RotateCcw, Flame, Server, AlertTriangle, Clock,
} from 'lucide-react';
import { listServerBackupsFn, restoreServerFn, purgeBackupFn } from '../lib/api';

const DAY_MS = 86400000;

// Human-readable byte size (B/KB/MB/GB). Unknown/0 → '—'.
function humanSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

// Coerce a manifest timestamp (epoch ms, epoch s, or ISO string) to epoch-ms, or null.
function toMs(ts) {
  if (ts == null) return null;
  if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts; // seconds → ms heuristic
  const parsed = Date.parse(ts);
  return Number.isNaN(parsed) ? null : parsed;
}

// One recycle-bin entry. Restore + purge are per-row; both re-scan the list on success.
function BackupRow({ m, onRestore, onPurge, restoring, purging, t }) {
  const deletedMs = toMs(m.deletedAt);
  const purgeMs = toMs(m.purgeAt);
  const now = Date.now();

  // "deleted X days ago"
  const deletedDays = deletedMs != null ? Math.max(0, Math.floor((now - deletedMs) / DAY_MS)) : null;
  const deletedLabel = deletedDays == null ? ''
    : deletedDays === 0 ? t('binDeletedToday')
    : t('binDeletedAgo').replace('{days}', deletedDays);

  // countdown to purge — amber as it nears, red on the last day / expired.
  const daysLeft = purgeMs != null ? Math.ceil((purgeMs - now) / DAY_MS) : null;
  let countdownLabel = '';
  let countdownClass = 'text-zinc-400';
  if (daysLeft != null) {
    if (daysLeft <= 0) { countdownLabel = t('binExpired'); countdownClass = 'text-red-400'; }
    else if (daysLeft === 1) { countdownLabel = t('binRestoreLastDay'); countdownClass = 'text-red-400'; }
    else { countdownLabel = t('binRestoreDays').replace('{days}', daysLeft); countdownClass = daysLeft <= 7 ? 'text-amber-400' : 'text-zinc-400'; }
  }

  const busy = restoring || purging;
  const name = m.name || m.slug || m.serverId || '—';

  return (
    <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="w-9 h-9 flex-shrink-0 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center">
        <Server size={16} className="text-zinc-500" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-zinc-100 truncate" title={name}>{name}</span>
          {m.slug && <span className="text-[11px] text-zinc-500 font-mono truncate" dir="ltr">/{m.slug}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 mt-0.5">
          {(m.type || m.version) && (
            <span dir="ltr" className="text-zinc-400">{[m.type, m.version].filter(Boolean).join(' ')}</span>
          )}
          {deletedLabel && <span>{deletedLabel}</span>}
          {countdownLabel && (
            <span className={`flex items-center gap-1 font-bold ${countdownClass}`}>
              <Clock size={11} /> {countdownLabel}
            </span>
          )}
          <span>{humanSize(m.sizeBytes)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onRestore(m)}
          disabled={busy || (daysLeft != null && daysLeft <= 0)}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
        >
          {restoring ? <RefreshCw size={13} className="animate-spin" /> : <RotateCcw size={13} />}
          {restoring ? t('binRestoring') : t('binRestore')}
        </button>
        <button
          onClick={() => onPurge(m)}
          disabled={busy}
          className="bg-transparent hover:bg-red-950/40 disabled:opacity-40 text-red-500/70 hover:text-red-400 border border-red-900/40 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
        >
          {purging ? <RefreshCw size={13} className="animate-spin" /> : <Flame size={13} />}
          {t('binPurge')}
        </button>
      </div>
    </div>
  );
}

// Recycle-bin collapsible — mirrors the Dashboard Health/Requests accordion.
// COLLAPSED by default; renders ONLY when there is at least one backup. Loads via
// listServerBackupsFn on mount (so the header count is accurate) and re-scans after
// every restore/purge. Restore is admin-gated server-side; a non-admin with no
// backups simply never sees the section. `onRestored` lets App.jsx refresh state.
export default function RecycleBin({ t, onRestored }) {
  const [open, setOpen] = useState(false);
  const [backups, setBackups] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [restoringId, setRestoringId] = useState(null); // archiveFile currently restoring
  const [purgingId, setPurgingId] = useState(null);      // archiveFile currently purging

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listServerBackupsFn();
      const d = res?.data || res;
      if (!d || d.success !== true) throw new Error(d?.error || 'list-backups failed');
      setBackups(Array.isArray(d.backups) ? d.backups : []);
    } catch (e) {
      console.error('RecycleBin listServerBackups failed:', e);
      setError(e?.message || String(e));
      setBackups([]);
    }
    setLoading(false);
  }, []);

  // Load once on mount so the header count is correct even while collapsed.
  useEffect(() => { load(); }, [load]);

  const handleRestore = useCallback(async (m) => {
    const archiveFile = m.archiveFile;
    const serverId = m.serverId;
    if (!serverId && !archiveFile) return;
    setRestoringId(archiveFile || serverId);
    try {
      // Prefer the explicit archive (backupId) so the exact tarball is restored.
      const payload = archiveFile ? { backupId: archiveFile } : { serverId };
      const res = await restoreServerFn(payload);
      const d = res?.data || res;
      if (!d || d.success !== true) throw new Error(d?.error || 'restore failed');
      alert(t('binRestored').replace('{name}', m.name || m.slug || serverId || ''));
      if (typeof onRestored === 'function') onRestored(d);
      await load(); // re-scan (the archive itself is NOT deleted, but state changed)
    } catch (e) {
      console.error('RecycleBin restore failed:', e);
      alert(t('binRestoreFailed').replace('{error}', e?.message || String(e)));
    }
    setRestoringId(null);
  }, [load, onRestored, t]);

  const handlePurge = useCallback(async (m) => {
    const archiveFile = m.archiveFile;
    if (!archiveFile) return;
    if (!window.confirm(t('binPurgeConfirm').replace('{name}', m.name || m.slug || m.serverId || ''))) return;
    setPurgingId(archiveFile);
    try {
      const res = await purgeBackupFn({ archiveFile });
      const d = res?.data || res;
      if (!d || d.success !== true) throw new Error(d?.error || 'purge failed');
      // Optimistically drop the row, then re-scan to stay authoritative.
      setBackups((prev) => (Array.isArray(prev) ? prev.filter((x) => x.archiveFile !== archiveFile) : prev));
      await load();
    } catch (e) {
      console.error('RecycleBin purge failed:', e);
      alert(t('binPurgeFailed').replace('{error}', e?.message || String(e)));
    }
    setPurgingId(null);
  }, [load, t]);

  const count = Array.isArray(backups) ? backups.length : 0;

  // Hide the whole section entirely when there is nothing to show (and no error /
  // not still loading the first fetch). Matches "shown ONLY when there are backups".
  if (backups !== null && count === 0 && !error && !loading) return null;
  // First load in flight and nothing known yet → stay hidden (no empty flash).
  if (backups === null && loading) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl">
      <div className="flex items-center justify-between p-4">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 min-w-0 flex-1 text-start"
          aria-expanded={open}
        >
          <ChevronDown size={16} className={`text-zinc-400 flex-shrink-0 transition-transform ${open ? '' : '-rotate-90 rtl:rotate-90'}`} />
          <Trash2 size={16} className="flex-shrink-0 text-zinc-400" />
          <span className="text-sm font-bold text-zinc-300">🗑️ {t('binTitle')}</span>
          <span className="text-[11px] font-bold text-zinc-400 flex-shrink-0">·</span>
          <span className="text-[11px] font-bold rounded-full px-2 py-0.5 flex-shrink-0 whitespace-nowrap text-zinc-300 bg-zinc-800 border border-zinc-700">
            {count}
          </span>
        </button>
        {open && (
          <button
            onClick={load}
            disabled={loading}
            className="text-xs font-bold text-zinc-400 hover:text-zinc-200 flex items-center gap-1 transition-colors flex-shrink-0 disabled:opacity-40"
            title={t('healthRefresh')}
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        )}
      </div>
      {open && (
        <div className="px-4 pb-4">
          {loading && (!backups || backups.length === 0) ? (
            <div className="text-zinc-500 text-sm flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> {t('binLoading')}</div>
          ) : error ? (
            <div className="text-red-400 text-sm flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-400" /> {t('binError')}: {error}
            </div>
          ) : count === 0 ? (
            <div className="text-zinc-500 text-sm">{t('binEmpty')}</div>
          ) : (
            <div className="space-y-2 max-h-[45vh] overflow-y-auto">
              {backups.map((m) => (
                <BackupRow
                  key={m.archiveFile || m.manifestFile || `${m.serverId}:${m.deletedAt}`}
                  m={m}
                  onRestore={handleRestore}
                  onPurge={handlePurge}
                  restoring={restoringId === (m.archiveFile || m.serverId)}
                  purging={purgingId === m.archiveFile}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
