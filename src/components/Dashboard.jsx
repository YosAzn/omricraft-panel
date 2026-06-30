import React, { useState, useEffect, useCallback } from 'react';
import {
  Server, Trash2, Plus, Package, HardDrive, RefreshCw, Square, Play, Shield,
  Users, Activity, AlertTriangle, ArrowUpCircle,
  ChevronRight, CheckCircle2, Search
} from 'lucide-react';
import { getDiagnosticsFn, getVersionMatrixFn } from '../lib/api';
import PendingRequests from './PendingRequests';
import HealthIssueRow from './HealthIssueRow';

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
  playersData = {}, isAdmin = false, onOpenHealth, onApproveRequest,
}) {
  // Client-side server search (filters the visible servers grid by name).
  const [serverSearch, setServerSearch] = useState('');

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

  // --- Per-user stat cards (REAL, scoped to the servers this user can see) ---
  // These describe the user's own servers — NOT the global/public landing stat.
  const onlineServers = servers.filter(s => s.status === 'online');

  // "Servers online" = how many of THIS user's servers are online right now.
  const totalServersValue = servers.length;
  const onlineNowValue = onlineServers.length;

  // "Players online" = sum of player counts across the user's ONLINE servers.
  // 0 online servers → a real 0. Online servers but no count known yet →
  // neutral dash (null), never an invented number.
  const knownOnlinePlayerCounts = onlineServers
    .map(playerCountFor)
    .filter(Number.isFinite);
  const playersOnlineValue =
    onlineServers.length === 0
      ? 0
      : knownOnlinePlayerCounts.length === 0
      ? null
      : knownOnlinePlayerCounts.reduce((sum, c) => sum + c, 0);

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

  return (
    <div className="animate-in fade-in duration-300">
      {/* ===== Greeting + header (keeps the role-aware heading + count) ===== */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-6">
        <div>
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
        {/* Create button is ALWAYS visible to every signed-in user. Admins create
            directly; non-admins submit a request (App.jsx routes the submit). */}
        <div className="flex gap-2">
          <button
            onClick={onCreateClick}
            className="bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/20"
          >
            <Plus size={20} /> <span>{isAdmin ? t('newServer') : t('requestServerCta')}</span>
          </button>
        </div>
      </div>

      {/* ===== Pending server requests (ADMIN only) — non-admins submit create
              requests; admins approve/deny here. Data via admin-SDK callables. ===== */}
      {isAdmin && (
        <PendingRequests t={t} onApproved={onApproveRequest} />
      )}

      {/* ===== Stat cards (section 1) — REAL, scoped to the user's servers. The
              חמ"ל open-issues card shows for ALL users (scoped to their own
              issues by getDiagnostics({scope:'mine'})). ===== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={Server} label={t('dashStatTotalServers')} value={totalServersValue} accent="emerald" />
        <StatCard icon={Activity} label={t('dashStatOnlineNow')} value={onlineNowValue} accent="emerald" />
        <StatCard icon={Users} label={t('dashStatPlayersOnline')} value={playersOnlineValue} accent="sky" />
        <StatCard icon={AlertTriangle} label={t('dashStatOpenIssues')} value={issueCount} loading={diagLoading && diagnostics === null} accent={issueCount > 0 ? 'rose' : 'emerald'} />
      </div>

      {/* ===== חמ"ל summary (section 3) — ALL users. This is the FULL חמ"ל
              experience for non-admins: every issue on THEIR servers (scoped by
              getDiagnostics({scope:'mine'})) rendered in a scrollable bordered
              panel, each row carrying the SAME fix button as the dedicated tab
              (reset-status / restart / remove-datapack, via <HealthIssueRow>).
              The 'open full' link is ADMIN-only (admins also get the mine/all
              tab); for non-admins this panel IS their full חמ"ל. ===== */}
      <div className="mb-8 bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-zinc-300 flex items-center gap-2">
            <Activity size={16} className="text-rose-400" /> {t('dashHamalSummary')}
          </h3>
          {isAdmin && (
            <button onClick={onOpenHealth} className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors">
              {t('dashHamalOpenFull')} <ChevronRight size={14} className="rtl:rotate-180" />
            </button>
          )}
        </div>
        {diagLoading && diagnostics === null ? (
          <div className="text-zinc-500 text-sm flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> {t('dashLoading')}</div>
        ) : issues.length === 0 ? (
          <div className="text-emerald-300 text-sm font-bold flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400" /> {t('dashHamalAllOk')}
          </div>
        ) : (
          /* Scrollable panel — same look as the create-server addon-picker /
             HealthTab list (bg-zinc-950 + bordered + max-height + overflow). The
             flat list isn't grouped by server, so each row shows its server name. */
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

      {/* ===== Available updates (section 4) — REAL server/MC version only ===== */}
      {servers.length > 0 && matrix !== null && (
        <div className="mb-8">
          <h3 className="text-sm font-bold text-zinc-400 mb-3 flex items-center gap-2">
            <ArrowUpCircle size={16} className="text-emerald-400" /> {t('dashUpdatesTitle')}
          </h3>
          {updates.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 text-sm text-emerald-300 font-bold flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400" /> {t('dashUpdatesAllCurrent')}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {updates.map(({ server, current, latest }) => (
                <button
                  key={server.id}
                  onClick={() => onOpenServer(server.id)}
                  className="bg-zinc-900 hover:bg-zinc-800 border border-amber-500/20 hover:border-amber-500/40 rounded-2xl p-4 text-start transition-all"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <ArrowUpCircle size={16} className="text-amber-400 flex-shrink-0" />
                    <span className="text-xs font-bold text-amber-400">{t('dashUpdateAvailable')}</span>
                  </div>
                  <div className="font-bold text-zinc-100 truncate mb-1" title={server.name}>{server.name}</div>
                  <div className="text-sm text-zinc-400 flex items-center gap-2" dir="ltr">
                    <span className="text-zinc-500">{current}</span>
                    <ChevronRight size={14} className="text-zinc-600" />
                    <span className="text-emerald-400 font-bold">{latest}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== Servers at-a-glance (section 2) — existing grid, enhanced with
              real player counts. Keeps onOpenServer / toggleServerStatus.
              Section header carries the search box + admin "delete all". ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <h3 className="text-sm font-bold text-zinc-400">{t('dashServersGlance')}</h3>
        {servers.length > 0 && (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={15} className="absolute top-1/2 -translate-y-1/2 start-3 text-zinc-500 pointer-events-none" />
              <input
                type="text"
                value={serverSearch}
                onChange={(e) => setServerSearch(e.target.value)}
                placeholder={t('dashSearchServer')}
                className="bg-zinc-900 border border-zinc-800 focus:border-emerald-500/40 focus:outline-none rounded-lg ps-9 pe-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 w-full sm:w-56"
              />
            </div>
            {userRole === 'admin' && (
              <button
                onClick={onDeleteAll}
                className="bg-red-900/40 hover:bg-red-800/60 text-red-400 border border-red-800/40 px-3 py-2 rounded-lg font-medium flex items-center justify-center gap-2 transition-all whitespace-nowrap"
              >
                <Trash2 size={16} /> <span>מחק הכל</span>
              </button>
            )}
          </div>
        )}
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
            return (
            <div key={server.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-700 transition-colors group flex flex-col relative">
              {server.needsRestart && (
                <div className="absolute top-0 left-0 w-full h-1 bg-yellow-500"></div>
              )}
              <div className="p-5 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3 w-full pr-2 overflow-hidden">
                    <div className="w-12 h-12 flex-shrink-0 bg-zinc-950 rounded-lg flex items-center justify-center border border-zinc-800 overflow-hidden">
                      {server.icon ? (
                        <img src={server.icon} alt={server.name} className="w-full h-full object-cover" />
                      ) : (
                        <Server size={20} className="text-zinc-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                       <h3 className="text-xl font-bold truncate" title={server.name}>{server.name}</h3>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {server.isPrivate && (
                      <div className="px-2 py-1 rounded-full text-[10px] font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center gap-1">
                        <Shield size={10} /> פרטי
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
                <div className="space-y-2 mb-2 ml-14 rtl:ml-0 rtl:mr-14">
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
                    <HardDrive size={14} /> <span>{server.installedAddons.length} תוספים מותקנים</span>
                  </div>
                </div>
              </div>
              <div className="p-4 bg-zinc-950/50 border-t border-zinc-800 flex gap-2">
                <button
                  onClick={() => toggleServerStatus(server.id)}
                  disabled={userRole !== 'admin'}
                  title={userRole !== 'admin' ? t('noPermission') : ''}
                  className={`flex-1 py-2 rounded-lg font-medium flex justify-center items-center gap-2 transition-colors disabled:opacity-30
                    ${server.status === 'online' ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                >
                  {server.status === 'starting'
                    ? <RefreshCw size={16} className="animate-spin" />
                    : server.status === 'online'
                    ? <Square size={16} fill="currentColor" />
                    : <Play size={16} fill="currentColor" />}
                  {server.status === 'online' ? t('stop') : t('start')}
                </button>
                <button onClick={() => onOpenServer(server.id)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 py-2 rounded-lg font-medium transition-colors text-zinc-100">
                  {t('manage')}
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
