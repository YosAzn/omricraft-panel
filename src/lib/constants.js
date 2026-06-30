// --- Shared constants ---

// installMethod — איך התוסף מותקן:
//   'server' (ברירת מחדל) — מותקן בשרת ה-VPS דרך Cloud Function (installPlugin / installDatapack).
//   'manual' — אין URL מתארח (vanilla-tweaks וכו') → המשתמש מוריד ידנית, לא נוגעים ב-VPS.
//   'client' — resource/texture pack שמותקן אצל השחקן בלקוח, לא בשרת.
// addon ללא השדה הזה נחשב 'server'.
export const getInstallMethod = (addon) => addon?.installMethod || 'server';

// Bukkit-based server software (Paper family + Mohist/Youer NeoForge hybrids + legacy
// spigot). Youer is Mohist's maintained successor and implements the same Paper/Bukkit
// API, so it behaves identically here. Worldgen-overhaul datapacks
// (Terralith/Tectonic/Incendium/Nullscape) do NOT work on these — Bukkit ignores
// datapack worldgen biomes. They need a Mojang-engine loader (Vanilla/Fabric/Forge/NeoForge).
export const BUKKIT_SOFTWARE = ['paper', 'purpur', 'folia', 'mohist', 'youer', 'spigot', 'bukkit'];
export const isBukkitBased = (software) => BUKKIT_SOFTWARE.includes(software);

// A worldgen-overhaul datapack (replaces overworld/nether/end generation). Flagged
// in the catalog as worldgenOverhaul or worldgen. Used to grey these out on Bukkit.
export const isWorldgenDatapack = (addon) =>
  !!(addon && addon.type === 'datapacks' && (addon.worldgenOverhaul || addon.worldgen));

// --- Per-addon CORE compatibility (loader-family gating) ---
// Some addons only have a build for a specific loader family and would loud-fail
// (or be silently ignored) on the wrong core. `compatibleCores` is an explicit
// allow-list of software ids; an addon WITHOUT the field is unrestricted.
//   • Fabric-family (Sodium / C2ME): only the Fabric loader has these builds.
//   • Create: ships only Forge/NeoForge builds (no Fabric port in this catalog).
// This is a UX hint shown in the picker (grey-out + note); the VPS already resolves
// the correct build per core, so it never installs an incompatible jar regardless.
export const FABRIC_FAMILY_CORES = ['fabric'];
export const FORGE_FAMILY_CORES = ['forge', 'neoforge'];

// True when `software` is NOT in the addon's compatibleCores allow-list (so the
// picker should grey it out). No allow-list → always compatible.
export const isCoreIncompatible = (addon, software) =>
  !!(addon && Array.isArray(addon.compatibleCores) && software && !addon.compatibleCores.includes(software));

// --- Phase 5d — plugin-bound resource packs are plugin-capable-core only ---
// A pluginBound:true resource pack (Custom Hats Pack) only WORKS when its backing
// plugin (ItemsAdder/Oraxen-style) can run — i.e. on the Bukkit/plugin family. On
// Vanilla (no plugins at all) and pure-mod loaders (Fabric/Forge/NeoForge, which use
// mods not these plugins) the items can never be injected, so the pack is meaningless
// → grey it out + block selection. Mohist/Youer (Bukkit hybrids) run plugins → allowed.
export const isPluginBoundBlocked = (addon, software) =>
  !!(addon && addon.pluginBound && software && !isBukkitBased(software));

// --- Modpack exact loader + MC-version gating ---
// A modpack ships ONE fixed build for ONE loader on ONE exact MC version (verified
// per pack in the catalog: e.g. Better MC = Forge 1.20.1, Vault Hunters = Forge 1.18.2,
// Cobblemon = Fabric 1.20.1, Pixelmon = NeoForge 1.21.1, Fabulously Optimized = Fabric
// 1.21.11). It runs ONLY when the server's core (`software`) AND version BOTH match its
// declared loader + mcVersion. PURE exact-match — a Forge 1.20.1 modpack is compatible
// only with a Forge server on 1.20.1. Hybrids (mohist/youer) are intentionally treated as
// incompatible: a full modpack on a Bukkit-hybrid is unstable, so we gate it out by design
// (the hybrid's software id never equals 'forge'/'fabric'/'neoforge', so the loader check
// already excludes it). A modpack missing `loader`/`mcVersion` is unrestricted on that
// dimension (the check only fires for a field that exists) — but every catalog modpack
// carries both, so in practice the gate is always exact.
export const isModpackIncompatible = (addon, software, version) =>
  !!(addon && addon.type === 'modpacks' && (
    (addon.loader && software && addon.loader !== software) ||
    (addon.mcVersion && version && addon.mcVersion !== version)
  ));

// Human-readable "<Loader> <MC version>" requirement label for a modpack's gate note
// (e.g. "Forge 1.20.1"). Uses the SOFTWARE_TYPES display name for the loader id.
export const modpackRequirementLabel = (addon) => {
  if (!addon || addon.type !== 'modpacks') return '';
  const loaderName = addon.loader
    ? ((SOFTWARE_TYPES.find(s => s.id === addon.loader)?.name) || addon.loader)
    : '';
  return [loaderName, addon.mcVersion].filter(Boolean).join(' ');
};

// --- Phase 6b — cross-family equivalent suggestions ---
// When a server's TYPE is switched, leftover .jar files from the OLD core (plugins/
// on a mod core, mods/ on a plugin core) are flagged by the חמ"ל / diagnostics and
// can be ARCHIVED. For the well-known overlaps we additionally hint at an equivalent
// add-on that DOES work on the new core, so the owner can re-install it from the
// catalog (a normal catalog action — we never auto-install, especially anything
// paid/unknown). Keyed by a lowercased substring of the leftover filename; unknown
// files simply have no equivalent (archive-only). Both directions are covered
// (plugin→mod equivalent AND mod→plugin where one exists).
export const PLUGIN_MOD_EQUIVALENTS = {
  // plugin (Bukkit) → equivalent that works on the mod loaders
  'essentialsx': 'FTB Essentials',
  'essentials': 'FTB Essentials',
  'griefprevention': 'FTB Chunks',
  'luckperms': 'LuckPerms (Forge/Fabric build)',
  'worldedit': 'WorldEdit (works on both)',
  // mod → equivalent plugin (reverse direction, where one sensibly exists)
  'ftbessentials': 'EssentialsX',
  'ftbchunks': 'GriefPrevention',
};

// Look up a cross-family equivalent for a leftover .jar filename. Matches by the
// FIRST map key that appears as a (lowercased, non-alphanumeric-stripped) substring
// of the filename. Returns the equivalent add-on name, or null if none is known.
export const equivalentForFile = (fileName) => {
  const norm = String(fileName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!norm) return null;
  for (const [key, equiv] of Object.entries(PLUGIN_MOD_EQUIVALENTS)) {
    if (norm.includes(key)) return equiv;
  }
  return null;
};

// Human-readable list of the cores an addon supports (for the "works on X only" note).
export const compatibleCoresLabel = (addon) => {
  const cores = (addon && Array.isArray(addon.compatibleCores)) ? addon.compatibleCores : [];
  const names = cores.map(id => (SOFTWARE_TYPES.find(s => s.id === id)?.name) || id);
  return names.join(' / ');
};

// Resolve a list of required-addon ids (addon.requires) to their catalog objects.
// Unknown ids are dropped (a dep that isn't in the catalog simply isn't listed).
export const resolveRequires = (addon, allAddons) =>
  ((addon && Array.isArray(addon.requires)) ? addon.requires : [])
    .map(id => allAddons.find(a => a.id === id))
    .filter(Boolean);

// Recursively collect every required-addon id for a set of selected ids (handles
// transitive deps, e.g. A requires B requires C). Returns a flat de-duped array
// that does NOT include the seed ids. Cycle-safe via a visited set.
export const collectRequiredIds = (seedIds, allAddons) => {
  const byId = new Map(allAddons.map(a => [a.id, a]));
  const out = new Set();
  const visit = (id) => {
    const addon = byId.get(id);
    const reqs = (addon && Array.isArray(addon.requires)) ? addon.requires : [];
    for (const r of reqs) {
      if (!byId.has(r)) continue; // unknown dep id — skip (resolveRequires drops it too)
      if (!out.has(r)) { out.add(r); visit(r); }
    }
  };
  (seedIds || []).forEach(visit);
  return [...out];
};

// Full literal Tailwind class strings per addon type (so the JIT compiler keeps
// them in the build — never build these from a variable). `shaders` (gray) and
// `client-mods` (yellow) are CLIENT-ONLY groups: their addons carry
// installMethod:'client', so they never reach the VPS installer.
export const TYPE_COLORS = {
  mods: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  plugins: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  datapacks: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  modpacks: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  textures: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  shaders: 'bg-zinc-500/10 text-zinc-300 border-zinc-500/30',
  'client-mods': 'bg-amber-500/10 text-amber-400 border-amber-500/20'
};

// Ordered list of every addon group, used to render filter tabs / pickers
// everywhere consistently. Keep in sync with TYPE_COLORS + i18n labels.
export const ADDON_TYPES = ['mods', 'plugins', 'datapacks', 'modpacks', 'textures', 'shaders', 'client-mods'];

// Client-only groups — never installed on the server (player-PC only). Used by
// the UI to render them as their own group without a server "install" button.
export const CLIENT_ONLY_TYPES = ['shaders', 'client-mods'];
export const isClientOnlyType = (type) => CLIENT_ONLY_TYPES.includes(type);

// --- Resource-pack (textures) install CHOICE ---
// A server-applied resource pack (installMethod:'server') is just a .zip — the SAME
// file works as a plain PC download. So for normal packs we offer BOTH:
//   (a) server-resource-pack (auto-push to every player via server.properties), or
//   (b) download to the player's PC.
// EXCEPTION (`pluginBound:true`): packs whose items only exist via a plugin
// (ItemsAdder/Oraxen-style — Custom Hats etc.). A bare resource pack can't add the
// items, so a plain PC download is meaningless → server-only, hide the PC option.
export const isServerAppliedRP = (addon) =>
  !!(addon && addon.type === 'textures' && getInstallMethod(addon) === 'server');
// Can this server-applied RP also be downloaded to the player's PC? No when it's
// plugin-bound (the items need the plugin to be injected server-side).
export const canPcDownloadRP = (addon) =>
  isServerAppliedRP(addon) && !addon.pluginBound;

// --- Modpack player-side install (mod-loader + one-click deep-links) ---
// CurseForge / Modrinth desktop apps register custom URI protocols, so a single
// link opens the app and starts the modpack install. We render whichever ids exist
// on the modpack entry (slug for Modrinth, numeric addonId for CurseForge) and fall
// back to the official page + "get the app" links when an id is missing.
export const modrinthModpackUri = (slug) =>
  slug ? `modrinth://modpack/${slug}` : null;
export const curseforgeInstallUri = (id) =>
  id ? `curseforge://install?addonId=${id}` : null;

// `recommendedRamMb` — the RAM the create form pre-selects (and labels "recommended")
// for this core. Vanilla/Paper-family run lean (~2GB); Fabric a bit more (~3GB);
// mod-loaders (Forge/NeoForge) + the Mohist hybrid are heavy (~6GB). Modpacks need
// even more (6-8GB+) — surfaced as a note, not a per-core value (modpacks are addons).
// `eol:true` flags an End-Of-Life / unmaintained core (Mohist) for a UX warning; it
// stays fully selectable — existing Mohist servers must keep working.
export const SOFTWARE_TYPES = [
  { id: 'vanilla',   name: 'Vanilla',   type: 'official', desc: 'שרת Mojang רשמי — קשה, נקי',                          recommendedRamMb: 2048 },
  { id: 'paper',     name: 'Paper',     type: 'plugins',  desc: 'הכי נפוץ — ביצועים + plugins',                        recommendedRamMb: 2048 },
  { id: 'purpur',    name: 'Purpur',    type: 'plugins',  desc: 'Paper משופר — תומך plugins, מהיר + עוד הגדרות. מומלץ!', recommendedRamMb: 2048 },
  { id: 'folia',     name: 'Folia',     type: 'plugins',  desc: 'Paper עם multi-threading לשרתים גדולים',              recommendedRamMb: 2048 },
  { id: 'fabric',    name: 'Fabric',    type: 'mods',     desc: 'Mods קלים — עדכניים',                                 recommendedRamMb: 3072 },
  { id: 'forge',     name: 'Forge',     type: 'mods',     desc: 'Mods קלאסיים — ספריית ה-mods הגדולה',                 recommendedRamMb: 6144 },
  { id: 'neoforge',  name: 'NeoForge',  type: 'mods',     desc: 'Forge המודרני — מתחזק יותר',                          recommendedRamMb: 6144 },
  { id: 'mohist',    name: 'Mohist',    type: 'hybrid',   desc: 'Forge + Bukkit plugins יחד',                         recommendedRamMb: 6144, eol: true },
  { id: 'youer',     name: 'Youer',     type: 'hybrid',   desc: 'שרת היברידי NeoForge (היורש המתוחזק של Mohist) — מריץ מודים + פלאגינים יחד', recommendedRamMb: 6144, eol: false },
];

// Recommended RAM (MB) for a core; falls back to 2GB for unknown ids.
export const getRecommendedRamMb = (software) =>
  (SOFTWARE_TYPES.find(s => s.id === software)?.recommendedRamMb) || 2048;

// --- Modpack RAM recommendation by WEIGHT + player count (Phase 5c) ---
// Rule-of-thumb from the guidance doc:
//   light  (≤50 mods)        → 4GB min (good for 1-5 players)
//   medium (50-150 mods)     → 6GB min; +2GB per extra 5 players beyond the first 5
//   heavy  (150-300+ mods)   → 8GB min even for 2 players; 10+ players → 12GB
// Returns the recommended RAM in MB. Unknown weight falls back to 'medium'. Used as a
// soft HINT in the create form (raises the pre-selected RAM + warns when the chosen
// value is below it) — never a hard block, and the user's manual RAM choice still wins.
export const recommendedRamForModpack = (weight, maxPlayers = 5) => {
  const players = Math.max(1, Number(maxPlayers) || 1);
  if (weight === 'light') {
    return 4096; // 4GB
  }
  if (weight === 'heavy') {
    return players >= 10 ? 12288 : 8192; // 12GB for 10+, else 8GB min
  }
  // medium (default): 6GB base + 2GB per extra 5 players beyond the first 5.
  const extraBlocks = Math.max(0, Math.ceil((players - 5) / 5));
  return 6144 + extraBlocks * 2048;
};

// The heaviest recommendation across all currently-selected modpack addons (in MB),
// or 0 when none are selected. `selectedAddons` is an array of addon ids; `allAddons`
// the full catalog; `maxPlayers` the chosen player cap. Drives the create-form RAM hint.
export const modpackRamRecommendationMb = (selectedAddons, allAddons, maxPlayers) => {
  const packs = (selectedAddons || [])
    .map(id => (allAddons || []).find(a => a.id === id))
    .filter(a => a && a.type === 'modpacks');
  if (packs.length === 0) return 0;
  return Math.max(...packs.map(p => recommendedRamForModpack(p.weight, maxPlayers)));
};

// True when the core is End-Of-Life / unmaintained (Mohist). Stays selectable.
export const isEolCore = (software) =>
  !!(SOFTWARE_TYPES.find(s => s.id === software)?.eol);

// --- Forge vs NeoForge recommendation by MC version ---
// NeoForge is the modern standard for MC 1.20.2 and newer; for older versions only
// classic Forge exists (NeoForge wasn't published before 1.20.2). Parse safely — the
// project's version scheme is `1.MINOR(.PATCH)?`; anything that isn't `1.x` (e.g. a
// future 26.x) is treated as newer than 1.20.2.
export const isNeoForgeEraVersion = (version) => {
  if (typeof version !== 'string') return false;
  const m = version.match(/^1\.(\d+)(?:\.(\d+))?$/);
  if (!m) return !version.startsWith('1.'); // non-1.x scheme → newer than 1.20.2
  const minor = parseInt(m[1], 10);
  const patch = parseInt(m[2] || '0', 10);
  if (minor < 20) return false;
  if (minor > 20) return true;
  return patch >= 2; // 1.20.x where x >= 2
};

// UX hint for the mod-loader picker given the chosen core + version. Returns:
//   'preferNeoForge' — user picked Forge on a 1.20.2+ version (soft "NeoForge is the
//                      modern standard" note; NOT a hard block).
//   'neoForgeUnavailable' — user picked NeoForge on a pre-1.20.2 version (use Forge).
//   null — no hint (non-mod core, or the choice already matches the era).
export const forgeNeoForgeHint = (software, version) => {
  if (software === 'forge' && isNeoForgeEraVersion(version)) return 'preferNeoForge';
  if (software === 'neoforge' && !isNeoForgeEraVersion(version)) return 'neoForgeUnavailable';
  return null;
};

// --- Client (player-side) loader requirements per server type ---
// The SERVER-side loader is auto-installed on the VPS. This map tells the PLAYER
// what THEY need on their own PC to JOIN the server — we can't touch their machine.
//   needsLoader:false → join with the normal vanilla client (plugins are server-side).
//   needsLoader:true  → install the matching loader for the server's MC version
//                       (the UI states the exact version the build must match).
//   conditional:true  → Mohist hybrid: Forge client only for Forge MODS; plain
//                       vanilla is enough for Bukkit PLUGINS.
// `label` is shown verbatim; `noteKey` resolves an i18n string for the longer note.
export const CLIENT_LOADERS = {
  vanilla:  { label: 'Vanilla',  installerUrl: null,                                  needsLoader: false, noteKey: 'clientReqVanilla' },
  paper:    { label: 'Vanilla',  installerUrl: null,                                  needsLoader: false, noteKey: 'clientReqVanilla' },
  purpur:   { label: 'Vanilla',  installerUrl: null,                                  needsLoader: false, noteKey: 'clientReqVanilla' },
  folia:    { label: 'Vanilla',  installerUrl: null,                                  needsLoader: false, noteKey: 'clientReqVanilla' },
  fabric:   { label: 'Fabric Loader (+ Fabric API)', installerUrl: 'https://fabricmc.net/use/installer/',  needsLoader: true,  noteKey: 'clientReqFabric' },
  forge:    { label: 'Forge',    installerUrl: 'https://files.minecraftforge.net/',   needsLoader: true,  noteKey: 'clientReqForge' },
  neoforge: { label: 'NeoForge', installerUrl: 'https://neoforged.net/',              needsLoader: true,  noteKey: 'clientReqNeoForge' },
  mohist:   { label: 'Forge',    installerUrl: 'https://files.minecraftforge.net/',   needsLoader: true,  conditional: true, noteKey: 'clientReqMohist' },
  youer:    { label: 'NeoForge', installerUrl: 'https://neoforged.net/',              needsLoader: true,  conditional: true, noteKey: 'clientReqYouer' },
};

// Returns the client-loader requirement for a software type (defaults to vanilla/no-loader).
export const getClientLoader = (software) =>
  CLIENT_LOADERS[software] || CLIENT_LOADERS.vanilla;

// Per-type version allow-list. When a software type can only run a subset of MC
// versions, list them here; the create form (and SettingsTab) intersect the global
// version list with this. Mohist only publishes builds for 1.20.1 (no 1.21.x), so
// offering 1.21.x would create a server whose jar download always fails. Youer (the
// maintained successor) publishes ONLY 1.21.1 (api.mohistmc.com/project/youer/versions),
// so it is gated to 1.21.1 for the same reason.
// Types NOT listed here are unrestricted (use the full versionMatrix/mcVersions list).
export const TYPE_VERSION_LIMITS = {
  mohist: ['1.20.1'],
  youer: ['1.21.1'],
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
  { id: 'm1', name: 'Sodium', desc: 'משפר ביצועים ו-FPS בטירוף', type: 'mods', installMethod: 'client', clientUrl: 'https://modrinth.com/mod/sodium', compatibleCores: ['fabric'], downloads: '24M', rating: 4.9, reviews: 15400 },
  { id: 'm2', name: 'Iris Shaders', desc: 'תמיכה בשיידרים מהממים', type: 'mods', installMethod: 'client', clientUrl: 'https://modrinth.com/mod/iris', requires: ['m1'], downloads: '15M', rating: 4.8, reviews: 11200 },
  { id: 'm3', name: 'Create', desc: 'מוד טכנולוגיה, גלגלי שיניים, אוטומציה ורכבות (Forge/NeoForge בלבד)', type: 'mods', modrinthSlug: 'create', compatibleCores: ['forge', 'neoforge'], downloads: '40M', rating: 4.9, reviews: 30000 },
  { id: 'm4', name: 'Litematica', desc: 'מאפשר להציג סכמות ושרטוטים תלת ממדיים', type: 'mods', installMethod: 'client', clientUrl: 'https://modrinth.com/mod/litematica', downloads: '12M', rating: 4.7, reviews: 8500 },
  { id: 'm5', name: 'Distant Horizons', desc: 'מגדיל את טווח הראייה משמעותית בלי להעמיס על המחשב', type: 'mods', modrinthSlug: 'distanthorizons', downloads: '8M', rating: 4.6, reviews: 4200 },
  { id: 'm6', name: 'Simple Voice Chat', desc: 'צ\'אט קולי מובנה במשחק לפי מרחק שחקנים (Proximity Chat)', type: 'mods', modrinthSlug: 'simple-voice-chat', downloads: '25M', rating: 4.8, reviews: 16000 },
  { id: 'm7', name: 'Just Enough Items (JEI)', desc: 'מציג את כל הפריטים והמתכונים במשחק', type: 'mods', modrinthSlug: 'jei', downloads: '150M', rating: 4.9, reviews: 90000 },
  // Server-side performance/utility mods — install-mod.sh resolves the build for the
  // server's loader+version; loaders that lack a build (e.g. Lithium has no Forge build,
  // C2ME is Fabric-only) fail loud + skip, never install an incompatible jar.
  { id: 'm8', name: 'Lithium', desc: 'מנוע אופטימיזציה לשרת - משפר ביצועי טיק, AI של מובים ופיזיקה בלי לשנות gameplay (Fabric/NeoForge/Quilt)', type: 'mods', modrinthSlug: 'lithium', downloads: '20M', rating: 4.9, reviews: 14000 },
  { id: 'm9', name: 'FerriteCore', desc: 'מצמצם דרמטית את צריכת הזיכרון (RAM) של השרת בלי שום השפעה על המשחק', type: 'mods', modrinthSlug: 'ferrite-core', downloads: '30M', rating: 4.9, reviews: 12000 },
  { id: 'm10', name: 'C2ME', desc: 'מאיץ טעינה ויצירת צ\'אנקים במקביל (multi-thread) - פחות לאגים כשחוקרים אזורים חדשים (Fabric בלבד)', type: 'mods', modrinthSlug: 'c2me-fabric', compatibleCores: ['fabric'], downloads: '8M', rating: 4.7, reviews: 4200 },
  { id: 'm11', name: 'No Chat Reports', desc: 'מסיר את מערכת דיווחי הצ\'אט של מוג\'אנג ומשפר פרטיות בשרת', type: 'mods', modrinthSlug: 'no-chat-reports', downloads: '10M', rating: 4.8, reviews: 9000 },
  // Client-side mods — installMethod:'client' (badge only, never reaches the VPS installer).
  { id: 'm12', name: 'Jade', desc: 'מציג מידע על הבלוק/המוב שמסתכלים עליו (שם, חיים, כלי נדרש) בראש המסך', type: 'mods', installMethod: 'client', clientUrl: 'https://modrinth.com/mod/jade', downloads: '40M', rating: 4.8, reviews: 13000 },
  { id: 'm13', name: 'Xaero\'s Minimap', desc: 'מפת מיני בפינת המסך עם סימון שחקנים, מובים ונקודות ציון - ניווט קל בעולם', type: 'mods', installMethod: 'client', clientUrl: 'https://modrinth.com/mod/xaeros-minimap', downloads: '30M', rating: 4.8, reviews: 11000 },
  // --- Client-side Mods (player-PC only) ---
  // type:'client-mods' — these run ONLY on the player's machine, NEVER on the server.
  // They keep installMethod:'client' so they are never sent to the VPS installer.
  // (Per the guidance doc: ETF/EMF/OptiFine are explicitly "Client-Side Mods".)
  { id: 'm14', name: 'Entity Texture Features (ETF)', desc: 'מפעיל את אנימציות הטקסטורות של Fresh Animations בצד-הלקוח (התחליף המודרני ל-OptiFine, יחד עם EMF)', type: 'client-mods', installMethod: 'client', clientUrl: 'https://modrinth.com/mod/entitytexturefeatures', requires: ['m15'], downloads: '20M', rating: 4.9, reviews: 8000 },
  { id: 'm15', name: 'Entity Model Features (EMF)', desc: 'משלים את ETF - מפעיל את שינויי המודל/האנימציה של Fresh Animations בצד-הלקוח', type: 'client-mods', installMethod: 'client', clientUrl: 'https://modrinth.com/mod/entity-model-features', requires: ['m14'], downloads: '12M', rating: 4.9, reviews: 5000 },
  // OptiFine — classic client-side alternative to ETF+EMF for shaders/animations. Not on Modrinth (own site), client-only.
  { id: 'm16', name: 'OptiFine', desc: 'שדרוג ביצועים ותאורה קלאסי בצד-הלקוח, עם תמיכה בשיידרים ובאנימציות מותאמות (התחליף הוותיק ל-ETF+EMF; מותקן אצל השחקן)', type: 'client-mods', installMethod: 'client', clientUrl: 'https://optifine.net/downloads', downloads: '100M', rating: 4.7, reviews: 50000 },

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
  { id: 'p18', name: 'Slimefun 4', desc: 'מוסיף מכונות, גנרטורים וקסמים בלי צורך במודים! חווית הישרדות מתקדמת (דורש Vault לכלכלה ולהרשאות של המכונות/חנויות)', type: 'plugins', requires: ['p5'], downloads: '6M', rating: 4.9, reviews: 21000 },
  { id: 'p19', name: 'Aurelium Skills', desc: 'מערכת סקילים ורמות RPG - לחימה, חציבה, פארקור ועוד הרבה', type: 'plugins', downloads: '4M', rating: 4.9, reviews: 8500 },
  { id: 'p20', name: 'AuctionHouse', desc: 'שוק עולמי שבו שחקנים מוכרים וקונים פריטים אחד מהשני (מערכת כלכלה) (דורש Vault + פלאגין כלכלה)', type: 'plugins', requires: ['p5'], downloads: '9M', rating: 4.8, reviews: 11000 },
  { id: 'p21', name: 'MythicMobs', desc: 'מאפשר ליצור בוסים ומפלצות מותאמים אישית עם כוחות מיוחדים (כמו בנייטפול)', type: 'plugins', downloads: '7M', rating: 4.9, reviews: 16000, paid: true, buyUrl: 'https://mythiccraft.io/index.php?resources/mythicmobs.1/' },
  { id: 'p22', name: 'BetterRTP', desc: 'מאפשר לשחקנים להשתגר בבטחה למקום רנדומלי בעולם הפתוח כדי לבנות', type: 'plugins', downloads: '11M', rating: 4.7, reviews: 12500 },

  // --- ניהול ביצועים וכישופים (סגנון נייטפול) ---
  { id: 'p23', name: 'Spark', desc: 'חובה לשרתים מרובי פלאגינים - מנתח ביצועים שמאבחן בדיוק איזה פלאגין גורם ללאגים', type: 'plugins', downloads: '14M', rating: 4.9, reviews: 22000 },
  { id: 'p24', name: 'PlugManX', desc: 'מאפשר להפעיל, לכבות ולרענן פלאגינים ספציפיים מתוך המשחק בלי לעשות ריסטארט לשרת', type: 'plugins', downloads: '3M', rating: 4.8, reviews: 5400 },
  { id: 'p25', name: 'ExcellentEnchants', desc: 'מוסיף עשרות כישופים חדשים ומיוחדים (כמו Refill/Replenish, Telekinesis, ריחוף ועוד) (דורש את ספריית NightCore — בלעדיה הפלאגין לא עולה)', type: 'plugins', requires: ['p36'], downloads: '2.5M', rating: 4.8, reviews: 3900 },
  { id: 'p26', name: 'AdvancedShulkerboxes', desc: 'פותח שאלקרים מהיד, שואב אליהם חפצים אוטומטית ומוסיף יכולות מתקדמות (Refill)', type: 'plugins', downloads: '1.8M', rating: 4.7, reviews: 2100 },

  // --- תוספות RPG, חיות רכיבה ואנטי-צ'יט (חדש) ---
  { id: 'p27', name: 'MythicMounts', desc: 'חיות רכיבה מיוחדות! מאפשר לרכוב על אפיגאסט (Epigast), לשים לו הארנס (רתמה) עם כישוף Soul Speed שככל שרמתו גבוהה יותר, החיה טסה מהר יותר! (דורש MythicMobs)', type: 'plugins', requires: ['p21'], downloads: '1.5M', rating: 4.8, reviews: 4200, paid: true, buyUrl: 'https://mythiccraft.io/index.php?resources/' },
  { id: 'p28', name: 'ItemsAdder', desc: 'הוספת אלפי חפצים, נשקים, רהיטים ובלוקים חדשים לשרת (כולל טקסטורות) בלי שאף שחקן יצטרך להוריד מודים (דורש ProtocolLib — אינו ב-Modrinth, התקנה ידנית מ-SpigotMC)', type: 'plugins', requires: ['p37'], downloads: '4.5M', rating: 4.9, reviews: 18000, paid: true, buyUrl: 'https://itemsadder.devs.beer/' },
  { id: 'p29', name: 'Grim AntiCheat', desc: 'מערכת האנטי-צ\'יט (נגד האקרים) המתקדמת בעולם כיום. חוסמת צ\'יטים מבלי לפגוע בשחקנים רגילים', type: 'plugins', downloads: '8M', rating: 4.9, reviews: 25000 },
  { id: 'p30', name: 'ViaVersion', desc: 'חובה! מאפשר לשחקנים מגרסאות מיינקראפט ישנות או חדשות יותר (מ-1.8 עד 1.26) להיכנס לשרת שלך בלי בעיות', type: 'plugins', downloads: '45M', rating: 4.9, reviews: 150000 },
  { id: 'p31', name: 'InteractiveChat', desc: 'משדרג את הצ\'אט: שחקנים יכולים לכתוב [item] או [inv] כדי להראות את הנשק או התיק שלהם לכולם בצ\'אט (דורש ProtocolLib (ידני, אינו ב-Modrinth) + PlaceholderAPI + Vault)', type: 'plugins', requires: ['p37', 'p14', 'p5'], downloads: '6M', rating: 4.8, reviews: 9200 },
  { id: 'p32', name: 'Chunky', desc: 'כלי חובה לשרתים פתוחים: טוען את כל העולם מראש! מונע לחלוטין את הלאגים שנוצרים כששחקנים חוקרים אזורים חדשים', type: 'plugins', downloads: '12M', rating: 4.9, reviews: 14000 },

  // --- כלים ועיצוב ---
  { id: 'p-axiom', name: 'Axiom', desc: 'כלי בנייה מתקדם לשחקני creative - בנייה מהירה, brushes, undo מלא', type: 'plugins', downloads: '1.2M', rating: 4.9, reviews: 3100 },
  { id: 'p-chatfmt', name: 'ChatFormatter', desc: 'פורמט צ\'אט מתקדם עם תגיות צבעוניות, emoji reactions, ופקודות מותאמות אישית', type: 'plugins', downloads: '800K', rating: 4.6, reviews: 1200 },

  // --- עיצוב וניהול עומסים (בקשת משתמש) ---
  { id: 'p33', name: 'TAB', desc: 'מעצב את רשימת השחקנים (Tablist) שמופיעה שלוחצים על TAB. מאפשר להוסיף צבעים, את הדרגה של השחקן, אנימציות, והודעות למעלה ולמטה (Header/Footer).', type: 'plugins', downloads: '10M', rating: 4.9, reviews: 18000 },
  { id: 'p34', name: 'InvisibleItemFrames', desc: 'מאפשר להפוך מסגרות של חפצים (Item Frames) לבלתי נראות. מעולה לעיצוב חדרים וחנויות בלי לראות את העץ של המסגרת!', type: 'plugins', downloads: '1.2M', rating: 4.8, reviews: 2100 },
  { id: 'p35', name: 'ClearLag', desc: 'פלאגין חובה לשרתים עמוסים: מנקה אוטומטית חפצים שזרוקים על הרצפה, מוחק מובים מיותרים שנתקעו, ומונע קריסות (Crash) כשיש עומס.', type: 'plugins', downloads: '22M', rating: 4.7, reviews: 35000 },

  // --- ספריות תלות (dependency libraries) ---
  // p36 NightCore — ספריית הליבה של מפתח ExcellentEnchants (p25); מותקנת אוטומטית מ-Modrinth.
  // p37 ProtocolLib — אינו ב-Modrinth (מופץ דרך SpigotMC) → installMethod:'manual', אין התקנה אוטומטית בשרת.
  { id: 'p36', name: 'NightCore', desc: 'ספריית ליבה הכרחית לפלאגינים של אותו מפתח (כמו ExcellentEnchants) — בלעדיה הם לא עולים', type: 'plugins', downloads: '2.5M', rating: 4.8, reviews: 3900 },
  { id: 'p37', name: 'ProtocolLib', desc: 'ספריית פאקטים הכרחית לפלאגינים כמו ItemsAdder ו-InteractiveChat (אינו ב-Modrinth — מופץ דרך SpigotMC, התקנה ידנית)', type: 'plugins', installMethod: 'manual', downloads: '50M', rating: 4.9, reviews: 60000 },

  // --- Datapacks ---
  // installMethod: 'server' = מותקן בשרת דרך installDatapack endpoint. 'manual' = אין URL מתארח → הורדה ידנית.
  { id: 'd1', name: 'Vanilla Tweaks', desc: 'אוסף שיפורים קטנים ונוחים למשחק הרגיל', type: 'datapacks', installMethod: 'manual', downloadUrl: 'https://vanillatweaks.net/picker/datapacks/', downloads: '2M', rating: 4.8, reviews: 3200 },
  { id: 'd2', name: 'Terralith', desc: 'משנה לחלוטין את יצירת העולם, ביומות והרים ללא בלוקים חדשים (datapack של worldgen — עובד רק על Vanilla/Fabric/Forge/NeoForge; שרתי Bukkit כמו Paper/Purpur/Folia מתעלמים מביומות worldgen של datapack, וצריך להחיל אותו על עולם חדש)', type: 'datapacks', installMethod: 'server', modrinthSlug: 'terralith', worldgenOverhaul: true, downloads: '4M', rating: 4.7, reviews: 5100 },
  { id: 'd4', name: 'Multiplayer Sleep', desc: 'מספיק שחקן אחד במיטה כדי להעביר את הלילה', type: 'datapacks', installMethod: 'server', modrinthSlug: 'serversleep', downloads: '3M', rating: 4.9, reviews: 4500 },
  { id: 'd6', name: 'Mini Blocks', desc: 'מאפשר להשיג גרסאות מיניאטוריות של בלוקים כראשים (datapack של function/loot — פועל על כל סוג שרת שתומך datapacks, כולל Paper)', type: 'datapacks', installMethod: 'server', modrinthSlug: 'mini-blocks-datapack', downloads: '1.5M', rating: 4.6, reviews: 1200 },
  { id: 'd7', name: 'Wandering Trades', desc: 'משפר את החפצים שמוכר הסוחר הנודד ומציע בלוקים מיניאטוריים', type: 'datapacks', installMethod: 'server', modrinthSlug: 'better-wanderingtraders', downloads: '1.2M', rating: 4.5, reviews: 900 },
  { id: 'd8', name: 'Nether Portal Coords', desc: 'מסייע בחישוב מדויק של מיקומי פורטלים בנדר', type: 'datapacks', installMethod: 'manual', downloadUrl: 'https://modrinth.com/datapack/nether-portal-coords', downloads: '800K', rating: 4.7, reviews: 600 },
  { id: 'd9', name: 'Coordinates HUD', desc: 'מציג קואורדינטות וזמן בצורה נוחה מעל ה-Hotbar', type: 'datapacks', installMethod: 'server', modrinthSlug: 'hotbarcoordinates', downloads: '2.5M', rating: 4.8, reviews: 2200 },
  { id: 'd10', name: 'Player Head Drops', desc: 'שחקנים מפילים את הראש שלהם כשהם מתים מחיצים או שחקנים', type: 'datapacks', installMethod: 'server', modrinthSlug: 'player-drops-head', downloads: '2.1M', rating: 4.6, reviews: 1700 },
  { id: 'd11', name: 'More Mob Heads', desc: 'כל המובים במשחק יכולים להפיל את הראש שלהם למטרות קישוט', type: 'datapacks', installMethod: 'server', modrinthSlug: 'mob-heads', downloads: '2.8M', rating: 4.7, reviews: 2500 },
  { id: 'd12', name: 'VeinMiner', desc: 'כורה את כל גוש העפרה/העץ בבת אחת בשבירה אחת - חוסך זמן חציבה אדיר', type: 'datapacks', installMethod: 'server', modrinthSlug: 'veinminer', downloads: '2M', rating: 4.8, reviews: 3000 },
  { id: 'd13', name: 'Tectonic', desc: 'שדרוג עולם דרמטי - הרים ענקיים, נהרות ועמקים עמוקים, בלי בלוקים חדשים (datapack של worldgen — עובד רק על Vanilla/Fabric/Forge/NeoForge; להחלה על עולם חדש)', type: 'datapacks', installMethod: 'server', modrinthSlug: 'tectonic', worldgenOverhaul: true, downloads: '1.5M', rating: 4.7, reviews: 2100 },
  { id: 'd14', name: 'Incendium', desc: 'שדרוג מלא לנדר (Nether) - ביומות, מבנים ובוסים חדשים מסוכנים (datapack של worldgen — עובד רק על Vanilla/Fabric/Forge/NeoForge; להחלה על עולם חדש)', type: 'datapacks', installMethod: 'server', modrinthSlug: 'incendium', worldgenOverhaul: true, downloads: '1.8M', rating: 4.8, reviews: 2400 },
  { id: 'd15', name: 'Nullscape', desc: 'הופך את העולם הסופי (End) לאזור אטמוספרי ומסתורי עם ביומות חדשות (datapack של worldgen — עובד רק על Vanilla/Fabric/Forge/NeoForge; להחלה על עולם חדש)', type: 'datapacks', installMethod: 'server', modrinthSlug: 'nullscape', worldgenOverhaul: true, downloads: '1.3M', rating: 4.7, reviews: 1600 },
  { id: 'd16', name: 'Explorify', desc: 'מוסיף עשרות מבנים ווניליים חדשים לחקירה בלי לשנות את תחושת המשחק', type: 'datapacks', installMethod: 'server', modrinthSlug: 'explorify', downloads: '2.2M', rating: 4.8, reviews: 2700 },
  { id: 'd17', name: 'Dungeons and Taverns', desc: 'מבוכים, פונדקים ומבנים חדשים מלאי שלל והרפתקאות בכל רחבי העולם', type: 'datapacks', installMethod: 'server', modrinthSlug: 'dungeons-and-taverns', downloads: '2.4M', rating: 4.9, reviews: 3100 },

  // --- Modpacks ---
  // installMethod: 'manual' — modpacks are multi-file (mods+configs); the single-jar
  // installer can't deploy them. Shown with a manual badge so the UI never promises a
  // server install that loud-fails. A real mrpack/zip unpacker is a post-launch feature.
  // loader = the mod-loader the PLAYER must install on their PC (+ exact MC version,
  // shown via ClientRequirements). curseforgeId / modrinthSlug drive the one-click
  // install deep-links (curseforge://install / modrinth://modpack); an unknown id is
  // omitted gracefully so only the working button(s) + official page render.
  // `weight` ('light'|'medium'|'heavy') drives the modpack RAM recommendation
  // (recommendedRamForModpack): light≤50 mods→4GB, medium 50-150→6GB (+2GB/5 players),
  // heavy 150-300+→8GB min (12GB for 10+ players). Big content packs (Better MC,
  // Vault Hunters, Prominence II) = heavy; Pokémon packs (Cobblemon/Cobbleverse/Pixelmon)
  // = medium; pure-optimization packs (Fabulously Optimized) = light.
  // mcVersion = the EXACT MC version the modpack targets (verified per pack from its
  // CurseForge/Modrinth page) — drives the player client-loader note and the
  // server-version-mismatch warning. The modpack's own version always wins over the
  // server's selected version (a modpack has one fixed MC target).
  // mp1 Better MC [FORGE] BMC4 — CF id 876781 (was a stale 543611), latest = 1.20.1 (Forge).
  { id: 'mp1', name: 'Better MC', desc: 'המיינקראפט כמו שהוא היה צריך להיות - מאות ביומות ומובים', type: 'modpacks', installMethod: 'manual', loader: 'forge', mcVersion: '1.20.1', curseforgeId: '876781', officialUrl: 'https://www.curseforge.com/minecraft/modpacks/better-mc-forge-bmc4', weight: 'heavy', downloads: '7M', rating: 4.6, reviews: 12000 },
  // mp2 Vault Hunters Third Edition — CF id 711537, MC 1.18.2 (Forge). CurseForge-only (not on Modrinth).
  { id: 'mp2', name: 'Vault Hunters', desc: 'מודפאק אקשן ו-RPG מדהים בתוך מבוכים מסוכנים', type: 'modpacks', installMethod: 'manual', loader: 'forge', mcVersion: '1.18.2', curseforgeId: '711537', officialUrl: 'https://www.curseforge.com/minecraft/modpacks/vault-hunters-1-18-2', weight: 'heavy', downloads: '3M', rating: 4.8, reviews: 7500 },
  // mp3..mp7 — modpacks אמיתיים שאומתו ב-Modrinth (project_type:modpack, 200).
  // downloadUrl = הדף הרשמי ב-Modrinth; ה-AddonsTab הופך את ה-badge הידני לקישור.
  // mp3 Cobblemon Official [Fabric] 1.5.2 → MC 1.20.1 (Modrinth featured version).
  { id: 'mp3', name: 'Cobblemon Official Modpack', desc: 'המודפאק הרשמי של Cobblemon - הרפתקת פוקימון מלאה בעולם המיינקראפט (Fabric)', type: 'modpacks', installMethod: 'manual', loader: 'fabric', mcVersion: '1.20.1', modrinthSlug: 'cobblemon-fabric', downloadUrl: 'https://modrinth.com/modpack/cobblemon-fabric', weight: 'medium', downloads: '8M', rating: 4.9, reviews: 14000 },
  // mp4 COBBLEVERSE 1.7.31 → MC 1.21.1 (Modrinth featured version).
  { id: 'mp4', name: 'COBBLEVERSE', desc: 'הרפתקת פוקימון ענקית מבוססת Cobblemon - מנהיגי חדרים, אליפות וגיבוש חבורת פוקימון', type: 'modpacks', installMethod: 'manual', loader: 'fabric', mcVersion: '1.21.1', modrinthSlug: 'cobbleverse', downloadUrl: 'https://modrinth.com/modpack/cobbleverse', weight: 'medium', downloads: '4.5M', rating: 4.8, reviews: 9000 },
  // mp5 Prominence II: Hasturian Era 3.9.27 → MC 1.20.1 (Modrinth featured version).
  { id: 'mp5', name: 'Prominence II: Hasturian Era', desc: 'מודפאק RPG והרפתקה עשיר עם קווסטים, מחלקות לחימה וקסם - אחד הפופולריים ביותר', type: 'modpacks', installMethod: 'manual', loader: 'fabric', mcVersion: '1.20.1', modrinthSlug: 'prominence-2-fabric', downloadUrl: 'https://modrinth.com/modpack/prominence-2-fabric', weight: 'heavy', downloads: '1.5M', rating: 4.9, reviews: 8000 },
  // mp6 The Pixelmon Modpack 9.3.x → MC 1.21.1 on NeoForge (the current builds dropped Forge).
  { id: 'mp6', name: 'The Pixelmon Modpack', desc: 'המודפאק הרשמי של Pixelmon - לתפוס ולאמן פוקימון בעולם המיינקראפט', type: 'modpacks', installMethod: 'manual', loader: 'neoforge', mcVersion: '1.21.1', modrinthSlug: 'the-pixelmon-modpack', downloadUrl: 'https://modrinth.com/modpack/the-pixelmon-modpack', weight: 'medium', downloads: '1.9M', rating: 4.7, reviews: 7000 },
  // mp7 Fabulously Optimized 12.2.2 → MC 1.21.11 (latest stable on a released MC version).
  { id: 'mp7', name: 'Fabulously Optimized', desc: 'מודפאק ביצועים מוביל - מאיץ FPS, שיידרים ושיפורי איכות-חיים בלי לשנות gameplay', type: 'modpacks', installMethod: 'manual', loader: 'fabric', mcVersion: '1.21.11', modrinthSlug: 'fabulously-optimized', downloadUrl: 'https://modrinth.com/modpack/fabulously-optimized', weight: 'light', downloads: '13M', rating: 4.9, reviews: 25000 },
  
  // --- Textures ---
  // installMethod: 'client' = resource/texture packs מותקנים בצד-הלקוח (אצל השחקן), לא בשרת. אין URL מתארח כרגע.
  // pluginBound:true — a bare resource pack can't ADD the hats; the items only exist when a
  // plugin (ItemsAdder/Oraxen) injects them. So this is server-only (no plain PC download) and
  // carries a prominent "needs ItemsAdder/compatible datapack" tag. suggestsPlugin (soft hint,
  // NOT a hard `requires`) points the user at ItemsAdder without auto-installing a paid plugin.
  { id: 't1', name: 'Custom Hats Pack', desc: 'מוסיף כתרים, כובעי קסם ופריטים שניתן לשים על הראש לטובת מראה ייחודי (בדומה לנייטפול) (חבילת מרקם בצד-הלקוח — מוחלת בשרת דרך server-resource-pack; כל שחקן צריך לאשר אותה אצלו)', type: 'textures', installMethod: 'server', modrinthSlug: 'elibruhs-custom-hats-pack', pluginBound: true, suggestsPlugin: 'p28', downloads: '1.2M', rating: 4.8, reviews: 4500 },
  { id: 't2', name: 'Golden Pumpkin Pie', desc: 'מודל תלת-ממדי מיוחד שהופך את פשטידת הדלעת הרגילה לפשטידת זהב נוצצת', type: 'textures', installMethod: 'client', clientUrl: 'https://modrinth.com/resourcepack/golden-pumpkin-pie', downloads: '800K', rating: 4.6, reviews: 2100 },
  // clientDeps — this server-applied pack only FUNCTIONS if each player also has one client option installed.
  // Rendered as an inline "pick one" chooser (no popup); each option lists its client items + download links.
  { id: 't3', name: 'Fresh Animations', desc: 'אנימציות תנועה מציאותיות, חלקות ומצחיקות לכל המפלצות והחיות במשחק (דורש בצד-הלקוח את המודים ETF + EMF, או OptiFine, כדי שהאנימציות יפעלו)', type: 'textures', installMethod: 'server', modrinthSlug: 'fresh-animations', clientDeps: [{ label: 'ETF + EMF', recommended: true, ids: ['m14', 'm15'] }, { label: 'OptiFine', ids: ['m16'] }], downloads: '15M', rating: 4.9, reviews: 45000 },
  { id: 't4', name: 'Faithful 32x', desc: 'הטקסטורה הקלאסית והמוכרת של מיינקראפט ברזולוציה כפולה וחדה הרבה יותר (חבילת מרקם בצד-הלקוח — מוחלת דרך server-resource-pack; כל שחקן צריך לאשר אותה אצלו)', type: 'textures', installMethod: 'server', modrinthSlug: 'faithful-32x', downloads: '50M', rating: 4.8, reviews: 120000 },
  { id: 't5', name: 'Bare Bones', desc: 'טקסטורה חלקה ונקייה שגורמת למשחק להיראות כמו הטריילרים הרשמיים של מיינקראפט (חבילת מרקם בצד-הלקוח — מוחלת דרך server-resource-pack; כל שחקן צריך לאשר אותה אצלו)', type: 'textures', installMethod: 'server', modrinthSlug: 'bare-bones', downloads: '22M', rating: 4.9, reviews: 60000 },
  { id: 't6', name: 'Visible Ores', desc: 'גורם למחצבים (יהלומים, ברזל) לזהור בחושך, מושלם למערות עמוקות (חבילת מרקם בצד-הלקוח — מוחלת דרך server-resource-pack; כל שחקן צריך לאשר אותה אצלו)', type: 'textures', installMethod: 'server', modrinthSlug: 'visible-ores', downloads: '9.5M', rating: 4.8, reviews: 25000 },
  { id: 't7', name: 'Dark UI', desc: 'משנה את כל התפריטים במשחק לעיצוב כהה ונוח לעיניים (Dark Mode) (חבילת מרקם בצד-הלקוח שמשנה את ה-GUI אצל השחקן — מוחלת דרך server-resource-pack; כל שחקן צריך לאשר אותה אצלו)', type: 'textures', installMethod: 'server', modrinthSlug: 'mandalas-gui-dark-mode', downloads: '18M', rating: 4.9, reviews: 41000 },
  { id: 't8', name: 'Shulker Box Tooltip', desc: 'מאפשר לראות את כל התכולה של השאלקרים ברחרוף עם העכבר בתוך התיק, בלי להניח אותם', type: 'textures', installMethod: 'client', clientUrl: 'https://modrinth.com/mod/shulkerboxtooltip', downloads: '35M', rating: 4.9, reviews: 85000 },
  { id: 't9', name: 'Motschen\'s Better Leaves', desc: 'הופך את העלים של העצים לסבוכים, מלאים ויפהפיים - שדרוג ויזואלי ענק לטבע (חבילת מרקם בצד-הלקוח — מוחלת דרך server-resource-pack; כל שחקן צריך לאשר אותה אצלו)', type: 'textures', installMethod: 'server', modrinthSlug: 'better-leaves', downloads: '5M', rating: 4.8, reviews: 9000 },
  { id: 't10', name: 'Dramatic Skys', desc: 'שמיים ריאליסטיים ודרמטיים עם עננים, שקיעות וירח מרהיבים (חבילת מרקם בצד-הלקוח — מוחלת דרך server-resource-pack; כל שחקן צריך לאשר אותה אצלו)', type: 'textures', installMethod: 'server', modrinthSlug: 'dramatic-skys', downloads: '3M', rating: 4.7, reviews: 5000 },
  { id: 't11', name: 'Default Dark Mode', desc: 'מצב כהה לכל ממשק המשחק - נוח לעיניים, שומר על הסגנון הווניל המקורי (חבילת מרקם בצד-הלקוח — מוחלת דרך server-resource-pack; כל שחקן צריך לאשר אותה אצלו)', type: 'textures', installMethod: 'server', modrinthSlug: 'default-dark-mode', downloads: '8M', rating: 4.8, reviews: 12000 },
  { id: 't12', name: 'New Glowing Ores', desc: 'כל המחצבים זוהרים בחושך - קל לאתר יהלומים וברזל במערות עמוקות (חבילת מרקם בצד-הלקוח — מוחלת דרך server-resource-pack; כל שחקן צריך לאשר אותה אצלו)', type: 'textures', installMethod: 'server', modrinthSlug: 'new-glowing-ores', downloads: '4M', rating: 4.7, reviews: 6000 },
  { id: 't13', name: 'Enchantment Outlines', desc: 'מוסיף מסגרת זוהרת לפריטים מכושפים כדי שיבלטו במלאי (חבילת מרקם בצד-הלקוח — מוחלת דרך server-resource-pack; כל שחקן צריך לאשר אותה אצלו)', type: 'textures', installMethod: 'server', modrinthSlug: 'glowing-glints', downloads: '2.5M', rating: 4.7, reviews: 3500 },
  { id: 't14', name: 'Low On Fire', desc: 'מנמיך את אנימציית האש שמכסה את המסך כשנשרפים - שדה ראייה צלול בקרב (חבילת מרקם בצד-הלקוח — מוחלת דרך server-resource-pack; כל שחקן צריך לאשר אותה אצלו)', type: 'textures', installMethod: 'server', modrinthSlug: 'low-on-fire', downloads: '6M', rating: 4.8, reviews: 8000 },

  // --- Shaders (player-PC only) ---
  // type:'shaders' — real shader PACKS (not the loader). They run ONLY on the
  // player's machine and require a shader loader installed there: Iris (Fabric/Quilt)
  // or Oculus (Forge). installMethod:'client' → never sent to the VPS installer.
  { id: 'sh1', name: 'Complementary Reimagined', desc: 'חבילת השיידרים הפופולרית ביותר כיום — תאורה, צללים והשתקפויות מרהיבים עם ביצועים מצוינים (מותקנת אצל השחקן; דורשת Iris ל-Fabric/Quilt או Oculus ל-Forge)', type: 'shaders', installMethod: 'client', clientUrl: 'https://modrinth.com/shader/complementary-reimagined', downloads: '15M', rating: 4.9, reviews: 30000 },
  { id: 'sh2', name: 'BSL Shaders', desc: 'שיידרים קלאסיים ואהובים עם מים משתקפים, עננים נפחיים ותאורה דרמטית — איזון מצוין בין יופי לביצועים (מותקנים אצל השחקן; דורשים Iris ל-Fabric/Quilt או Oculus ל-Forge)', type: 'shaders', installMethod: 'client', clientUrl: 'https://modrinth.com/shader/bsl-shaders', downloads: '10M', rating: 4.8, reviews: 22000 },
  { id: 'sh3', name: "Sildur's Vibrant Shaders", desc: 'שיידרים צבעוניים וגמישים עם פרופילי ביצועים מ-Lite ועד Extreme — מתאימים גם למחשבים חלשים (מותקנים אצל השחקן; דורשים Iris ל-Fabric/Quilt או Oculus ל-Forge)', type: 'shaders', installMethod: 'client', clientUrl: 'https://modrinth.com/shader/sildurs-vibrant-shaders', downloads: '8M', rating: 4.7, reviews: 16000 },
];

// --- Public landing-page catalog facts (derived from the real arrays above) ---
// Static, always-true facts the landing page shows as social proof. Derived from
// SOFTWARE_TYPES / DEFAULT_ADDONS so they stay accurate as the catalog grows.
export const SERVER_TYPE_COUNT = SOFTWARE_TYPES.length;        // 9 (Vanilla/Paper/Purpur/Folia/Fabric/Forge/NeoForge/Mohist/Youer)
export const ADDON_CATALOG_COUNT = DEFAULT_ADDONS.length;      // every mod/plugin/datapack/modpack/texture in the repo

// Round a count DOWN to the nearest 10 for an honest "N+" label (never overstates).
export const roundedFloorPlus = (n) => `${Math.floor((Number(n) || 0) / 10) * 10}+`;
