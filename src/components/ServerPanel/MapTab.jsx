import React from 'react';
import { Map as MapIcon } from 'lucide-react';

export default function MapTab({ server, t }) {
  const VPS_IP = '151.145.94.177';
  const mapUrl = server.blueMapPort
    ? `http://${VPS_IP}:${server.blueMapPort}`
    : null;

  return (
    <div className="h-full flex flex-col animate-in fade-in space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold flex items-center gap-2 text-xl"><MapIcon size={20} className="text-blue-400"/> {t('mapTab')} (BlueMap)</h3>
        {server.status !== 'online' && <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">{t('offline')}</span>}
      </div>
      <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-center min-h-[400px] relative overflow-hidden">
        {server.status === 'online' && mapUrl ? (
          <iframe src={mapUrl} title="Live Map" className="absolute inset-0 w-full h-full border-0"></iframe>
        ) : (
          <div className="text-zinc-500 flex flex-col items-center gap-3 text-center px-8 z-10">
            <MapIcon size={40} className="text-zinc-700"/>
            {server.status !== 'online' ? (
              <p>הפעל את השרת כדי לצפות במפה החיה</p>
            ) : (
              <>
                <p className="text-sm">מפת BlueMap החיה</p>
                <p className="text-xs text-zinc-600">בקרוב — מפת תלת-ממד חיה של העולם, ישירות בדפדפן</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
