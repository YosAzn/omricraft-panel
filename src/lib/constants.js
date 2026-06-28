// --- Shared constants ---

// installMethod — איך התוסף מותקן:
//   'server' (ברירת מחדל) — מותקן בשרת ה-VPS דרך Cloud Function (installPlugin / installDatapack).
//   'manual' — אין URL מתארח (vanilla-tweaks וכו') → המשתמש מוריד ידנית, לא נוגעים ב-VPS.
//   'client' — resource/texture pack שמותקן אצל השחקן בלקוח, לא בשרת.
// addon ללא השדה הזה נחשב 'server'.
export const getInstallMethod = (addon) => addon?.installMethod || 'server';

export const TYPE_COLORS = {
  mods: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  plugins: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  datapacks: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  modpacks: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  textures: 'bg-teal-500/10 text-teal-400 border-teal-500/20'
};

export const SOFTWARE_TYPES = [
  { id: 'vanilla',   name: 'Vanilla',   type: 'official', desc: 'שרת Mojang רשמי — קשה, נקי' },
  { id: 'paper',     name: 'Paper',     type: 'plugins',  desc: 'הכי נפוץ — ביצועים + plugins' },
  { id: 'purpur',    name: 'Purpur',    type: 'plugins',  desc: 'Paper משופר — תומך plugins, מהיר + עוד הגדרות. מומלץ!' },
  { id: 'folia',     name: 'Folia',     type: 'plugins',  desc: 'Paper עם multi-threading לשרתים גדולים' },
  { id: 'fabric',    name: 'Fabric',    type: 'mods',     desc: 'Mods קלים — עדכניים' },
  { id: 'forge',     name: 'Forge',     type: 'mods',     desc: 'Mods קלאסיים — ספריית ה-mods הגדולה' },
  { id: 'neoforge',  name: 'NeoForge',  type: 'mods',     desc: 'Forge המודרני — מתחזק יותר' },
  { id: 'mohist',    name: 'Mohist',    type: 'hybrid',   desc: 'Forge + Bukkit plugins יחד' },
];

// Per-type version allow-list. When a software type can only run a subset of MC
// versions, list them here; the create form (and SettingsTab) intersect the global
// version list with this. Mohist only publishes builds for 1.20.1 (no 1.21.x), so
// offering 1.21.x would create a server whose jar download always fails.
// Types NOT listed here are unrestricted (use the full versionMatrix/mcVersions list).
export const TYPE_VERSION_LIMITS = {
  mohist: ['1.20.1'],
};

// Returns the version list for a software type, applying TYPE_VERSION_LIMITS if any.
// `baseList` is the per-type list already resolved (versionMatrix[type] || mcVersions).
export const limitVersionsForType = (type, baseList) => {
  const allow = TYPE_VERSION_LIMITS[type];
  if (!allow) return baseList;
  const filtered = baseList.filter(v => allow.includes(v));
  // If none of the allowed versions are in the live list, fall back to the static
  // allow-list itself so the type is never left with an empty selector.
  return filtered.length ? filtered : allow;
};

export const DEFAULT_ADDONS = [
  // --- Mods (Fabric/Forge/NeoForge) ---
  // installMethod:'client' — Sodium/Iris/Litematica are client-side mods (rendering /
  // shaders / schematics); installing them on the server is useless, so they get a
  // client-side badge like textures (no server install, no false "installed").
  // Server-installable mods carry a modrinthSlug; install-mod.sh resolves the correct
  // build for the server's loader+version via the Modrinth API (fail-loud if none).
  { id: 'm1', name: 'Sodium', desc: 'משפר ביצועים ו-FPS בטירוף', type: 'mods', installMethod: 'client', downloads: '24M', rating: 4.9, reviews: 15400 },
  { id: 'm2', name: 'Iris Shaders', desc: 'תמיכה בשיידרים מהממים', type: 'mods', installMethod: 'client', requires: ['m1'], downloads: '15M', rating: 4.8, reviews: 11200 },
  { id: 'm3', name: 'Create', desc: 'מוד טכנולוגיה, גלגלי שיניים, אוטומציה ורכבות (Forge/NeoForge בלבד)', type: 'mods', modrinthSlug: 'create', downloads: '40M', rating: 4.9, reviews: 30000 },
  { id: 'm4', name: 'Litematica', desc: 'מאפשר להציג סכמות ושרטוטים תלת ממדיים', type: 'mods', installMethod: 'client', downloads: '12M', rating: 4.7, reviews: 8500 },
  { id: 'm5', name: 'Distant Horizons', desc: 'מגדיל את טווח הראייה משמעותית בלי להעמיס על המחשב', type: 'mods', modrinthSlug: 'distanthorizons', downloads: '8M', rating: 4.6, reviews: 4200 },
  { id: 'm6', name: 'Simple Voice Chat', desc: 'צ\'אט קולי מובנה במשחק לפי מרחק שחקנים (Proximity Chat)', type: 'mods', modrinthSlug: 'simple-voice-chat', downloads: '25M', rating: 4.8, reviews: 16000 },
  { id: 'm7', name: 'Just Enough Items (JEI)', desc: 'מציג את כל הפריטים והמתכונים במשחק', type: 'mods', modrinthSlug: 'jei', downloads: '150M', rating: 4.9, reviews: 90000 },

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
  { id: 'p20', name: 'AuctionHouse', desc: 'שוק עולמי שבו שחקנים מוכרים וקונים פריטים אחד מהשני (מערכת כלכלה) (דורש Vault + פלאגין כלכלה)', type: 'plugins', requires: ['p5'], downloads: '9M', rating: 4.8, reviews: 11000 },
  { id: 'p21', name: 'MythicMobs', desc: 'מאפשר ליצור בוסים ומפלצות מותאמים אישית עם כוחות מיוחדים (כמו בנייטפול)', type: 'plugins', downloads: '7M', rating: 4.9, reviews: 16000, paid: true, buyUrl: 'https://mythiccraft.io/index.php?resources/mythicmobs.1/' },
  { id: 'p22', name: 'BetterRTP', desc: 'מאפשר לשחקנים להשתגר בבטחה למקום רנדומלי בעולם הפתוח כדי לבנות', type: 'plugins', downloads: '11M', rating: 4.7, reviews: 12500 },

  // --- ניהול ביצועים וכישופים (סגנון נייטפול) ---
  { id: 'p23', name: 'Spark', desc: 'חובה לשרתים מרובי פלאגינים - מנתח ביצועים שמאבחן בדיוק איזה פלאגין גורם ללאגים', type: 'plugins', downloads: '14M', rating: 4.9, reviews: 22000 },
  { id: 'p24', name: 'PlugManX', desc: 'מאפשר להפעיל, לכבות ולרענן פלאגינים ספציפיים מתוך המשחק בלי לעשות ריסטארט לשרת', type: 'plugins', downloads: '3M', rating: 4.8, reviews: 5400 },
  { id: 'p25', name: 'ExcellentEnchants', desc: 'מוסיף עשרות כישופים חדשים ומיוחדים (כמו Refill/Replenish, Telekinesis, ריחוף ועוד)', type: 'plugins', downloads: '2.5M', rating: 4.8, reviews: 3900 },
  { id: 'p26', name: 'AdvancedShulkerboxes', desc: 'פותח שאלקרים מהיד, שואב אליהם חפצים אוטומטית ומוסיף יכולות מתקדמות (Refill)', type: 'plugins', downloads: '1.8M', rating: 4.7, reviews: 2100 },

  // --- תוספות RPG, חיות רכיבה ואנטי-צ'יט (חדש) ---
  { id: 'p27', name: 'MythicMounts', desc: 'חיות רכיבה מיוחדות! מאפשר לרכוב על אפיגאסט (Epigast), לשים לו הארנס (רתמה) עם כישוף Soul Speed שככל שרמתו גבוהה יותר, החיה טסה מהר יותר! (דורש MythicMobs)', type: 'plugins', requires: ['p21'], downloads: '1.5M', rating: 4.8, reviews: 4200, paid: true, buyUrl: 'https://mythiccraft.io/index.php?resources/' },
  { id: 'p28', name: 'ItemsAdder', desc: 'הוספת אלפי חפצים, נשקים, רהיטים ובלוקים חדשים לשרת (כולל טקסטורות) בלי שאף שחקן יצטרך להוריד מודים (דורש ProtocolLib)', type: 'plugins', downloads: '4.5M', rating: 4.9, reviews: 18000, paid: true, buyUrl: 'https://itemsadder.devs.beer/' },
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
  // installMethod: 'server' = מותקן בשרת דרך installDatapack endpoint. 'manual' = אין URL מתארח → הורדה ידנית.
  { id: 'd1', name: 'Vanilla Tweaks', desc: 'אוסף שיפורים קטנים ונוחים למשחק הרגיל', type: 'datapacks', installMethod: 'manual', downloads: '2M', rating: 4.8, reviews: 3200 },
  { id: 'd2', name: 'Terralith', desc: 'משנה לחלוטין את יצירת העולם, ביומות והרים ללא בלוקים חדשים', type: 'datapacks', installMethod: 'server', modrinthSlug: 'terralith', worldgenOverhaul: true, downloads: '4M', rating: 4.7, reviews: 5100 },
  { id: 'd4', name: 'Multiplayer Sleep', desc: 'מספיק שחקן אחד במיטה כדי להעביר את הלילה', type: 'datapacks', installMethod: 'server', modrinthSlug: 'serversleep', downloads: '3M', rating: 4.9, reviews: 4500 },
  { id: 'd6', name: 'Mini Blocks', desc: 'מאפשר להשיג גרסאות מיניאטוריות של בלוקים כראשים', type: 'datapacks', installMethod: 'server', modrinthSlug: 'mini-blocks-datapack', downloads: '1.5M', rating: 4.6, reviews: 1200 },
  { id: 'd7', name: 'Wandering Trades', desc: 'משפר את החפצים שמוכר הסוחר הנודד ומציע בלוקים מיניאטוריים', type: 'datapacks', installMethod: 'server', modrinthSlug: 'better-wanderingtraders', downloads: '1.2M', rating: 4.5, reviews: 900 },
  { id: 'd8', name: 'Nether Portal Coords', desc: 'מסייע בחישוב מדויק של מיקומי פורטלים בנדר', type: 'datapacks', installMethod: 'manual', downloads: '800K', rating: 4.7, reviews: 600 },
  { id: 'd9', name: 'Coordinates HUD', desc: 'מציג קואורדינטות וזמן בצורה נוחה מעל ה-Hotbar', type: 'datapacks', installMethod: 'server', modrinthSlug: 'hotbarcoordinates', downloads: '2.5M', rating: 4.8, reviews: 2200 },
  { id: 'd10', name: 'Player Head Drops', desc: 'שחקנים מפילים את הראש שלהם כשהם מתים מחיצים או שחקנים', type: 'datapacks', installMethod: 'server', modrinthSlug: 'player-drops-head', downloads: '2.1M', rating: 4.6, reviews: 1700 },
  { id: 'd11', name: 'More Mob Heads', desc: 'כל המובים במשחק יכולים להפיל את הראש שלהם למטרות קישוט', type: 'datapacks', installMethod: 'server', modrinthSlug: 'mob-heads', downloads: '2.8M', rating: 4.7, reviews: 2500 },
  
  // --- Modpacks ---
  // installMethod: 'manual' — modpacks are multi-file (mods+configs); the single-jar
  // installer can't deploy them. Shown with a manual badge so the UI never promises a
  // server install that loud-fails. A real mrpack/zip unpacker is a post-launch feature.
  { id: 'mp1', name: 'Better MC', desc: 'המיינקראפט כמו שהוא היה צריך להיות - מאות ביומות ומובים', type: 'modpacks', installMethod: 'manual', downloads: '7M', rating: 4.6, reviews: 12000 },
  { id: 'mp2', name: 'Vault Hunters', desc: 'מודפאק אקשן ו-RPG מדהים בתוך מבוכים מסוכנים', type: 'modpacks', installMethod: 'manual', downloads: '3M', rating: 4.8, reviews: 7500 },
  
  // --- Textures ---
  // installMethod: 'client' = resource/texture packs מותקנים בצד-הלקוח (אצל השחקן), לא בשרת. אין URL מתארח כרגע.
  { id: 't1', name: 'Custom Hats Pack', desc: 'מוסיף כתרים, כובעי קסם ופריטים שניתן לשים על הראש לטובת מראה ייחודי (בדומה לנייטפול)', type: 'textures', installMethod: 'server', modrinthSlug: 'elibruhs-custom-hats-pack', downloads: '1.2M', rating: 4.8, reviews: 4500 },
  { id: 't2', name: 'Golden Pumpkin Pie', desc: 'מודל תלת-ממדי מיוחד שהופך את פשטידת הדלעת הרגילה לפשטידת זהב נוצצת', type: 'textures', installMethod: 'client', downloads: '800K', rating: 4.6, reviews: 2100 },
  { id: 't3', name: 'Fresh Animations', desc: 'אנימציות תנועה מציאותיות, חלקות ומצחיקות לכל המפלצות והחיות במשחק (דורש בצד-הלקוח את המודים ETF + EMF, או OptiFine, כדי שהאנימציות יפעלו)', type: 'textures', installMethod: 'server', modrinthSlug: 'fresh-animations', downloads: '15M', rating: 4.9, reviews: 45000 },
  { id: 't4', name: 'Faithful 32x', desc: 'הטקסטורה הקלאסית והמוכרת של מיינקראפט ברזולוציה כפולה וחדה הרבה יותר', type: 'textures', installMethod: 'server', modrinthSlug: 'faithful-32x', downloads: '50M', rating: 4.8, reviews: 120000 },
  { id: 't5', name: 'Bare Bones', desc: 'טקסטורה חלקה ונקייה שגורמת למשחק להיראות כמו הטריילרים הרשמיים של מיינקראפט', type: 'textures', installMethod: 'server', modrinthSlug: 'bare-bones', downloads: '22M', rating: 4.9, reviews: 60000 },
  { id: 't6', name: 'Visible Ores', desc: 'גורם למחצבים (יהלומים, ברזל) לזהור בחושך, מושלם למערות עמוקות', type: 'textures', installMethod: 'server', modrinthSlug: 'visible-ores', downloads: '9.5M', rating: 4.8, reviews: 25000 },
  { id: 't7', name: 'Dark UI', desc: 'משנה את כל התפריטים במשחק לעיצוב כהה ונוח לעיניים (Dark Mode)', type: 'textures', installMethod: 'server', modrinthSlug: 'mandalas-gui-dark-mode', downloads: '18M', rating: 4.9, reviews: 41000 },
  { id: 't8', name: 'Shulker Box Tooltip', desc: 'מאפשר לראות את כל התכולה של השאלקרים ברחרוף עם העכבר בתוך התיק, בלי להניח אותם', type: 'textures', installMethod: 'client', downloads: '35M', rating: 4.9, reviews: 85000 },
];
