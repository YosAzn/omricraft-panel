import { httpsCallable } from "firebase/functions";
import { functionsInstance } from './firebase';

export const sendMcCommand = httpsCallable(functionsInstance, 'sendMcCommand');
export const createServerFn = httpsCallable(functionsInstance, 'createServer');
// Create-server REQUEST + APPROVAL flow. requestServer = any signed-in user; the
// three review callables are admin-enforced server-side (assertAdmin). All request
// data flows through these admin-SDK callables — clients never read serverRequests.
export const requestServerFn = httpsCallable(functionsInstance, 'requestServer');
export const getPendingRequestsFn = httpsCallable(functionsInstance, 'getPendingRequests');
export const approveServerRequestFn = httpsCallable(functionsInstance, 'approveServerRequest');
export const denyServerRequestFn = httpsCallable(functionsInstance, 'denyServerRequest');
export const deleteServerFn = httpsCallable(functionsInstance, 'deleteServer');
export const updateServerIconFn = httpsCallable(functionsInstance, 'updateServerIcon');
export const setServerPrivacyFn = httpsCallable(functionsInstance, 'setServerPrivacy');
export const updateWhitelistPlayersFn = httpsCallable(functionsInstance, 'updateWhitelistPlayers');
export const getServerStatusFn = httpsCallable(functionsInstance, 'getServerStatus');
export const startServerFn = httpsCallable(functionsInstance, 'startServer');
export const stopServerFn = httpsCallable(functionsInstance, 'stopServer');
export const getPaperVersionsFn = httpsCallable(functionsInstance, 'getPaperVersions');
export const getVersionMatrixFn = httpsCallable(functionsInstance, 'getVersionMatrix');
export const updateServerOpsFn = httpsCallable(functionsInstance, 'updateServerOps');
export const installPluginFn = httpsCallable(functionsInstance, 'installPlugin');
export const installDatapackFn = httpsCallable(functionsInstance, 'installDatapack');
export const installModFn = httpsCallable(functionsInstance, 'installMod');
export const installResourcepackFn = httpsCallable(functionsInstance, 'installResourcepack');
export const changeDifficultyFn = httpsCallable(functionsInstance, 'changeDifficulty');
export const getPlayersOnlineFn = httpsCallable(functionsInstance, 'getPlayersOnline');
export const getServerLogFn = httpsCallable(functionsInstance, 'getServerLog');
export const updateServerPropertiesFn = httpsCallable(functionsInstance, 'updateServerProperties');
export const restartServerFn = httpsCallable(functionsInstance, 'restartServer');
export const getServerStatsFn = httpsCallable(functionsInstance, 'getServerStats');
export const listFilesFn = httpsCallable(functionsInstance, 'listFiles');
export const readFileFn = httpsCallable(functionsInstance, 'readFile');
export const writeFileFn = httpsCallable(functionsInstance, 'writeFile');
export const deleteFileFn = httpsCallable(functionsInstance, 'deleteFile');
// Upload a manual/premium plugin .jar/.zip into a server's folder (owner/admin only).
// Payload: { serverId, dir, filename, contentBase64 }. Size cap enforced client + server.
export const uploadServerFileFn = httpsCallable(functionsInstance, 'uploadServerFile');
export const reloadPluginFn = httpsCallable(functionsInstance, 'reloadPlugin');
export const removePluginJarFn = httpsCallable(functionsInstance, 'removePluginJar');
export const changeServerVersionFn = httpsCallable(functionsInstance, 'changeServerVersion');
export const changeServerTypeFn = httpsCallable(functionsInstance, 'changeServerType');
export const updateServerMemoryFn = httpsCallable(functionsInstance, 'updateServerMemory');
export const backupServerFn = httpsCallable(functionsInstance, 'backupServer');
export const listBackupsFn = httpsCallable(functionsInstance, 'listBackups');
export const restoreBackupFn = httpsCallable(functionsInstance, 'restoreBackup');
// Recycle bin — lists SOFT-DELETE archives (deleted servers, 30-day VPS backups).
// Distinct from listBackups (per-server manual world backups). Restore/UI = D2/D3.
export const listServerBackupsFn = httpsCallable(functionsInstance, 'listServerBackups');
// Recycle bin — RESTORE a soft-deleted server from its archive (D2). Accepts
// { serverId } (newest archive) or { backupId } (explicit "<id>-<epoch>.tar.gz").
// The recycle-bin UI that calls this is D3.
export const restoreServerFn = httpsCallable(functionsInstance, 'restoreServer');
// Recycle bin — PERMANENTLY purge ONE soft-delete archive now (D3 per-entry
// "🔥 מחק לצמיתות"). Accepts { archiveFile } ("<id>-<epoch>.tar.gz"); deletes both
// the tarball + its manifest on the VPS. Owner-or-admin (derived from the archive id).
export const purgeBackupFn = httpsCallable(functionsInstance, 'purgeServerBackup');
// War Room / חמ"ל — health diagnostics (admin-only)
export const getDiagnosticsFn = httpsCallable(functionsInstance, 'getDiagnostics');
export const resetServerStatusFn = httpsCallable(functionsInstance, 'resetServerStatus');
export const removeDatapackFn = httpsCallable(functionsInstance, 'removeDatapack');
// War Room — manually HIDE one issue by its content hash (issueKey). Owner-or-admin.
// The exact issue stays hidden across re-scans; a new/different issue reappears.
export const dismissDiagnosticFn = httpsCallable(functionsInstance, 'dismissDiagnostic');
// Phase 6b — REVERSIBLE archive of cross-family leftover jars (plugins/ on a mod core,
// mods/ on a plugin core) after a server TYPE switch. Moves them to disabled-*/ (not deleted).
export const archiveIncompatibleFilesFn = httpsCallable(functionsInstance, 'archiveIncompatibleFiles');
// Public landing-page aggregate stats — onCall, NOT admin-gated (returns only counts).
export const getPublicStatsFn = httpsCallable(functionsInstance, 'getPublicStats');
// Admin-only Modpack Builder — theme → real Modrinth mods (free or Gemini-verified).
export const suggestModpackFn = httpsCallable(functionsInstance, 'suggestModpack');
// Admin-only AI Texture Generator — prompt → 256×256 image (free Pollinations or
// Gemini/Imagen with graceful free fallback). Client downscales to 16×16.
export const generateTextureFn = httpsCallable(functionsInstance, 'generateTexture');
// Admin-only Datapack Builder — theme → real Modrinth datapacks (free, keyless).
export const suggestDatapacksFn = httpsCallable(functionsInstance, 'suggestDatapacks');
// Admin-only Datapack Builder — prompt → a NEW AI-generated datapack (free
// Pollinations text or Gemini, with graceful free fallback). The client zips the
// returned files (pack.mcmeta carries the correct injected datapack pack_format).
export const generateDatapackFn = httpsCallable(functionsInstance, 'generateDatapack');
