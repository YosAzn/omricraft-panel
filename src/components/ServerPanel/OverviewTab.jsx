import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';
import { getServerStatsFn } from '../../lib/api';

// Maps every worldType value (matches the create/settings <select>) to its i18n key.
const WORLD_TYPE_KEYS = {
  default: 'worldDefault',
  flat: 'worldFlat',
  amplified: 'worldAmplified',
  large_biomes: 'worldLargeBiomes',
};

export default function OverviewTab({ server, t, playersLive }) {
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [liveStats, setLiveStats] = useState({ ram: null, cpu: null });

  useEffect(() => {
    if (!server?.id || server.status !== 'online') { setLiveStats({ ram: null, cpu: null }); return; }
    const fetchStats = async () => {
      try {
        const res = await getServerStatsFn({ serverId: server.id });
        if (res.data?.success) setLiveStats({ ram: res.data.ram, cpu: res.data.cpu });
      } catch (e) { console.error('getServerStats poll failed:', e?.message || e); /* keep last/null stats */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, [server?.id, server?.status]);

  const slug =
    server?.serverSlug ||
    server?.minecraftWorldName ||
    server?.worldName ||
    server?.id;

  // Domain is the connection address (Velocity proxies by hostname, port 25565 default)
  const connectAddress = server?.publicHost || server?.address || (server?.slug ? `${server.slug}.omricraft.com` : '—');

  return (
    <div className="space-y-6 animate-in fade-in">
      <div>
        <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl flex items-center justify-between gap-3">
          <div className="font-mono text-lg text-green-400 tracking-wider truncate" dir="ltr" title={connectAddress}>
            {connectAddress}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {copiedDomain && (
              <span className="text-xs text-emerald-400">
                הועתק
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                if (navigator.clipboard?.writeText) {
                  navigator.clipboard.writeText(connectAddress).catch(() => {});
                } else {
                  const ta = document.createElement('textarea');
                  ta.value = connectAddress;
                  ta.style.position = 'fixed';
                  ta.style.opacity = '0';
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand('copy');
                  document.body.removeChild(ta);
                }
                setCopiedDomain(true);
                setTimeout(() => setCopiedDomain(false), 2000);
              }}
              className="text-sm bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg transition-colors"
            >
              {copiedDomain ? 'הועתק! ✓' : t('copyIp')}
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl">
          <div className="text-zinc-400 text-xs mb-1">{t('gamemode')}</div>
          <div className="font-bold text-lg">{t(server.gamemode)}</div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl">
          <div className="text-zinc-400 text-xs mb-1">{t('worldType')}</div>
          <div className="font-bold text-lg">{t(WORLD_TYPE_KEYS[server.worldType] || 'worldDefault')}</div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl">
          <div className="text-zinc-400 text-xs mb-1">Seed</div>
          <div className="font-mono font-bold text-base truncate" title={server.seed}>{server.seed}</div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl">
          <div className="text-zinc-400 text-xs mb-1">{t('opPlayers')}</div>
          <div className="font-bold text-sm truncate" title={server.ops?.join(', ')}>{server.ops?.join(', ') || 'אין מנהלים'}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-xl">
          <div className="text-zinc-400 text-sm mb-1 flex items-center gap-2">
            <Users size={16} /> {t('players')}
            {playersLive?.online && <span className="text-xs text-green-400 ml-auto">● live</span>}
          </div>
          <div className="text-3xl font-bold">
            {playersLive?.online ? playersLive.count : (server.status === 'online' ? server.players : 0)}
            <span className="text-base text-zinc-500 font-normal"> / {playersLive?.max || server.maxPlayers || 20}</span>
          </div>
          {playersLive?.players?.length > 0 && (
            <div className="mt-2 text-xs text-zinc-400 truncate">{playersLive.players.join(', ')}</div>
          )}
        </div>
        <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-xl">
          <div className="text-zinc-400 text-sm mb-1">{t('ram')}</div>
          <div className="text-3xl font-bold">
            {liveStats.ram !== null ? (liveStats.ram / 1024).toFixed(1) : (server.status === 'online' ? '…' : '0')}
            <span className="text-base text-zinc-500 font-normal"> GB / {((server.memoryMb || 2048) / 1024).toFixed(0)} GB</span>
          </div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-xl">
          <div className="text-zinc-400 text-sm mb-1">{t('cpu')}</div>
          <div className="text-3xl font-bold">
            {liveStats.cpu !== null ? liveStats.cpu : (server.status === 'online' ? '…' : '0')}
            <span className="text-base text-zinc-500 font-normal"> %</span>
          </div>
        </div>
      </div>
    </div>
  );
}
