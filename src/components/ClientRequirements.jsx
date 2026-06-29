import React, { useState } from 'react';
import { ChevronDown, Download, Monitor, CheckCircle2 } from 'lucide-react';

import { getClientLoader } from '../lib/constants';

// Tells the PLAYER what THEY need on their own PC to JOIN this server. The server-side
// loader is already installed on the VPS — this is purely client-side guidance (we
// can't touch the player's machine). Version-aware: states the exact MC version the
// loader build must match. he+en via t() (other langs fall back through translate()).
//
// Props:
//   type        — software id (vanilla/paper/.../fabric/forge/neoforge/mohist)
//   version     — the server's Minecraft version (e.g. "1.21.4")
//   defaultOpen — start expanded (default: collapsed, unobtrusive)
//   compact     — slimmer styling for inline use in the create form
export default function ClientRequirements({ type, version, t, defaultOpen = false, compact = false }) {
  const loader = getClientLoader(type);
  const [open, setOpen] = useState(defaultOpen);

  const needsLoader = !!loader.needsLoader;
  // Accent + icon differ so "no loader needed" reads reassuring (green) and
  // "install a loader" reads as an action (teal, matching the client-download links).
  const accent = needsLoader ? 'teal' : 'green';
  const HeadIcon = needsLoader ? Monitor : CheckCircle2;

  return (
    <div className={`rounded-xl border ${needsLoader ? 'border-teal-500/30 bg-teal-500/5' : 'border-green-500/25 bg-green-500/5'} ${compact ? 'p-3' : 'p-4'}`}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); }}
        className="flex items-center gap-2 w-full text-start"
      >
        <HeadIcon size={16} className={needsLoader ? 'text-teal-400' : 'text-green-400'} />
        <span className={`font-bold text-sm ${needsLoader ? 'text-teal-300' : 'text-green-300'}`}>
          {t('clientReqTitle')}
        </span>
        <ChevronDown
          size={15}
          className={`ms-auto transition-transform ${needsLoader ? 'text-teal-400' : 'text-green-400'} ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-3 text-sm leading-relaxed">
          {needsLoader ? (
            <>
              <p className="text-zinc-300">
                {t('clientReqInstall')}{' '}
                <b className="text-white">{loader.label}</b>{' '}
                {t('clientReqForVersion')}{' '}
                <b className="text-white" dir="ltr">{version}</b>.
              </p>
              {/* Per-type clarification (Fabric API, Mohist conditional, etc.) */}
              <p className="text-zinc-400 text-xs mt-1.5">{t(loader.noteKey)}</p>
              <p className="text-zinc-400 text-xs mt-1.5">{t('clientReqAlsoMods')}</p>
              {loader.installerUrl && (
                <a
                  href={loader.installerUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1.5 mt-2.5 text-[12px] font-bold text-teal-300 hover:text-teal-200 border border-teal-500/30 bg-teal-500/10 rounded px-2 py-1 transition-colors"
                >
                  <Download size={13} /> {loader.label} <span className="text-teal-500/70">↗</span>
                </a>
              )}
            </>
          ) : (
            <p className="text-zinc-300">{t('clientReqVanilla')}</p>
          )}
        </div>
      )}
    </div>
  );
}
