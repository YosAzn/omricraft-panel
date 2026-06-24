import React, { useState, useEffect } from 'react';
import {
  AlertCircle, RefreshCcw, ArrowLeft, Server, RefreshCw, Square, Play,
  HardDrive, Map as MapIcon, Terminal, Package, Folder, Settings, Archive
} from 'lucide-react';

import { TabBtn } from '../ui';
import OverviewTab from './OverviewTab';
import MapTab from './MapTab';
import ConsoleTab from './ConsoleTab';
import AddonsTab from './AddonsTab';
import FilesTab from './FilesTab';
import SettingsTab from './SettingsTab';
import BackupsTab from './BackupsTab';

export default function ServerPanel({ server, onBack, toggleStatus, restartServer, toggleAddon, onDelete, updateServer, t, allAddons, userRole, mcVersions, versionMatrix = {}, syncStatus, playersData }) {
  const [activeTab, setActiveTab] = useState('overview');
  const hasMapPlugin = server.installedAddons.includes('p9');

  // Sync real status from VPS on panel open
  useEffect(() => {
    if (syncStatus) syncStatus(server.id);
  }, [server.id]);

  return (
    <div className="animate-in fade-in duration-300">
      
      {server.needsRestart && (
        <div className="bg-yellow-500/20 border border-yellow-500/50 text-yellow-200 p-4 rounded-xl mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3 font-bold">
            <AlertCircle size={20} className="text-yellow-400" />
            {t('restartRequired')}
          </div>
          {userRole === 'admin' && (
            <button onClick={restartServer} className="bg-yellow-500 text-yellow-950 px-4 py-2 rounded-lg font-bold hover:bg-yellow-400 transition-colors whitespace-nowrap flex items-center gap-2">
              <RefreshCcw size={16}/> {t('restart')}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors">
            <ArrowLeft size={20} className="rtl:rotate-180" />
          </button>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-zinc-950 rounded-xl flex items-center justify-center border border-zinc-800 overflow-hidden shadow-lg hidden sm:flex">
                {server.icon ? <img src={server.icon} alt="Logo" className="w-full h-full object-cover" /> : <Server size={24} className="text-zinc-600"/>}
            </div>
            <div>
              <h2 className="text-3xl font-bold">{server.name}</h2>
              <div className="flex items-center gap-3 text-zinc-400 text-sm mt-1">
                <span>{server.software} {server.version}</span>
                <span className="w-1 h-1 rounded-full bg-zinc-600"></span>
                <span>{server.address || (server.slug ? `${server.slug}.omricraft.com` : server.id)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 p-2 rounded-xl">
          <div className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2
            ${server.status === 'online' ? 'text-green-400' : server.status === 'starting' ? 'text-yellow-400' : 'text-zinc-400'}`}
          >
            <span className={`w-2.5 h-2.5 rounded-full ${server.status === 'online' ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.5)]' : server.status === 'starting' ? 'bg-yellow-400 animate-pulse' : 'bg-zinc-500'}`}></span>
            {t(server.status)}
          </div>
          
          {userRole === 'admin' && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => syncStatus && syncStatus(server.id)}
                className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
                title="רענן סטטוס אמיתי מהשרת"
              >
                <RefreshCw size={16} />
              </button>
              <button
                onClick={toggleStatus}
                className={`px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all
                  ${server.status === 'online' ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20'}`}
              >
                {server.status === 'starting'
                  ? <RefreshCw size={16} className="animate-spin" />
                  : server.status === 'online'
                  ? <Square size={16} fill="currentColor" />
                  : <Play size={16} fill="currentColor" />}
                {server.status === 'online' ? t('stop') : t('start')}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-64 flex-shrink-0">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden flex flex-row lg:flex-col p-2 gap-1 overflow-x-auto">
            <TabBtn icon={<HardDrive size={18} />} label={t('overview')} active={activeTab === 'overview'} onClick={() => setActiveTab('overview')} />
            {hasMapPlugin && <TabBtn icon={<MapIcon size={18} className="text-blue-400"/>} label={t('mapTab')} active={activeTab === 'map'} onClick={() => setActiveTab('map')} />}
            <TabBtn icon={<Terminal size={18} />} label={t('console')} active={activeTab === 'console'} onClick={() => setActiveTab('console')} />
            <TabBtn icon={<Package size={18} />} label={t('addonsTab')} active={activeTab === 'addons'} onClick={() => setActiveTab('addons')} badge={server.installedAddons.length} />
            <TabBtn icon={<Folder size={18} />} label={t('filesTab')} active={activeTab === 'files'} onClick={() => setActiveTab('files')} />
            {userRole === 'admin' && <TabBtn icon={<Archive size={18} />} label={t('backupsTab')} active={activeTab === 'backups'} onClick={() => setActiveTab('backups')} />}
            {userRole === 'admin' && <TabBtn icon={<Settings size={18} />} label={t('advanced')} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />}
          </div>
        </div>

        <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-6 min-h-[500px]">
          {activeTab === 'overview' && <OverviewTab server={server} t={t} playersLive={(playersData || {})[server.id]} />}
          {activeTab === 'map' && <MapTab server={server} t={t} />}
          {activeTab === 'console' && <ConsoleTab server={server} t={t} userRole={userRole} />}
          {activeTab === 'addons' && <AddonsTab server={server} toggleAddon={toggleAddon} t={t} allAddons={allAddons} userRole={userRole} />}
          {activeTab === 'files' && <FilesTab server={server} t={t} userRole={userRole} />}
          {activeTab === 'backups' && userRole === 'admin' && <BackupsTab server={server} t={t} userRole={userRole} syncStatus={syncStatus} />}
          {activeTab === 'settings' && userRole === 'admin' && <SettingsTab server={server} onDelete={onDelete} updateServer={updateServer} t={t} mcVersions={mcVersions} versionMatrix={versionMatrix} />}
        </div>
      </div>
    </div>
  );
}
