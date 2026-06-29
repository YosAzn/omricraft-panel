import React, { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getDiagnosticsFn } from '../lib/api';
import HealthIssueRow from './HealthIssueRow';

// --- War Room / חמ"ל — health diagnostics (available to ALL signed-in users) ---
// Flow: A (this component) → B getDiagnostics Cloud Function (auth-required,
// SCOPED to the caller's servers) → C Manager API GET /diagnostics → D VPS scan →
// E (fix actions over RCON/files). Non-admins only ever see issues for servers
// they own (or legacy/unowned servers); the function enforces this regardless of
// the requested scope. Admins additionally get a "mine / all" toggle.
// All diagnostic text (title/detail/suggestion) arrives pre-translated from the
// backend in Hebrew; this component only renders + wires the fix buttons.
//
// issue = { serverId, serverName, severity:'error'|'warning'|'info', category,
//           title, detail, suggestion, fix:{action,label,params}|null }
// The single-issue row + fix-button wiring lives in the shared <HealthIssueRow>,
// reused by the Dashboard summary panel so both stay identical.

export default function HealthTab({ t = (k) => k, isAdmin = false }) {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [hasScanned, setHasScanned] = useState(false);
  // Admin-only mine/all toggle. Non-admins are always forced to 'mine' (the
  // function ignores 'all' for them anyway). Default = 'mine' for everyone.
  const [scope, setScope] = useState('mine');

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    setScanError(null);
    // Only admins may request the full 'all' set; everyone else is scoped to 'mine'.
    const effectiveScope = isAdmin ? scope : 'mine';
    try {
      const res = await getDiagnosticsFn({ scope: effectiveScope });
      const d = res.data || res;
      if (d.success) {
        setIssues(Array.isArray(d.issues) ? d.issues : []);
      } else {
        setScanError(d.error || t('healthScanFailed'));
      }
    } catch (e) {
      console.error('getDiagnostics failed:', e);
      setScanError(e.message || t('healthScanFailed'));
    }
    setLoading(false);
    setHasScanned(true);
  }, [isAdmin, scope, t]);

  useEffect(() => {
    loadDiagnostics();
  }, [loadDiagnostics]);

  // Group issues by server for readable display.
  const groups = {};
  issues.forEach((iss) => {
    const k = iss.serverId || '—';
    if (!groups[k]) groups[k] = { serverName: iss.serverName || k, serverSlug: iss.serverSlug || null, items: [] };
    groups[k].items.push(iss);
  });
  const groupKeys = Object.keys(groups);

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  return (
    <div className="max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="bg-rose-600/15 p-2 rounded-lg">
            <Activity size={22} className="text-rose-400" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">{t('healthTitle')}</h2>
            <p className="text-xs text-zinc-500">
              {isAdmin && scope === 'all' ? t('healthSubtitleAll') : t('healthSubtitleMine')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Admin-only: flip the getDiagnostics scope between own servers and all. */}
          {isAdmin && (
            <div className="inline-flex rounded-lg bg-zinc-900 border border-zinc-800 p-0.5 text-xs font-bold">
              <button
                onClick={() => setScope('mine')}
                disabled={loading}
                className={`px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 ${scope === 'mine' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {t('healthScopeMine')}
              </button>
              <button
                onClick={() => setScope('all')}
                disabled={loading}
                className={`px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 ${scope === 'all' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                {t('healthScopeAll')}
              </button>
            </div>
          )}
          <button
            onClick={loadDiagnostics}
            disabled={loading}
            className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {t('healthRefresh')}
          </button>
        </div>
      </div>

      {/* Summary counters */}
      {hasScanned && !scanError && issues.length > 0 && (
        <div className="flex items-center gap-2 mb-4 text-xs font-bold">
          {errorCount > 0 && <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-300">🔴 {errorCount} {t('healthErrors')}</span>}
          {warnCount > 0 && <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300">🟠 {warnCount} {t('healthWarnings')}</span>}
          {infoCount > 0 && <span className="px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-300">🔵 {infoCount} {t('healthInfo')}</span>}
        </div>
      )}

      {scanError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-300 rounded-lg p-3 mb-4 text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {scanError}
        </div>
      )}

      {loading && !hasScanned ? (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-10 text-center text-zinc-500">
          <RefreshCw size={28} className="animate-spin mx-auto mb-3 text-zinc-600" />
          {t('healthScanning')}
        </div>
      ) : !scanError && issues.length === 0 && hasScanned ? (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-10 text-center">
          <CheckCircle2 size={36} className="mx-auto mb-3 text-emerald-400" />
          <div className="text-emerald-300 font-bold">{t('healthAllOk')}</div>
        </div>
      ) : (
        /* Scrollable panel — same look as the create-server addon-picker list
           (bg-zinc-950 + bordered + max-height + overflow-y-auto). Keeps a long
           issue list from pushing the page; fix buttons stay reachable inside. */
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 max-h-[60vh] overflow-y-auto space-y-5">
          {groupKeys.map((gk) => (
            <div key={gk}>
              <div className="flex items-center gap-2 mb-2 text-sm font-bold text-zinc-300">
                <span className="w-1.5 h-4 bg-zinc-700 rounded-full" />
                {groups[gk].serverName}
                {groups[gk].serverSlug && groups[gk].serverSlug !== groups[gk].serverName && (
                  <span className="text-teal-500/70 font-mono text-xs" dir="ltr">({groups[gk].serverSlug})</span>
                )}
                <span className="text-zinc-600 font-mono text-xs" dir="ltr">{gk}</span>
              </div>
              <div className="space-y-2">
                {groups[gk].items.map((iss, idx) => (
                  <HealthIssueRow
                    key={`${iss.serverId}:${iss.category}:${idx}`}
                    issue={iss}
                    onFixed={loadDiagnostics}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
