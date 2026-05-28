import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Server, Play, Square, Package, Plus, Search, 
  Terminal, HardDrive, Cpu, ArrowLeft, Check, Download, AlertCircle,
  Globe, User, Trash2, X, Library, UploadCloud, Link as LinkIcon,
  Shield, Users, RefreshCw, Map as MapIcon, RefreshCcw, Settings,
  Star, Layers, Camera, ImageIcon, Edit3, Palette,
  Folder, FileText, FileCode, Save
} from 'lucide-react';

// --- Firebase Setup ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc } from 'firebase/firestore';

import { getFunctions, httpsCallable } from "firebase/functions";


const firebaseConfig = {
  apiKey: "AIzaSyBc72tYqQAlJarsqt5CUJQ93rFCfHIZe3M",
  authDomain: "omricraft-74735.firebaseapp.com",
  projectId: "omricraft-74735",
  storageBucket: "omricraft-74735.firebasestorage.app",
  messagingSenderId: "308782209773",
  appId: "1:308782209773:web:4a5808ece4a1d7f06e4ae4"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functionsInstance = getFunctions(app);
const sendMcCommand = httpsCallable(functionsInstance, 'sendMcCommand');
const createServerFn = httpsCallable(functionsInstance, 'createServer');
const deleteServerFn = httpsCallable(functionsInstance, 'deleteServer');


// --- מילון שפות ---
const DICT = {
  he: {
    appTitle: "OmriCraft",
    dashboard: "לוח בקרה",
    repo: "מאגר תוספים",
    ourServers: "השרתים שלנו",
    manageDesc: "נהל את העולמות, המודים והפלאגינים שלך.",
    newServer: "שרת חדש",
    noServers: "אין שרתים עדיין",
    noServersDesc: "לחץ על הכפתור כדי ליצור את שרת המיינקראפט הראשון שלכם.",
    create: "יצירת שרת",
    online: "מחובר",
    offline: "מנותק",
    starting: "מתחיל...",
    start: "הפעל",
    stop: "כיבוי",
    restart: "הפעלה מחדש",
    manage: "ניהול שרת",
    back: "חזרה",
    serverName: "שם השרת",
    serverIcon: "לוגו השרת",
    uploadIcon: "העלה לוגו",
    removeIcon: "הסר לוגו",
    software: "סוג שרת (Software)",
    version: "גרסת מיינקראפט",
    gamemode: "מצב משחק",
    survival: "הישרדות (Survival)",
    creative: "יצירתי (Creative)",
    adventure: "הרפתקה (Adventure)",
    spectator: "צופה (Spectator)",
    worldType: "סוג עולם",
    worldDefault: "רגיל (Default)",
    worldFlat: "שטוח (Flat)",
    opPlayers: "שחקני OP (מנהלים)",
    opPlayersDesc: "הכנס שמות משתמש מופרדים בפסיק (לדוגמה: Omri,Notch)",
    seed: "Seed לעולם (מושאר ריק? ניצור אחד רנדומלי)",
    cancel: "ביטול",
    selectAddons: "בחר תוספים מראש (אופציונלי)",
    overview: "מבט כללי",
    console: "קונסולה",
    addonsTab: "תוספים וטקסטורות",
    filesTab: "קבצים והגדרות",
    advanced: "הגדרות מתקדמות",
    mapTab: "מפה חיה",
    players: "שחקנים",
    ram: "RAM",
    cpu: "מעבד",
    copyIp: "העתק כתובת שרת",
    install: "התקן",
    uninstall: "הסר",
    search: "חיפוש תוסף לפי שם או תיאור...",
    noResults: "לא נמצאו תוצאות.",
    basicSettings: "הגדרות בסיסיות",
    maxPlayers: "מקסימום שחקנים",
    discordWebhook: "Discord Webhook (התראות לשרת)",
    dangerZone: "פעולות מסוכנות",
    deleteServer: "מחיקת שרת",
    deleteServerDesc: "פעולה זו תמחק לחלוטין את השרת, את העולם ואת כל המודים שהתקנתם. לא ניתן לבטל.",
    deleteBtn: "מחק לצמיתות",
    addCustomAddon: "הוסף תוסף אישי",
    createModpack: "יצירת Modpack מותאם אישית",
    addonName: "שם התוסף / מודפאק",
    addonDesc: "תיאור קצר (מה הוא עושה?)",
    save: "שמור למאגר",
    language: "שנה שפה",
    globalRepoDesc: "כאן תוכלו לחפש תוספים, טקסטורות, להוסיף מודים משלכם, או לבנות מודפאק מותאם אישית.",
    mods: "מודים",
    plugins: "פלאגינים",
    datapacks: "דתה-פאקים",
    modpacks: "מודפאקים",
    textures: "טקסטורות",
    uploadFile: "בחר קובץ (.jar / .zip)",
    orLink: "או הדבק קישור הורדה",
    fileSelected: "קובץ נבחר",
    linkInfo: "הקישור יישמר ויאפשר הורדה מהירה לשרת.",
    all: "הכל",
    roleAdmin: "מנהל (עמרי)",
    roleMember: "חבר (שחקן)",
    noPermission: "אין לך הרשאה לבצע זאת.",
    restartRequired: "בוצעו שינויים! נדרש ריסטארט לשרת.",
    missingDependency: "חסרה תלות! מוד זה דורש את:",
    conflictError: "התנגשות! מוד זה לא עובד יחד עם:",
    selectModsForPack: "בחר תוספים שייכללו במודפאק החדש:",
    fileSaved: "הקובץ נשמר בהצלחה!",
    editingFile: "עורך קובץ:",
    saveFile: "שמור שינויים"
  },
  en: {
    appTitle: "OmriCraft",
    dashboard: "Dashboard",
    repo: "Add-ons Repo",
    ourServers: "Our Servers",
    manageDesc: "Manage your worlds, mods, and plugins.",
    newServer: "New Server",
    noServers: "No servers yet",
    noServersDesc: "Click the button to create your first Minecraft server.",
    create: "Create Server",
    online: "Online",
    offline: "Offline",
    starting: "Starting...",
    start: "Start",
    stop: "Stop",
    restart: "Restart",
    manage: "Manage Server",
    back: "Back",
    serverName: "Server Name",
    serverIcon: "Server Logo",
    uploadIcon: "Upload Logo",
    removeIcon: "Remove Logo",
    software: "Software Type",
    version: "Minecraft Version",
    gamemode: "Gamemode",
    survival: "Survival",
    creative: "Creative",
    adventure: "Adventure",
    spectator: "Spectator",
    worldType: "World Type",
    worldDefault: "Default",
    worldFlat: "Flat",
    opPlayers: "OP Players (Admins)",
    opPlayersDesc: "Comma separated usernames (e.g., Omri,Notch)",
    seed: "World Seed (Leave empty for random)",
    cancel: "Cancel",
    selectAddons: "Pre-install Add-ons (Optional)",
    overview: "Overview",
    console: "Console",
    addonsTab: "Mods & Textures",
    filesTab: "Files & Config",
    advanced: "Advanced Settings",
    mapTab: "Live Map",
    players: "Players",
    ram: "RAM",
    cpu: "CPU",
    copyIp: "Copy Server Address",
    install: "Install",
    uninstall: "Uninstall",
    search: "Search add-on by name or description...",
    noResults: "No results found.",
    basicSettings: "Basic Settings",
    maxPlayers: "Max Players",
    discordWebhook: "Discord Webhook (Alerts)",
    dangerZone: "Danger Zone",
    deleteServer: "Delete Server",
    deleteServerDesc: "This will completely delete the server, world, and installed mods. Cannot be undone.",
    deleteBtn: "Delete Permanently",
    addCustomAddon: "Add Custom Add-on",
    createModpack: "Create Custom Modpack",
    addonName: "Add-on / Modpack Name",
    addonDesc: "Short Description",
    save: "Save to Repo",
    language: "Change Language",
    globalRepoDesc: "Search add-ons, textures, add your own mods, or build custom modpacks.",
    mods: "Mods",
    plugins: "Plugins",
    datapacks: "Datapacks",
    modpacks: "Modpacks",
    textures: "Textures",
    uploadFile: "Select File (.jar / .zip)",
    orLink: "Or Paste Download Link",
    fileSelected: "File selected",
    linkInfo: "Link will be saved for quick server download.",
    all: "All",
    roleAdmin: "Admin (Omri)",
    roleMember: "Member (Player)",
    noPermission: "You don't have permission for this.",
    restartRequired: "Changes made! Server restart required.",
    missingDependency: "Missing dependency! This requires:",
    conflictError: "Conflict! This is incompatible with:",
    selectModsForPack: "Select addons to include in this modpack:",
    fileSaved: "File saved successfully!",
    editingFile: "Editing:",
    saveFile: "Save Changes"
  }
};

const TYPE_COLORS = {
  mods: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  plugins: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  datapacks: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  modpacks: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  textures: 'bg-teal-500/10 text-teal-400 border-teal-500/20'
};

const SOFTWARE_TYPES = [
  { id: 'vanilla', name: 'Vanilla', type: 'official' },
  { id: 'paper', name: 'Paper', type: 'plugins' },
  { id: 'fabric', name: 'Fabric', type: 'mods' },
  { id: 'forge', name: 'Forge', type: 'mods' }
];

const DEFAULT_ADDONS = [
  // --- Mods (Fabric/Forge) ---
  { id: 'm1', name: 'Sodium', desc: 'משפר ביצועים ו-FPS בטירוף', type: 'mods', downloads: '24M', rating: 4.9, reviews: 15400 },
  { id: 'm2', name: 'Iris Shaders', desc: 'תמיכה בשיידרים מהממים', type: 'mods', downloads: '15M', requires: ['m1'], rating: 4.8, reviews: 11200 },
  { id: 'm3', name: 'Create', desc: 'מוד טכנולוגיה, גלגלי שיניים, אוטומציה ורכבות', type: 'mods', downloads: '40M', rating: 4.9, reviews: 30000 },
  { id: 'm4', name: 'Litematica', desc: 'מאפשר להציג סכמות ושרטוטים תלת ממדיים', type: 'mods', downloads: '12M', rating: 4.7, reviews: 8500 },
  { id: 'm5', name: 'Distant Horizons', desc: 'מגדיל את טווח הראייה משמעותית בלי להעמיס על המחשב', type: 'mods', downloads: '8M', rating: 4.6, reviews: 4200 },
  { id: 'm6', name: 'Simple Voice Chat', desc: 'צ\'אט קולי מובנה במשחק לפי מרחק שחקנים (Proximity Chat)', type: 'mods', downloads: '25M', rating: 4.8, reviews: 16000 },
  { id: 'm7', name: 'Just Enough Items (JEI)', desc: 'מציג את כל הפריטים והמתכונים במשחק', type: 'mods', downloads: '150M', rating: 4.9, reviews: 90000 },

  // --- Plugins (Paper) ---
  { id: 'p1', name: 'EssentialsX', desc: 'פקודות בסיסיות לשרת (spawn, home, tpa, warp)', type: 'plugins', downloads: '10M', rating: 4.7, reviews: 12500 },
  { id: 'p2', name: 'GeyserMC', desc: 'יאפשר לחברים מהטלפון/קונסולה להיכנס לשרת ה-Java', type: 'plugins', downloads: '8M', rating: 4.8, reviews: 6800 },
  { id: 'p3', name: 'CoreProtect', desc: 'שומר היסטוריה של כל בלוק לביצוע Rollback ומניעת גריפינג', type: 'plugins', downloads: '5M', rating: 4.9, reviews: 4500 },
  { id: 'p4', name: 'LuckPerms', desc: 'מערכת ניהול הרשאות ודרגות (Admin, VIP) המובילה כיום', type: 'plugins', downloads: '12M', rating: 4.9, reviews: 9000 },
  { id: 'p5', name: 'Vault', desc: 'תשתית הכרחית למערכות כלכלה וכסף בשרת', type: 'plugins', downloads: '25M', rating: 4.7, reviews: 13000 },
  { id: 'p6', name: 'WorldEdit', desc: 'עריכת עולם מסיבית ומהירה באמצעות פקודות וגרזן עץ', type: 'plugins', downloads: '30M', rating: 4.8, reviews: 22000 },
  { id: 'p9', name: 'BlueMap', desc: 'יוצר מפת תלת ממד חיה של השרת שניתן לראות בדפדפן', type: 'plugins', downloads: '4M', rating: 4.6, reviews: 3100 },
  { id: 'p10', name: 'Fast Leaf Decay', desc: 'עלים נופלים מיד כשהעץ נשבר (מונע לאגים)', type: 'plugins', downloads: '5M', rating: 4.8, reviews: 4100 },
  { id: 'p11', name: 'GSit Modern Sit Seats', desc: 'מאפשר לשחקנים לשבת על מדרגות, בלוקים או על שחקנים אחרים', type: 'plugins', downloads: '3.5M', rating: 4.7, reviews: 2800 },
  { id: 'p12', name: 'Multiverse-Core', desc: 'ניהול מתקדם של מספר עולמות נפרדים על אותו שרת', type: 'plugins', downloads: '18M', rating: 4.8, reviews: 15000 },
  { id: 'p13', name: 'ZNPCsPlus', desc: 'יצירת דמויות NPC בקלות שנותנות פקודות לשחקנים', type: 'plugins', downloads: '2.2M', rating: 4.6, reviews: 1900 },
  { id: 'p14', name: 'PlaceholderAPI', desc: 'תשתית עיקרית למשתנים (כמו {player_name}) בפלאגינים', type: 'plugins', downloads: '20M', rating: 4.9, reviews: 11000 },
  { id: 'p15', name: 'PowerRanks', desc: 'מערכת דרגות והרשאות קלה להגדרה מתוך המשחק', type: 'plugins', downloads: '1.2M', rating: 4.4, reviews: 900 },
  { id: 'p16', name: 'ChatControl', desc: 'סינון ספאם, קללות ושליטה מתקדמת בצ\'אט', type: 'plugins', downloads: '3M', rating: 4.5, reviews: 2400 },
  { id: 'p17', name: 'Towny Advanced', desc: 'מערכת ערים ואומות שמאפשרת לשחקנים לנהל שטחים (בדיוק כמו בנייטפול)', type: 'plugins', downloads: '8M', rating: 4.8, reviews: 14000 },
  { id: 'p18', name: 'Slimefun 4', desc: 'מוסיף מכונות, גנרטורים וקסמים בלי צורך במודים! חווית הישרדות מתקדמת', type: 'plugins', downloads: '6M', rating: 4.9, reviews: 21000 },
  { id: 'p19', name: 'Aurelium Skills', desc: 'מערכת סקילים ורמות RPG - לחימה, חציבה, פארקור ועוד הרבה', type: 'plugins', downloads: '4M', rating: 4.9, reviews: 8500 },
  { id: 'p20', name: 'AuctionHouse', desc: 'שוק עולמי שבו שחקנים מוכרים וקונים פריטים אחד מהשני (מערכת כלכלה)', type: 'plugins', downloads: '9M', rating: 4.8, reviews: 11000 },
  { id: 'p21', name: 'MythicMobs', desc: 'מאפשר ליצור בוסים ומפלצות מותאמים אישית עם כוחות מיוחדים (כמו בנייטפול)', type: 'plugins', downloads: '7M', rating: 4.9, reviews: 16000 },
  { id: 'p22', name: 'BetterRTP', desc: 'מאפשר לשחקנים להשתגר בבטחה למקום רנדומלי בעולם הפתוח כדי לבנות', type: 'plugins', downloads: '11M', rating: 4.7, reviews: 12500 },

  // --- ניהול ביצועים וכישופים (סגנון נייטפול) ---
  { id: 'p23', name: 'Spark', desc: 'חובה לשרתים מרובי פלאגינים - מנתח ביצועים שמאבחן בדיוק איזה פלאגין גורם ללאגים', type: 'plugins', downloads: '14M', rating: 4.9, reviews: 22000 },
  { id: 'p24', name: 'PlugManX', desc: 'מאפשר להפעיל, לכבות ולרענן פלאגינים ספציפיים מתוך המשחק בלי לעשות ריסטארט לשרת', type: 'plugins', downloads: '3M', rating: 4.8, reviews: 5400 },
  { id: 'p25', name: 'ExcellentEnchants', desc: 'מוסיף עשרות כישופים חדשים ומיוחדים (כמו Refill/Replenish, Telekinesis, ריחוף ועוד)', type: 'plugins', downloads: '2.5M', rating: 4.8, reviews: 3900 },
  { id: 'p26', name: 'AdvancedShulkerboxes', desc: 'פותח שאלקרים מהיד, שואב אליהם חפצים אוטומטית ומוסיף יכולות מתקדמות (Refill)', type: 'plugins', downloads: '1.8M', rating: 4.7, reviews: 2100 },

  // --- תוספות RPG, חיות רכיבה ואנטי-צ'יט (חדש) ---
  { id: 'p27', name: 'MythicMounts', desc: 'חיות רכיבה מיוחדות! מאפשר לרכוב על אפיגאסט (Epigast), לשים לו הארנס (רתמה) עם כישוף Soul Speed שככל שרמתו גבוהה יותר, החיה טסה מהר יותר!', type: 'plugins', downloads: '1.5M', rating: 4.8, reviews: 4200 },
  { id: 'p28', name: 'ItemsAdder', desc: 'הוספת אלפי חפצים, נשקים, רהיטים ובלוקים חדשים לשרת (כולל טקסטורות) בלי שאף שחקן יצטרך להוריד מודים', type: 'plugins', downloads: '4.5M', rating: 4.9, reviews: 18000 },
  { id: 'p29', name: 'Grim AntiCheat', desc: 'מערכת האנטי-צ\'יט (נגד האקרים) המתקדמת בעולם כיום. חוסמת צ\'יטים מבלי לפגוע בשחקנים רגילים', type: 'plugins', downloads: '8M', rating: 4.9, reviews: 25000 },
  { id: 'p30', name: 'ViaVersion', desc: 'חובה! מאפשר לשחקנים מגרסאות מיינקראפט ישנות או חדשות יותר (מ-1.8 עד 1.26) להיכנס לשרת שלך בלי בעיות', type: 'plugins', downloads: '45M', rating: 4.9, reviews: 150000 },
  { id: 'p31', name: 'InteractiveChat', desc: 'משדרג את הצ\'אט: שחקנים יכולים לכתוב [item] או [inv] כדי להראות את הנשק או התיק שלהם לכולם בצ\'אט', type: 'plugins', downloads: '6M', rating: 4.8, reviews: 9200 },
  { id: 'p32', name: 'Chunky', desc: 'כלי חובה לשרתים פתוחים: טוען את כל העולם מראש! מונע לחלוטין את הלאגים שנוצרים כששחקנים חוקרים אזורים חדשים', type: 'plugins', downloads: '12M', rating: 4.9, reviews: 14000 },

  // --- כלים ועיצוב ---
  { id: 'p-axiom', name: 'Axiom', desc: 'כלי בנייה מתקדם לשחקני creative - בנייה מהירה, brushes, undo מלא', type: 'plugins', downloads: '1.2M', rating: 4.9, reviews: 3100 },
  { id: 'p-chatfmt', name: 'ChatFormatter', desc: 'פורמט צ\'אט מתקדם עם תגיות צבעוניות, emoji reactions, ופקודות מותאמות אישית', type: 'plugins', downloads: '800K', rating: 4.6, reviews: 1200 },

  // --- עיצוב וניהול עומסים (בקשת משתמש) ---
  { id: 'p33', name: 'TAB', desc: 'מעצב את רשימת השחקנים (Tablist) שמופיעה שלוחצים על TAB. מאפשר להוסיף צבעים, את הדרגה של השחקן, אנימציות, והודעות למעלה ולמטה (Header/Footer).', type: 'plugins', downloads: '10M', rating: 4.9, reviews: 18000 },
  { id: 'p34', name: 'InvisibleItemFrames', desc: 'מאפשר להפוך מסגרות של חפצים (Item Frames) לבלתי נראות. מעולה לעיצוב חדרים וחנויות בלי לראות את העץ של המסגרת!', type: 'plugins', downloads: '1.2M', rating: 4.8, reviews: 2100 },
  { id: 'p35', name: 'ClearLag', desc: 'פלאגין חובה לשרתים עמוסים: מנקה אוטומטית חפצים שזרוקים על הרצפה, מוחק מובים מיותרים שנתקעו, ומונע קריסות (Crash) כשיש עומס.', type: 'plugins', downloads: '22M', rating: 4.7, reviews: 35000 },

  // --- Datapacks ---
  { id: 'd1', name: 'Vanilla Tweaks', desc: 'אוסף שיפורים קטנים ונוחים למשחק הרגיל', type: 'datapacks', downloads: '2M', rating: 4.8, reviews: 3200 },
  { id: 'd2', name: 'Terralith', desc: 'משנה לחלוטין את יצירת העולם, ביומות והרים ללא בלוקים חדשים', type: 'datapacks', downloads: '4M', rating: 4.7, reviews: 5100 },
  { id: 'd4', name: 'Multiplayer Sleep', desc: 'מספיק שחקן אחד במיטה כדי להעביר את הלילה', type: 'datapacks', downloads: '3M', rating: 4.9, reviews: 4500 },
  { id: 'd6', name: 'Mini Blocks', desc: 'מאפשר להשיג גרסאות מיניאטוריות של בלוקים כראשים', type: 'datapacks', downloads: '1.5M', rating: 4.6, reviews: 1200 },
  { id: 'd7', name: 'Wandering Trades', desc: 'משפר את החפצים שמוכר הסוחר הנודד ומציע בלוקים מיניאטוריים', type: 'datapacks', downloads: '1.2M', rating: 4.5, reviews: 900 },
  { id: 'd8', name: 'Nether Portal Coords', desc: 'מסייע בחישוב מדויק של מיקומי פורטלים בנדר', type: 'datapacks', downloads: '800K', rating: 4.7, reviews: 600 },
  { id: 'd9', name: 'Coordinates HUD', desc: 'מציג קואורדינטות וזמן בצורה נוחה מעל ה-Hotbar', type: 'datapacks', downloads: '2.5M', rating: 4.8, reviews: 2200 },
  { id: 'd10', name: 'Player Head Drops', desc: 'שחקנים מפילים את הראש שלהם כשהם מתים מחיצים או שחקנים', type: 'datapacks', downloads: '2.1M', rating: 4.6, reviews: 1700 },
  { id: 'd11', name: 'More Mob Heads', desc: 'כל המובים במשחק יכולים להפיל את הראש שלהם למטרות קישוט', type: 'datapacks', downloads: '2.8M', rating: 4.7, reviews: 2500 },
  
  // --- Modpacks ---
  { id: 'mp1', name: 'Better MC', desc: 'המיינקראפט כמו שהוא היה צריך להיות - מאות ביומות ומובים', type: 'modpacks', downloads: '7M', rating: 4.6, reviews: 12000 },
  { id: 'mp2', name: 'Vault Hunters', desc: 'מודפאק אקשן ו-RPG מדהים בתוך מבוכים מסוכנים', type: 'modpacks', downloads: '3M', rating: 4.8, reviews: 7500 },
  
  // --- Textures ---
  { id: 't1', name: 'Custom Hats Pack', desc: 'מוסיף כתרים, כובעי קסם ופריטים שניתן לשים על הראש לטובת מראה ייחודי (בדומה לנייטפול)', type: 'textures', downloads: '1.2M', rating: 4.8, reviews: 4500 },
  { id: 't2', name: 'Golden Pumpkin Pie', desc: 'מודל תלת-ממדי מיוחד שהופך את פשטידת הדלעת הרגילה לפשטידת זהב נוצצת', type: 'textures', downloads: '800K', rating: 4.6, reviews: 2100 },
  { id: 't3', name: 'Fresh Animations', desc: 'אנימציות תנועה מציאותיות, חלקות ומצחיקות לכל המפלצות והחיות במשחק', type: 'textures', downloads: '15M', rating: 4.9, reviews: 45000 },
  { id: 't4', name: 'Faithful 32x', desc: 'הטקסטורה הקלאסית והמוכרת של מיינקראפט ברזולוציה כפולה וחדה הרבה יותר', type: 'textures', downloads: '50M', rating: 4.8, reviews: 120000 },
  { id: 't5', name: 'Bare Bones', desc: 'טקסטורה חלקה ונקייה שגורמת למשחק להיראות כמו הטריילרים הרשמיים של מיינקראפט', type: 'textures', downloads: '22M', rating: 4.9, reviews: 60000 },
  { id: 't6', name: 'Visible Ores', desc: 'גורם למחצבים (יהלומים, ברזל) לזהור בחושך, מושלם למערות עמוקות', type: 'textures', downloads: '9.5M', rating: 4.8, reviews: 25000 },
  { id: 't7', name: 'Dark UI', desc: 'משנה את כל התפריטים במשחק לעיצוב כהה ונוח לעיניים (Dark Mode)', type: 'textures', downloads: '18M', rating: 4.9, reviews: 41000 },
  { id: 't8', name: 'Shulker Box Tooltip', desc: 'מאפשר לראות את כל התכולה של השאלקרים ברחרוף עם העכבר בתוך התיק, בלי להניח אותם', type: 'textures', downloads: '35M', rating: 4.9, reviews: 85000 },
];

export default function App() {
  const [authUser, setAuthUser] = useState(null);
  const [userRole, setUserRole] = useState('admin');
  const [lang, setLang] = useState('he');
  const t = (key) => DICT[lang][key] || key;
  const isRtl = lang === 'he';

  const [currentView, setCurrentView] = useState('dashboard');
  const [activeServerId, setActiveServerId] = useState(null);
  
  const [mcVersions, setMcVersions] = useState([
    // Game Drops era
    '26.1', '26.1.1', '26.1.2',
    // 1.21.x
    '1.21.5', '1.21.4', '1.21.3', '1.21.2', '1.21.1', '1.21',
    // 1.20.x
    '1.20.6', '1.20.5', '1.20.4', '1.20.3', '1.20.2', '1.20.1', '1.20',
    // 1.19.x
    '1.19.4', '1.19.3', '1.19.2', '1.19.1', '1.19',
    // 1.18.x
    '1.18.2', '1.18.1', '1.18',
    // 1.17.x
    '1.17.1', '1.17',
    // 1.16.x
    '1.16.5', '1.16.4', '1.16.3', '1.16.2', '1.16.1', '1.16',
    // 1.15.x
    '1.15.2', '1.15.1', '1.15',
    // 1.14.x
    '1.14.4', '1.14.3', '1.14.2', '1.14.1', '1.14',
    // 1.13.x
    '1.13.2', '1.13.1', '1.13',
    // 1.12.x
    '1.12.2', '1.12.1', '1.12',
    // 1.11.x
    '1.11.2', '1.11.1', '1.11',
    // 1.10.x
    '1.10.2', '1.10.1', '1.10',
    // 1.9.x
    '1.9.4', '1.9.3', '1.9.2', '1.9.1', '1.9',
    // 1.8.x
    '1.8.9', '1.8.8', '1.8.7', '1.8.6', '1.8.5', '1.8.4', '1.8.3', '1.8.2', '1.8.1', '1.8',
    // 1.7.x
    '1.7.10', '1.7.9', '1.7.8', '1.7.7', '1.7.6', '1.7.5', '1.7.4', '1.7.2',
    // 1.6.x
    '1.6.4', '1.6.2', '1.6.1',
    // 1.5.x
    '1.5.2', '1.5.1', '1.5',
    // 1.4.x
    '1.4.7', '1.4.6', '1.4.5', '1.4.4', '1.4.2',
    // 1.3.x
    '1.3.2', '1.3.1',
    // 1.2.x
    '1.2.5', '1.2.4', '1.2.3', '1.2.2', '1.2.1',
  ]);

  const [servers, setServers] = useState([]);
  const [customAddons, setCustomAddons] = useState([]);

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
    
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUser(user);
      } else {
        initAuth();
      }
    });

    return () => unsubscribe();
  }, []);

  const getServersPath = () => {
    if (!authUser) return null;
    return `users/${authUser.uid}/servers`;
  };

  const getAddonsPath = () => {
    if (!authUser) return null;
    return `users/${authUser.uid}/customAddons`;
  };

  useEffect(() => {
    if (!db || !authUser) return;

    const serversPath = getServersPath();
    const addonsPath = getAddonsPath();

    if (!serversPath || !addonsPath) return;

    const unsubServers = onSnapshot(collection(db, serversPath), (snap) => {
      setServers(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Firestore Listen Error (Servers):", err));

    const unsubAddons = onSnapshot(collection(db, addonsPath), (snap) => {
      setCustomAddons(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (err) => console.error("Firestore Listen Error (Addons):", err));

    return () => { unsubServers(); unsubAddons(); };
  }, [authUser]);
  // ----------------------------------------

  const allAddons = useMemo(() => [...DEFAULT_ADDONS, ...customAddons], [customAddons]);
  const activeServer = servers.find(s => s.id === activeServerId);

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

    if (!value) {
      alert('אין דומיין להעתקה');
      return false;
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      textarea.style.left = '0';
      textarea.style.opacity = '0';

      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();

      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);

      if (copied) {
        alert(`הועתק: ${value}`);
        return true;
      }

      window.prompt('העתק את הדומיין ידנית:', value);
      return false;
    } catch (error) {
      console.error('Clipboard copy failed:', error);
      window.prompt('העתק את הדומיין ידנית:', value);
      return false;
    }
  };

  const handleCreateServer = async (data) => {
    if (creatingServerRef.current) {
      console.warn('World creation is already in progress. Ignoring duplicate click.');
      return;
    }

    creatingServerRef.current = true;
    setIsCreatingServer(true);

    try {
      if (!db || !authUser) {
        throw new Error('Database or user is not ready.');
      }

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
        version: data.version || '1.21.1',
        memoryMb: data.memoryMb || 2048,
        gamemode: data.gamemode || 'survival',
        ops: data.ops || [],
        maxPlayers: data.maxPlayers || 20,
        seed: String(finalSeed || ''),
        addons: resolvedAddons,
        icon: data.icon || ''
      });

      if (!result.data?.success) {
        throw new Error(result.data?.error || 'Server creation failed');
      }

      const serverData = {
        ...data,
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
      if (!db || !authUser) {
        throw new Error('אין חיבור תקין ל-Firebase או שאין משתמש מחובר.');
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
    const currentServer = servers.find(s => s.id === id);
    if (!currentServer) return;

    let newStatus = currentServer.status === 'offline' ? 'starting' : 'offline';

    if (db && authUser) {
      await updateDoc(doc(db, getServersPath(), id), { status: newStatus, players: 0, needsRestart: false });
      if (newStatus === 'starting') {
        setTimeout(async () => {
          await updateDoc(doc(db, getServersPath(), id), { status: 'online' });
        }, 3000);
      }
    }
  };

  const restartServer = async (id) => {
    if (userRole !== 'admin') return;
    
    if (db && authUser) {
      await updateDoc(doc(db, getServersPath(), id), { status: 'starting', players: 0, needsRestart: false });
      setTimeout(async () => {
        await updateDoc(doc(db, getServersPath(), id), { status: 'online' });
      }, 4000);
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
    
    const requiresRestart = currentServer.status === 'online';

    if (db && authUser) {
      await updateDoc(doc(db, getServersPath(), serverId), { 
        installedAddons: newAddons, 
        needsRestart: requiresRestart || currentServer.needsRestart 
      });
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
            servers={servers} t={t} userRole={userRole}
            onOpenServer={(id) => { setActiveServerId(id); setCurrentView('server'); }}
            onCreateClick={() => setCurrentView('create')}
            toggleServerStatus={toggleServerStatus}
          />
        )}
        
        {currentView === 'create' && (
          <CreateServerForm
            t={t}
            allAddons={allAddons}
            userRole={userRole}
            mcVersions={mcVersions}
            onCancel={() => setCurrentView('dashboard')}
            onCreate={handleCreateServer}
            isCreatingServer={isCreatingServer}
          />
        )}

        {currentView === 'server' && activeServer && (
          <ServerPanel 
            server={activeServer} t={t} allAddons={allAddons} userRole={userRole} mcVersions={mcVersions}
            onBack={() => setCurrentView('dashboard')}
            toggleStatus={() => toggleServerStatus(activeServer.id)}
            restartServer={() => restartServer(activeServer.id)}
            toggleAddon={(addon) => toggleAddonForServer(activeServer.id, addon)}
            onDelete={() => deleteServer(activeServer.id)}
            updateServer={(newData) => updateServer(activeServer.id, newData)}
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

function NavBtn({ active, onClick, icon, label }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all ${active ? 'bg-zinc-800 text-white shadow-md' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
    >
      {icon} <span className="hidden md:inline">{label}</span>
    </button>
  );
}

function ImageUploader({ iconUrl, setIconUrl, t, size = 'lg' }) {
  const fileInputRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setIconUrl(reader.result); 
      };
      reader.readAsDataURL(file);
    }
  };

  const dimensions = size === 'lg' ? 'w-24 h-24 sm:w-32 sm:h-32' : 'w-16 h-16';
  const iconSize = size === 'lg' ? 32 : 20;

  return (
    <div className="flex flex-col items-center gap-2">
      <div 
        onClick={() => fileInputRef.current.click()}
        className={`relative ${dimensions} rounded-2xl border-2 border-dashed flex items-center justify-center cursor-pointer transition-all overflow-hidden group
          ${iconUrl ? 'border-zinc-700 bg-zinc-900' : 'border-zinc-700 hover:border-green-500 hover:bg-green-500/10 bg-zinc-950'}`}
        title={t('uploadIcon')}
      >
        {iconUrl ? (
          <>
            <img src={iconUrl} alt="Server Logo" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
               <Camera size={iconSize} className="text-white"/>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center text-zinc-500 group-hover:text-green-500 transition-colors">
            <ImageIcon size={iconSize} className="mb-2" />
            {size === 'lg' && <span className="text-xs font-bold">{t('uploadIcon')}</span>}
          </div>
        )}
        <input 
          type="file" 
          accept="image/png, image/jpeg, image/gif" 
          className="hidden" 
          ref={fileInputRef} 
          onChange={handleImageChange} 
        />
      </div>
      {iconUrl && size === 'lg' && (
        <button type="button" onClick={() => setIconUrl(null)} className="text-xs text-red-400 hover:text-red-300 transition-colors">
          {t('removeIcon')}
        </button>
      )}
    </div>
  );
}

function Dashboard({ servers, onOpenServer, onCreateClick, toggleServerStatus, t, userRole }) {
  return (
    <div className="animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold mb-2">{t('ourServers')}</h2>
          <p className="text-zinc-400">{t('manageDesc')}</p>
        </div>
        {userRole === 'admin' && (
          <button 
            onClick={onCreateClick}
            className="bg-green-600 hover:bg-green-500 text-white px-5 py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/20"
          >
            <Plus size={20} /> <span>{t('newServer')}</span>
          </button>
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
                  
                  <div className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold flex items-center gap-1.5 whitespace-nowrap
                    ${server.status === 'online' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 
                      server.status === 'starting' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20' : 
                      'bg-zinc-800 text-zinc-400 border border-zinc-700'}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${server.status === 'online' ? 'bg-green-400' : server.status === 'starting' ? 'bg-yellow-400 animate-pulse' : 'bg-zinc-500'}`}></span>
                    {t(server.status)}
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
                  disabled={server.status === 'starting' || userRole !== 'admin'}
                  title={userRole !== 'admin' ? t('noPermission') : ''}
                  className={`flex-1 py-2 rounded-lg font-medium flex justify-center items-center gap-2 transition-colors disabled:opacity-30
                    ${server.status === 'online' ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                >
                  {server.status === 'online' ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
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

function CreateServerForm({ onCancel, onCreate, allAddons, t, userRole, mcVersions, isCreatingServer = false }) {
  if (userRole !== 'admin') return <div className="text-center p-12 text-zinc-500">{t('noPermission')}</div>;

  const [name, setName] = useState('My Awesome Server');
  const [icon, setIcon] = useState(null); 
  const [software, setSoftware] = useState('paper');
  const [version, setVersion] = useState(mcVersions[0]); 
  const [gamemode, setGamemode] = useState('survival');
  const [worldType, setWorldType] = useState('default');
  const [opsString, setOpsString] = useState('');
  const [seed, setSeed] = useState('');
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [maxPlayers, setMaxPlayers] = useState(20);

  // State חדש לחיפוש תוספים
  const [addonSearch, setAddonSearch] = useState('');

  const relevantAddons = allAddons.filter(a => {
    if (a.type === 'textures') return true; 
    if (['fabric', 'forge'].includes(software) && ['mods', 'modpacks'].includes(a.type)) return true;
    if (software === 'paper' && a.type === 'plugins') return true;
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
    onCreate({
      name, icon, software, version, gamemode, worldType, ops: opsArray,
      seed: seed || undefined, installedAddons: selectedAddons, maxPlayers
    });
  };

  const toggleSelection = (id) => setSelectedAddons(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);

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
                <div key={sw.id} onClick={() => { setSoftware(sw.id); setSelectedAddons([]); }}
                  className={`cursor-pointer border rounded-lg p-3 text-center transition-all flex flex-col items-center gap-1
                    ${software === sw.id ? 'bg-green-500/10 border-green-500 text-green-400 shadow-md' : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'}`}>
                  <div className="font-bold">{sw.name}</div>
                  <div className="text-[10px] uppercase opacity-70">{sw.type}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-zinc-400 mb-2">{t('version')}</label>
              <select value={version} onChange={(e) => setVersion(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-green-500 transition-all">
                {mcVersions.map(v => <option key={v} value={v}>{v}{v === '1.21.4' ? ' (מומלץ)' : ''}</option>)}
              </select>
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
          </div>
          
          <div className="bg-zinc-950 border border-red-500/20 rounded-xl p-5">
             <label className="block text-sm font-bold text-red-400 mb-2">{t('opPlayers')}</label>
             <input type="text" placeholder={t('opPlayersDesc')} value={opsString} onChange={(e) => setOpsString(e.target.value)}
               className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-red-500 transition-all placeholder:text-zinc-600" />
             <p className="text-xs text-zinc-500 mt-2">רק השחקנים ברשימה זו יוכלו להשתמש בפקודות ניהול בשרת.</p>
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

function ServerPanel({ server, onBack, toggleStatus, restartServer, toggleAddon, onDelete, updateServer, t, allAddons, userRole, mcVersions }) {
  const [activeTab, setActiveTab] = useState('overview');
  const hasMapPlugin = server.installedAddons.includes('p9');

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
            <button 
              onClick={toggleStatus}
              disabled={server.status === 'starting'}
              className={`px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all disabled:opacity-50
                ${server.status === 'online' ? 'bg-zinc-800 hover:bg-zinc-700 text-white' : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20'}`}
            >
              {server.status === 'online' ? <Square size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
              {server.status === 'online' ? t('stop') : t('start')}
            </button>
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
          {activeTab === 'overview' && <OverviewTab server={server} t={t} />}
          {activeTab === 'map' && <MapTab server={server} t={t} />}
          {activeTab === 'console' && <ConsoleTab server={server} t={t} userRole={userRole} />}
          {activeTab === 'addons' && <AddonsTab server={server} toggleAddon={toggleAddon} t={t} allAddons={allAddons} userRole={userRole} />}
          {activeTab === 'files' && <FilesTab server={server} t={t} userRole={userRole} />}
          {activeTab === 'settings' && userRole === 'admin' && <SettingsTab server={server} onDelete={onDelete} updateServer={updateServer} t={t} mcVersions={mcVersions} />}
        </div>
      </div>
    </div>
  );
}

function TabBtn({ icon, label, active, onClick, badge }) {
  return (
    <button onClick={onClick} className={`flex items-center justify-between w-full p-3 rounded-lg font-medium transition-all whitespace-nowrap ${active ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}>
      <div className="flex items-center gap-3">{icon} <span>{label}</span></div>
      {badge !== undefined && badge > 0 && <span className="bg-green-500/20 text-green-400 text-xs py-0.5 px-2 rounded-full font-bold">{badge}</span>}
    </button>
  );
}

function OverviewTab({ server, t }) {
  const [copiedDomain, setCopiedDomain] = useState(false);

  const slug =
    server?.serverSlug ||
    server?.minecraftWorldName ||
    server?.worldName ||
    server?.id;

  const domain = server?.address || (server?.slug ? `${server.slug}.omricraft.com` : (slug ? `${slug}.omricraft.com` : '—'));

  return (
    <div className="space-y-6 animate-in fade-in">
      <div>
        <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl flex items-center justify-between gap-3">
          <div className="font-mono text-lg text-green-400 tracking-wider truncate" dir="ltr" title={domain}>
            {domain}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {copiedDomain && (
              <span className="text-xs text-emerald-400">
                הועתק
              </span>
            )}

            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(domain);
                  setCopiedDomain(true);
                  setTimeout(() => setCopiedDomain(false), 2000);
                } catch (error) {
                  window.prompt('העתק ידנית את הדומיין:', domain);
                }
              }}
              className="text-sm bg-zinc-800 hover:bg-zinc-700 px-4 py-2 rounded-lg transition-colors"
            >
              {copiedDomain ? 'הועתק!' : t('copyIp')}
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
          <div className="text-zinc-400 text-sm mb-1 flex items-center gap-2"><Cpu size={16} /> {t('players')}</div>
          <div className="text-3xl font-bold">{server.status === 'online' ? server.players : 0} <span className="text-base text-zinc-500 font-normal">/ {server.maxPlayers}</span></div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-xl">
          <div className="text-zinc-400 text-sm mb-1">{t('ram')}</div>
          <div className="text-3xl font-bold">{server.status === 'online' ? '1.8' : '0'} <span className="text-base text-zinc-500 font-normal">GB / 4 GB</span></div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 p-5 rounded-xl">
          <div className="text-zinc-400 text-sm mb-1">{t('cpu')}</div>
          <div className="text-3xl font-bold">{server.status === 'online' ? '12' : '0'} <span className="text-base text-zinc-500 font-normal">%</span></div>
        </div>
      </div>
    </div>
  );
}

function MapTab({ server, t }) {
  return (
    <div className="h-full flex flex-col animate-in fade-in space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-bold flex items-center gap-2 text-xl"><MapIcon size={20} className="text-blue-400"/> {t('mapTab')} (BlueMap)</h3>
        {server.status !== 'online' && <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">{t('offline')}</span>}
      </div>
      <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-center min-h-[400px] relative overflow-hidden">
        {server.status === 'online' ? (
          <iframe src="https://demo.bluemap.app/" title="Live Map" className="absolute inset-0 w-full h-full border-0"></iframe>
        ) : (
          <div className="text-zinc-600 flex flex-col items-center gap-2 z-10">
            <AlertCircle size={32}/>
            <p>השרת חייב להיות מחובר כדי לצפות במפה</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ConsoleTab({ server, t, userRole }) {
  const [logs, setLogs] = useState([
    `[INFO]: Starting minecraft server version ${server.version}`,
    '[INFO]: Loading properties',
  ]);
  const [consoleInput, setConsoleInput] = useState('');
  const [sending, setSending] = useState(false);
  const logsEndRef = useRef(null);

  useEffect(() => {
    if (server.status === 'starting') {
      setLogs(prev => [...prev, `[INFO]: Starting ${server.software} server...`, `[INFO]: Loading addons...`]);
      setTimeout(() => setLogs(prev => [...prev, `[INFO]: Done (3.24s)! For help, type "help"`]), 3000);
    } else if (server.status === 'offline') {
      setLogs(prev => [...prev, `[INFO]: Stopping server`, `[INFO]: Saving chunks`]);
    }
  }, [server.status, server.software]);

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
        if (data.output) setLogs(prev => [...prev, `[RCON]: ${data.output}`]);
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
        {server.status !== 'online' && <span className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={14}/> {t('offline')}</span>}
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
          placeholder={server.status === 'online' && userRole === 'admin' ? 'הכנס פקודה...' : '...'}
          disabled={server.status !== 'online' || userRole !== 'admin' || sending}
          value={consoleInput}
          onChange={e => setConsoleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-zinc-950 px-4 py-3 outline-none text-white disabled:opacity-50 font-mono"
          dir="ltr"
        />
        <button
          onClick={handleSend}
          disabled={server.status !== 'online' || userRole !== 'admin' || sending || !consoleInput.trim()}
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
  };

  return (
    <div className="animate-in fade-in">
      {warning && (
        <div className={`p-4 rounded-xl mb-4 font-bold flex items-center justify-between ${warning.type === 'conflict' ? 'bg-red-500/20 text-red-300 border border-red-500/50' : 'bg-orange-500/20 text-orange-300 border border-orange-500/50'}`}>
          <div className="flex items-center gap-2"><AlertCircle size={18}/> {warning.message}</div>
          <button onClick={()=>setWarning(null)} className="p-1 hover:bg-black/20 rounded"><X size={16}/></button>
        </div>
      )}

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
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-lg">{item.name}</h4>
                    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${badgeStyle}`}>
                      {t(item.type) || item.type}
                    </span>
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
                <button onClick={() => handleToggle(item)} className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${isInstalled ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20' : 'bg-green-600 hover:bg-green-500 text-white'}`}>
                  {isInstalled ? t('uninstall') : <><Download size={16} /> {t('install')}</>}
                </button>
              )}
            </div>
          );
        })}
        {displayAddons.length === 0 && <div className="text-center text-zinc-500 py-12">{t('noResults')}</div>}
      </div>
    </div>
  );
}

// --- NEW FILES TAB COMPONENT (File Manager) ---
function FilesTab({ server, t, userRole }) {
  const [currentPath, setCurrentPath] = useState([]);
  const [editingFile, setEditingFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [savedMsg, setSavedMsg] = useState(false);

  // מערכת קבצים וירטואלית להדגמה (בדיוק כמו באטרנוס)
  const [fileSystem, setFileSystem] = useState({
    'server.properties': 'motd=Welcome to OmriCraft!\nmax-players=20\nview-distance=10\nonline-mode=true\npvp=true\ndifficulty=hard\ngenerate-structures=true',
    'bukkit.yml': 'settings:\n  allow-end: true\n  connection-throttle: 4000\n  ticks-per:\n    animal-spawns: 400\n    monster-spawns: 1',
    'spigot.yml': 'messages:\n  whitelist: "You are not whitelisted on this server!"\n  unknown-command: "Unknown command. Type /help"\nstats:\n  disable-saving: false',
    'world': {
      'level.dat': '[Binary Data - Cannot Edit]',
      'playerdata': {
        'Omri.dat': '[Binary Data]'
      }
    },
    'plugins': {
      'Essentials': {
        'config.yml': '# Essentials Configuration\nops-name-color: "4"\nheal-cooldown: 60\nspawnmob-limit: 10\nchat:\n  radius: 0\n  format: "<{DISPLAYNAME}> {MESSAGE}"'
      },
      'Towny': {
        'config.yml': 'town:\n  max_residents: 50\n  upkeep: 10.0\neconomy:\n  daily_taxes: true\n  tax_percentage: 5.0'
      },
      'Slimefun': {
        'config.yml': '# Slimefun 4 Core Settings\nauto-update: true\nclear-holograms-on-shutdown: true\noptions:\n  print-out-loading: false'
      },
      'AureliumSkills': {
        'config.yml': 'skills:\n  farming:\n    enabled: true\n  foraging:\n    enabled: true\n  mining:\n    enabled: true\nmodifiers:\n  health:\n    base: 20.0'
      },
      'AuctionHouse': {
        'config.yml': 'auction:\n  max-listings: 5\n  tax-rate: 5.0\n  listing-duration: 7d\n  prevent-creative-sale: true'
      },
      'MythicMobs': {
        'config.yml': 'Configuration:\n  CheckForUpdates: true\n  General:\n    AllowMetrics: true\n  Mobs:\n    EnableAIModifiers: true'
      }
    }
  });

  const getCurrentFolder = () => {
    let current = fileSystem;
    for (const folder of currentPath) {
      if (current[folder]) current = current[folder];
    }
    return current;
  };

  const handleOpen = (name, content) => {
    if (typeof content === 'object') {
      setCurrentPath([...currentPath, name]);
    } else {
      if (userRole !== 'admin') return;
      if (content.includes('[Binary Data')) return; // לא ניתן לערוך קבצים בינאריים
      setEditingFile(name);
      setFileContent(content);
    }
  };

  const navigateUp = (index) => {
    setCurrentPath(currentPath.slice(0, index + 1));
    setEditingFile(null);
  };

  const handleSave = () => {
    // בחיים האמיתיים זה ישלח בקשה לשרת כדי לעדכן את הקובץ
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 3000);
  };

  const currentFolder = getCurrentFolder();

  return (
    <div className="h-full flex flex-col animate-in fade-in">
      {/* Breadcrumb Navigation (שורת הניווט למעלה) */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-3 flex items-center gap-2 mb-4 overflow-x-auto text-sm font-bold">
        <button onClick={() => navigateUp(-1)} className="text-zinc-400 hover:text-white transition-colors flex items-center gap-1">
          <HardDrive size={16}/> Root
        </button>
        {currentPath.map((folder, idx) => (
          <React.Fragment key={idx}>
            <span className="text-zinc-600">/</span>
            <button onClick={() => navigateUp(idx)} className="text-zinc-400 hover:text-white transition-colors">
              {folder}
            </button>
          </React.Fragment>
        ))}
        {editingFile && (
          <>
            <span className="text-zinc-600">/</span>
            <span className="text-green-400 flex items-center gap-1"><FileCode size={16}/> {editingFile}</span>
          </>
        )}
      </div>

      {/* אזור עריכת קובץ */}
      {editingFile ? (
        <div className="flex-1 flex flex-col bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden relative">
          <div className="bg-zinc-900 border-b border-zinc-800 p-3 flex justify-between items-center">
            <span className="font-mono text-sm text-zinc-300">{editingFile}</span>
            <div className="flex items-center gap-3">
              {savedMsg && <span className="text-green-400 text-xs font-bold animate-pulse">{t('fileSaved')}</span>}
              <button onClick={handleSave} className="bg-green-600 hover:bg-green-500 text-white px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors">
                <Save size={14}/> {t('saveFile')}
              </button>
              <button onClick={() => setEditingFile(null)} className="text-zinc-400 hover:text-red-400 p-1 transition-colors">
                <X size={18}/>
              </button>
            </div>
          </div>
          <textarea 
            value={fileContent} 
            onChange={(e) => setFileContent(e.target.value)}
            className="flex-1 w-full bg-black text-zinc-300 font-mono text-sm p-4 outline-none resize-none leading-relaxed"
            dir="ltr"
            spellCheck="false"
          />
        </div>
      ) : (
        /* אזור תצוגת תיקיות וקבצים */
        <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl overflow-y-auto">
          {Object.entries(currentFolder).map(([name, content]) => {
            const isFolder = typeof content === 'object';
            const isEditable = !isFolder && !content.includes('[Binary Data');
            return (
              <div 
                key={name} 
                onClick={() => handleOpen(name, content)}
                className={`flex items-center justify-between p-4 border-b border-zinc-900/50 hover:bg-zinc-900 transition-colors group
                  ${isFolder || isEditable ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                dir="ltr"
              >
                <div className="flex items-center gap-3">
                  {isFolder ? <Folder size={20} className="text-blue-400 fill-blue-400/20"/> : 
                   name.endsWith('.yml') || name.endsWith('.properties') ? <FileCode size={20} className="text-orange-400"/> : 
                   <FileText size={20} className="text-zinc-500"/>}
                  <span className="font-medium text-zinc-200">{name}</span>
                </div>
                {isEditable && userRole === 'admin' && (
                   <Edit3 size={16} className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"/>
                )}
              </div>
            );
          })}
          {Object.keys(currentFolder).length === 0 && (
            <div className="p-8 text-center text-zinc-600">תיקייה ריקה</div>
          )}
        </div>
      )}
    </div>
  );
}

function SettingsTab({ server, onDelete, updateServer, t, mcVersions }) {
  return (
    <div className="space-y-8 animate-in fade-in max-w-2xl">
      <div>
        <h3 className="text-xl font-bold mb-4 border-b border-zinc-800 pb-2">{t('basicSettings')}</h3>
        <div className="flex flex-col sm:flex-row gap-6 mb-6">
           <div className="flex-shrink-0">
             <label className="block text-sm text-zinc-400 mb-2 text-center">{t('serverIcon')}</label>
             <ImageUploader 
               iconUrl={server.icon} 
               setIconUrl={(newUrl) => updateServer({ icon: newUrl })} 
               t={t} size="sm" 
             />
           </div>
           <div className="flex-1">
              <label className="block text-sm text-zinc-400 mb-1">{t('serverName')}</label>
              <input type="text" value={server.name} onChange={(e) => updateServer({ name: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600" />
           </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-zinc-400 mb-1">{t('version')}</label>
              <select value={server.version} onChange={(e) => updateServer({ version: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600">
                {mcVersions.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">{t('maxPlayers')}</label>
              <input type="number" value={server.maxPlayers} onChange={(e) => updateServer({ maxPlayers: parseInt(e.target.value) || 20 })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600" />
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">{t('gamemode')}</label>
              <select value={server.gamemode} onChange={(e) => updateServer({ gamemode: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600">
                <option value="survival">{t('survival')}</option>
                <option value="creative">{t('creative')}</option>
                <option value="adventure">{t('adventure')}</option>
                <option value="spectator">{t('spectator')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-zinc-400 mb-1">{t('worldType')}</label>
              <select value={server.worldType} onChange={(e) => updateServer({ worldType: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600">
                <option value="default">{t('worldDefault')}</option>
                <option value="flat">{t('worldFlat')}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1">{t('opPlayers')}</label>
            <input type="text" placeholder={t('opPlayersDesc')} value={server.ops?.join(', ') || ''} onChange={(e) => updateServer({ ops: e.target.value.split(',').map(o=>o.trim()).filter(Boolean) })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600 text-sm" />
          </div>
          <div>
            <label className="block text-sm text-zinc-400 mb-1 flex items-center gap-1"><img src="https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0a6a49cf127bf92de1e2_icon_clyde_blurple_RGB.png" className="w-4 h-3 object-contain"/> {t('discordWebhook')}</label>
            <input type="text" placeholder="https://discord.com/api/webhooks/..." value={server.discordWebhook || ''} onChange={(e) => updateServer({ discordWebhook: e.target.value })} className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-white outline-none focus:border-zinc-600 text-sm" />
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