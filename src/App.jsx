import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Server, Globe, Library, Shield, Users } from 'lucide-react';

import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';

import { auth, db } from './lib/firebase';
import {
  createServerFn, deleteServerFn, getServerStatusFn, startServerFn,
  stopServerFn, getPaperVersionsFn, getVersionMatrixFn,
  installPluginFn, getPlayersOnlineFn, restartServerFn
} from './lib/api';
import { DICT } from './lib/i18n';
import { DEFAULT_ADDONS } from './lib/constants';
import { NavBtn } from './components/ui';
import Dashboard from './components/Dashboard';
import CreateServerForm from './components/CreateServerForm';
import GlobalRepository from './components/GlobalRepository';
import ServerPanel from './components/ServerPanel/ServerPanel';

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [adminUid, setAdminUid] = useState(null);
  const [userRole, setUserRole] = useState('admin');
  const [lang, setLang] = useState('he');
  const t = (key) => DICT[lang][key] || key;
  const isRtl = lang === 'he';

  const [currentView, setCurrentView] = useState('dashboard');
  const [activeServerId, setActiveServerId] = useState(null);
  
  // Verified Paper versions ONLY. Never list versions Paper can't build (e.g. 26.x):
  // create-server would silently fall back to a different jar under a false label,
  // and Velocity would then reject the matching client. Max real version = 1.21.11.
  const FALLBACK_VERSIONS = [
    '1.21.11','1.21.10','1.21.9','1.21.8','1.21.7','1.21.6','1.21.5','1.21.4',
    '1.21.3','1.21.1','1.21',
    '1.20.6','1.20.5','1.20.4','1.20.2','1.20.1','1.20',
    '1.19.4','1.19.3','1.19.2','1.19.1','1.19',
    '1.18.2','1.18.1','1.18',
    '1.17.1','1.17',
    '1.16.5','1.16.4','1.16.3','1.16.2','1.16.1',
    '1.15.2','1.15.1','1.15',
    '1.14.4','1.14.3','1.14.2','1.14.1','1.14',
    '1.13.2','1.13.1','1.13',
    '1.12.2','1.12.1','1.12',
    '1.8.8','1.7.10',
  ];
  const [mcVersions, setMcVersions] = useState(FALLBACK_VERSIONS);

  // Load versions via Firebase Function (avoids PaperMC CORS restriction), cache 6h
  // v3 cache key — forces refresh to evict the phantom 26.x versions
  useEffect(() => {
    ['mc-versions','mc-versions-ts','mc-versions-v2','mc-versions-v2-ts'].forEach(k => localStorage.removeItem(k));
    const cached = localStorage.getItem('mc-versions-v3');
    const ts = parseInt(localStorage.getItem('mc-versions-v3-ts') || '0');
    if (cached && Date.now() - ts < 21600000) {
      try { setMcVersions(JSON.parse(cached)); return; } catch(e) {}
    }
    localStorage.removeItem('mc-versions-v3');
    localStorage.removeItem('mc-versions-v3-ts');
    getPaperVersionsFn()
      .then(res => {
        const versions = res.data?.versions;
        if (Array.isArray(versions) && versions.length > 0) {
          setMcVersions(versions);
          localStorage.setItem('mc-versions-v3', JSON.stringify(versions));
          localStorage.setItem('mc-versions-v3-ts', String(Date.now()));
        }
      })
      .catch(() => {}); // keep fallback on error
  }, []);

  // Per-server-type version matrix. Paper tops out at 1.21.x, but Purpur/Fabric/
  // Vanilla already ship the real 26.x releases — so the version list shown in the
  // create form is driven by the SELECTED type, not one global list. Cached 6h.
  const [versionMatrix, setVersionMatrix] = useState({});
  useEffect(() => {
    const cached = localStorage.getItem('mc-version-matrix-v1');
    const ts = parseInt(localStorage.getItem('mc-version-matrix-v1-ts') || '0');
    if (cached && Date.now() - ts < 21600000) {
      try { setVersionMatrix(JSON.parse(cached)); return; } catch(e) {}
    }
    getVersionMatrixFn()
      .then(res => {
        const matrix = res.data?.matrix;
        if (matrix && typeof matrix === 'object') {
          setVersionMatrix(matrix);
          localStorage.setItem('mc-version-matrix-v1', JSON.stringify(matrix));
          localStorage.setItem('mc-version-matrix-v1-ts', String(Date.now()));
        }
      })
      .catch(() => {}); // keep {} → falls back to mcVersions per-type in the form
  }, []);

  const [servers, setServers] = useState([]);
  const [customAddons, setCustomAddons] = useState([]);
  const [playersData, setPlayersData] = useState({}); // { serverId: { count, max, players, online } }

  const creatingServerRef = useRef(false);
  const [isCreatingServer, setIsCreatingServer] = useState(false);

  // --- FIREBASE INTEGRATION (AUTH & SYNC) ---
  useEffect(() => {
    if (!auth) return;
    
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (e) {
        console.error("Auth Error:", e);
      }
    };
    
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setAuthUser(user);
        // Check/set admin UID from Firestore config
        try {
          const configRef = doc(db, 'omricraft/main/config', 'admin');
          const configSnap = await getDoc(configRef);
          if (configSnap.exists()) {
            setAdminUid(configSnap.data().adminUid || null);
          } else {
            // First device to auth — claim admin
            await setDoc(configRef, { adminUid: user.uid });
            setAdminUid(user.uid);
          }
        } catch (e) { /* silent */ }
      } else {
        initAuth();
      }
    });

    return () => unsubscribe();
  }, []);

  // Shared path — all browsers/devices see the same servers
  const getServersPath = () => 'omricraft/main/servers';
  const getAddonsPath = () => 'omricraft/main/customAddons';

  useEffect(() => {
    if (!db) return;

    const serversPath = getServersPath();
    const addonsPath = getAddonsPath();

    const unsubServers = onSnapshot(collection(db, serversPath), (snap) => {
      setServers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Firestore Listen Error (Servers):", err));

    const unsubAddons = onSnapshot(collection(db, addonsPath), (snap) => {
      setCustomAddons(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Firestore Listen Error (Addons):", err));

    return () => { unsubServers(); unsubAddons(); };
  }, []);

  // Poll player counts every 30s (non-blocking, best-effort)
  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const res = await getPlayersOnlineFn();
        if (res?.data?.success && res.data.servers) {
          setPlayersData(res.data.servers);
        }
      } catch (e) { /* silent */ }
    };
    fetchPlayers();
    const interval = setInterval(fetchPlayers, 30000);
    return () => clearInterval(interval);
  }, []);
  // ----------------------------------------

  const isAdmin = authUser && adminUid && authUser.uid === adminUid;

  const visibleServers = useMemo(() => {
    if (isAdmin) return servers; // admin sees all
    if (!authUser) return [];
    // non-admin: sees only own servers (or legacy servers with no ownerUid)
    return servers.filter(s => !s.ownerUid || s.ownerUid === authUser.uid);
  }, [servers, isAdmin, authUser]);

  const allAddons = useMemo(() => [...DEFAULT_ADDONS, ...customAddons], [customAddons]);
  const activeServer = visibleServers.find(s => s.id === activeServerId);

  const HEBREW_TO_LATIN = {
    'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v',
    'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'y', 'כ': 'k', 'ך': 'kh',
    'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's',
    'ע': 'a', 'פ': 'p', 'ף': 'f', 'צ': 'tz', 'ץ': 'tz', 'ק': 'k',
    'ר': 'r', 'ש': 'sh', 'ת': 't'
  };

  const transliterateHebrew = (value) => {
    return String(value || '')
      .split('')
      .map(char => HEBREW_TO_LATIN[char] || char)
      .join('');
  };

  const makeSafeServerSlug = (name) => {
    const rawName = String(name || '').trim();

    let slug = transliterateHebrew(rawName)
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);

    if (!slug || !/[a-z0-9]/.test(slug)) {
      slug = 'server';
    }

    return slug;
  };

  const commandLooksSuccessful = (payload) => {
    if (!payload) return false;
    if (payload.success === true) return true;

    const output = String(
      payload.output ||
      payload.message ||
      payload.result ||
      ''
    );

    const hasFailure =
      /failed|error|exception|unknown command|invalid|could not|not found|already exists/i.test(output);

    const hasSuccess =
      /world ['"]?.+['"]? created|created!|creating world|preparing spawn area/i.test(output);

    return hasSuccess && !hasFailure;
  };

  const getRconOutput = (payload) => {
    return String(
      payload?.output ||
      payload?.message ||
      payload?.result ||
      ''
    );
  };

  const getServerDomain = (server) => {
    if (!server) return '';
    if (server.address) return server.address;
    const slug = server.slug || server.serverSlug || server.worldName || server.id;
    return slug ? `${slug}.omricraft.com` : '';
  };

  const getServerAddress = (server) => {
    if (server?.address) return server.address;
    const slug = server?.slug || server?.serverSlug || server?.worldName || server?.id;
    return slug ? `${slug}.omricraft.com` : '';
  };

  const copyToClipboard = (text) => {
    const value = String(text || '').trim();
    if (!value) return false;

    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(value).catch(() => {});
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = value;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      return true;
    } catch (error) {
      console.error('Clipboard copy failed:', error);
      return false;
    }
  };

  // Resize image to 64x64 PNG (Minecraft server-icon spec), returns small base64
  const resizeIconTo64 = (base64Src) => new Promise((resolve) => {
    if (!base64Src) return resolve('');
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64; canvas.height = 64;
      canvas.getContext('2d').drawImage(img, 0, 0, 64, 64);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve('');
    img.src = base64Src;
  });

  const handleCreateServer = async (data) => {
    if (creatingServerRef.current) {
      console.warn('World creation is already in progress. Ignoring duplicate click.');
      return;
    }

    creatingServerRef.current = true;
    setIsCreatingServer(true);

    try {
      if (!db) {
        throw new Error('Database is not ready.');
      }

      // Resize icon to 64x64 PNG before sending (keeps Firestore doc small + valid MC format)
      const smallIcon = await resizeIconTo64(data.icon || '');

      const finalSeed = data.seed || Math.floor(Math.random() * 9000000000) + 1000000000;

      let resolvedAddons = [...data.installedAddons];

      const modpacksIncluded = data.installedAddons.filter(id => {
        const a = allAddons.find(addon => addon.id === id);
        return a && a.type === 'modpacks' && a.includedAddons;
      });

      modpacksIncluded.forEach(mpId => {
        const mp = allAddons.find(addon => addon.id === mpId);
        if (mp && mp.includedAddons) {
          resolvedAddons = [...new Set([...resolvedAddons, ...mp.includedAddons])];
        }
      });

      const displayName = String(data.name || 'New Server').trim();

      console.log(`Creating real server: ${displayName}`);

      const result = await createServerFn({
        displayName,
        type: data.software || 'paper',
        version: data.version || '1.21.1',
        memoryMb: data.memoryMb || 2048,
        gamemode: data.gamemode || 'survival',
        difficulty: data.difficulty || 'normal',
        ops: data.ops || [],
        maxPlayers: data.maxPlayers || 20,
        seed: String(finalSeed || ''),
        addons: resolvedAddons,
        icon: smallIcon,
        isPrivate: data.isPrivate === true,
        whitelistPlayers: Array.isArray(data.whitelistPlayers) ? data.whitelistPlayers : []
      });

      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Server creation failed');
      }

      const { icon: _raw, ...dataWithoutIcon } = data;

      const serverData = {
        ...dataWithoutIcon,
        id: result.data.id,
        name: result.data.displayName,
        displayName: result.data.displayName,
        slug: result.data.slug,
        address: result.data.address,
        publicHost: result.data.address,
        gamePort: result.data.gamePort,
        rconPort: result.data.rconPort,
        backendAddress: `127.0.0.1:${result.data.gamePort}`,
        seed: finalSeed.toString(),
        installedAddons: resolvedAddons,
        icon: smallIcon,
        difficulty: data.difficulty || 'normal',
        isPrivate: data.isPrivate === true,
        whitelistPlayers: data.whitelistPlayers || [],
        ownerUid: authUser?.uid || null,
        status: 'starting',
        players: 0,
        needsRestart: false,
        discordWebhook: '',
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, getServersPath(), serverData.id), serverData);

      setActiveServerId(serverData.id);
      setCurrentView('server');

    } catch (error) {
      console.error('World creation error:', error);
      alert(`World creation failed: ${error.message}`);
    } finally {
      creatingServerRef.current = false;
      setIsCreatingServer(false);
    }
  };

  const deleteAllServers = async () => {
    if (userRole !== 'admin') return;
    if (servers.length === 0) { alert('אין שרתים למחיקה.'); return; }
    const approved = window.confirm(
      `מחיקת כל ${servers.length} השרתים?\n\nפעולה זו תמחק לצמיתות את כל השרתים מהשרת ומה-Firebase. לא ניתן לבטל.`
    );
    if (!approved) return;
    for (const srv of servers) {
      try {
        await deleteServerFn({ serverId: srv.id }).catch(() => {});
        await deleteDoc(doc(db, getServersPath(), srv.id)).catch(() => {});
      } catch (e) {
        console.error('Failed to delete', srv.id, e);
      }
    }
    setCurrentView('dashboard');
    alert('כל השרתים נמחקו.');
  };

  const deleteServer = async (id) => {
    if (userRole !== 'admin') return;

    const currentServer = servers.find(s => s.id === id);
    if (!currentServer) {
      alert('לא נמצא שרת למחיקה.');
      return;
    }

    const displayName = currentServer.displayName || currentServer.name || id;

    const approved = window.confirm(
      `למחוק את "${displayName}"?\n\nהפעולה תעצור את השרת, תמחק את תיקיית השרת ותסיר את הניתוב. לא ניתן לבטל.`
    );

    if (!approved) return;

    try {
      if (!db) {
        throw new Error('אין חיבור תקין ל-Firebase.');
      }

      await updateDoc(doc(db, getServersPath(), id), {
        status: 'deleting',
        deletingAt: new Date().toISOString()
      });

      const result = await deleteServerFn({ serverId: id });

      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Delete failed');
      }

      await deleteDoc(doc(db, getServersPath(), id));
      setCurrentView('dashboard');

    } catch (error) {
      console.error('שגיאה במחיקת העולם:', error);

      try {
        await updateDoc(doc(db, getServersPath(), id), {
          status: 'delete_failed',
          deleteError: error.message,
          deleteFailedAt: new Date().toISOString()
        });
      } catch (innerError) {
        console.error('Failed to update delete_failed status:', innerError);
      }

      alert(`המחיקה נכשלה: ${error.message}`);
    }
  };

  const toggleServerStatus = async (id) => {
    if (userRole !== 'admin') return;

    // First get real status from VPS
    let isRunning = false;
    try {
      const statusRes = await getServerStatusFn({ serverId: id });
      isRunning = statusRes.data?.running === true;
    } catch (e) {
      // fallback to Firestore status
      const srv = servers.find(s => s.id === id);
      isRunning = srv?.status === 'online';
    }

    if (isRunning) {
      // Stop the server
      if (db && authUser) await updateDoc(doc(db, getServersPath(), id), { status: 'offline', players: 0 });
      try { await stopServerFn({ serverId: id }); } catch(e) { console.error('Stop failed', e); }
    } else {
      // Start the server
      if (db && authUser) await updateDoc(doc(db, getServersPath(), id), { status: 'starting', players: 0 });
      try {
        await startServerFn({ serverId: id });
        if (db && authUser) await updateDoc(doc(db, getServersPath(), id), { status: 'online' });
      } catch(e) {
        console.error('Start failed', e);
        if (db && authUser) await updateDoc(doc(db, getServersPath(), id), { status: 'offline' });
      }
    }
  };

  // Sync status from VPS when entering server panel
  const syncServerStatus = async (id) => {
    if (!id || !db || !authUser) return;
    try {
      const statusRes = await getServerStatusFn({ serverId: id });
      const running = statusRes.data?.running === true;
      await updateDoc(doc(db, getServersPath(), id), { status: running ? 'online' : 'offline' });
    } catch(e) {}
  };

  // Auto-sync all server statuses when dashboard is shown
  useEffect(() => {
    if (currentView !== 'dashboard' || !db || !authUser || servers.length === 0) return;
    let cancelled = false;
    const syncAll = async () => {
      for (const srv of servers) {
        if (cancelled) break;
        try {
          const res = await getServerStatusFn({ serverId: srv.id });
          const running = res.data?.running === true;
          const newStatus = running ? 'online' : 'offline';
          if (srv.status !== newStatus) {
            await updateDoc(doc(db, getServersPath(), srv.id), { status: newStatus });
          }
        } catch(e) {}
      }
    };
    syncAll();
    return () => { cancelled = true; };
  }, [currentView, authUser]);

  const restartServer = async (id) => {
    if (userRole !== 'admin') return;
    if (db && authUser) {
      await updateDoc(doc(db, getServersPath(), id), { status: 'starting', players: 0, needsRestart: false });
    }
    try {
      await restartServerFn({ serverId: id });
      if (db && authUser) await updateDoc(doc(db, getServersPath(), id), { status: 'online' });
    } catch (e) {
      console.error('Restart failed', e);
      if (db && authUser) await updateDoc(doc(db, getServersPath(), id), { status: 'online' }); // best-effort
    }
  }

  const toggleAddonForServer = async (serverId, addon) => {
    if (userRole !== 'admin') return;
    const currentServer = servers.find(s => s.id === serverId);
    if (!currentServer) return;

    let newAddons = [...currentServer.installedAddons];
    const isInstalled = newAddons.includes(addon.id);

    if (isInstalled) {
      newAddons = newAddons.filter(id => id !== addon.id);
    } else {
      newAddons.push(addon.id);
      if (addon.type === 'modpacks' && addon.includedAddons) {
        newAddons = [...new Set([...newAddons, ...addon.includedAddons])];
      }
    }

    // Update Firestore metadata immediately (optimistic)
    if (db && authUser) {
      await updateDoc(doc(db, getServersPath(), serverId), {
        installedAddons: newAddons,
        needsRestart: true,
      });
    }

    // Actually install/remove the plugin on VPS, with rollback on failure
    try {
      const res = await installPluginFn({ serverId, pluginId: addon.id, install: !isInstalled });
      const d = res.data || res;
      if (!d.success && d.note === undefined) throw new Error(d.error || 'VPS install failed');
    } catch (e) {
      console.error('toggleAddon VPS install/remove failed:', e);
      // rollback Firestore to previous addon list
      if (db && authUser) {
        await updateDoc(doc(db, getServersPath(), serverId), {
          installedAddons: currentServer.installedAddons,
          needsRestart: currentServer.needsRestart || false,
        });
      }
      alert(`שגיאה בהתקנת/הסרת הפלאגין: ${e.message}`);
    }
  };

  const updateServer = async (serverId, newData) => {
    if (userRole !== 'admin') return;
    const currentServer = servers.find(s => s.id === serverId);
    if (!currentServer) return;

    const requiresRestart = (newData.version && newData.version !== currentServer.version) && currentServer.status === 'online';
    
    if (db && authUser) {
      await updateDoc(doc(db, getServersPath(), serverId), { 
        ...newData, 
        needsRestart: requiresRestart || currentServer.needsRestart 
      });
    }
  };

 const handleAddCustomAddon = async (addonData) => {
    // אם העברנו ID מראש נשתמש בו, אחרת נייצר חדש
    const newAddon = { ...addonData, id: addonData.id || `c_${Math.random().toString(36).substring(7)}`, rating: 5.0, reviews: 0 };
    if (db && authUser) {
      await setDoc(doc(db, getAddonsPath(), newAddon.id), newAddon);
    }
  };

  const handleDeleteCustomAddon = async (id) => {
    if (db && authUser) {
      await deleteDoc(doc(db, getAddonsPath(), id));
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans" dir={isRtl ? "rtl" : "ltr"}>
      <nav className="bg-zinc-900 border-b border-zinc-800 p-4 sticky top-0 z-20 shadow-lg">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          
          <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentView('dashboard')}>
              <div className="bg-green-600 p-2 rounded-lg"><Server size={24} className="text-white" /></div>
              <h1 className="text-2xl font-black tracking-tight bg-gradient-to-l from-green-400 to-emerald-600 bg-clip-text text-transparent hidden sm:block">
                {t('appTitle')}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <NavBtn active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} icon={<Server size={18}/>} label={t('dashboard')} />
              <NavBtn active={currentView === 'repository'} onClick={() => setCurrentView('repository')} icon={<Library size={18}/>} label={t('repo')} />
            </div>
          </div>
          
          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end bg-zinc-950 sm:bg-transparent p-2 sm:p-0 rounded-lg">
            <div className="flex bg-zinc-800 p-1 rounded-lg">
              <button 
                onClick={() => setUserRole('admin')} 
                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1 transition-all ${userRole === 'admin' ? 'bg-emerald-600 text-white' : 'text-zinc-400 hover:text-white'}`}
              >
                <Shield size={14}/> <span className="hidden sm:inline">{t('roleAdmin')}</span>
              </button>
              <button 
                onClick={() => setUserRole('member')} 
                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1 transition-all ${userRole === 'member' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'}`}
              >
                <Users size={14}/> <span className="hidden sm:inline">{t('roleMember')}</span>
              </button>
            </div>

            <button onClick={() => setLang(lang === 'he' ? 'en' : 'he')} className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1 text-sm px-2 py-1.5 rounded-full" title={t('language')}>
              <Globe size={16} /> <span className="uppercase font-bold text-xs">{lang === 'he' ? 'EN' : 'HE'}</span>
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 relative">
        {currentView === 'dashboard' && (
          <Dashboard
            servers={visibleServers} t={t} userRole={userRole}
            onOpenServer={(id) => { setActiveServerId(id); setCurrentView('server'); }}
            onCreateClick={() => setCurrentView('create')}
            toggleServerStatus={toggleServerStatus}
            onDeleteAll={deleteAllServers}
          />
        )}
        
        {currentView === 'create' && (
          <CreateServerForm
            t={t}
            allAddons={allAddons}
            userRole={userRole}
            mcVersions={mcVersions}
            versionMatrix={versionMatrix}
            onCancel={() => setCurrentView('dashboard')}
            onCreate={handleCreateServer}
            isCreatingServer={isCreatingServer}
          />
        )}

        {currentView === 'server' && activeServer && (
          <ServerPanel
            server={activeServer} t={t} allAddons={allAddons} userRole={userRole} mcVersions={mcVersions} versionMatrix={versionMatrix}
            onBack={() => setCurrentView('dashboard')}
            toggleStatus={() => toggleServerStatus(activeServer.id)}
            restartServer={() => restartServer(activeServer.id)}
            toggleAddon={(addon) => toggleAddonForServer(activeServer.id, addon)}
            onDelete={() => deleteServer(activeServer.id)}
            updateServer={(newData) => updateServer(activeServer.id, newData)}
            syncStatus={syncServerStatus}
            playersData={playersData}
          />
        )}

        {currentView === 'repository' && (
          <GlobalRepository 
            t={t} allAddons={allAddons} customAddons={customAddons} userRole={userRole}
            onAdd={handleAddCustomAddon}
            onDelete={handleDeleteCustomAddon}
          />
        )}
      </main>
    </div>
  );
}

