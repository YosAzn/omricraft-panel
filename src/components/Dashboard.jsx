import React, { useState, useEffect, useCallback } from 'react';
import {
  Server, Trash2, Plus, Package, HardDrive, RefreshCw, Square, Play, Shield,
  Users, Activity, ArrowUpCircle,
  ChevronRight, ChevronDown, CheckCircle2, Search
} from 'lucide-react';
import { getDiagnosticsFn, getVersionMatrixFn } from '../lib/api';
import PendingRequests from './PendingRequests';
import HealthIssueRow from './HealthIssueRow';
import RecycleBin from './RecycleBin';

// Numeric MC-version compare (newest-first): "1.21.11" must rank above "1.21.9".
// String compare gets this wrong, so we tuple-compare integer segments.
const verTuple = (v) => String(v || '').split('.').map(n => parseInt(n, 10) || 0);
const cmpVerDesc = (a, b) => {
  const ta = verTuple(a), tb = verTuple(b);
  for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
    const d = (tb[i] || 0) - (ta[i] || 0);
    if (d) return d;
  }
  return 0;
};

// A single stat card. value === null renders a neutral dash (never a fake 0).
function StatCard({ icon: Icon, label, value, loading, accent = 'emerald' }) {
  const accents = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    sky: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    rose: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex items-center gap-4">
      <div className={`w-12 h-12 flex-shrink-0 rounded-xl flex items-center justify-center border ${accents[accent] || accents.emerald}`}>
        <Icon size={22} />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-black tabular-nums">
          {loading ? <RefreshCw size={20} className="animate-spin text-zinc-600" /> : (value === null || value === undefined ? '—' : value)}
        </div>
        <div className="text-xs text-zinc-400 truncate">{label}</div>
      </div>
    </div>
  );
}

export default function Dashboard({
  servers, onOpenServer, onCreateClick, toggleServerStatus, onDeleteAll, t, userRole,
  playersData = {}, isAdmin = false, onOpenHealth, onApproveRequest, onServerRestored,
}) {
  // Client-side server search (filters the visible servers grid by name).
  const [serverSearch, setServerSearch] = useState('');

  // Accordion state — both the חמ"ל/Health summary and the admin pending-requests
  // panels are COLLAPSED BY DEFAULT so they don't dominate the dashboard. The
  // server list + stat cards stay the focus; the long issue list only shows on
  // demand. Each header (title + count badge + chevron) toggles its own panel.
  const [healthOpen, setHealthOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);

  // --- חמ"ל diagnostics — fetched ONCE for EVERY signed-in user, reused by both
  //     the stat card and the summary card below (no double-call). The function
  //     scopes issues to the caller's own servers (admins/non-admins alike get
  //     'mine' here; the dedicated חמ"ל tab is where admins can switch to 'all').
  //     {success, issues:[...]}. ---
  const [diagnostics, setDiagnostics] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  // Reusable re-scan: runs on mount AND after a fix succeeds (passed as onFixed
  // to each HealthIssueRow) so the panel reflects the fix without a page reload.
  const refreshDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    try {
      const res = await getDiagnosticsFn({ scope: 'mine' });
      const d = res?.data || res;
      if (d && d.success) setDiagnostics(Array.isArray(d.issues) ? d.issues : []);
    } catch (e) {
      console.error('Dashboard getDiagnostics failed:', e);
    }
    setDiagLoading(false);
  }, []);
  useEffect(() => { refreshDiagnostics(); }, [refreshDiagnostics]);

  // --- Version matrix (REAL latest per server type) for the updates section. ---
  // {success, matrix:{ paper:[newest-first], fabric:[...], ... }}. On failure → {}.
  const [matrix, setMatrix] = useState(null);
  useEffect(() => {
    let alive = true;
    // Reuse the same 6h localStorage cache App.jsx populates, to avoid a cold call.
    try {
      const cached = localStorage.getItem('mc-version-matrix-v1');
      const ts = parseInt(localStorage.getItem('mc-version-matrix-v1-ts') || '0');
      if (cached && Date.now() - ts < 21600000) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed === 'object') { setMatrix(parsed); return; }
      }
    } catch (e) { console.warn('Dashboard matrix cache parse failed:', e); }
    getVersionMatrixFn()
      .then(res => {
        const m = res?.data?.matrix;
        if (alive && m && typeof m === 'object') setMatrix(m);
      })
      .catch(e => { console.error('Dashboard getVersionMatrix failed:', e); });
    return () => { alive = false; };
  }, []);

  // Players online per server, from the live poll passed down by App.jsx.
  const playerCountFor = (server) => {
    const info = playersData?.[server.id];
    return info && Number.isFinite(info.count) ? info.count : null;
  };

  // --- Single "Total servers" stat (REAL, scoped to the servers this user sees) ---
  // The online-now / players-online / open-issues cards were removed (open-issues
  // duplicated the חמ"ל summary; the others were noise), so their derived values
  // are gone too. `playerCountFor` above is still used by the server cards.
  const totalServersValue = servers.length;

  // Servers shown in the at-a-glance grid, filtered by the search box (by name,
  // case-insensitive). Empty query → all visible servers.
  const search = serverSearch.trim().toLowerCase();
  const filteredServers = search
    ? servers.filter(s => (s.name || '').toLowerCase().includes(search))
    : servers;

  // חמ"ל counts + sorted list (scoped to the user's own servers). null while
  // loading / unavailable → dash for the stat card.
  const issues = diagnostics || [];
  const issueCount = diagnostics === null ? null : issues.length;
  // Show errors first, then warnings, then info — the full (scrollable) summary
  // panel renders ALL of the user's issues in this order, each with its fix button.
  const sevRank = { error: 0, warning: 1, info: 2 };
  const sortedIssues = [...issues]
    .sort((a, b) => (sevRank[a.severity] ?? 3) - (sevRank[b.severity] ?? 3));

  // --- Available updates (REAL — server/MC version only). For each server,
  //     compare its current version to the latest in versionMatrix[software].
  //     A server is "behind" only when the matrix has a STRICTLY newer version. ---
  const updates = (matrix && typeof matrix === 'object')
    ? servers.reduce((acc, s) => {
        const list = matrix[s.software];
        if (!Array.isArray(list) || list.length === 0) return acc;
        const latest = [...list].sort(cmpVerDesc)[0];
        if (latest && s.version && cmpVerDesc(latest, s.version) < 0) {
          // cmpVerDesc(latest, current) < 0  ⇒  latest is newer than current.
          acc.push({ server: s, current: s.version, latest });
        }
        return acc;
      }, [])
    : [];

  // Per-server update lookup (serverId → {current, latest}) so each card can show
  // its OWN "update available" indicator below its action buttons (FIX #2), not
  // just the aggregate updates section above.
  const updateByServerId = updates.reduce((m, u) => { m[u.server.id] = u; return m; }, {});

  return (
    <div className="animate-in fade-in duration-300">
      {/* ===== Greeting + header (keeps the role-aware heading + count) ===== */}
      <div className="mb-6">
        <p className="text-sm text-emerald-400 font-bold mb-1">
          {userRole === 'admin' ? t('dashGreetingAdmin') : t('dashGreeting')}
        </p>
        <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
          {/* heading is dynamic by role: admin sees all, client sees only their own */}
          {userRole === 'admin' ? t('allServers') : t('yourServers')}
          <span className="text-base font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-0.5">
            {servers.length}
          </span>
        </h2>
        <p className="text-zinc-400">{t('manageDesc')}</p>
      </div>

      {/* ===== PRIMARY ACTIONS (top of dashboard) — the dashboard LEADS with
              actions: prominent emerald "New Server", the server search, and a
              quieter danger-outline "Delete all" (admin). Search drives the
              at-a-glance grid below (filteredServers). Moved up here from the old
              "Servers at a glance" header so actions are the first thing seen. ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        {/* Create — ALWAYS visible; admins create, non-admins submit a request. */}
        <button
          onClick={onCreateClick}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/30 hover:-translate-y-0.5 whitespace-nowrap"
        >
          <Plus size={18} /> <span>{isAdmin ? t('newServer') : t('requestServerCta')}</span>
        </button>
        {servers.length > 0 && (
          <>
            <div className="relative flex-1 sm:max-w-xs">
              <Search size={16} className="absolute top-1/2 -translate-y-1/2 start-3 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={serverSearch}
                onChange={(e) => setServerSearch(e.target.value)}
                placeholder={t('dashSearchServer')}
                className="bg-zinc-900 border border-zinc-800 focus:border-emerald-500/40 focus:outline-none rounded-xl ps-9 pe-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 w-full"
              />
            </div>
            {userRole === 'admin' && (
              <button
                onClick={onDeleteAll}
                className="border border-red-800/50 text-red-400 hover:bg-red-900/30 hover:border-red-700 px-4 py-2.5 rounded-xl font-medium flex items-center justify-center gap-2 transition-all whitespace-nowrap sm:ms-auto"
              >
                <Trash2 size={16} /> <span>{t('dashDeleteAll')}</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* ===== Collapsible panels — STACKED (Health above Requests), both
              COLLAPSED BY DEFAULT so the server list stays the focus. ===== */}
      <div className="mb-8 space-y-3">
        {/* --- חמ"ל / Health summary accordion (ALL users). This is the FULL חמ"ל
                experience for non-admins: every issue on THEIR servers (scoped by
                getDiagnostics({scope:'mine'})), each row carrying the SAME fix
                button as the dedicated tab (via <HealthIssueRow>). The 'open full'
                link is ADMIN-only. Collapsed = header only; expand = issue list. --- */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          {/* DECLUTTERED header — ONE leading icon (state-coloured) + title + count
              badge, and a single trailing chevron as the expand affordance. The
              whole row is one button with a clear hover state so it's obviously
              clickable-to-expand (dropped the extra 🩺 emoji + "·" dot + the second
              chevron). Admin "open full" moves inside the expanded panel below. */}
          <button
            type="button"
            onClick={() => setHealthOpen(o => !o)}
            className="w-full flex items-center gap-2 p-4 text-start hover:bg-zinc-800/40 transition-colors"
            aria-expanded={healthOpen}
          >
            <Activity size={16} className={`flex-shrink-0 ${issueCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`} />
            <span className="text-sm font-bold text-zinc-300">{t('dashHamalSummary')}</span>
            <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 flex-shrink-0 whitespace-nowrap ${issueCount > 0 ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20' : 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'}`}>
              {issueCount === null ? '…' : `${issueCount} ${t('issuesUnit')}`}
            </span>
            <ChevronDown size={18} className={`text-zinc-400 flex-shrink-0 ms-auto transition-transform ${healthOpen ? 'rotate-180' : ''}`} />
          </button>
          {healthOpen && (
            <div className="px-4 pb-4">
              {/* Admin-only "open full חמ"ל" — moved out of the header into the
                  expanded panel so the collapsed row stays clean. */}
              {isAdmin && (
                <div className="flex justify-end mb-2">
                  <button onClick={onOpenHealth} className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors">
                    {t('dashHamalOpenFull')} <ChevronRight size={14} className="rtl:rotate-180" />
                  </button>
                </div>
              )}
              {diagLoading && diagnostics === null ? (
                <div className="text-zinc-500 text-sm flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> {t('dashLoading')}</div>
              ) : issues.length === 0 ? (
                <div className="text-emerald-300 text-sm font-bold flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" /> {t('dashHamalAllOk')}
                </div>
              ) : (
                /* Scrollable panel — same look as the create-server addon-picker /
                   HealthTab list. The flat list isn't grouped by server, so each
                   row shows its server name. */
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 max-h-[40vh] overflow-y-auto space-y-2">
                  {sortedIssues.map((iss, idx) => (
                    <HealthIssueRow
                      key={`${iss.serverId}:${iss.category}:${idx}`}
                      issue={iss}
                      onFixed={refreshDiagnostics}
                      showServer
                      t={t}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* --- Pending server requests accordion (ADMIN only) — non-admins submit
                create requests; admins approve/deny here. Data via admin-SDK
                callables. Collapsed by default; header shows the pending count. --- */}
        {isAdmin && (
          <PendingRequests
            t={t}
            onApproved={onApproveRequest}
            collapsible
            open={requestsOpen}
            onToggle={() => setRequestsOpen(o => !o)}
          />
        )}

        {/* --- Recycle bin (deleted servers) accordion — COLLAPSED by default,
                renders ONLY when there is at least one soft-delete archive. Each
                entry shows type/version, "deleted X days ago", the restore
                countdown, and size, with per-entry restore + permanent-purge.
                Restore is admin-gated server-side (restoreServer callable); a
                non-admin with no archives simply never sees the section. --- */}
        <RecycleBin t={t} onRestored={onServerRestored} />
      </div>

      {/* NOTE: the top aggregate "available updates" section was removed — it was
          redundant with the per-server update strip shown BELOW each server card's
          action buttons (see updateByServerId + the strip further down). The
          `updates` / `updateByServerId` computation above is kept because that
          per-server strip still relies on it. */}

      {/* ===== SINGLE stat card — only "Total servers" is kept. The old 4-card grid
              (online-now / players-online / open-issues) was removed: open-issues
              duplicated the חמ"ל summary row above, and online/players were noise.
              Compact + start-aligned (not a full-width grid) so one card doesn't
              stretch awkwardly. Sits just above the server grid it counts. ===== */}
      <div className="mb-6 max-w-xs">
        <StatCard icon={Server} label={t('dashStatTotalServers')} value={totalServersValue} accent="emerald" />
      </div>

      {/* ===== Servers at-a-glance (section 2) — existing grid, enhanced with
              real player counts. Keeps onOpenServer / toggleServerStatus.
              The search / delete-all / create actions moved UP to the primary
              actions row at the top of the dashboard, so this header is title-only. ===== */}
      <div className="mb-3">
        <h3 className="text-sm font-bold text-zinc-400">{t('dashServersGlance')}</h3>
      </div>
      {servers.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <Server className="mx-auto text-zinc-600 mb-4" size={48} />
          <h3 className="text-xl font-bold mb-2">{t('noServers')}</h3>
          <p className="text-zinc-500 mb-6">{t('noServersDesc')}</p>
          {/* Always visible — admins create, non-admins request (routed in App.jsx). */}
          <button onClick={onCreateClick} className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
            {isAdmin ? t('create') : t('requestServerCta')}
          </button>
        </div>
      ) : filteredServers.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center text-zinc-500 text-sm">
          {t('noResults')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredServers.map(server => {
            const playerCount = playerCountFor(server);
            const upd = updateByServerId[server.id]; // {current, latest} if behind
            return (
            <div key={server.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors group flex flex-col relative">
              {server.needsRestart && (
                <div className="absolute top-0 left-0 w-full h-1 bg-yellow-500"></div>
              )}
              <div className="p-4 flex-1">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3 w-full pr-2 overflow-hidden">
                    {/* Avatar blends gently into the card: soft rounded-xl tile with a
                        faint top-down gradient + inset ring instead of a hard square
                        border, so the icon melts into the surface rather than sitting
                        on a thumbnail. */}
                    <div className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center overflow-hidden bg-gradient-to-br from-zinc-800/70 to-zinc-900 ring-1 ring-inset ring-zinc-700/50">
                      {server.icon ? (
                        <img src={server.icon} alt={server.name} className="w-full h-full object-cover rounded-xl" />
                      ) : (
                        <Server size={18} className="text-zinc-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                       <h3 className="text-lg font-bold truncate" title={server.name}>{server.name}</h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {server.isPrivate && (
                      <div className="px-2 py-1 rounded-full text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center gap-1">
                        <Shield size={10} /> {t('dashPrivateBadge')}
                      </div>
                    )}
                    <div className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold flex items-center gap-1.5 whitespace-nowrap
                      ${server.status === 'online' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                        server.status === 'starting' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' :
                        'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${server.status === 'online' ? 'bg-green-400' : server.status === 'starting' ? 'bg-yellow-400 animate-pulse' : 'bg-zinc-500'}`}></span>
                      {t(server.status)}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5 mb-1 ml-[52px] rtl:ml-0 rtl:mr-[52px]">
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <Package size={14} /> <span>{server.software} {server.version}</span>
                  </div>
                  {/* Real player count from the live poll — only shown when online and known */}
                  {server.status === 'online' && Number.isFinite(playerCount) && (
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <Users size={14} /> <span>{playerCount} {t('players')}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm text-zinc-400">
                    <HardDrive size={14} /> <span>{server.installedAddons.length} {t('dashAddons')}</span>
                  </div>
                </div>
              </div>
              <div className="p-3 bg-zinc-950/50 border-t border-zinc-800 flex gap-2">
                <button
                  onClick={() => toggleServerStatus(server.id)}
                  disabled={userRole !== 'admin'}
                  title={userRole !== 'admin' ? t('noPermission') : ''}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium flex justify-center items-center gap-2 transition-colors disabled:opacity-30
                    ${server.status === 'online' ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                >
                  {server.status === 'starting'
                    ? <RefreshCw size={16} className="animate-spin" />
                    : server.status === 'online'
                    ? <Square size={16} fill="currentColor" />
                    : <Play size={16} fill="currentColor" />}
                  {server.status === 'online' ? t('stop') : t('start')}
                </button>
                <button onClick={() => onOpenServer(server.id)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-1.5 rounded-lg text-sm font-medium transition-colors text-zinc-100">
                  {t('manage')}
                </button>
              </div>
              {/* Per-server version-update indicator (FIX #2) — sits BELOW the
                  start/manage action buttons so it never overlaps or hides them.
                  Only shown when the matrix has a strictly newer version. */}
              {upd && (
                <button
                  onClick={() => onOpenServer(server.id)}
                  className="w-full px-4 py-2 bg-amber-500/5 hover:bg-amber-500/10 border-t border-amber-500/20 text-start transition-colors flex items-center gap-2"
                  title={t('dashUpdateAvailable')}
                >
                  <ArrowUpCircle size={14} className="text-amber-400 flex-shrink-0" />
                  <span className="text-[11px] font-bold text-amber-400 flex-shrink-0">{t('dashUpdateAvailable')}</span>
                  <span className="text-xs text-zinc-400 flex items-center gap-1.5 ms-auto" dir="ltr">
                    <span className="text-zinc-500">{upd.current}</span>
                    <ChevronRight size={12} className="text-zinc-600" />
                    <span className="text-emerald-400 font-bold">{upd.latest}</span>
                  </span>
                </button>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
