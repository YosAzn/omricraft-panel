import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, Wrench, RefreshCw, Archive, X } from 'lucide-react';
import { resetServerStatusFn, removeDatapackFn, restartServerFn, archiveIncompatibleFilesFn, dismissDiagnosticFn } from '../lib/api';
import { equivalentForFile } from '../lib/constants';

// --- Shared single-issue row for the חמ"ל / War Room ---
// Used by BOTH HealthTab (the dedicated admin tab) and the Dashboard summary
// panel so the issue display + fix logic stay identical and aren't duplicated.
//
// Flow per fix: A (this button) → B fix Cloud Function (reset-status / restart /
// remove-datapack — each owner-OR-admin gated server-side) → C Manager API →
// D VPS. A successful fix calls onFixed() so the parent can re-scan diagnostics.
//
// issue = { serverId, serverName, severity:'error'|'warning'|'info', category,
//           title, detail, suggestion, fix:{action,label,params}|null }

const SEVERITY = {
  error:   { icon: AlertCircle,   ring: 'border-red-500/30',    bg: 'bg-red-500/5',    text: 'text-red-300',    iconColor: 'text-red-400' },
  warning: { icon: AlertTriangle, ring: 'border-amber-500/30',  bg: 'bg-amber-500/5',  text: 'text-amber-300',  iconColor: 'text-amber-400' },
  info:    { icon: Info,          ring: 'border-sky-500/30',     bg: 'bg-sky-500/5',    text: 'text-sky-300',    iconColor: 'text-sky-400' },
};

// Show the owning server's name on the row (used by the flat Dashboard panel,
// which is not grouped by server the way HealthTab is).
export default function HealthIssueRow({ issue, onFixed, showServer = false, t = (k) => k }) {
  const [fixing, setFixing] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const sev = SEVERITY[issue.severity] || SEVERITY.info;
  const SevIcon = sev.icon;

  // Manually HIDE this exact issue (by its content hash issueKey). The backend
  // persists the key under dismissedDiagnostics/{serverId}; getDiagnostics then
  // filters it out on every future scan — so it stays hidden. A genuinely NEW or
  // DIFFERENT problem gets a different issueKey and still appears. After a successful
  // dismiss we re-scan (onFixed) so the row disappears immediately. Orphan issues
  // (orphan-dir, scan-error) carry a key too and can be dismissed the same way.
  const dismiss = async () => {
    if (dismissing || fixing) return;
    if (!issue.issueKey) {
      // Fail loud rather than pretend-succeed: an issue with no key can't be tracked.
      alert('לא ניתן להסתיר תקלה זו (חסר מזהה תוכן).');
      return;
    }
    const ok = window.confirm(
      `להסתיר את ההודעה "${issue.title || ''}" עבור "${issue.serverName || issue.serverId || ''}"?\n` +
      'התקלה תוסתר בסריקות הבאות. אם אותה תקלה תחזור — תישאר מוסתרת; תקלה חדשה/שונה כן תופיע.'
    );
    if (!ok) return;
    setDismissing(true);
    try {
      const res = await dismissDiagnosticFn({ serverId: issue.serverId, issueKey: issue.issueKey });
      const d = res.data || res;
      if (!d.success) throw new Error(d.error || t('commonActionFailed'));
      if (typeof onFixed === 'function') await onFixed();
    } catch (e) {
      console.error('dismiss failed:', e);
      alert(`הסתרת ההודעה נכשלה: ${e.message}`);
    }
    setDismissing(false);
  };

  const applyFix = async () => {
    if (!issue.fix || fixing) return;
    const { action, params } = issue.fix;

    // Destructive fixes require explicit confirmation.
    if (action === 'remove-datapack') {
      const file = params?.file || '';
      const ok = window.confirm(
        t('healthDatapackDeleteConfirm', { file, server: issue.serverName || '' })
      );
      if (!ok) return;
    }

    setFixing(true);
    try {
      let res;
      if (action === 'reset-status') {
        res = await resetServerStatusFn({ serverId: issue.serverId });
      } else if (action === 'restart') {
        res = await restartServerFn({ serverId: issue.serverId });
      } else if (action === 'remove-datapack') {
        res = await removeDatapackFn({ serverId: issue.serverId, file: params?.file });
      } else {
        throw new Error(`${t('healthUnknownAction')}: ${action}`);
      }
      const d = res.data || res;
      if (!d.success) {
        throw new Error(d.error || t('commonActionFailed'));
      }
      if (d.note) alert(d.note);
      // Re-scan so the parent list reflects the fix.
      if (typeof onFixed === 'function') await onFixed();
    } catch (e) {
      console.error('applyFix failed:', e);
      alert(`${t('healthFixFailed')}: ${e.message}`);
    }
    setFixing(false);
  };

  // Remove one specific installed datapack — used by the per-file buttons the
  // diagnostics attaches via issue.removableDatapacks when the log named no file.
  const removeOne = async (file) => {
    if (fixing) return;
    const ok = window.confirm(
      t('healthDatapackDeleteConfirm', { file, server: issue.serverName || '' })
    );
    if (!ok) return;
    setFixing(true);
    try {
      const res = await removeDatapackFn({ serverId: issue.serverId, file });
      const d = res.data || res;
      if (!d.success) throw new Error(d.error || t('commonActionFailed'));
      if (d.note) alert(d.note);
      if (typeof onFixed === 'function') await onFixed();
    } catch (e) {
      console.error('removeOne failed:', e);
      alert(`${t('healthFixFailed')}: ${e.message}`);
    }
    setFixing(false);
  };

  // FIX #6 — Restart-to-apply for datapack-failed issues. Removing a bad datapack
  // .zip from disk does NOT rewrite the historical server LOG, so the diagnostic
  // (which scans the log segment after the last start marker) keeps finding the
  // old parse errors until the server boots fresh. This restarts the server, then
  // re-scans (onFixed): a fresh boot with no such errors clears the issue; a real
  // remaining problem is naturally re-reported by the scan (the "new error").
  const restartToApply = async () => {
    if (fixing) return;
    setFixing(true);
    try {
      const res = await restartServerFn({ serverId: issue.serverId });
      const d = res.data || res;
      if (!d.success) throw new Error(d.error || t('commonActionFailed'));
      if (d.note) alert(d.note);
      // Re-scan AFTER the restart so the panel reflects the current (post-boot)
      // state — the issue clears if resolved, or re-reports if a real problem remains.
      if (typeof onFixed === 'function') await onFixed();
    } catch (e) {
      console.error('restartToApply failed:', e);
      alert(`${t('healthFixFailed')}: ${e.message}`);
    }
    setFixing(false);
  };

  // Phase 6b — REVERSIBLE archive of cross-family leftover jars (plugins/ on a mod
  // core, mods/ on a plugin core) after a TYPE switch. The backend decides which dir
  // and MOVES the jars to disabled-*/ (not deleted), so no file path is sent here.
  const archiveIncompatible = async () => {
    if (fixing) return;
    const kind = issue.incompatibleKind || '';
    const ok = window.confirm(
      t('healthArchiveConfirm').replace('{server}', issue.serverName || issue.serverId || '').replace('{kind}', kind)
    );
    if (!ok) return;
    setFixing(true);
    try {
      const res = await archiveIncompatibleFilesFn({ serverId: issue.serverId });
      const d = res.data || res;
      if (!d.success) throw new Error(d.error || t('commonActionFailed'));
      if (d.note) alert(d.note);
      if (typeof onFixed === 'function') await onFixed();
    } catch (e) {
      console.error('archiveIncompatible failed:', e);
      alert(`${t('healthFixFailed')}: ${e.message}`);
    }
    setFixing(false);
  };

  // For cross-family-files issues: pair each leftover file with a known compatible
  // equivalent (if any) so we can show an informational re-install hint per file.
  const equivalents = (issue.category === 'cross-family-files' && Array.isArray(issue.incompatibleFiles))
    ? issue.incompatibleFiles
        .map((file) => ({ file, equiv: equivalentForFile(file) }))
        .filter((e) => e.equiv)
    : [];

  return (
    <div className={`relative border ${sev.ring} ${sev.bg} rounded-xl p-4`}>
      {/* Manual dismiss ("סגור") — hides THIS exact issue across future scans. Always
          available (even for issues with no auto-fix). Positioned top-start (RTL) so
          it never overlaps the fix buttons on the top-end side. */}
      <button
        onClick={dismiss}
        disabled={dismissing || fixing}
        title="הסתר הודעה זו"
        aria-label="הסתר הודעה זו"
        className="absolute top-2 start-2 text-zinc-500 hover:text-zinc-200 disabled:opacity-40 transition-colors"
      >
        {dismissing ? <RefreshCw size={14} className="animate-spin" /> : <X size={16} />}
      </button>
      <div className="flex items-start gap-3 ps-6">
        <SevIcon size={18} className={`${sev.iconColor} flex-shrink-0 mt-0.5`} />
        <div className="min-w-0 flex-1">
          <div className={`font-bold ${sev.text}`}>
            {issue.title}
            {showServer && issue.serverName && (
              <span className="text-zinc-500 text-xs font-normal ms-2">
                · {issue.serverName}
                {issue.serverSlug && issue.serverSlug !== issue.serverName && (
                  <span className="text-zinc-600"> ({issue.serverSlug})</span>
                )}
              </span>
            )}
          </div>
          {issue.detail && <div className="text-sm text-zinc-300 mt-1">{issue.detail}</div>}
          {issue.suggestion && (
            <div className="text-xs text-zinc-500 mt-1.5">💡 {issue.suggestion}</div>
          )}
          {/* FIX #6 — remove+restart sequence hint (log only refreshes on boot). */}
          {issue.category === 'datapack-failed' && (
            <div className="text-xs text-amber-300/80 mt-1.5">🔄 {t('healthDatapackRestartHint')}</div>
          )}
          {/* Phase 6b — per-file compatible-equivalent hints (informational; the
              user installs the equivalent as a normal catalog action). */}
          {equivalents.map(({ file, equiv }) => (
            <div key={file} className="text-xs text-emerald-300/80 mt-1.5">
              {t('healthEquivalentNote').replace('{name}', file).replace('{equiv}', equiv)}
            </div>
          ))}
        </div>
        {(issue.fix
          || (issue.removableDatapacks && issue.removableDatapacks.length > 0)
          || issue.category === 'datapack-failed'
          || issue.category === 'cross-family-files') && (
          <div className="flex flex-col gap-1.5 flex-shrink-0">
            {issue.category === 'cross-family-files' && (
              <button
                onClick={archiveIncompatible}
                disabled={fixing}
                className="bg-zinc-800 hover:bg-amber-600 text-zinc-200 hover:text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {fixing ? <RefreshCw size={14} className="animate-spin" /> : <Archive size={14} />}
                {t('healthArchiveIncompatible')}
              </button>
            )}
            {issue.fix && (
              <button
                onClick={applyFix}
                disabled={fixing}
                className="bg-zinc-800 hover:bg-rose-600 text-zinc-200 hover:text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {fixing ? <RefreshCw size={14} className="animate-spin" /> : <Wrench size={14} />}
                {issue.fix.label}
              </button>
            )}
            {(issue.removableDatapacks || []).map((file) => (
              <button
                key={file}
                onClick={() => removeOne(file)}
                disabled={fixing}
                title={file}
                className="bg-zinc-800 hover:bg-rose-600 text-zinc-200 hover:text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {fixing ? <RefreshCw size={14} className="animate-spin" /> : <Wrench size={14} />}
                <span className="max-w-[150px] truncate">{t('commonRemove')} {file}</span>
              </button>
            ))}
            {/* FIX #6 — restart-to-apply: shown on datapack-failed rows AFTER the
                per-file remove buttons. Removing the .zip doesn't rewrite the log,
                so a fresh boot is what actually clears the diagnostic. */}
            {issue.category === 'datapack-failed' && (
              <button
                onClick={restartToApply}
                disabled={fixing}
                className="bg-zinc-800 hover:bg-emerald-600 text-zinc-200 hover:text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw size={14} className={fixing ? 'animate-spin' : ''} />
                {t('healthRestartToApply')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
