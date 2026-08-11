import React, { useState, useEffect } from 'react';
import { Archive, RotateCcw, Plus, AlertCircle, Clock, RefreshCw } from 'lucide-react';
import { backupServerFn, listBackupsFn, restoreBackupFn, startServerFn } from '../../lib/api';

// --- BACKUPS TAB (real backups via Manager API → VPS) ---
// Backend contract:
//   POST /backup-server   {serverId} -> {success, file, sizeBytes}
//   GET  /list-backups/:id          -> {success, backups:[{name,sizeBytes,mtime}]} (newest-first)
//   POST /restore-backup  {serverId,fileName} -> {success, restartNeeded:true}
// Restore does NOT auto-start; we offer to start the server afterwards.
export default function BackupsTab({ server, t, userRole, syncStatus }) {
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [backingUp, setBackingUp] = useState(false);
  const [restoringFile, setRestoringFile] = useState(null);

  const fmtSize = (n) =>
    n < 1024 ? n + ' B'
    : n < 1048576 ? (n / 1024).toFixed(1) + ' KB'
    : n < 1073741824 ? (n / 1048576).toFixed(1) + ' MB'
    : (n / 1073741824).toFixed(2) + ' GB';

  const fmtDate = (ms) => {
    try { return new Date(ms).toLocaleString(); }
    catch { return String(ms); }
  };

  const loadBackups = async () => {
    setLoading(true); setError(null);
    try {
      const res = await listBackupsFn({ serverId: server.id });
      const d = res.data || res;
      if (d.success) setBackups(Array.isArray(d.backups) ? d.backups : []);
      else setError(d.error || t('backupsListFailed'));
    } catch (e) {
      setError(e.message || t('backupsListFailed'));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id]);

  const handleBackup = async () => {
    if (backingUp) return;
    setBackingUp(true); setError(null);
    try {
      const res = await backupServerFn({ serverId: server.id });
      const d = res.data || res;
      if (!d.success) { alert(`${t('backupFailed')}: ${d.error || ''}`); }
      await loadBackups();
    } catch (e) {
      alert(`${t('backupFailed')}: ${e.message}`);
    }
    setBackingUp(false);
  };

  const handleRestore = async (name) => {
    if (restoringFile) return;
    // Double confirmation — restore destroys the current world.
    if (!window.confirm(t('restoreConfirm1'))) return;
    const typed = window.prompt(t('restoreConfirm2'));
    if (typed === null) return;
    if (typed.trim() !== (server.name || '').trim()) {
      alert(t('restoreNameMismatch'));
      return;
    }
    setRestoringFile(name); setError(null);
    try {
      const res = await restoreBackupFn({ serverId: server.id, fileName: name });
      const d = res.data || res;
      if (!d.success) {
        alert(`${t('restoreFailed')}: ${d.error || ''}`);
        setRestoringFile(null);
        return;
      }
      // Restore stops the server and does not auto-start. Offer a restart.
      if (d.restartNeeded) {
        if (window.confirm(t('restoreDone'))) {
          try {
            await startServerFn({ serverId: server.id });
          } catch (e) {
            alert(`${t('restoreFailed')}: ${e.message}`);
          }
        } else {
          alert(t('restartedNote'));
        }
        if (syncStatus) syncStatus(server.id);
      }
    } catch (e) {
      alert(`${t('restoreFailed')}: ${e.message}`);
    }
    setRestoringFile(null);
  };

  const isAdmin = userRole === 'admin';

  return (
    <div className="h-full flex flex-col animate-in fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold flex items-center gap-2 text-lg">
          <Archive size={20} className="text-zinc-400" /> {t('backupsTab')}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={loadBackups}
            disabled={loading}
            className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
            title={t('backupsTab')}
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {isAdmin && (
            <button
              onClick={handleBackup}
              disabled={backingUp}
              className="bg-crown hover:bg-crown-light text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {backingUp ? <RefreshCw size={16} className="animate-spin" /> : <Plus size={16} />}
              {backingUp ? t('backingUp') : t('backupNow')}
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-500 mb-4">{t('backupHint')}</p>

      {error && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 rounded-lg p-3 mb-4 text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-zinc-600">{t('loadingBackups')}</div>
        ) : backups.length === 0 ? (
          <div className="p-8 text-center text-zinc-600">{t('noBackups')}</div>
        ) : backups.map((b) => (
          <div key={b.name}
            className="flex items-center justify-between p-4 border-b border-zinc-900/50 hover:bg-zinc-900 transition-colors group"
            dir="ltr">
            <div className="flex items-center gap-3 min-w-0">
              <Archive size={20} className="text-blue-400 flex-shrink-0" />
              <div className="min-w-0">
                <div className="font-medium text-zinc-200 truncate">{b.name}</div>
                <div className="text-xs text-zinc-500 flex items-center gap-2 mt-0.5">
                  <Clock size={12} /> {fmtDate(b.mtime)}
                  <span className="text-zinc-700">•</span>
                  {fmtSize(b.sizeBytes)}
                </div>
              </div>
            </div>
            {isAdmin && (
              <button
                onClick={() => handleRestore(b.name)}
                disabled={!!restoringFile}
                title={t('restore')}
                className="bg-zinc-800 hover:bg-yellow-600 text-zinc-300 hover:text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {restoringFile === b.name
                  ? <RefreshCw size={14} className="animate-spin" />
                  : <RotateCcw size={14} />}
                {restoringFile === b.name ? t('restoring') : t('restore')}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
