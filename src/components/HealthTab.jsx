import React, { useState, useEffect, useCallback } from 'react';
import { Activity, RefreshCw, AlertCircle, AlertTriangle, Info, Wrench, CheckCircle2 } from 'lucide-react';
import { getDiagnosticsFn, resetServerStatusFn, removeDatapackFn, restartServerFn } from '../lib/api';

// --- War Room / חמ"ל — admin-only health diagnostics ---
// Flow: A (this component) → B getDiagnostics Cloud Function (admin-gated) →
// C Manager API GET /diagnostics → D VPS scan → E (fix actions over RCON/files).
// All diagnostic text (title/detail/suggestion) arrives pre-translated from the
// backend in Hebrew; this component only renders + wires the fix buttons.
//
// issue = { serverId, serverName, severity:'error'|'warning'|'info', category,
//           title, detail, suggestion, fix:{action,label,params}|null }

const SEVERITY = {
  error:   { icon: AlertCircle,   dot: '🔴', ring: 'border-red-500/30',    bg: 'bg-red-500/5',    text: 'text-red-300',    iconColor: 'text-red-400' },
  warning: { icon: AlertTriangle, dot: '🟠', ring: 'border-amber-500/30',  bg: 'bg-amber-500/5',  text: 'text-amber-300',  iconColor: 'text-amber-400' },
  info:    { icon: Info,          dot: '🔵', ring: 'border-sky-500/30',     bg: 'bg-sky-500/5',    text: 'text-sky-300',    iconColor: 'text-sky-400' },
};

export default function HealthTab() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [fixingKey, setFixingKey] = useState(null);
  const [hasScanned, setHasScanned] = useState(false);

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    setScanError(null);
    try {
      const res = await getDiagnosticsFn();
      const d = res.data || res;
      if (d.success) {
        setIssues(Array.isArray(d.issues) ? d.issues : []);
      } else {
        setScanError(d.error || 'סריקת הבריאות נכשלה');
      }
    } catch (e) {
      console.error('getDiagnostics failed:', e);
      setScanError(e.message || 'סריקת הבריאות נכשלה');
    }
    setLoading(false);
    setHasScanned(true);
  }, []);

  useEffect(() => {
    loadDiagnostics();
  }, [loadDiagnostics]);

  const applyFix = async (issue, idx) => {
    if (!issue.fix || fixingKey) return;
    const { action, params } = issue.fix;

    // Destructive fixes require explicit confirmation.
    if (action === 'remove-datapack') {
      const file = params?.file || '';
      const ok = window.confirm(
        `למחוק את ה-datapack "${file}" מהשרת "${issue.serverName}"?\n\nהקובץ יימחק מתיקיית world/datapacks. לא ניתן לבטל.`
      );
      if (!ok) return;
    }

    const key = `${issue.serverId}:${issue.category}:${idx}`;
    setFixingKey(key);
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
      // Re-scan so the list reflects the fix.
      await loadDiagnostics();
    } catch (e) {
      console.error('applyFix failed:', e);
      alert(`התיקון נכשל: ${e.message}`);
    }
    setFixingKey(null);
  };

  // Group issues by server for readable display.
  const groups = {};
  issues.forEach((iss) => {
    const k = iss.serverId || '—';
    if (!groups[k]) groups[k] = { serverName: iss.serverName || k, items: [] };
    groups[k].items.push(iss);
  });
  const groupKeys = Object.keys(groups);

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warnCount = issues.filter((i) => i.severity === 'warning').length;
  const infoCount = issues.filter((i) => i.severity === 'info').length;

  return (
    <div className="max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-rose-600/15 p-2 rounded-lg">
            <Activity size={22} className="text-rose-400" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">חמ"ל — בריאות שרתים</h2>
            <p className="text-xs text-zinc-500">זיהוי אוטומטי של תקלות בכל השרתים + כפתורי תיקון</p>
          </div>
        </div>
        <button
          onClick={loadDiagnostics}
          disabled={loading}
          className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          רענן
        </button>
      </div>

      {/* Summary counters */}
      {hasScanned && !scanError && issues.length > 0 && (
        <div className="flex items-center gap-2 mb-4 text-xs font-bold">
          {errorCount > 0 && <span className="px-2.5 py-1 rounded-full bg-red-500/10 text-red-300">🔴 {errorCount} תקלות</span>}
          {warnCount > 0 && <span className="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300">🟠 {warnCount} אזהרות</span>}
          {infoCount > 0 && <span className="px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-300">🔵 {infoCount} מידע</span>}
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
          סורק שרתים...
        </div>
      ) : !scanError && issues.length === 0 && hasScanned ? (
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-10 text-center">
          <CheckCircle2 size={36} className="mx-auto mb-3 text-emerald-400" />
          <div className="text-emerald-300 font-bold">אין בעיות פתוחות — הכל תקין ✅</div>
        </div>
      ) : (
        <div className="space-y-5">
          {groupKeys.map((gk) => (
            <div key={gk}>
              <div className="flex items-center gap-2 mb-2 text-sm font-bold text-zinc-300">
                <span className="w-1.5 h-4 bg-zinc-700 rounded-full" />
                {groups[gk].serverName}
                <span className="text-zinc-600 font-mono text-xs" dir="ltr">{gk}</span>
              </div>
              <div className="space-y-2">
                {groups[gk].items.map((iss, idx) => {
                  const sev = SEVERITY[iss.severity] || SEVERITY.info;
                  const SevIcon = sev.icon;
                  const key = `${iss.serverId}:${iss.category}:${idx}`;
                  return (
                    <div key={key} className={`border ${sev.ring} ${sev.bg} rounded-xl p-4`}>
                      <div className="flex items-start gap-3">
                        <SevIcon size={18} className={`${sev.iconColor} flex-shrink-0 mt-0.5`} />
                        <div className="min-w-0 flex-1">
                          <div className={`font-bold ${sev.text}`}>{iss.title}</div>
                          {iss.detail && <div className="text-sm text-zinc-300 mt-1">{iss.detail}</div>}
                          {iss.suggestion && (
                            <div className="text-xs text-zinc-500 mt-1.5">💡 {iss.suggestion}</div>
                          )}
                        </div>
                        {iss.fix && (
                          <button
                            onClick={() => applyFix(iss, idx)}
                            disabled={!!fixingKey}
                            className="bg-zinc-800 hover:bg-rose-600 text-zinc-200 hover:text-white px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 flex-shrink-0 whitespace-nowrap"
                          >
                            {fixingKey === key
                              ? <RefreshCw size={14} className="animate-spin" />
                              : <Wrench size={14} />}
                            {iss.fix.label}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
