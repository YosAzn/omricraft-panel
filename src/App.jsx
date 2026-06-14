import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Server, Play, Square, Package, Plus, Search,
  Terminal, HardDrive, Cpu, ArrowLeft, Check, Download, AlertCircle,
  Globe, User, Trash2, X, Library, UploadCloud, Link as LinkIcon,
  Shield, Users, RefreshCw, Map as MapIcon, RefreshCcw, Settings,
  Star, Layers, Camera, ImageIcon, Edit3, Palette,
  Folder, FileText, FileCode, Save
} from 'lucide-react';

import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';

import { auth, db } from './lib/firebase';
import {
  sendMcCommand, createServerFn, deleteServerFn, updateServerIconFn,
  setServerPrivacyFn, updateWhitelistPlayersFn, getServerStatusFn, startServerFn,
  stopServerFn, getPaperVersionsFn, getVersionMatrixFn, updateServerOpsFn,
  installPluginFn, changeDifficultyFn, getPlayersOnlineFn, getServerLogFn,
  updateServerPropertiesFn, restartServerFn, getServerStatsFn, listFilesFn,
  readFileFn, writeFileFn, deleteFileFn, reloadPluginFn, removePluginJarFn,
  changeServerVersionFn, changeServerTypeFn, updateServerMemoryFn
} from './lib/api';
import { DICT } from './lib/i18n';
import { TYPE_COLORS, SOFTWARE_TYPES, DEFAULT_ADDONS } from './lib/constants';
import { isViaVersion } from './lib/utils';
import { NavBtn, TabBtn } from './components/ui';
import ImageUploader from './components/ImageUploader';
import WhitelistEditor from './components/ServerPanel/WhitelistEditor';
import OpsEditor from './components/ServerPanel/OpsEditor';
import DifficultyControl from './components/ServerPanel/DifficultyControl';

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

// ==========================================
// Sub-components
// ==========================================

function Dashboard({ servers, onOpenServer, onCreateClick, toggleServerStatus, onDeleteAll, t, userRole }) {
  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold mb-2">{t('ourServers')}</h2>
          <p className="text-zinc-400">{t('manageDesc')}</p>
        </div>
        {userRole === 'admin' && (
          <div className="flex gap-2">
            {servers.length > 0 && (
              <button
                onClick={onDeleteAll}
                className="bg-red-900/40 hover:bg-red-800/60 text-red-400 border border-red-800/40 px-4 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-all"
              >
                <Trash2 size={16} /> <span>מחק הכל</span>
              </button>
            )}
            <button
              onClick={onCreateClick}
              className="bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/20"
            >
              <Plus size={20} /> <span>{t('newServer')}</span>
            </button>
          </div>
        )}
      </div>

      {servers.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-12 text-center">
          <Server className="mx-auto text-zinc-600 mb-4" size={48} />
          <h3 className="text-xl font-bold mb-2">{t('noServers')}</h3>
          <p className="text-zinc-500 mb-6">{t('noServersDesc')}</p>
          {userRole === 'admin' && (
            <button onClick={onCreateClick} className="bg-zinc-800 hover:bg-zinc-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
              {t('create')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {servers.map(server => (
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
          ))}
        </div>
      )}
    </div>
  );
}

function CreateServerForm({ onCancel, onCreate, allAddons, t, userRole, mcVersions, versionMatrix = {}, isCreatingServer = false }) {
  if (userRole !== 'admin') return <div className="text-center p-12 text-zinc-500">{t('noPermission')}</div>;

  const [name, setName] = useState('My Awesome Server');
  const [icon, setIcon] = useState(null); 
  const [software, setSoftware] = useState('paper');
  const [version, setVersion] = useState('1.21.4');
  const [gamemode, setGamemode] = useState('survival');
  const [worldType, setWorldType] = useState('default');
  const [opsString, setOpsString] = useState('');
  const [seed, setSeed] = useState('');
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [difficulty, setDifficulty] = useState('normal');
  const [isPrivate, setIsPrivate] = useState(false);
  const [whitelistString, setWhitelistString] = useState('');

  // State חדש לחיפוש תוספים
  const [addonSearch, setAddonSearch] = useState('');

  const relevantAddons = allAddons.filter(a => {
    if (a.type === 'textures') return true; 
    if (['fabric', 'forge'].includes(software) && ['mods', 'modpacks'].includes(a.type)) return true;
    if (['paper', 'purpur'].includes(software) && a.type === 'plugins') return true;
    if (a.type === 'datapacks') return true;
    return false;
  });

  // סינון התוספים לפי החיפוש
  const searchedAddons = relevantAddons.filter(a => 
    a.name.toLowerCase().includes(addonSearch.toLowerCase()) || 
    (a.desc && a.desc.toLowerCase().includes(addonSearch.toLowerCase()))
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    const opsArray = opsString.split(',').map(o => o.trim()).filter(Boolean);
    const whitelistArray = isPrivate ? whitelistString.split(',').map(o => o.trim()).filter(Boolean) : [];
    onCreate({
      name, icon, software, version, gamemode, worldType, ops: opsArray,
      seed: seed || undefined, installedAddons: selectedAddons, maxPlayers,
      difficulty, isPrivate, whitelistPlayers: whitelistArray
    });
  };

  const toggleSelection = (id) => setSelectedAddons(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);

  // Version list is driven by the SELECTED software type. Each type's real API
  // supports a different set (Paper ≤ 1.21.x, Purpur/Fabric/Vanilla ship 26.x).
  // Fall back to the global Paper list if the matrix hasn't loaded for that type.
  const typeVersions = (versionMatrix[software] && versionMatrix[software].length)
    ? versionMatrix[software]
    : mcVersions;

  // When the type changes, if the current version isn't valid for it, snap to newest.
  const handleSoftwareChange = (id) => {
    setSoftware(id);
    setSelectedAddons([]);
    const list = (versionMatrix[id] && versionMatrix[id].length) ? versionMatrix[id] : mcVersions;
    if (list.length && !list.includes(version)) setVersion(list[0]);
  };

  return (
    <div className="max-w-3xl mx-auto animate-in fade-in duration-300 pb-10">
      <button onClick={onCancel} className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 transition-colors">
        <ArrowLeft size={20} className="rtl:rotate-180" /> <span>{t('back')}</span>
      </button>

      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 md:p-8 shadow-xl">
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-2 pb-4 border-b border-zinc-800">
           <Play size={24} className="text-green-500"/> {t('create')}
        </h2>
        
        <form onSubmit={handleSubmit} className="space-y-8">
          
          <div className="flex flex-col sm:flex-row gap-6 items-start">
             <div className="flex-shrink-0">
               <label className="block text-sm font-bold text-zinc-400 mb-2 text-center">{t('serverIcon')}</label>
               <ImageUploader iconUrl={icon} setIconUrl={setIcon} t={t} size="lg" />
             </div>
             
             <div className="flex-1 w-full">
               <label className="block text-sm font-bold text-zinc-400 mb-2">{t('serverName')}</label>
               <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
                 className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-4 text-white text-lg font-bold focus:outline-none focus:border-green-500 transition-all shadow-inner" />
               <p className="text-xs text-zinc-500 mt-2">זה השם שיופיע לשחקנים ברשימת השרתים בתוך המשחק.</p>
             </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5">
            <label className="block text-sm font-bold text-zinc-400 mb-3">{t('software')}</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {SOFTWARE_TYPES.map(sw => (
                <div key={sw.id} onClick={() => handleSoftwareChange(sw.id)}
                  className={`cursor-pointer border rounded-lg p-3 text-center transition-all flex flex-col items-center gap-1
                    ${software === sw.id ? 'bg-green-500/10 border-green-500 text-green-400 shadow-md' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}>
                  <div className="font-bold">{sw.name}</div>
                  <div className="text-[10px] uppercase opacity-70">{sw.type}</div>
                  {sw.desc && <div className="text-[9px] opacity-50 leading-tight mt-0.5">{sw.desc}</div>}
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">{t('version')}</label>
              <select value={version} onChange={(e) => setVersion(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all">
                {typeVersions.map(v => <option key={v} value={v}>{v}{v === '1.21.4' ? ' (מומלץ)' : ''}</option>)}
              </select>
              <p className="text-xs text-blue-400 mt-2">
                💡 ViaVersion מותקן אצלנו אוטומטית — שחקנים מ<b>כל</b> גרסת מיינקראפט (כולל 26.x) יכולים להיכנס לשרת הזה, בלי קשר לגרסת השרת.
              </p>
              {isViaVersion(version) && (
                <p className="text-xs text-zinc-500 mt-1">
                  שים לב: זו גרסה חדשה יותר ממה ש-Paper בנה. כאן תקבל את <b>התוכן</b> המלא של {version}. (Paper מוגבל ל-1.21.11; לתוכן 26.x בחר Purpur/Fabric.)
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">{t('gamemode')}</label>
              <select value={gamemode} onChange={(e) => setGamemode(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all">
                <option value="survival">{t('survival')}</option>
                <option value="creative">{t('creative')}</option>
                <option value="adventure">{t('adventure')}</option>
                <option value="spectator">{t('spectator')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">{t('worldType')}</label>
              <select value={worldType} onChange={(e) => setWorldType(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all">
                <option value="default">{t('worldDefault')}</option>
                <option value="flat">{t('worldFlat')}</option>
                <option value="amplified">{t('worldAmplified')}</option>
                <option value="large_biomes">{t('worldLargeBiomes')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">{t('seed')}</label>
              <input type="text" placeholder={t('seed')} value={seed} onChange={(e) => setSeed(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all placeholder:text-zinc-600" />
            </div>
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">{t('maxPlayers')}</label>
              <input type="number" min={1} max={100} value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all" />
            </div>
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">{t('difficulty')}</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all">
                <option value="peaceful">{t('peaceful')}</option>
                <option value="easy">{t('easy')}</option>
                <option value="normal">{t('normal')}</option>
                <option value="hard">{t('hard')}</option>
              </select>
            </div>
          </div>

          {/* OP Players */}
          <div className="bg-zinc-950 border border-red-500/20 rounded-xl p-5">
             <label className="block text-sm font-bold text-red-400 mb-2">{t('opPlayers')}</label>
             <input type="text" placeholder={t('opPlayersDesc')} value={opsString} onChange={(e) => setOpsString(e.target.value)}
               className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-all placeholder:text-zinc-600" />
             <p className="text-xs text-zinc-500 mt-2">רק השחקנים ברשימה זו יוכלו להשתמש בפקודות ניהול בשרת.</p>
          </div>

          {/* Private / Public toggle + Whitelist (no gap between them) */}
          <div>
            <div
              onClick={() => setIsPrivate(p => !p)}
              className={`flex items-center justify-between rounded-xl p-4 cursor-pointer border transition-all ${isPrivate ? 'bg-yellow-500/10 border-yellow-500/40 rounded-b-none border-b-0' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600'}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isPrivate ? 'bg-yellow-500/20' : 'bg-zinc-800'}`}>
                  <Shield size={18} className={isPrivate ? 'text-yellow-400' : 'text-zinc-500'} />
                </div>
                <div>
                  <p className={`font-bold text-sm ${isPrivate ? 'text-yellow-400' : 'text-zinc-300'}`}>{isPrivate ? 'שרת פרטי' : 'שרת ציבורי'}</p>
                  <p className="text-xs text-zinc-500">{isPrivate ? 'רק שחקנים ב-Whitelist יוכלו להתחבר' : 'כל שחקן יכול להתחבר'}</p>
                </div>
              </div>
              <div className={`w-11 h-6 rounded-full transition-colors relative ${isPrivate ? 'bg-yellow-500' : 'bg-zinc-700'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${isPrivate ? 'left-6' : 'left-1'}`} />
              </div>
            </div>
            {isPrivate && (
              <div className="bg-yellow-500/5 border border-yellow-500/40 border-t-0 rounded-b-xl p-5">
                <label className="block text-sm font-bold text-yellow-400 mb-2">{t('whitelistPlayers')}</label>
                <input type="text" placeholder={t('whitelistPlayersDesc')} value={whitelistString} onChange={(e) => setWhitelistString(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-yellow-500 transition-all placeholder:text-zinc-600" />
                <p className="text-xs text-zinc-500 mt-2">שחקנים שלא ברשימה לא יוכלו להתחבר לשרת.</p>
              </div>
            )}
          </div>

          {relevantAddons.length > 0 && (
            <div className="space-y-4">
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <label className="block text-sm font-bold text-zinc-400">{t('selectAddons')} ({selectedAddons.length})</label>
                  <div className="relative w-full sm:w-64">
                    <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input 
                      type="text" 
                      placeholder="חיפוש תוסף..." 
                      value={addonSearch}
                      onChange={(e) => setAddonSearch(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pr-9 pl-3 py-1.5 text-xs text-white focus:outline-none focus:border-zinc-600"
                    />
                  </div>
               </div>
               
               <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2 max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                 {searchedAddons.map(a => (
                    <div key={a.id} onClick={() => toggleSelection(a.id)} className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer border transition-colors ${selectedAddons.includes(a.id) ? 'bg-green-500/5 border-green-500/50' : 'bg-zinc-900 border-transparent hover:border-zinc-700'}`}>
                      <div className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center border flex-shrink-0 ${selectedAddons.includes(a.id) ? 'bg-green-600 border-green-600' : 'border-zinc-600'}`}>
                        {selectedAddons.includes(a.id) && <Check size={14} className="text-white"/>}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm block leading-none text-zinc-200">{a.name}</span>
                          <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${TYPE_COLORS[a.type]}`}>
                            {t(a.type)}
                          </span>
                        </div>
                        <span className="text-xs text-zinc-400 mt-2 block leading-relaxed">{a.desc}</span>
                      </div>
                    </div>
                 ))}
                 {searchedAddons.length === 0 && <div className="col-span-full p-4 text-center text-zinc-600 text-sm">לא נמצאו תוספים התואמים לחיפוש.</div>}
               </div>
            </div>
          )}

          <hr className="border-zinc-800" />
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onCancel} className="px-6 py-3 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
              {t('cancel')}
            </button>
            <button type="submit" disabled={isCreatingServer} className="bg-green-600 hover:bg-green-500 text-white px-10 py-3 rounded-xl font-bold transition-all shadow-lg shadow-green-900/20 text-lg flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              <Play size={20} fill="currentColor"/> {isCreatingServer ? 'יוצר עולם...' : t('create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GlobalRepository({ allAddons, customAddons, onAdd, onDelete, t, userRole }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showModpackForm, setShowModpackForm] = useState(false);
  const [selectedAddon, setSelectedAddon] = useState(null);
  
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newType, setNewType] = useState('mods');
  const [fileUrl, setFileUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const [mpName, setMpName] = useState('');
  const [mpDesc, setMpDesc] = useState('');
  const [mpSelectedMods, setMpSelectedMods] = useState([]);

  // --- Quick Add State ---
  const [quickAdd, setQuickAdd] = useState(false);
  const [qaName, setQaName] = useState('');
  const [qaDesc, setQaDesc] = useState('');
  const [qaType, setQaType] = useState('mods');
  const [qaUrl, setQaUrl] = useState('');

  const filtered = allAddons.filter(a => 
    (filter === 'all' || a.type === filter) &&
    (a.name.toLowerCase().includes(search.toLowerCase()) || a.desc.toLowerCase().includes(search.toLowerCase()))
  );

  const handleAdd = (e) => {
    e.preventDefault();
    onAdd({
      name: newName,
      desc: newDesc,
      type: newType,
      fileName: selectedFile?.name,
      fileUrl: fileUrl,
      downloads: 'Custom'
    });
    setNewName(''); setNewDesc(''); setFileUrl(''); setSelectedFile(null); setShowAddForm(false);
  };

  const handleQuickAddSubmit = () => {
    if (!qaName) return;
    const newId = `c_${Math.random().toString(36).substring(7)}`;
    onAdd({
        id: newId,
        name: qaName,
        desc: qaDesc || 'נוסף דרך יצירת מודפאק',
        type: qaType,
        fileUrl: qaUrl,
        downloads: 'Custom'
    });
    setMpSelectedMods(prev => [...prev, newId]); // מסמן אוטומטית את התוסף במודפאק
    setQuickAdd(false);
    setQaName(''); setQaDesc(''); setQaUrl('');
  };

  const handleAddModpack = (e) => {
    e.preventDefault();
    if(mpSelectedMods.length === 0) return;
    
    onAdd({
      name: mpName,
      desc: mpDesc,
      type: 'modpacks',
      includedAddons: mpSelectedMods,
      downloads: 'Custom'
    });
    setMpName(''); setMpDesc(''); setMpSelectedMods([]); setShowModpackForm(false);
  };

  const toggleMpMod = (id) => {
    setMpSelectedMods(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="animate-in fade-in duration-300">
       <div className="flex flex-col md:flex-row justify-between md:items-end gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold mb-2">{t('repo')}</h2>
          <p className="text-zinc-400 max-w-lg">{t('globalRepoDesc')}</p>
        </div>
        {userRole === 'admin' && (
          <div className="flex gap-2">
            <button 
              onClick={() => { setShowModpackForm(!showModpackForm); setShowAddForm(false); }}
              className={`px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all border ${showModpackForm ? 'bg-zinc-800 text-white border-zinc-700' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-600 text-zinc-300'}`}
            >
              <Layers size={18}/> <span className="hidden sm:inline">{t('createModpack')}</span>
            </button>
            <button 
              onClick={() => { setShowAddForm(!showAddForm); setShowModpackForm(false); }}
              className="bg-green-600 hover:bg-green-500 text-white px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all shadow-lg"
            >
              {showAddForm ? <X size={20}/> : <Plus size={20} />} <span className="hidden sm:inline">{showAddForm ? t('cancel') : t('addCustomAddon')}</span>
            </button>
          </div>
        )}
      </div>

      {showAddForm && (
        <form onSubmit={handleAdd} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 mb-6 animate-in slide-in-from-top-4">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
             <div>
                <label className="block text-xs text-zinc-400 mb-1">{t('addonName')}</label>
                <input required value={newName} onChange={e=>setNewName(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none focus:border-green-500" />
             </div>
             <div>
                <label className="block text-xs text-zinc-400 mb-1">{t('addonDesc')}</label>
                <input required value={newDesc} onChange={e=>setNewDesc(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none focus:border-green-500" />
             </div>
             <div>
                <label className="block text-xs text-zinc-400 mb-1">סוג התוסף</label>
                <select value={newType} onChange={e=>setNewType(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none focus:border-green-500">
                  <option value="mods">{t('mods')}</option>
                  <option value="plugins">{t('plugins')}</option>
                  <option value="datapacks">{t('datapacks')}</option>
                  <option value="textures">{t('textures')}</option>
                </select>
             </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pt-4 border-t border-zinc-800">
             <div>
                <label className="block text-xs text-zinc-400 mb-1 font-bold flex items-center gap-1"><UploadCloud size={14}/> {t('uploadFile')}</label>
                <div className="relative">
                  <input type="file" accept=".jar,.zip" onChange={e => setSelectedFile(e.target.files[0])} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                  <div className={`w-full border border-dashed rounded-lg px-3 py-2 text-center text-sm transition-colors ${selectedFile ? 'border-green-500 bg-green-500/10 text-green-400' : 'border-zinc-700 hover:border-zinc-500 text-zinc-400'}`}>
                    {selectedFile ? `${t('fileSelected')}: ${selectedFile.name}` : 'לחץ או גרור קובץ לכאן'}
                  </div>
                </div>
             </div>
             <div>
                <label className="block text-xs text-zinc-400 mb-1 font-bold flex items-center gap-1"><LinkIcon size={14}/> {t('orLink')}</label>
                <input type="url" placeholder="https://modrinth.com/..." value={fileUrl} onChange={e=>setFileUrl(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-green-500" />
             </div>
           </div>
           
           <div className="flex justify-end mt-4">
             <button type="submit" className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg font-bold w-full md:w-auto">{t('save')}</button>
           </div>
        </form>
      )}

      {showModpackForm && (
        <form onSubmit={handleAddModpack} className="bg-zinc-900 border border-pink-500/30 rounded-xl p-5 mb-6 animate-in slide-in-from-top-4 shadow-[0_0_15px_rgba(236,72,153,0.1)]">
           <h3 className="font-bold text-pink-400 mb-4 flex items-center gap-2"><Layers size={20}/> {t('createModpack')}</h3>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
             <div>
                <label className="block text-xs text-zinc-400 mb-1">{t('addonName')}</label>
                <input required value={mpName} onChange={e=>setMpName(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none focus:border-pink-500" />
             </div>
             <div>
                <label className="block text-xs text-zinc-400 mb-1">{t('addonDesc')}</label>
                <input required value={mpDesc} onChange={e=>setMpDesc(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-white outline-none focus:border-pink-500" />
             </div>
           </div>

           <div>
              <div className="flex justify-between items-center mb-2">
                 <label className="block text-xs text-zinc-400">{t('selectModsForPack')} ({mpSelectedMods.length} נבחרו)</label>
                 <button type="button" onClick={() => setQuickAdd(!quickAdd)} className="text-xs font-bold text-pink-400 hover:text-pink-300 flex items-center gap-1 transition-colors">
                    <Plus size={14}/> תוסף חסר במאגר? הוסף עכשיו
                 </button>
              </div>

              {quickAdd && (
                 <div className="bg-zinc-950 p-4 rounded-xl border border-pink-500/30 mb-3 animate-in fade-in">
                    <h4 className="text-xs font-bold text-pink-400 mb-3">הוספה מהירה למאגר</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                       <input placeholder="שם התוסף" value={qaName} onChange={e=>setQaName(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500" />
                       <select value={qaType} onChange={e=>setQaType(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500">
                          <option value="mods">{t('mods')}</option>
                          <option value="plugins">{t('plugins')}</option>
                          <option value="datapacks">{t('datapacks')}</option>
                          <option value="textures">{t('textures')}</option>
                       </select>
                       <input placeholder="תיאור קצר (אופציונלי)" value={qaDesc} onChange={e=>setQaDesc(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500 sm:col-span-2" />
                       <input placeholder="קישור להורדה" value={qaUrl} onChange={e=>setQaUrl(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-pink-500 sm:col-span-2" />
                    </div>
                    <button type="button" onClick={handleQuickAddSubmit} className="bg-pink-600 hover:bg-pink-500 text-white text-xs px-4 py-2 rounded-lg font-bold w-full transition-colors">שמור במאגר וסמן במודפאק</button>
                 </div>
              )}

              <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1">
                 {allAddons.filter(a => a.type !== 'modpacks').map(a => (
                    <div key={a.id} onClick={() => toggleMpMod(a.id)} className="flex items-center gap-3 p-2 hover:bg-zinc-900 rounded-md cursor-pointer border border-transparent hover:border-zinc-800 transition-colors">
                      <div className={`w-4 h-4 rounded flex items-center justify-center border flex-shrink-0 ${mpSelectedMods.includes(a.id) ? 'bg-pink-600 border-pink-600' : 'border-zinc-600'}`}>
                        {mpSelectedMods.includes(a.id) && <Check size={12} className="text-white"/>}
                      </div>
                      <div className="truncate">
                        <span className="font-bold text-sm">{a.name}</span>
                        <span className="text-[10px] text-zinc-500 ml-2">{t(a.type)}</span>
                      </div>
                    </div>
                 ))}
               </div>
           </div>
           
           <div className="flex justify-end mt-4">
             <button type="submit" disabled={mpSelectedMods.length === 0} className="bg-pink-600 hover:bg-pink-500 text-white px-6 py-2 rounded-lg font-bold w-full md:w-auto disabled:opacity-50">{t('save')}</button>
           </div>
        </form>
      )}

      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 overflow-x-auto">
          {['all', 'mods', 'plugins', 'datapacks', 'modpacks', 'textures'].map(f => (
            <button 
              key={f} 
              onClick={() => setFilter(f)} 
              className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all whitespace-nowrap ${filter === f ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              {t(f) || f}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-80">
          <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 rtl:right-3 rtl:left-auto" />
          <input 
            type="text" placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-xl w-full py-2.5 pr-10 pl-4 text-white focus:outline-none focus:border-zinc-700 placeholder:text-zinc-600"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(a => {
          const isCustom = customAddons.some(c => c.id === a.id);
          const badgeStyle = TYPE_COLORS[a.type] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
          
          let IconComp = Package;
          if (a.type === 'modpacks') IconComp = Layers;
          if (a.type === 'textures') IconComp = Palette;

          return (
            <div key={a.id} onClick={() => setSelectedAddon(a)} className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center justify-between group hover:border-zinc-700 transition-all cursor-pointer">
              <div className="flex items-center gap-4 overflow-hidden">
                <div className="w-12 h-12 flex-shrink-0 bg-zinc-950 rounded-lg flex items-center justify-center border border-zinc-800 relative">
                  <IconComp size={20} className={isCustom ? "text-green-400" : (a.type==='textures' ? "text-teal-500" : "text-zinc-400")} />
                  {isCustom && (a.fileUrl || a.fileName) && <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border border-zinc-950" title="קובץ מקושר" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                     <h4 className="font-bold truncate">{a.name}</h4>
                     <span className={`flex-shrink-0 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${badgeStyle}`}>
                        {t(a.type) || a.type}
                     </span>
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2 group-hover:line-clamp-none transition-all">{a.desc}</p>
                  
                  <div className="flex items-center gap-1 text-[11px] text-yellow-500 mt-2">
                    <Star size={12} fill="currentColor"/>
                    <span className="font-bold">{a.rating || '5.0'}</span>
                    <span className="text-zinc-500">({a.reviews || 0})</span>
                  </div>
                </div>
              </div>
              {isCustom && userRole === 'admin' && (
                <button onClick={(e) => { e.stopPropagation(); onDelete(a.id); }} className="text-zinc-600 hover:text-red-500 p-2 transition-colors">
                  <Trash2 size={16}/>
                </button>
              )}
            </div>
          );
        })}
      </div>
      {filtered.length === 0 && <div className="text-center text-zinc-500 py-12">{t('noResults')}</div>}

      {/* Popup Modal for Addon Details */}
      {selectedAddon && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 animate-in fade-in" onClick={() => setSelectedAddon(null)}>
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-4">
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center border border-zinc-800 bg-zinc-950`}>
                  <Package size={28} className="text-green-500" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{selectedAddon.name}</h3>
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border inline-block mt-1 ${TYPE_COLORS[selectedAddon.type]}`}>
                    {t(selectedAddon.type) || selectedAddon.type}
                  </span>
                </div>
              </div>
              <button onClick={() => setSelectedAddon(null)} className="text-zinc-500 hover:text-white"><X size={24}/></button>
            </div>
            
            <p className="text-zinc-300 text-sm leading-relaxed mb-6 bg-zinc-950 p-4 rounded-xl border border-zinc-800">
              {selectedAddon.desc}
            </p>

            <div className="flex items-center justify-between text-sm text-zinc-400 mb-6 px-2">
              <div className="flex items-center gap-1"><Download size={16}/> {selectedAddon.downloads} הורדות</div>
              <div className="flex items-center gap-1 text-yellow-500"><Star size={16} fill="currentColor"/> {selectedAddon.rating} מדורג</div>
            </div>

            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
              <p className="text-green-400 font-bold mb-1">איך מתקינים?</p>
              <p className="text-zinc-400 text-xs leading-relaxed">מאגר זה משמש כספרייה עולמית בלבד. <br/>כדי להתקין את התוסף, היכנס ל"השרתים שלנו" -&gt; "ניהול שרת" -&gt; "תוספים וטקסטורות" ולחץ על "התקן".</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ServerPanel({ server, onBack, toggleStatus, restartServer, toggleAddon, onDelete, updateServer, t, allAddons, userRole, mcVersions, versionMatrix = {}, syncStatus, playersData }) {
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
            {userRole === 'admin' && <TabBtn icon={<Settings size={18} />} label={t('advanced')} active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} />}
          </div>
        </div>

        <div className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl p-6 min-h-[500px]">
          {activeTab === 'overview' && <OverviewTab server={server} t={t} playersLive={(playersData || {})[server.id]} />}
          {activeTab === 'map' && <MapTab server={server} t={t} />}
          {activeTab === 'console' && <ConsoleTab server={server} t={t} userRole={userRole} />}
          {activeTab === 'addons' && <AddonsTab server={server} toggleAddon={toggleAddon} t={t} allAddons={allAddons} userRole={userRole} />}
          {activeTab === 'files' && <FilesTab server={server} t={t} userRole={userRole} />}
          {activeTab === 'settings' && userRole === 'admin' && <SettingsTab server={server} onDelete={onDelete} updateServer={updateServer} t={t} mcVersions={mcVersions} versionMatrix={versionMatrix} />}
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ server, t, playersLive }) {
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [liveStats, setLiveStats] = useState({ ram: null, cpu: null });

  useEffect(() => {
    if (!server?.id || server.status !== 'online') { setLiveStats({ ram: null, cpu: null }); return; }
    const fetchStats = async () => {
      try {
        const res = await getServerStatsFn({ serverId: server.id });
        if (res.data?.success) setLiveStats({ ram: res.data.ram, cpu: res.data.cpu });
      } catch (e) { /* silent — show 0 on failure */ }
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
          <div className="font-bold text-lg">{t(server.worldType === 'flat' ? 'worldFlat' : 'worldDefault')}</div>
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

function MapTab({ server, t }) {
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
                <p className="text-sm">BlueMap מותקן אך לא מוגדר</p>
                <p className="text-xs text-zinc-600">יש להוסיף <code className="text-blue-400">blueMapPort</code> לנתוני השרת</p>
                <a href={`http://${VPS_IP}:8100`} target="_blank" rel="noopener noreferrer"
                   className="text-blue-400 hover:underline text-sm">
                  נסה ב-{VPS_IP}:8100
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ConsoleTab({ server, t, userRole }) {
  const [logs, setLogs] = useState([]);
  const [consoleInput, setConsoleInput] = useState('');
  const [sending, setSending] = useState(false);
  const logsEndRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const fetchLogs = async () => {
      try {
        const result = await getServerLogFn({ serverId: server.id, lines: 200 });
        const data = result.data || result;
        if (!cancelled && data.success && Array.isArray(data.log)) {
          setLogs(data.log);
        }
      } catch(e) {
        if (!cancelled) setLogs([`[ERROR]: לא ניתן לטעון לוג: ${e.message}`]);
      }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 10000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [server.id]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleSend = async () => {
    const cmd = consoleInput.trim();
    if (!cmd || sending) return;
    setConsoleInput('');
    setLogs(prev => [...prev, `> ${cmd}`]);
    setSending(true);
    try {
      const result = await sendMcCommand({ serverId: server.id, command: cmd });
      const data = result.data || result;
      if (data.success) {
        setLogs(prev => [...prev, `[RCON]: ${data.output || '✓ הפקודה בוצעה'}`]);
      } else {
        setLogs(prev => [...prev, `[ERROR]: ${data.error || 'Command failed'}`]);
      }
    } catch (e) {
      setLogs(prev => [...prev, `[ERROR]: ${e.message}`]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSend();
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in">
      <div className="bg-zinc-950 border border-zinc-800 rounded-t-xl p-3 flex justify-between items-center">
        <h3 className="font-bold flex items-center gap-2"><Terminal size={18} className="text-zinc-400" /> {t('console')}</h3>
        {server.status !== 'online' && <span className="text-xs text-yellow-400 flex items-center gap-1"><AlertCircle size={14}/> סטטוס לא ידוע — נסה לשלוח פקודה</span>}
      </div>
      <div className="flex-1 bg-black border-x border-zinc-800 p-4 font-mono text-sm overflow-y-auto text-zinc-300 min-h-[300px]" dir="ltr">
        {logs.map((log, i) => (
          <div key={i} className="mb-1">
            {log.includes('[INFO]') ? <span className="text-blue-400">INFO </span> : null}
            {log.includes('[ERROR]') ? <span className="text-red-400">ERROR </span> : null}
            {log.includes('[RCON]') ? <span className="text-green-400">RCON </span> : null}
            <span dangerouslySetInnerHTML={{__html: log.replace(/\[INFO\]:\s*|\[ERROR\]:\s*|\[RCON\]:\s*/, '')}}></span>
          </div>
        ))}
        <div ref={logsEndRef} />
      </div>
      <div className="border border-zinc-800 rounded-b-xl overflow-hidden flex">
        <input
          type="text"
          placeholder={userRole === 'admin' ? 'הכנס פקודה...' : 'אין הרשאה'}
          disabled={userRole !== 'admin' || sending}
          value={consoleInput}
          onChange={e => setConsoleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-zinc-950 px-4 py-3 outline-none text-white disabled:opacity-50 font-mono"
          dir="ltr"
        />
        <button
          onClick={handleSend}
          disabled={userRole !== 'admin' || sending || !consoleInput.trim()}
          className="bg-zinc-800 hover:bg-zinc-700 px-6 font-bold transition-colors disabled:opacity-50"
        >
          {sending ? '...' : 'Send'}
        </button>
      </div>
    </div>
  );
}

function AddonsTab({ server, toggleAddon, t, allAddons, userRole }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [warning, setWarning] = useState(null);
  const [installedPlugins, setInstalledPlugins] = useState([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [reloading, setReloading] = useState(false);

  const loadInstalledPlugins = () => {
    if (!server?.id) return;
    setPluginsLoading(true);
    listFilesFn({ serverId: server.id, path: 'plugins' })
      .then(res => {
        const d = res.data || res;
        if (d.success) {
          const jars = (d.entries || [])
            .filter(f => f.type === 'file' && f.name.endsWith('.jar'))
            .map(f => ({ name: f.name.replace(/\.jar$/i, ''), size: f.size, file: f.name }));
          setInstalledPlugins(jars);
        }
      })
      .catch((e) => { console.error('loadInstalledPlugins failed:', e); })
      .finally(() => setPluginsLoading(false));
  };

  const handleRemoveJar = async (jarFile) => {
    if (userRole !== 'admin') return;
    if (!window.confirm(`להסיר את ${jarFile}? השרת יצטרך הפעלה מחדש.`)) return;
    try {
      const res = await removePluginJarFn({ serverId: server.id, file: jarFile });
      const d = res.data || res;
      if (!d.success) throw new Error(d.error || 'שגיאה');
      loadInstalledPlugins();
      alert('הוסר. הפעל מחדש את השרת כדי שייכנס לתוקף.');
    } catch (e) {
      console.error('handleRemoveJar failed:', e);
      alert(`שגיאה: ${e.message}`);
    }
  };

  useEffect(() => {
    loadInstalledPlugins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server?.id]);

  const handleReloadPlugins = async () => {
    setReloading(true);
    try {
      const res = await reloadPluginFn({ serverId: server.id });
      const d = res.data || res;
      if (!d.success) throw new Error(d.error || 'שגיאה');
      loadInstalledPlugins();
      alert('Plugins נטענו מחדש בהצלחה');
    } catch (e) {
      alert(`שגיאה בטעינת Plugins: ${e.message}`);
    } finally {
      setReloading(false);
    }
  };

  const relevantAddons = allAddons.filter(a => {
    if (a.type === 'textures') return true; 
    if (['fabric', 'forge'].includes(server.software) && ['mods', 'modpacks'].includes(a.type)) return true;
    if (server.software === 'paper' && a.type === 'plugins') return true;
    if (a.type === 'datapacks') return true;
    return false;
  });

  const availableFilters = [{ id: 'all', name: t('all') || 'הכל' }];
  if (['fabric', 'forge'].includes(server.software)) {
    availableFilters.push({ id: 'mods', name: t('mods') });
    availableFilters.push({ id: 'modpacks', name: t('modpacks') });
  }
  if (server.software === 'paper') availableFilters.push({ id: 'plugins', name: t('plugins') });
  availableFilters.push({ id: 'datapacks', name: t('datapacks') });
  availableFilters.push({ id: 'textures', name: t('textures') });

  const displayAddons = relevantAddons.filter(a => 
    (filter === 'all' || a.type === filter) &&
    (a.name.toLowerCase().includes(search.toLowerCase()) || a.desc.toLowerCase().includes(search.toLowerCase()))
  );

  const handleToggle = (item) => {
    const isInstalled = server.installedAddons.includes(item.id);
    
    if (!isInstalled) {
      if (item.requires) {
        const missing = item.requires.filter(req => !server.installedAddons.includes(req));
        if (missing.length > 0) {
          const missingNames = missing.map(m => allAddons.find(a=>a.id === m)?.name).join(', ');
          setWarning({ type: 'dependency', message: `${t('missingDependency')} ${missingNames}` });
          setTimeout(() => setWarning(null), 5000);
          return;
        }
      }
      if (item.conflicts) {
        const conflict = item.conflicts.find(con => server.installedAddons.includes(con));
        if (conflict) {
          const conflictName = allAddons.find(a=>a.id === conflict)?.name;
          setWarning({ type: 'conflict', message: `${t('conflictError')} ${conflictName}` });
          setTimeout(() => setWarning(null), 5000);
          return;
        }
      }
    }
    toggleAddon(item);
    // Refresh VPS jar list after a short delay to pick up the newly installed/removed plugin
    setTimeout(loadInstalledPlugins, 8000);
  };

  return (
    <div className="animate-in fade-in">
      {warning && (
        <div className={`p-4 rounded-xl mb-4 font-bold flex items-center justify-between ${warning.type === 'conflict' ? 'bg-red-500/20 text-red-300 border border-red-500/50' : 'bg-orange-500/20 text-orange-300 border border-orange-500/50'}`}>
          <div className="flex items-center gap-2"><AlertCircle size={18}/> {warning.message}</div>
          <button onClick={()=>setWarning(null)} className="p-1 hover:bg-black/20 rounded"><X size={16}/></button>
        </div>
      )}

      {/* VPS Installed Plugins — real .jar files from server */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-green-500" />
            <span className="font-bold text-sm">מותקן על השרת ({installedPlugins.length})</span>
            {pluginsLoading && <RefreshCw size={14} className="animate-spin text-zinc-500" />}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadInstalledPlugins}
              disabled={pluginsLoading}
              className="p-1.5 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
              title="רענן רשימה"
            >
              <RefreshCw size={14} className={pluginsLoading ? 'animate-spin' : ''} />
            </button>
            {userRole === 'admin' && (
              <button
                onClick={handleReloadPlugins}
                disabled={reloading || server.status !== 'online'}
                title={server.status !== 'online' ? 'השרת לא פעיל' : 'Reload Plugins (reload confirm)'}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm rounded-lg transition-colors"
              >
                <RefreshCcw size={14} className={reloading ? 'animate-spin' : ''} />
                {reloading ? 'טוען...' : 'Reload Plugins'}
              </button>
            )}
          </div>
        </div>
        {installedPlugins.length === 0 && !pluginsLoading ? (
          <p className="text-zinc-600 text-sm">לא נמצאו קבצי .jar בתיקיית plugins</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {installedPlugins.map(p => (
              <span key={p.file} className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 text-zinc-300 text-xs px-2.5 py-1 rounded-full">
                <Package size={11} className="text-green-500" />
                {p.name}
                {p.size > 0 && <span className="text-zinc-600">({(p.size / 1024).toFixed(0)}kb)</span>}
                {userRole === 'admin' && (
                  <button onClick={() => handleRemoveJar(p.file)} className="text-zinc-500 hover:text-red-400 ml-1" title="הסר">
                    <X size={11} />
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row justify-between gap-4 mb-6">
        <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800 overflow-x-auto">
          {availableFilters.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all whitespace-nowrap ${filter === f.id ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {f.name}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-80">
          <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 rtl:right-3 rtl:left-auto" />
          <input type="text" placeholder={t('search')} value={search} onChange={(e) => setSearch(e.target.value)} className="bg-zinc-950 border border-zinc-800 rounded-lg pr-10 pl-4 py-2 text-sm focus:outline-none focus:border-green-500 w-full placeholder:text-zinc-600" />
        </div>
      </div>

      <div className="space-y-3">
        {displayAddons.map(item => {
          const isInstalled = server.installedAddons.includes(item.id);
          const badgeStyle = TYPE_COLORS[item.type] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
          
          let IconComp = Package;
          if (item.type === 'modpacks') IconComp = Layers;
          if (item.type === 'textures') IconComp = Palette;

          return (
            <div key={item.id} className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-zinc-700 transition-all">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-zinc-900 rounded-lg flex items-center justify-center border border-zinc-800 flex-shrink-0 relative">
                  <IconComp size={24} className={isInstalled ? (item.type === 'textures' ? 'text-teal-500' : 'text-green-500') : 'text-zinc-600'} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-bold text-lg">{item.name}</h4>
                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${badgeStyle}`}>
                      {t(item.type) || item.type}
                    </span>
                    {item.paid && (
                      <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                        💎 Premium
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{item.desc}</p>
                  <div className="flex items-center gap-1 text-[11px] text-yellow-500 mt-2">
                    <Star size={12} fill="currentColor"/>
                    <span className="font-bold">{item.rating || '5.0'}</span>
                    <span className="text-zinc-500">({item.reviews || 0})</span>
                  </div>
                </div>
              </div>
              {userRole === 'admin' && (
                item.paid && !isInstalled ? (
                  <a href="#" onClick={e => e.preventDefault()} title="Premium plugin — התקן ידנית מהאתר הרשמי"
                    className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-sm border border-yellow-500/30 text-yellow-400 bg-yellow-500/5 cursor-not-allowed whitespace-nowrap">
                    💎 Premium
                  </a>
                ) : (
                  <button onClick={() => handleToggle(item)} className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${isInstalled ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20' : 'bg-green-600 hover:bg-green-500 text-white'}`}>
                    {isInstalled ? t('uninstall') : <><Download size={16} /> {t('install')}</>}
                  </button>
                )
              )}
            </div>
          );
        })}
        {displayAddons.length === 0 && <div className="text-center text-zinc-500 py-12">{t('noResults')}</div>}
      </div>
    </div>
  );
}

// --- FILES TAB (real file manager via Manager API → VPS) ---
function FilesTab({ server, t, userRole }) {
  const [currentPath, setCurrentPath] = useState([]);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [editingFile, setEditingFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [fileNote, setFileNote] = useState(null);
  const [savedMsg, setSavedMsg] = useState(false);
  const [saving, setSaving] = useState(false);

  const pathStr = currentPath.join('/');

  const loadDir = async () => {
    setLoading(true); setError(null); setFileNote(null);
    try {
      const res = await listFilesFn({ serverId: server.id, path: pathStr });
      const d = res.data || res;
      if (d.success) setEntries(d.entries || []);
      else setError(d.error || 'שגיאה בטעינת קבצים');
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => {
    if (!editingFile) loadDir();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server.id, pathStr]);

  const openEntry = async (entry) => {
    if (entry.type === 'dir') { setCurrentPath([...currentPath, entry.name]); return; }
    setFileNote(null);
    try {
      const res = await readFileFn({ serverId: server.id, path: [...currentPath, entry.name].join('/') });
      const d = res.data || res;
      if (!d.success) { setFileNote(d.error || 'שגיאה בקריאת הקובץ'); return; }
      if (d.binary) { setFileNote(d.tooLarge ? 'הקובץ גדול מדי לתצוגה' : 'קובץ בינארי — לא ניתן לעריכה'); return; }
      setEditingFile(entry.name);
      setFileContent(d.content || '');
    } catch (e) { setFileNote(e.message); }
  };

  const navigateUp = (index) => {
    setEditingFile(null); setFileNote(null);
    setCurrentPath(index < 0 ? [] : currentPath.slice(0, index + 1));
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true); setFileNote(null);
    try {
      const res = await writeFileFn({ serverId: server.id, path: [...currentPath, editingFile].join('/'), content: fileContent });
      const d = res.data || res;
      if (d.success) { setSavedMsg(true); setTimeout(() => setSavedMsg(false), 4000); }
      else setFileNote(d.error || 'שמירה נכשלה');
    } catch (e) { setFileNote(e.message); }
    setSaving(false);
  };

  const handleDelete = async (entry, e) => {
    e.stopPropagation();
    if (userRole !== 'admin') return;
    if (!window.confirm(`למחוק את "${entry.name}"? פעולה בלתי הפיכה.`)) return;
    setFileNote(null);
    try {
      const res = await deleteFileFn({ serverId: server.id, path: [...currentPath, entry.name].join('/') });
      const d = res.data || res;
      if (d.success) loadDir();
      else setFileNote(d.error || 'מחיקה נכשלה');
    } catch (err) { setFileNote(err.message); }
  };

  const fmtSize = (n) => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB';

  return (
    <div className="h-full flex flex-col animate-in fade-in">
      {/* Breadcrumb */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center gap-2 mb-4 overflow-x-auto text-sm font-bold">
        <button onClick={() => navigateUp(-1)} className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1">
          <HardDrive size={16}/> {server.slug || 'Root'}
        </button>
        {currentPath.map((folder, idx) => (
          <React.Fragment key={idx}>
            <span className="text-zinc-600">/</span>
            <button onClick={() => navigateUp(idx)} className="text-zinc-400 hover:text-white transition-colors">{folder}</button>
          </React.Fragment>
        ))}
        {editingFile && (
          <>
            <span className="text-zinc-600">/</span>
            <span className="text-green-400 flex items-center gap-1"><FileCode size={16}/> {editingFile}</span>
          </>
        )}
        {!editingFile && (
          <button onClick={loadDir} className="ml-auto text-zinc-500 hover:text-white transition-colors text-xs">↻ רענן</button>
        )}
      </div>

      {fileNote && !editingFile && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-300 rounded-lg p-3 mb-4 text-sm flex items-center gap-2">
          <AlertCircle size={16}/> {fileNote}
        </div>
      )}

      {editingFile ? (
        <div className="flex-1 flex flex-col bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden relative">
          <div className="bg-zinc-900 border-b border-zinc-800 p-3 flex justify-between items-center">
            <span className="font-mono text-sm text-zinc-300">{editingFile}</span>
            <div className="flex items-center gap-3">
              {savedMsg && <span className="text-green-400 text-xs font-bold animate-pulse">{t('fileSaved')} — ייתכן שצריך הפעלה מחדש</span>}
              {fileNote && <span className="text-red-400 text-xs font-bold">{fileNote}</span>}
              {userRole === 'admin' && (
                <button onClick={handleSave} disabled={saving} className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50">
                  <Save size={14}/> {saving ? '...' : t('saveFile')}
                </button>
              )}
              <button onClick={() => { setEditingFile(null); setFileNote(null); }} className="text-zinc-400 hover:text-red-400 p-1 transition-colors">
                <X size={18}/>
              </button>
            </div>
          </div>
          <textarea
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            readOnly={userRole !== 'admin'}
            className="flex-1 w-full bg-black text-zinc-300 font-mono text-sm p-4 outline-none resize-none leading-relaxed"
            dir="ltr"
            spellCheck="false"
          />
        </div>
      ) : (
        <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl overflow-y-auto">
          {loading ? (
            <div className="p-8 text-center text-zinc-600">טוען...</div>
          ) : error ? (
            <div className="p-8 text-center text-red-400 text-sm">{error}</div>
          ) : entries.length === 0 ? (
            <div className="p-8 text-center text-zinc-600">תיקייה ריקה</div>
          ) : entries.map((entry) => {
            const isFolder = entry.type === 'dir';
            return (
              <div key={entry.name} onClick={() => openEntry(entry)}
                className="flex items-center justify-between p-4 border-b border-zinc-900/50 hover:bg-zinc-900 transition-colors group cursor-pointer"
                dir="ltr">
                <div className="flex items-center gap-3">
                  {isFolder ? <Folder size={20} className="text-blue-400 fill-blue-400/20"/> :
                   /\.(yml|yaml|properties|json|toml|conf|cfg|ini)$/i.test(entry.name) ? <FileCode size={20} className="text-orange-400"/> :
                   <FileText size={20} className="text-zinc-500"/>}
                  <span className="font-medium text-zinc-200">{entry.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  {!isFolder && <span className="text-xs text-zinc-600">{fmtSize(entry.size)}</span>}
                  {!isFolder && userRole === 'admin' && <Edit3 size={16} className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"/>}
                  {!isFolder && userRole === 'admin' && (
                    <button onClick={(e) => handleDelete(entry, e)} title="מחק"
                      className="text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                      <Trash2 size={16}/>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SettingsTab({ server, onDelete, updateServer, t, mcVersions, versionMatrix = {} }) {
  // Version list filtered to what THIS server's software type actually supports.
  const typeVersions = (versionMatrix[server.software] && versionMatrix[server.software].length)
    ? versionMatrix[server.software]
    : mcVersions;
  const applyServerProperty = async (field, value) => {
    try {
      const res = await updateServerPropertiesFn({ serverId: server.id, properties: { [field]: value } });
      if (!res.data?.success) throw new Error(res.data?.error || 'שגיאה לא ידועה');
    } catch(e) {
      console.error('updateServerProperties error:', e);
      alert(`שגיאה בעדכון הגדרות: ${e.message}`);
    }
  };

  const [versionSaving, setVersionSaving] = React.useState(false);
  const [typeSaving, setTypeSaving] = React.useState(false);

  // Software types the user may switch TO from Settings. forge/neoforge/vanilla
  // are intentionally excluded — the manager-api rejects them (no reliable
  // Velocity modern-forwarding mod → unjoinable server).
  const CHANGEABLE_TYPES = ['paper', 'purpur', 'folia', 'mohist', 'fabric'];
  const changeableSoftware = SOFTWARE_TYPES.filter(sw => CHANGEABLE_TYPES.includes(sw.id));
  const BUKKIT_FAMILY = ['paper', 'purpur', 'folia', 'mohist'];
  const isCrossFamily = (a, b) =>
    (BUKKIT_FAMILY.includes(a) && b === 'fabric') ||
    (a === 'fabric' && BUKKIT_FAMILY.includes(b));

  // Real software/type change: swaps the jar AND rewrites the Velocity
  // forwarding config for the target family on the VPS, then restarts.
  const handleTypeChange = async (newType) => {
    const prevType = server.software;
    const prevVersion = server.version;
    if (!newType || newType === prevType) return;

    // Pick a version valid for the target type (newest from the matrix).
    const targetList = (versionMatrix[newType] && versionMatrix[newType].length)
      ? versionMatrix[newType]
      : (mcVersions || []);
    const newVersion = (targetList.includes(prevVersion)) ? prevVersion : (targetList[0] || prevVersion);

    const newName = (SOFTWARE_TYPES.find(s => s.id === newType) || {}).name || newType;
    let warn = `שינוי סוג השרת ל-${newName} יבצע את הפעולות הבאות:\n` +
      `• השרת יופעל מחדש (downtime קצר).\n` +
      `• גרסת השרת תיקבע ל-${newVersion}.\n`;
    if (isCrossFamily(prevType, newType)) {
      warn += `• ⚠️ הפלאגינים/מודים הקיימים לא יעברו! מעבר בין Bukkit (paper/purpur/folia/mohist) ל-Fabric (מודים) הוא מעבר משפחה — תצטרך להתקין מחדש את התוספות המתאימות לסוג החדש.\n`;
    }
    if (newType === 'fabric') {
      warn += `• יותקן אוטומטית FabricProxy-Lite (נדרש כדי שהשחקנים יוכלו להתחבר דרך הפרוקסי שלנו).\n`;
    }
    warn += `\nהעולם (world) לא ייפגע. להמשיך?`;
    if (!window.confirm(warn)) return;

    setTypeSaving(true);
    updateServer({ software: newType, version: newVersion }); // optimistic
    try {
      const res = await changeServerTypeFn({ serverId: server.id, type: newType, version: newVersion });
      if (!res.data?.success) throw new Error(res.data?.error || 'שינוי סוג השרת נכשל');
    } catch (e) {
      console.error('changeServerType error:', e);
      updateServer({ software: prevType, version: prevVersion }); // rollback
      alert(`שגיאה בשינוי סוג השרת: ${e.message}`);
    } finally {
      setTypeSaving(false);
    }
  };

  // Real version change: swaps the jar on the VPS and restarts the server.
  const handleVersionChange = async (newVersion) => {
    const prevVersion = server.version;
    if (!newVersion || newVersion === prevVersion) return;
    if (!window.confirm('שינוי גרסה יוריד גרסה חדשה ויפעיל מחדש את השרת. להמשיך?')) return;
    setVersionSaving(true);
    updateServer({ version: newVersion }); // optimistic
    try {
      const res = await changeServerVersionFn({ serverId: server.id, version: newVersion, type: server.software });
      if (!res.data?.success) throw new Error(res.data?.error || 'שינוי הגרסה נכשל');
    } catch (e) {
      console.error('changeServerVersion error:', e);
      updateServer({ version: prevVersion }); // rollback
      alert(`שגיאה בשינוי הגרסה: ${e.message}`);
    } finally {
      setVersionSaving(false);
    }
  };

  // RAM editing: writes memoryMb to servers.json (effective on next restart).
  const handleMemoryChange = async (newMemoryMb) => {
    const prev = server.memoryMb || 2048;
    if (!newMemoryMb || newMemoryMb === prev) return;
    updateServer({ memoryMb: newMemoryMb }); // optimistic
    try {
      const res = await updateServerMemoryFn({ serverId: server.id, memoryMb: newMemoryMb });
      if (!res.data?.success) throw new Error(res.data?.error || 'עדכון ה-RAM נכשל');
    } catch (e) {
      console.error('updateServerMemory error:', e);
      updateServer({ memoryMb: prev }); // rollback
      alert(`שגיאה בעדכון ה-RAM: ${e.message}`);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in max-w-2xl">
      <div>
        <h3 className="text-xl font-bold mb-4 border-b border-zinc-800 pb-2">{t('basicSettings')}</h3>
        <div className="flex flex-col sm:flex-row gap-6 mb-6">
           <div className="flex-shrink-0">
             <label className="block text-sm text-zinc-400 mb-2 text-center">{t('serverIcon')}</label>
             <ImageUploader
               iconUrl={server.icon}
               setIconUrl={async (newUrl) => {
                 updateServer({ icon: newUrl });
                 if (newUrl && server.id) {
                   try { await updateServerIconFn({ serverId: server.id, icon: newUrl }); } catch(e) {}
                 }
               }}
               t={t} size="sm"
             />
           </div>
           <div className="flex-1">
              <label className="block text-sm text-zinc-400 mb-1">{t('serverName')}</label>
              <input type="text" value={server.name} onChange={(e) => updateServer({ name: e.target.value })} onFocus={(e) => e.target.select()} onBlur={(e) => applyServerProperty('name', e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600" />
           </div>
        </div>

        <div className="space-y-4">
          {/* Server software (type) — editable post-creation. Reuses the same
              software cards as the create form. */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4">
            <label className="block text-sm text-zinc-400 mb-2 flex items-center gap-2">
              {t('software')}
              {typeSaving && <span className="text-xs text-zinc-500 animate-pulse">מחליף סוג שרת...</span>}
            </label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {changeableSoftware.map(sw => (
                <div key={sw.id}
                  onClick={() => { if (!typeSaving) handleTypeChange(sw.id); }}
                  className={`cursor-pointer border rounded-lg p-2 text-center transition-all flex flex-col items-center gap-0.5
                    ${typeSaving ? 'opacity-50 pointer-events-none' : ''}
                    ${server.software === sw.id ? 'bg-green-500/10 border-green-500 text-green-400 shadow-md' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}>
                  <div className="font-bold text-sm">{sw.name}</div>
                  <div className="text-[10px] uppercase opacity-70">{sw.type}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              שינוי הסוג מפעיל מחדש את השרת. מעבר בין Bukkit (paper/purpur/folia/mohist) ל-Fabric לא מעביר את הפלאגינים/מודים.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1 flex items-center gap-2">
                {t('version')}
                {versionSaving && <span className="text-xs text-zinc-500 animate-pulse">מחליף גרסה...</span>}
              </label>
              <select value={server.version} disabled={versionSaving} onChange={(e) => handleVersionChange(e.target.value)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600 disabled:opacity-50">
                {typeVersions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <p className="text-xs text-blue-400 mt-1">
                💡 ViaVersion מותקן אצלנו — שחקנים מ<b>כל</b> גרסה (כולל 26.x) מתחברים לשרת הזה.
              </p>
              {isViaVersion(server.version) && (
                <p className="text-xs text-zinc-500 mt-1">
                  זו גרסה חדשה מ-Paper — כאן יש תוכן {server.version} מלא (לתוכן 26.x בחר Purpur/Fabric).
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">{t('maxPlayers')}</label>
              <input type="number" value={server.maxPlayers} onChange={(e) => updateServer({ maxPlayers: parseInt(e.target.value) || 20 })} onBlur={(e) => applyServerProperty('maxPlayers', parseInt(e.target.value) || 20)} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600" />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">{t('ram')}</label>
              <select value={server.memoryMb || 2048} onChange={(e) => handleMemoryChange(parseInt(e.target.value, 10))} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600">
                {[1024, 2048, 3072, 4096, 6144, 8192].map(mb => (
                  <option key={mb} value={mb}>{(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB ({mb} MB)</option>
                ))}
              </select>
              <p className="text-xs text-zinc-500 mt-1">נכנס לתוקף בהפעלה הבאה (מקסימום כולל ~12000MB לכל השרתים)</p>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">{t('gamemode')}</label>
              <select value={server.gamemode} onChange={(e) => { updateServer({ gamemode: e.target.value }); applyServerProperty('gamemode', e.target.value); }} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600">
                <option value="survival">{t('survival')}</option>
                <option value="creative">{t('creative')}</option>
                <option value="adventure">{t('adventure')}</option>
                <option value="spectator">{t('spectator')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">{t('worldType')}</label>
              <select value={server.worldType} onChange={(e) => { updateServer({ worldType: e.target.value }); applyServerProperty('worldType', e.target.value); }} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600">
                <option value="default">{t('worldDefault')}</option>
                <option value="flat">{t('worldFlat')}</option>
                <option value="amplified">{t('worldAmplified')}</option>
                <option value="large_biomes">{t('worldLargeBiomes')}</option>
              </select>
            </div>
          </div>
          <DifficultyControl server={server} updateServer={updateServer} t={t} />
          {/* Privacy toggle */}
          <div
            onClick={async () => {
              const newVal = !server.isPrivate;
              updateServer({ isPrivate: newVal });
              try {
                const res = await setServerPrivacyFn({ serverId: server.id, isPrivate: newVal });
                if (!res.data?.success) throw new Error(res.data?.error || 'Privacy update failed');
              } catch(e) {
                console.error('setServerPrivacy error:', e);
                updateServer({ isPrivate: !newVal }); // rollback
                alert(`שגיאה בשינוי פרטיות השרת: ${e.message}`);
              }
            }}
            className={`flex items-center justify-between rounded-xl p-4 cursor-pointer border transition-all ${server.isPrivate ? 'bg-yellow-500/10 border-yellow-500/40' : 'bg-zinc-950 border-zinc-800 hover:border-zinc-600'}`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${server.isPrivate ? 'bg-yellow-500/20' : 'bg-zinc-800'}`}>
                <Shield size={18} className={server.isPrivate ? 'text-yellow-400' : 'text-zinc-500'} />
              </div>
              <div>
                <p className={`font-bold text-sm ${server.isPrivate ? 'text-yellow-400' : 'text-zinc-300'}`}>{server.isPrivate ? 'שרת פרטי' : 'שרת ציבורי'}</p>
                <p className="text-xs text-zinc-500">{server.isPrivate ? 'רק שחקנים ב-Whitelist יוכלו להתחבר' : 'כל שחקן יכול להתחבר'}</p>
              </div>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors relative ${server.isPrivate ? 'bg-yellow-500' : 'bg-zinc-700'}`}>
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${server.isPrivate ? 'left-6' : 'left-1'}`} />
            </div>
          </div>

          <OpsEditor server={server} updateServer={updateServer} />

          {/* Whitelist players — only shown when server is private */}
          {server.isPrivate && (
            <WhitelistEditor server={server} updateServer={updateServer} />
          )}

          <div>
            <label className="block text-sm text-zinc-400 mb-1 flex items-center gap-2"><img src="https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png" className="w-4 h-3 object-contain"/> {t('discordWebhook')} <span className="text-xs bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded-full">בקרוב</span></label>
            <input type="text" disabled placeholder="https://discord.com/api/webhooks/..." value={server.discordWebhook || ''} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2 text-zinc-500 outline-none text-sm cursor-not-allowed" />
          </div>
        </div>
      </div>
      
      <div>
        <h3 className="text-xl font-bold mb-4 border-b border-zinc-800 pb-2 text-red-500">{t('dangerZone')}</h3>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5">
          <h4 className="font-bold text-red-500 mb-2">{t('deleteServer')}</h4>
          <p className="text-sm text-red-400/80 mb-4">{t('deleteServerDesc')}</p>
          <button onClick={onDelete} className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-bold transition-colors">
            {t('deleteBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}