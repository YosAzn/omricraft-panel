import React, { useState, useEffect, useCallback } from 'react';
import {
  Server, Trash2, Plus, Package, HardDrive, RefreshCw, Square, Play, Shield,
  Users, Activity, ArrowUpCircle,
  ChevronRight, ChevronDown, CheckCircle2, Search, Inbox
} from 'lucide-react';
import { getDiagnosticsFn, getVersionMatrixFn } from '../lib/api';
import PendingRequests from './PendingRequests';
import HealthIssueRow from './HealthIssueRow';
import RecycleBin from './RecycleBin';
import { PageHeader } from './ui';
import dashboardLogo from '../assets/dashboard-spider.png';

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

// Per-accent class sets — full literal class names (Tailwind keeps them at build).
// Mirrors the LANDING page's stat-card language: an accent-tinted corner watermark
// of the icon, a white→accent gradient value, and an accent hover glow.
const DASH_ACCENTS = {
  emerald: { text: 'text-emerald-400', hover: 'hover:border-emerald-500/40 hover:shadow-emerald-900/20', value: 'from-white to-emerald-300', watermark: 'text-emerald-500/[0.13]' },
  sky:     { text: 'text-sky-400',     hover: 'hover:border-sky-500/40 hover:shadow-sky-900/20',         value: 'from-white to-sky-300',     watermark: 'text-sky-500/[0.13]' },
  amber:   { text: 'text-amber-400',   hover: 'hover:border-amber-500/40 hover:shadow-amber-900/20',     value: 'from-white to-amber-300',   watermark: 'text-amber-500/[0.13]' },
  rose:    { text: 'text-rose-400',    hover: 'hover:border-rose-500/40 hover:shadow-rose-900/20',       value: 'from-white to-rose-300',    watermark: 'text-rose-500/[0.13]' },
};

// A single stat card — LANDING-page style: rounded-2xl glass, an accent corner
// watermark of the stat's icon, and a white→accent gradient value. Compact (same
// footprint as before). value === null renders a neutral dash (never a fake 0).
function StatCard({ icon: Icon, label, value, loading, accent = 'emerald' }) {
  const a = DASH_ACCENTS[accent] || DASH_ACCENTS.emerald;
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3 min-w-[150px] transition-all hover:shadow-2xl ${a.hover}`}>
      <Icon size={72} strokeWidth={1.5} className={`pointer-events-none absolute -bottom-3 -end-2 ${a.watermark} select-none`} aria-hidden="true" />
      <div className="relative text-2xl font-black tabular-nums tracking-tighter leading-none">
        {loading
          ? <RefreshCw size={16} className="animate-spin text-zinc-600" />
          : <span className={`bg-gradient-to-b ${a.value} bg-clip-text text-transparent`}>{value === null || value === undefined ? '—' : value}</span>}
      </div>
      <div className="relative mt-1 text-[11px] text-zinc-400 truncate">{label}</div>
    </div>
  );
}

// A CLICKABLE stat "button" (חמ"ל / pending) — the SAME landing-style card as
// StatCard, plus an ENLARGED accent watermark icon + a chevron affordance so the
// open/close is obvious. `active` reflects the open panel (neutral-highlighted).
function StatButton({ icon: Icon, label, value, loading, accent = 'emerald', active = false, onClick }) {
  const a = DASH_ACCENTS[accent] || DASH_ACCENTS.emerald;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={active}
      className={`relative overflow-hidden text-start rounded-2xl border px-4 py-3 min-w-[150px] transition-all cursor-pointer hover:shadow-2xl
        ${active ? 'border-zinc-600 bg-zinc-800/70' : `border-zinc-800 bg-zinc-900/60 ${a.hover}`}`}
    >
      {/* Enlarged accent watermark of the חמ"ל / requests glyph (landing style). */}
      <Icon size={72} strokeWidth={1.5} className={`pointer-events-none absolute -bottom-3.5 -end-2.5 ${a.watermark} select-none`} aria-hidden="true" />
      <div className="relative flex items-center gap-1">
        <span className="text-2xl font-black tabular-nums tracking-tighter leading-none">
          {loading
            ? <RefreshCw size={16} className="animate-spin text-zinc-600" />
            : <span className={`bg-gradient-to-b ${a.value} bg-clip-text text-transparent`}>{value === null || value === undefined ? '—' : value}</span>}
        </span>
        <ChevronDown size={15} className={`${a.text} transition-transform ${active ? 'rotate-180' : ''}`} />
      </div>
      <div className="relative mt-1 text-[11px] text-zinc-400 truncate">{label}</div>
    </button>
  );
}

// The create/request action — SAME size/footprint as the stat cards (emerald-glass,
// a "+" corner watermark, a subtle green hover glow), but the label uses the NORMAL
// site font (bold emerald text, not a gradient wordmark).
function ActionCard({ label, onClick }) {
  const a = DASH_ACCENTS.emerald;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden text-start rounded-2xl border border-emerald-500/40 bg-emerald-500/[0.08] px-4 py-3 min-w-[150px] transition-all cursor-pointer hover:shadow-2xl hover:bg-emerald-500/[0.14] ${a.hover}`}
    >
      <Plus size={72} strokeWidth={1.5} className="pointer-events-none absolute -bottom-3 -end-2 text-emerald-500/[0.16] select-none" aria-hidden="true" />
      {/* "+" on top (its place), the label ("שרת חדש"/"בקש שרת") on the bottom row. */}
      <div className="relative flex items-center"><Plus size={24} className="text-emerald-300" /></div>
      <div className="relative mt-1 text-[13px] font-bold text-emerald-300 truncate">{label}</div>
    </button>
  );
}

export default function Dashboard({
  servers, onOpenServer, onCreateClick, toggleServerStatus, onDeleteAll, t, userRole,
  playersData = {}, isAdmin = false, onOpenHealth, onApproveRequest, onServerRestored, isRtl = false,
}) {
  // Client-side server search (filters the visible servers grid by name).
  const [serverSearch, setServerSearch] = useState('');

  // Accordion state — both the חמ"ל/Health summary and the admin pending-requests
  // panels are COLLAPSED BY DEFAULT so they don't dominate the dashboard. The
  // server list + stat cards stay the focus; the long issue list only shows on
  // demand. Each header (title + count badge + chevron) toggles its own panel.
  const [healthOpen, setHealthOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  // Pending-requests count, lifted from <PendingRequests onCount> so the top
  // stat-button shows it while the panel stays collapsed.
  const [pendingCount, setPendingCount] = useState(null);

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

  // --- Two stats only: "Total servers" + "Players online" (REAL, scoped to the
  //     servers this user sees). The online-now / open-issues cards were removed
  //     (open-issues duplicated the חמ"ל summary; online-now was noise). ---
  const totalServersValue = servers.length;
  // Sum of live player counts (from the App.jsx poll). If a server is online but
  // its count isn't known yet → null (dash), never a fake 0.
  const playersOnlineValue = (() => {
    let sum = 0, known = false;
    for (const s of servers) {
      const c = playerCountFor(s);
      if (Number.isFinite(c)) { sum += c; known = true; }
    }
    if (known) return sum;
    return servers.some(s => s.status === 'online') ? null : 0;
  })();

  // Servers shown in the at-a-glance grid, filtered by the search box (by name,
  // case-insensitive). Empty query → all visible servers.
  const search = serverSearch.trim().toLowerCase();
  const filteredServers = search
    ? servers.filter(s => (s.name || '').toLowerCase().includes(search))
    : servers;

  // חמ"ל counts + sorted list (scoped to the user's own servers). null while
  // loading / unavailable → dash for the stat card.
  // Drop issues for servers that were DELETED (stale VPS-scan leftovers) — keep only
  // issues for servers still present (or global, server-less issues).
  const knownServerIds = new Set(servers.map(s => s.id));
  const issues = (diagnostics || []).filter(i => !i.serverId || knownServerIds.has(i.serverId));
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
      {/* ===== Greeting + page header (emblem + "דשבורד" title). The server COUNT
              badge was dropped — the total is already shown in the stat card below. ===== */}
      <PageHeader
        logo={dashboardLogo}
        logoClass="h-14 sm:h-16"
        eyebrow={t('dashGreeting')}
        title={t('dashboard')}
        desc={userRole === 'admin' ? t('dashGreetingAdmin') : t('manageDesc')}
        glow="rgba(59,130,246,0.35)"
      />

      {/* ===== STATS + ACTIONS row — the stat-buttons (servers · players · חמ"ל
              issues · pending requests) sit together; the server search goes BETWEEN
              them and the actions; the actions (Create on the far left, Delete just to
              its right — RTL) sit at the row's end. חמ"ל + pending are now CLICKABLE
              stat-buttons that open their panel below (eduUI-style). On narrow screens
              the search drops to a slim bar above the server grid (see below). ===== */}
      <div className="flex flex-wrap items-stretch gap-3 mb-6">
        <StatCard icon={Server} label={t('dashStatTotalServers')} value={totalServersValue} accent="emerald" />
        <StatCard icon={Users} label={t('dashStatPlayersOnline')} value={playersOnlineValue} accent="sky" />
        {/* חמ"ל — "X issues"; click opens the health panel below (all users). */}
        <StatButton
          icon={Activity}
          label={t('issuesUnit')}
          value={issueCount}
          loading={diagLoading && diagnostics === null}
          accent="rose"
          active={healthOpen}
          onClick={() => setHealthOpen(o => !o)}
        />
        {/* Pending requests — "X requests"; click opens the panel below (admin). */}
        {isAdmin && (
          <StatButton
            icon={Inbox}
            label={t('requestsUnit')}
            value={pendingCount}
            accent="emerald"
            active={requestsOpen}
            onClick={() => setRequestsOpen(o => !o)}
          />
        )}
        {/* Actions — DOM order [Delete][Create] so in RTL "Create" is the far-left
            card and "Delete all" (a slim rose card) sits to its right. Same height
            as the stat cards; the server search moved DOWN to the glance row. */}
        <div className="flex items-stretch gap-3 ms-auto">
          {userRole === 'admin' && servers.length > 0 && (
            <button
              onClick={onDeleteAll}
              title={t('dashDeleteAll')}
              className="relative overflow-hidden text-start rounded-2xl border border-red-500/40 bg-red-500/[0.08] px-3 py-3 min-w-[88px] transition-all cursor-pointer hover:shadow-2xl hover:bg-red-500/[0.14] hover:border-red-500/50 hover:shadow-red-900/20"
            >
              <Trash2 size={64} strokeWidth={1.5} className="pointer-events-none absolute -bottom-3 -end-2 text-red-500/[0.16] select-none" aria-hidden="true" />
              <div className="relative flex items-center"><Trash2 size={22} className="text-red-400" /></div>
              <div className="relative mt-1 text-[13px] font-bold text-red-300 truncate">{t('dashDeleteAll')}</div>
            </button>
          )}
          <ActionCard label={isAdmin ? t('newServer') : t('requestServerCta')} onClick={onCreateClick} />
        </div>
      </div>

      {/* ===== Panels that OPEN from the top stat-buttons (חמ"ל issues / pending
              requests) — each renders below only when its button is active, like a
              card opening. Collapsed by default so the server list stays the focus. ===== */}
      <div className="mb-8 space-y-3">
        {/* --- חמ"ל / Health panel (ALL users) — opens from the "issues" stat-button.
                The FULL חמ"ל experience for non-admins: every issue on THEIR servers
                (getDiagnostics({scope:'mine'})), each row carrying the SAME fix button
                as the dedicated tab (via <HealthIssueRow>); 'open full' is admin-only. --- */}
        {healthOpen && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="p-4">
              {/* Admin-only "open full חמ"ל". */}
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
                   HealthTab list. Each row shows its server name. */
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
          </div>
        )}

        {/* --- Pending server requests accordion (ADMIN only) — non-admins submit
                create requests; admins approve/deny here. Data via admin-SDK
                callables. Collapsed by default; header shows the pending count. --- */}
        {isAdmin && (
          <PendingRequests
            t={t}
            onApproved={onApproveRequest}
            collapsible
            headerless
            open={requestsOpen}
            onToggle={() => setRequestsOpen(o => !o)}
            onCount={setPendingCount}
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

      {/* NOTE: the standalone stat-card block that used to sit here moved UP into
              the combined stats+actions row at the top of the dashboard. */}

      {/* ===== Servers at-a-glance — the heading on one side, and a SLIM server
              search (half height, like the add-ons page) on the OTHER side. ===== */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-base sm:text-lg font-bold text-zinc-200 whitespace-nowrap">{t('dashServersGlance')}</h3>
        {servers.length > 0 && (
          <div className="relative w-full max-w-[240px]">
            <Search size={14} className="absolute top-1/2 -translate-y-1/2 start-3 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={serverSearch}
              onChange={(e) => setServerSearch(e.target.value)}
              placeholder={t('dashSearchServer')}
              className="bg-zinc-900 border border-zinc-800 focus:border-emerald-500/40 focus:outline-none rounded-lg ps-9 pe-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 w-full"
            />
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
