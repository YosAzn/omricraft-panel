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
export const reloadPluginFn = httpsCallable(functionsInstance, 'reloadPlugin');
export const removePluginJarFn = httpsCallable(functionsInstance, 'removePluginJar');
export const changeServerVersionFn = httpsCallable(functionsInstance, 'changeServerVersion');
export const changeServerTypeFn = httpsCallable(functionsInstance, 'changeServerType');
export const updateServerMemoryFn = httpsCallable(functionsInstance, 'updateServerMemory');
export const backupServerFn = httpsCallable(functionsInstance, 'backupServer');
export const listBackupsFn = httpsCallable(functionsInstance, 'listBackups');
export const restoreBackupFn = httpsCallable(functionsInstance, 'restoreBackup');
// War Room / חמ"ל — health diagnostics (admin-only)
export const getDiagnosticsFn = httpsCallable(functionsInstance, 'getDiagnostics');
export const resetServerStatusFn = httpsCallable(functionsInstance, 'resetServerStatus');
export const removeDatapackFn = httpsCallable(functionsInstance, 'removeDatapack');
// Public landing-page aggregate stats — onCall, NOT admin-gated (returns only counts).
export const getPublicStatsFn = httpsCallable(functionsInstance, 'getPublicStats');
// Admin-only Modpack Builder — theme → real Modrinth mods (free or Gemini-verified).
export const suggestModpackFn = httpsCallable(functionsInstance, 'suggestModpack');
// Admin-only AI Texture Generator — prompt → 256×256 image (free Pollinations or
// Gemini/Imagen with graceful free fallback). Client downscales to 16×16.
export const generateTextureFn = httpsCallable(functionsInstance, 'generateTexture');
