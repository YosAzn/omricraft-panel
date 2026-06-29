import React, { useState, useEffect, useCallback } from 'react';
import { Inbox, Check, X, RefreshCw, Mail, Package, Shield } from 'lucide-react';
import { getPendingRequestsFn, approveServerRequestFn, denyServerRequestFn } from '../lib/api';

// ADMIN-only "Pending requests" review section for the Dashboard.
// Non-admins submit create-server requests (requestServer); admins approve/deny here.
// All data flows through admin-SDK callables (refetch, not onSnapshot) — the client
// never reads the serverRequests collection directly, so firestore.rules is untouched.
//
// onApproved(result) is called after a successful approval with the create result
// ({ id, displayName, slug, address, gamePort, rconPort, ownerUid, requesterUid, ... }).
// App.jsx uses it to persist the Firestore server doc (owned by the requester).
export default function PendingRequests({ t, onApproved }) {
  const [requests, setRequests] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);      // request currently being approved/denied
  const [error, setError] = useState(null);

  const fetchRequests = useCallback(() => {
    setLoading(true);
    setError(null);
    return getPendingRequestsFn()
      .then((res) => {
        const d = res?.data || res;
        if (d && d.success) setRequests(Array.isArray(d.requests) ? d.requests : []);
        else { setRequests([]); setError(d?.error || null); }
      })
      .catch((e) => {
        console.error('getPendingRequests failed:', e);
        setRequests([]);
        setError(e?.message || String(e));
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const handleApprove = async (id) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await approveServerRequestFn({ requestId: id });
      const d = res?.data || res;
      if (!d || !d.success) throw new Error(d?.error || 'Approve failed');
      if (typeof onApproved === 'function') {
        try { await onApproved(d); }
        catch (persistErr) { console.error('onApproved persist failed:', persistErr); }
      }
      await fetchRequests();
    } catch (e) {
      console.error('approveServerRequest failed:', e);
      alert(`${t('requestActionFailed')}: ${e?.message || e}`);
    } finally {
      setBusyId(null);
    }
  };

  const handleDeny = async (id) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const res = await denyServerRequestFn({ requestId: id });
      const d = res?.data || res;
      if (!d || !d.success) throw new Error(d?.error || 'Deny failed');
      await fetchRequests();
    } catch (e) {
      console.error('denyServerRequest failed:', e);
      alert(`${t('requestActionFailed')}: ${e?.message || e}`);
    } finally {
      setBusyId(null);
    }
  };

  const list = requests || [];
  const count = requests === null ? null : list.length;

  return (
    <div className="mb-8 bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
          <Inbox size={16} className="text-emerald-400" /> {t('pendingRequests')}
          {count !== null && count > 0 && (
            <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5">
              {count}
            </span>
          )}
        </h3>
        <button
          onClick={fetchRequests}
          disabled={loading}
          className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> {t('requestRefresh')}
        </button>
      </div>

      {error && (
        <div className="text-rose-400 text-xs mb-2">{error}</div>
      )}

      {requests === null && loading ? (
        <div className="text-zinc-500 text-sm flex items-center gap-2">
          <RefreshCw size={14} className="animate-spin" /> {t('dashLoading')}
        </div>
      ) : list.length === 0 ? (
        <div className="text-zinc-500 text-sm">{t('pendingRequestsNone')}</div>
      ) : (
        <div className="space-y-2">
          {list.map((r) => {
            const cfg = r.config || {};
            const isBusy = busyId === r.id;
            return (
              <div key={r.id} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-xl p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-zinc-100 truncate" title={cfg.displayName}>{cfg.displayName || '—'}</span>
                    {cfg.isPrivate && (
                      <span className="text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full px-2 py-0.5 flex items-center" title={t('whitelistPlayers')}>
                        <Shield size={10} />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-400 mt-1 flex-wrap">
                    <span className="flex items-center gap-1"><Package size={12} /> {cfg.type} {cfg.version}</span>
                    {r.requesterEmail && (
                      <span className="flex items-center gap-1"><Mail size={12} /> {t('requestBy')} {r.requesterEmail}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleApprove(r.id)}
                    disabled={isBusy}
                    className="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    {isBusy ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} {t('requestApprove')}
                  </button>
                  <button
                    onClick={() => handleDeny(r.id)}
                    disabled={isBusy}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-800/40 px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <X size={14} /> {t('requestDeny')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
