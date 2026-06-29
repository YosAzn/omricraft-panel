import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, Info, Wrench, RefreshCw } from 'lucide-react';
import { resetServerStatusFn, removeDatapackFn, restartServerFn } from '../lib/api';

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
export default function HealthIssueRow({ issue, onFixed, showServer = false }) {
  const [fixing, setFixing] = useState(false);
  const sev = SEVERITY[issue.severity] || SEVERITY.info;
  const SevIcon = sev.icon;

  const applyFix = async () => {
    if (!issue.fix || fixing) return;
    const { action, params } = issue.fix;

    // Destructive fixes require explicit confirmation.
    if (action === 'remove-datapack') {
      const file = params?.file || '';
      const ok = window.confirm(
        `למחוק את ה-datapack "${file}" מהשרת "${issue.serverName}"?\n\nהקובץ יימחק מתיקיית world/datapacks. לא ניתן לבטל.`
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
        throw new Error(`פעולת תיקון לא מוכרת: ${action}`);
      }
      const d = res.data || res;
      if (!d.success) {
        throw new Error(d.error || 'הפעולה נכשלה');
      }
      if (d.note) alert(d.note);
      // Re-scan so the parent list reflects the fix.
      if (typeof onFixed === 'function') await onFixed();
    } catch (e) {
      console.error('applyFix failed:', e);
      alert(`התיקון נכשל: ${e.message}`);
    }
    setFixing(false);
  };

  return (
    <div className={`border ${sev.ring} ${sev.bg} rounded-xl p-4`}>
      <div className="flex items-start gap-3">
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
        </div>
        {issue.fix && (
          <button
            onClick={applyFix}
            disabled={fixing}
            className="bg-zinc-800 hover:bg-rose-600 text-zinc-200 hover:text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
          >
            {fixing ? <RefreshCw size={14} className="animate-spin" /> : <Wrench size={14} />}
            {issue.fix.label}
          </button>
        )}
      </div>
    </div>
  );
}
