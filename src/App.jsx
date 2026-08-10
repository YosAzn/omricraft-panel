import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Shield, Users, BookOpen, Rocket, Plus } from 'lucide-react';

import { signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc, getDoc } from 'firebase/firestore';

import { auth, db } from './lib/firebase';
import {
  createServerFn, requestServerFn, deleteServerFn, getServerStatusFn, startServerFn,
  stopServerFn, getPaperVersionsFn, getVersionMatrixFn,
  installPluginFn, installDatapackFn, installModFn, installResourcepackFn, getPlayersOnlineFn, restartServerFn
} from './lib/api';
import { DICT, translate, dirForLang } from './lib/i18n';
import { DEFAULT_ADDONS, getInstallMethod, collectRequiredIds, isCoreIncompatible, isWorldgenDatapack, isBukkitBased, SOFTWARE_TYPES } from './lib/constants';
import { NavBtn } from './components/ui';
import omricraftLogo from './assets/omricraft-logo.png';
import omricraftLogoS from './assets/omricraft-logo-s.png';
// Nav button art — Yosef's faceted Minecraft set, one per destination.
import dashboardSpider from './assets/dashboard-spider.png';
import addonsSword from './assets/addons-sword.png';
import guideManGold from './assets/guide-man-gold.png';
import warroomCreeperTnt from './assets/warroom-creeper-tnt.png';
import Dashboard from './components/Dashboard';
import DeleteServerModal from './components/DeleteServerModal';
import CreateServerForm from './components/CreateServerForm';
import GlobalRepository from './components/GlobalRepository';
import ServerPanel from './components/ServerPanel/ServerPanel';
import HealthTab from './components/HealthTab';
import GuidePage from './components/GuidePage';
import LandingPage from './components/LandingPage';
import LanguageSelector from './components/LanguageSelector';
import SideCreepers from './components/SideCreepers';

export default function App() {
  // Stable admin identity is email-based (NOT the ephemeral anonymous UID).
  // Anonymous auth gives every browser a fresh UID on storage/SW clear, which
  // silently dropped admin rights. Google sign-in pins admin to a real account.
  const ADMIN_EMAILS = ['yosijo@gmail.com', 'omri.sokolov@gmail.com'];

  const [authUser, setAuthUser] = useState(null);
  const [adminUid, setAdminUid] = useState(null);
  const [userRole, setUserRole] = useState('member');
  const [lang, setLang] = useState('he');
  // translate() falls back current lang -> en -> he -> key, so the 8 partial
  // languages never render blank while their dictionaries are still empty.
  const t = (key, params) => translate(lang, key, params);
  const dir = dirForLang(lang); // 'rtl' for he & ar, 'ltr' otherwise
  const isRtl = dir === 'rtl';

  // Public landing page is the DEFAULT entry view — the first thing a visitor sees.
  // Anonymous visitors can browse it; CTAs route into the existing dashboard/create/repo.
  const [currentView, setCurrentView] = useState('landing');
  const [activeServerId, setActiveServerId] = useState(null);
  // Optional deep-link target inside the public Guide (e.g. 'guide-resource-packs').
  // Other components can call openGuide(anchor) to jump straight to a section.
  const [guideAnchor, setGuideAnchor] = useState(null);
  const openGuide = (anchor = null) => { setGuideAnchor(anchor); setCurrentView('guide'); };
  
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
      try { setMcVersions(JSON.parse(cached)); return; } catch(e) { console.warn('mc-versions cache parse failed:', e); }
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
      try { setVersionMatrix(JSON.parse(cached)); return; } catch(e) { console.warn('version-matrix cache parse failed:', e); }
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

  // Delete-confirmation modal state: { id, name } while open (null = closed) + a busy
  // flag so the dialog can't be double-fired / dismissed mid-delete. The actual
  // deleteServerFn call lives in performDeleteServer (soft/permanent).
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
        } catch (e) {
          console.error('Failed to read/claim admin config (omricraft/main/config/admin):', e);
        }
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
    // Wait for auth before subscribing: the Firestore rules require request.auth
    // (owner OR admin-email) to read servers. If we subscribe during the pre-auth /
    // anonymous phase the listen is permission-denied and dies; re-running on
    // authUser change (below) re-subscribes with the real (admin/Google) identity.
    // Anonymous visitors (signInAnonymously) own no servers and are not admin, so an
    // unconstrained servers listen is always permission-denied — noisy console errors
    // and wasted Firestore reads on every public page view. Only subscribe once a real
    // (Google) identity is present; the admin/owner read then succeeds.
    if (!db || !authUser || authUser.isAnonymous) return;

    const serversPath = getServersPath();
    const addonsPath = getAddonsPath();

    const unsubServers = onSnapshot(collection(db, serversPath), (snap) => {
      // Normalize installedAddons so every consumer (Dashboard, ServerPanel,
      // AddonsTab) can safely call .includes/.length without guarding for undefined.
      setServers(snap.docs.map(doc => ({ id: doc.id, ...doc.data(), installedAddons: doc.data().installedAddons || [] })));
    }, (err) => console.error("Firestore Listen Error (Servers):", err));

    const unsubAddons = onSnapshot(collection(db, addonsPath), (snap) => {
      setCustomAddons(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Firestore Listen Error (Addons):", err));

    return () => { unsubServers(); unsubAddons(); };
    // Re-subscribe whenever the signed-in identity changes (anon → Google/admin),
    // so a listen that was denied while anonymous is re-established once authed.
  }, [authUser]);

  // Player-count poll relocated below the isAdmin definition (it is gated on isAdmin,
  // which is declared further down — referencing it here would hit the TDZ).
  // ----------------------------------------

  // Sign in as admin via Google (added ALONGSIDE anonymous — anonymous stays for kids/other devices)
  const signInAsAdmin = async () => {
    if (!auth) return;
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      // onAuthStateChanged updates authUser; isAdmin recomputes from the email
    } catch (e) {
      console.error('Google admin sign-in failed:', e);
      alert(`התחברות Google נכשלה: ${e.message}`);
    }
  };

  // Sign out of the Google account → drops back to a fresh anonymous session
  const signOutAdmin = async () => {
    if (!auth) return;
    try {
      await signOut(auth);
      // onAuthStateChanged fires with null → initAuth() re-runs anonymous sign-in
    } catch (e) {
      console.error('Sign-out failed:', e);
    }
  };

  const adminEmail = authUser?.email ? authUser.email.toLowerCase() : null;
  // Email-based admin = stable across browser/storage clears (the root-cause fix).
  // Legacy UID match kept as fallback so an already-claimed anonymous admin UID
  // still works until it signs in with Google.
  const isAdmin =
    (!!adminEmail && ADMIN_EMAILS.includes(adminEmail)) ||
    (!!authUser && !!adminUid && authUser.uid === adminUid);

  // The client role STRICTLY follows the real email-based admin identity — there is no
  // manual override (the old Admin/Member toggle defaulted to 'admin' and let anyone
  // self-promote in the UI). The Cloud Functions independently enforce admin server-side;
  // this only gates which controls render.
  useEffect(() => { setUserRole(isAdmin ? 'admin' : 'member'); }, [isAdmin]);

  // Poll player counts every 30s — ADMIN ONLY. getPlayersOnline is an admin-only
  // Cloud Function; for anonymous visitors and non-admin members it always throws
  // "Admin only", so polling it there only spams the console and burns a Function
  // invocation every 30s. The live counts are only shown on the admin dashboard.
  useEffect(() => {
    if (!isAdmin) return;
    const fetchPlayers = async () => {
      try {
        const res = await getPlayersOnlineFn();
        if (res?.data?.success && res.data.servers) {
          setPlayersData(res.data.servers);
        }
      } catch (e) { console.error('getPlayersOnline poll failed:', e?.message || e); }
    };
    fetchPlayers();
    const interval = setInterval(fetchPlayers, 30000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  // Reflect the active language's text direction onto the document root so the
  // whole app — including any portal/modal rendered to <body> — flips correctly
  // for RTL languages (he & ar). The per-view <div dir=...> stays as a fallback.
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  // The dedicated חמ"ל view is ADMIN-ONLY. If a non-admin is on it (e.g. role
  // changed, or a stale view), bounce them to the dashboard — where their own
  // scoped חמ"ל (with fix buttons) lives in the summary panel.
  useEffect(() => {
    if (currentView === 'health' && !isAdmin) setCurrentView('dashboard');
  }, [currentView, isAdmin]);

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

      // The config payload is identical for both paths (admin create + non-admin request).
      const serverConfig = {
        displayName,
        type: data.software || 'paper',
        version: data.version || '1.21.1',
        memoryMb: data.memoryMb || 2048,
        gamemode: data.gamemode || 'survival',
        difficulty: data.difficulty || 'normal',
        ops: data.ops || [],
        maxPlayers: data.maxPlayers || 20,
        seed: String(finalSeed || ''),
        worldType: data.worldType || 'default',
        addons: resolvedAddons,
        icon: smallIcon,
        isPrivate: data.isPrivate === true,
        whitelistPlayers: Array.isArray(data.whitelistPlayers) ? data.whitelistPlayers : []
      };

      // Non-admins cannot create directly — they submit a REQUEST. createServer is
      // admin-enforced server-side regardless; this just routes the UI correctly.
      // The server is provisioned (owned by the requester) only after an admin approves.
      if (!isAdmin) {
        const reqRes = await requestServerFn(serverConfig);
        if (!reqRes.data?.success) {
          throw new Error(reqRes.data?.error || 'Request failed');
        }
        alert(t('requestSent'));
        setCurrentView('dashboard');
        return;
      }

      console.log(`Creating real server: ${displayName}`);

      const result = await createServerFn(serverConfig);

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

  // Called by the admin "Pending requests" UI AFTER approveServerRequest has already
  // provisioned the server on the VPS (owned by the requester). We persist a COMPLETE
  // Firestore server doc — mirroring the admin-create path — with ownerUid = the
  // ORIGINAL REQUESTER (from the approve result), NOT the approving admin. The
  // PendingRequests component handles the callable + errors; this only writes Firestore.
  const handleApproveRequest = async (result) => {
    if (!db || !result || !result.success || !result.id) {
      throw new Error(result?.error || 'Invalid approval result');
    }
    const cfg = result.config || {};
    const serverData = {
      id: result.id,
      name: result.displayName,
      displayName: result.displayName,
      slug: result.slug,
      address: result.address,
      publicHost: result.address,
      gamePort: result.gamePort,
      rconPort: result.rconPort,
      backendAddress: `127.0.0.1:${result.gamePort}`,
      // Map the stored request config to the same fields the dashboard/panel read.
      software: cfg.type || 'paper',
      version: cfg.version || '1.21.1',
      gamemode: cfg.gamemode || 'survival',
      worldType: cfg.worldType || 'default',
      difficulty: cfg.difficulty || 'normal',
      memoryMb: cfg.memoryMb || 2048,
      maxPlayers: cfg.maxPlayers || 20,
      seed: cfg.seed || '',
      ops: Array.isArray(cfg.ops) ? cfg.ops : [],
      installedAddons: Array.isArray(cfg.addons) ? cfg.addons : [],
      icon: cfg.icon || '',
      isPrivate: cfg.isPrivate === true,
      whitelistPlayers: Array.isArray(cfg.whitelistPlayers) ? cfg.whitelistPlayers : [],
      // Ownership goes to the REQUESTER (echoed by approveServerRequest), not the admin.
      ownerUid: result.ownerUid || result.requesterUid || null,
      status: 'starting',
      players: 0,
      needsRestart: false,
      discordWebhook: '',
      createdAt: new Date().toISOString()
    };
    await setDoc(doc(db, getServersPath(), serverData.id), serverData);
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

  // Mod-family core → the "mods/modpack stay on the player's PC" note. Fabric/Forge/
  // NeoForge are pure mod loaders; Mohist/Youer are mod-capable hybrids; a server with
  // an installed modpack addon (id starts 'mp') also counts.
  const isModFamilyServer = (server) => {
    if (!server) return false;
    const soft = SOFTWARE_TYPES.find(s => s.id === server.software);
    if (soft && (soft.type === 'mods' || soft.type === 'hybrid')) return true;
    return Array.isArray(server.installedAddons) && server.installedAddons.some(id => /^mp\d/.test(String(id)));
  };

  // Opens the delete-confirmation modal (replaces the old window.confirm). The actual
  // soft/permanent delete runs in performDeleteServer once the user picks an action.
  const deleteServer = (id) => {
    if (userRole !== 'admin') return;
    const currentServer = servers.find(s => s.id === id);
    if (!currentServer) {
      alert('לא נמצא שרת למחיקה.');
      return;
    }
    setDeleteModal({
      id,
      name: currentServer.displayName || currentServer.name || id,
      isMod: isModFamilyServer(currentServer),
    });
  };

  // Runs the actual delete for the server in deleteModal. `permanent` false → SOFT
  // delete (30-day VPS backup, restorable via the recycle bin); true → hard delete
  // (no backup). Optimistically flags the Firestore doc 'deleting'; on VPS failure the
  // doc is rolled back to 'delete_failed' with the error (never a silent catch).
  const performDeleteServer = async (permanent) => {
    if (!deleteModal) return;
    const id = deleteModal.id;
    const currentServer = servers.find(s => s.id === id);
    if (!currentServer) {
      alert('לא נמצא שרת למחיקה.');
      setDeleteModal(null);
      return;
    }

    setDeleteBusy(true);
    try {
      if (!db) {
        throw new Error('אין חיבור תקין ל-Firebase.');
      }

      await updateDoc(doc(db, getServersPath(), id), {
        status: 'deleting',
        deletingAt: new Date().toISOString()
      });

      // Pass the server's installedAddons (catalog ids) THROUGH to the soft-delete
      // manifest so a restore (D2) can re-fetch mods/datapacks/resourcepacks faithfully
      // via the same catalog install flow — mod JAR filenames alone aren't enough.
      // permanent:true skips the archive entirely (no backup).
      const result = await deleteServerFn({
        serverId: id,
        permanent: permanent === true,
        installedAddons: Array.isArray(currentServer.installedAddons) ? currentServer.installedAddons : []
      });

      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Delete failed');
      }

      await deleteDoc(doc(db, getServersPath(), id));
      setDeleteModal(null);
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
    } finally {
      setDeleteBusy(false);
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
    } catch(e) { console.error('syncServerStatus failed for', id, e); }
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
        } catch(e) { console.error('syncAll status fetch failed for', srv.id, e); }
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

    const method = getInstallMethod(addon); // 'server' | 'manual' | 'client'
    const isInstalled = currentServer.installedAddons.includes(addon.id);

    // manual / client: לא נוגעים ב-VPS ולא מסמנים "מותקן" ב-Firestore (כדי לא לשקר).
    // רק מציגים הודעת מידע למשתמש.
    if (method !== 'server') {
      const msg = method === 'client' ? t('clientInstallInfo') : t('manualInstallInfo');
      alert(`${addon.name}\n\n${msg}`);
      return;
    }

    // Dependency enforcement (REMOVE side): a required dep must not be orphaned while
    // a still-installed parent needs it. When the user tries to REMOVE this addon,
    // block it if ANY OTHER currently-installed addon lists it (transitively) in its
    // `requires`. Show which parent(s) still need it so the user removes those first.
    // (The INSTALL side already co-installs deps below via autoDeps.)
    if (isInstalled) {
      const dependents = currentServer.installedAddons
        .filter(id => id !== addon.id)
        .filter(parentId => collectRequiredIds([parentId], allAddons).includes(addon.id))
        .map(parentId => allAddons.find(a => a.id === parentId))
        .filter(Boolean);
      if (dependents.length > 0) {
        const names = dependents.map(d => d.name).join(', ');
        // "X נדרש ע"י Y — הסר קודם את Y" (X = this dep, Y = the parent(s) that need it).
        alert(t('depRemoveBlocked')
          .replace('{dep}', addon.name)
          .replace('{parents}', names));
        return;
      }
    }

    // Install a single SERVER addon on the VPS via the matching Cloud Function.
    // Used for the parent AND for each auto-installed dependency. Throws on failure
    // so the caller can roll Firestore back. `removing` only matters for plugins
    // (datapacks/mods/textures are install-only on the backend).
    const installOneOnVps = async (a, removing) => {
      let res;
      if (a.type === 'datapacks') {
        if (removing) throw new Error('הסרת datapack מהשרת אינה נתמכת אוטומטית — הסר ידנית מתיקיית העולם.');
        res = await installDatapackFn({ serverId, addonId: a.id });
      } else if (a.type === 'mods') {
        // mods install via Modrinth (install-mod.sh) and load on restart. Install-only —
        // no auto-uninstall (same model as datapacks). Client-side mods (Sodium/Iris/
        // Litematica) are installMethod:'client' and never reach here (handled above).
        if (removing) throw new Error('הסרת mod מהשרת אינה נתמכת אוטומטית — הסר ידנית מתיקיית mods.');
        res = await installModFn({ serverId, modId: a.id });
      } else if (a.type === 'textures') {
        // server-forced resource pack (install-resourcepack.sh -> server.properties).
        // ONE pack per server (last one wins); needs a restart to apply. Client-only
        // textures (t2/t8) are installMethod:'client' and never reach here (handled above).
        if (removing) throw new Error('הסרת חבילת-טקסטורות אינה נתמכת אוטומטית — הסר ידנית מ-server.properties.');
        res = await installResourcepackFn({ serverId, addonId: a.id });
      } else {
        res = await installPluginFn({ serverId, pluginId: a.id, install: !removing });
      }
      const d = res.data || res;
      if (!d.success && d.note === undefined) throw new Error(d.error || 'VPS install failed');
    };

    // Resolve the SERVER-installable dependencies that must be co-installed with this
    // addon (transitive, de-duped). Only when INSTALLING (not removing), only deps
    // not already installed, and only deps that can actually run on this server's
    // core (skip client/manual deps and core/worldgen-incompatible ones — no false
    // promise). These are auto-added to Firestore + auto-installed on the VPS.
    const serverIsBukkit = isBukkitBased(currentServer.software);
    const autoDeps = isInstalled ? [] : collectRequiredIds([addon.id], allAddons)
      .filter(id => !currentServer.installedAddons.includes(id))
      .map(id => allAddons.find(a => a.id === id))
      .filter(dep => dep
        && getInstallMethod(dep) === 'server'
        && !dep.paid
        && !isCoreIncompatible(dep, currentServer.software)
        && !(serverIsBukkit && isWorldgenDatapack(dep)));

    // server: install/remove דרך ה-Cloud Function המתאים (datapack vs plugin/mod/modpack).
    let newAddons = [...currentServer.installedAddons];
    if (isInstalled) {
      newAddons = newAddons.filter(id => id !== addon.id);
    } else {
      newAddons.push(addon.id);
      // Auto-add resolved dependencies so Firestore reflects what we install on the VPS.
      newAddons = [...new Set([...newAddons, ...autoDeps.map(d => d.id)])];
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

    // Actually install/remove on VPS, with rollback on failure. Dependencies first
    // (so the parent's libs exist), then the parent itself.
    try {
      for (const dep of autoDeps) {
        await installOneOnVps(dep, false);
      }
      await installOneOnVps(addon, isInstalled);
    } catch (e) {
      console.error('toggleAddon VPS install/remove failed:', e);
      // rollback Firestore to previous addon list
      if (db && authUser) {
        await updateDoc(doc(db, getServersPath(), serverId), {
          installedAddons: currentServer.installedAddons,
          needsRestart: currentServer.needsRestart || false,
        });
      }
      alert(`שגיאה בהתקנת/הסרת התוסף: ${e.message}\n\nשים לב: ייתכן שחלק מהתלויות כבר הותקנו על השרת. בדוק את רשימת המותקנים והפעל מחדש אם צריך.`);
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
    // Custom addons are a LIBRARY REFERENCE only — there is no server-side install path
    // for an arbitrary user URL (would need an SSRF-allowlisted installer). Mark them
    // installMethod:'manual' so the UI shows an honest manual badge (no fake install
    // button / no checkbox in the create form) instead of promising an install that fails.
    const newAddon = { ...addonData, id: addonData.id || `c_${Math.random().toString(36).substring(7)}`, installMethod: 'manual' };
    if (db && authUser) {
      await setDoc(doc(db, getAddonsPath(), newAddon.id), newAddon);
    }
  };

  const handleDeleteCustomAddon = async (id) => {
    if (db && authUser) {
      await deleteDoc(doc(db, getAddonsPath(), id));
    }
  };

  // CTA from the landing page: signed-in (incl. anonymous) → go straight to create;
  // fully signed-out → trigger Google sign-in (anonymous auth normally runs on load,
  // so authUser is almost always present and this falls through to the create view).
  const handleLandingCreate = () => {
    if (authUser) setCurrentView('create');
    else signInAsAdmin();
  };

  // ===== PUBLIC LANDING PAGE — default entry view, renders for anonymous visitors =====
  if (currentView === 'landing') {
    return (
      <LandingPage
        t={t} lang={lang} setLang={setLang} isRtl={isRtl}
        authUser={authUser} isAdmin={isAdmin} adminEmail={adminEmail}
        onCreate={handleLandingCreate}
        onPlugins={() => setCurrentView('repository')}
        onGuide={() => openGuide()}
        onOpenPanel={() => setCurrentView('dashboard')}
        onHealth={() => setCurrentView('health')}
        onSignIn={signInAsAdmin}
      />
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans" dir={dir}>
      {/* Faint edge decoration behind ALL content (fixed, z-0, pointer-events:none) */}
      <SideCreepers />
      <nav className="bg-zinc-900 border-b border-zinc-800 px-4 py-2 sticky top-0 z-20 shadow-lg">
        {/* NAV BAR is pinned physical LTR (dir="ltr") — regardless of the app's
            RTL/LTR direction the LOGO stays on the visual LEFT, then the nav
            buttons, with the role/lang/auth group on the right. Only THIS row is
            forced LTR; page content still follows the app `dir`. Button labels are
            single words/icons so each still renders correctly inside its own span. */}
        <div dir="ltr" className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">

          <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-start">
            <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setCurrentView('landing')} title={t('appTitle')}>
              <img src={omricraftLogoS} alt={t('appTitle')} className="h-10 w-auto drop-shadow-[0_0_7px_rgba(203,213,225,0.4)]" />
              <h1 className="text-2xl font-black tracking-tight bg-[linear-gradient(180deg,#eafff6_0%,#74cea1_26%,#2f9165_46%,#a8ead0_58%,#2c8a61_70%,#12583e_100%)] bg-clip-text text-transparent hidden sm:block">
                {t('appTitle')}
              </h1>
            </div>
            {/* The button GROUP follows the app direction (the surrounding nav row
                stays pinned LTR so the logo keeps its left slot). That lets this DOM
                order — create · dashboard · add-ons · guide · war-room — be the ONE
                place the order is defined: it renders right-to-left in Hebrew and
                left-to-right in English, and the landing page's CTA row uses the very
                same sequence, so the two always agree. */}
            <div dir={dir} className="flex items-center gap-2">
              {/* Create — same shape/size as the sibling NavBtns, but with a GREEN
                  outline + green text/icon so it reads as the primary action without
                  being a loud solid button. */}
              <button
                onClick={() => setCurrentView('create')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold transition-all border border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-400 hover:text-emerald-300"
                title={t('landingCtaCreate')}
              >
                <Plus size={16} /> <span className="hidden sm:inline">{t('navCreateShort')}</span>
              </button>
              <NavBtn active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} icon={<img src={dashboardSpider} alt="" className="h-6 w-6 object-contain" />} label={t('dashboard')} />
              <NavBtn active={currentView === 'repository'} onClick={() => setCurrentView('repository')} icon={<img src={addonsSword} alt="" className="h-6 w-6 object-contain" />} label={t('repo')} />
              {/* Guide / מדריך — PUBLIC reference center (servers + add-ons). Visible
                  to everyone incl. anonymous visitors; reachable from the main nav. */}
              <NavBtn active={currentView === 'guide'} onClick={() => openGuide()} icon={<img src={guideManGold} alt="" className={`h-6 w-6 object-contain ${dir === 'rtl' ? '-scale-x-100' : ''}`} />} label={t('guideNav')} />
              {/* War Room / חמ"ל — dedicated health-diagnostics tab is ADMIN-ONLY
                  (it carries the mine/all toggle). Non-admins get the full חמ"ל
                  experience — every issue on their own servers + fix buttons —
                  inside the Dashboard summary panel instead. The backend stays
                  open: getDiagnostics is callable by any authed user (scoped) and
                  the fix callables are owner-or-admin, which powers that panel. */}
              {isAdmin && (
                <NavBtn active={currentView === 'health'} onClick={() => setCurrentView('health')} icon={<img src={warroomCreeperTnt} alt="" className="h-6 w-6 object-contain" />} label={t('healthNav')} />
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end bg-zinc-950 sm:bg-transparent p-2 sm:p-0 rounded-lg">
            {/* Role badge — half-height: py-0.5 + text-[10px] + 12px icon. */}
            <div className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-md ${userRole === 'admin' ? 'bg-emerald-600/15 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`} title={userRole === 'admin' ? t('roleAdmin') : t('roleMember')}>
              {userRole === 'admin' ? <Shield size={12}/> : <Users size={12}/>}
              <span className="hidden sm:inline">{userRole === 'admin' ? t('roleAdmin') : t('roleMember')}</span>
            </div>

            <LanguageSelector lang={lang} setLang={setLang} title={t('language')} className="px-2 py-1.5 rounded-full" />

            {isAdmin && adminEmail ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-xs text-emerald-400 font-bold max-w-[140px] truncate" title={adminEmail}>{adminEmail}</span>
                <button onClick={signOutAdmin} className="text-zinc-400 hover:text-white transition-colors text-xs font-bold px-2 py-1.5 rounded-md bg-zinc-800" title={t('adminSignOut')}>
                  {t('adminSignOut')}
                </button>
              </div>
            ) : (
              <button onClick={signInAsAdmin} className="text-emerald-400 hover:text-white transition-colors flex items-center gap-1 text-xs font-bold px-2 py-1.5 rounded-md bg-zinc-800 hover:bg-emerald-600" title={t('adminSignIn')}>
                <Shield size={14} /> <span className="hidden sm:inline">{t('adminSignIn')}</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 relative z-10">
        {currentView === 'dashboard' && (
          <Dashboard
            servers={visibleServers} t={t} userRole={userRole} isRtl={isRtl}
            isAdmin={isAdmin} playersData={playersData}
            onOpenServer={(id) => { setActiveServerId(id); setCurrentView('server'); }}
            onCreateClick={() => setCurrentView('create')}
            onOpenRepository={() => setCurrentView('repository')}
            onOpenHealth={() => setCurrentView('health')}
            toggleServerStatus={toggleServerStatus}
            onDeleteAll={deleteAllServers}
            onApproveRequest={handleApproveRequest}
            onServerRestored={() => setCurrentView('dashboard')}
          />
        )}
        
        {currentView === 'create' && (
          <CreateServerForm
            t={t}
            lang={lang}
            isRtl={isRtl}
            allAddons={allAddons}
            userRole={userRole}
            isAdmin={isAdmin}
            mcVersions={mcVersions}
            versionMatrix={versionMatrix}
            onCancel={() => setCurrentView('dashboard')}
            onCreate={handleCreateServer}
            isCreatingServer={isCreatingServer}
          />
        )}

        {currentView === 'server' && activeServer && (
          <ServerPanel
            server={activeServer} t={t} lang={lang} allAddons={allAddons} userRole={userRole} mcVersions={mcVersions} versionMatrix={versionMatrix}
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
            t={t} lang={lang} isRtl={isRtl} allAddons={allAddons} customAddons={customAddons} userRole={userRole}
            onAdd={handleAddCustomAddon}
            onDelete={handleDeleteCustomAddon}
          />
        )}

        {/* Guide / מדריך — PUBLIC reference center. No auth gate (open to anonymous
            visitors, like the landing). `scrollToAnchor` powers deep-links. */}
        {currentView === 'guide' && (
          <GuidePage t={t} isRtl={isRtl} scrollToAnchor={guideAnchor} />
        )}

        {/* War Room / חמ"ל — ADMIN-ONLY dedicated tab (mine/all toggle). The
            redirect effect below bounces non-admins back to the dashboard if they
            ever land on this view; their חמ"ל lives in the Dashboard panel. */}
        {currentView === 'health' && isAdmin && (
          <HealthTab t={t} isAdmin={isAdmin} isRtl={isRtl} serverIds={visibleServers.map(s => s.id)} />
        )}
      </main>

      {/* Delete-confirmation dialog — soft (30-day backup) vs permanent. Replaces the
          old plain window.confirm on server delete. performDeleteServer runs the
          chosen action; the mod note shows for mod-family servers. */}
      <DeleteServerModal
        open={!!deleteModal}
        name={deleteModal?.name}
        isModServer={!!deleteModal?.isMod}
        busy={deleteBusy}
        onConfirm={performDeleteServer}
        onCancel={() => { if (!deleteBusy) setDeleteModal(null); }}
        t={t}
      />
    </div>
  );
}

