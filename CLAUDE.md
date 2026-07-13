# OmriCraft Panel — הקשר לסוכן

> קובץ זה = מפת-על + חוקי-הברזל. קרא אותו לפני כל שינוי.
> תיעוד מעמיק נוסף: `ARCHITECTURE.md` (stack/DNS/lifecycle), `FLOW.md` (נהלי-שינוי),
> `MINECRAFT_RULES.md` (התקנת תוספים — חובה!), `.claude/CLAUDE.md` (כללי-חוסן + אנטי-רגרסיה).

## מה הפרויקט
פאנל ניהול שרתי Minecraft. משתמש יוצר שרת → מקבל `{slug}.omricraft.com` → משחק מיד.
- **אתר:** https://omricraft.com (GitHub Pages)
- **Minecraft proxy:** `<slug>.omricraft.com:25565` (Velocity, VPS 151.145.94.177)

## ⚙️ 5 שכבות (ציין תמיד באיזו שכבה אתה נוגע לפני שינוי)

| # | שכבה | טכנולוגיה | מיקום |
|---|------|-----------|--------|
| A | **Frontend** | React 19 + Vite + Tailwind + lucide-react | `src/` → GitHub Pages |
| B | **VPS** | Oracle Cloud `151.145.94.177` — Velocity + Paper + Manager API | `oracle/` |
| C | **Backend** | Firebase Functions v2 (Node 24) + Firestore + Auth | `functions/`, `omricraft-74735` |
| D | **CI/CD** | GitHub `YosAzn/omricraft-panel` → Actions | `.github/workflows/` |
| E | **Game Control** | RCON (דרך Manager API) | — |

## 🗂️ מבנה הריפו

```
src/                      Frontend (React) — ראה "Frontend" למטה. אינו קובץ אחד!
  App.jsx                 orchestrator: auth, state, ניתוב views, פעולות שרת
  main.jsx, index.css     bootstrap + Tailwind
  lib/                    firebase.js · api.js (כל ה-callables) · constants.js
                          (catalog+gating) · i18n.js + addonI18n.js (~10 שפות) · utils.js
  components/             קומפוננטות UI (ServerPanel/ = טאבים של פאנל השרת)
functions/index.js        כל Firebase Functions (v2 onCall) — ~50 פונקציות
oracle/                   כל מה שרץ על ה-VPS
  manager-api/server.js   Express REST על :3001 (מאחורי nginx TLS)
  scripts/                bash scripts (create/start/stop/install/backup/health…)
  limbo/ serverwaker/     Seamless-wake stack (מעיר שרת כבוי בלי kick)
  monitoring/ systemd/ nginx/  monitoring-as-code + units (deploy ידני)
firestore.rules           Firestore security rules
.github/workflows/        deploy.yml (Pages+Functions) · deploy-oracle.yml (VPS) · vps-diagnose.yml
glassprofile/             תת-פרויקט נפרד (Glass Dome, ניסיוני) — לא נוגעים אלא אם התבקש
ARCHITECTURE.md FLOW.md MINECRAFT_RULES.md   תיעוד — קרא לפני שינוי גדול
```

## 🧭 ניווט מהיר — משימה → קבצים (התחל כאן, אל תסרוק את הריפו)

| רוצה ל… | גע ב… |
|---------|--------|
| לשנות UI של עמוד/טאב | `src/components/…` (טאבי-שרת ב-`ServerPanel/`) + טקסטים **רק** דרך `src/lib/i18n.js` |
| להוסיף/לשנות תוסף בקטלוג | `src/lib/constants.js` (`DEFAULT_ADDONS`) + `addonI18n.js` — **קרא `MINECRAFT_RULES.md` קודם** |
| יכולת backend חדשה | `functions/index.js` (onCall) + חתימה ב-`src/lib/api.js`; אם נוגע ב-VPS → route ב-`oracle/manager-api/server.js` + script ב-`oracle/scripts/` |
| התנהגות שרת MC (create/start/install) | `oracle/scripts/*.sh` — **קרא `MINECRAFT_RULES.md` קודם** |
| הרשאות/גישה | `firestore.rules` + `assertAdmin` ב-functions + `ADMIN_EMAILS` ב-`App.jsx` (3 מקומות מסונכרנים!) |
| ניתוב/פרוקסי (slug לא מגיע לשרת) | `register-server-in-velocity.sh` / `apply-forwarding-config.sh`; `velocity.toml` = runtime על ה-VPS בלבד |

## 🖥️ Frontend (שכבה A)

`App.jsx` הוא ה-orchestrator (auth, Firestore listeners, state, ניתוב `currentView`,
ופעולות השרת: create/delete/start/stop/restart/toggleAddon/updateServer). ה-UI מפורק
לקומפוננטות:

- **Views:** `LandingPage` (ברירת-מחדל, ציבורי), `Dashboard`, `CreateServerForm`,
  `GlobalRepository` (קטלוג תוספים), `GuidePage` (מדריך ציבורי), `HealthTab` (חמ"ל — admin).
- **ServerPanel/** — פאנל שרת בודד + טאבים: `OverviewTab`, `AddonsTab`, `SettingsTab`,
  `FilesTab` (File Manager), `ConsoleTab` (RCON), `BackupsTab`, `MapTab`,
  `WhitelistEditor`, `OpsEditor`, `DifficultyControl`.
- **עוד:** `PendingRequests` (אישור בקשות שרת), `RecycleBin` (שחזור soft-delete),
  `DeleteServerModal`, `DatapackBuilder` + `AiTextureGenerator` (בוני-AI, admin),
  `SideCreepers` (רקע), `LanguageSelector`, `ui.jsx` (primitives).
- **קריאות ל-Backend:** תמיד דרך `src/lib/api.js` (`httpsCallable`). אל תקרא ל-Manager API ישירות מה-frontend.
- **קטלוג תוספים + gating:** `src/lib/constants.js` — `DEFAULT_ADDONS`, `SOFTWARE_TYPES`,
  ולוגיקת תאימות (`isBukkitBased`, `isCoreIncompatible`, `isModpackIncompatible`,
  `isWorldgenDatapack`, `collectRequiredIds`…). כל שינוי לוגיקת addons עובר דרך `MINECRAFT_RULES.md`.

### 🎨 עיצוב — חשוב! שמור על השפה הוויזואלית הקיימת
- **Dark-only:** רקע `zinc-950`, משטחים `zinc-900`, גבולות `zinc-800`. אין light mode.
- **Accent:** emerald = פעולה ראשית/מצב חיובי (כפתור create, badge admin); אדום = הרס; ענבר = אזהרה.
- **כותרת-מותג "מתכתית":** gradient ירוק עם `bg-clip-text text-transparent` (ראה ה-h1 ב-`App.jsx`).
- **אייקונים: lucide-react בלבד — אסור אימוג'י ב-UI** (האימוג'ים הוסרו בכוונה, ראה היסטוריית ה-Guide).
- **primitives משותפים ב-`src/components/ui.jsx`:** `PageHeader` (לוגו+כותרת אחיד לכל עמוד, תומך sticky+glow+RTL-flip), `NavBtn`, `TabBtn` — השתמש בהם, אל תמציא header/כפתור חדש.
- **לוגו ייעודי לכל עמוד** ב-`src/assets/` (`dashboard/guide/warroom/addons/build-logo.png`).
- **RTL-first:** עברית ברירת-מחדל; `dir` נקבע על ה-root; ה-nav העליון נעול LTR פיזית (הלוגו תמיד משמאל).
- **כל טקסט UI דרך `t()`** (`i18n.js`, ~10 שפות) — אסור מחרוזת קשיחה בקומפוננטה.
- עמודים ציבוריים (Landing/Guide) עשירים יותר (hero, flip-cards) אבל באותה פלטה. שינוי עיצוב =
  בתוך השפה הקיימת; **לא** להכניס ספריית UI חדשה או פלטת צבעים שונה בלי אישור מפורש.

## 🔌 Backend — Firebase Functions (שכבה C)

- `functions/index.js`, **Firebase Functions v2** (`onCall`), region `us-central1`, Node 24.
- כל הפונקציות callable ונחתמות ב-`src/lib/api.js`. מדברות עם ה-VPS דרך `callManagerApi(...)`.
- **Secrets (Secret Manager):** `MANAGER_API_URL` (= `https://api.omricraft.com`), `MANAGER_API_KEY`.
  נשלח כ-`Authorization: Bearer`. `GEMINI_API_KEY` אופציונלי (בוני-AI, עם fallback חינמי).
- **אכיפת הרשאות server-side:** `assertAdmin` (allowlist מיילים), `assertOwnerOrAdmin`, `requireAuth`.
- **קבוצות:** provisioning (`createServer`/`requestServer`/`approve|denyServerRequest`/`deleteServer`),
  lifecycle (`start|stop|restartServer`, `getServerStatus`), addons (`installPlugin|Datapack|Mod|Resourcepack`,
  `removePluginJar`, `removeDatapack`), file-manager (`listFiles`/`readFile`/`writeFile`/`deleteFile`/`uploadServerFile`),
  backups + recycle-bin (`backupServer`/`listBackups`/`restoreBackup`/`restoreServer`/`purgeServerBackup`),
  diagnostics/חמ"ל (`getDiagnostics`/`dismissDiagnostic`/`resetServerStatus`), versions (`getPaperVersions`/`getVersionMatrix`),
  ובוני-AI (`suggestModpack`/`suggestDatapacks`/`generateDatapack`/`generateTexture`, `getPublicStats`).

## 🐧 VPS — Manager API + Scripts (שכבה B)

- **Manager API:** `oracle/manager-api/server.js`, Express על `:3001` (bind `0.0.0.0`),
  מאחורי **nginx TLS** ב-`api.omricraft.com` (ה-:3001 הגולמי סגור לאינטרנט). systemd unit `omricraft-manager`.
- **Auth:** `Authorization: Bearer <MANAGER_API_KEY>` על כל route (תומך `MANAGER_API_KEY_OLD` לרוטציה).
- **Scripts (`oracle/scripts/`):** lifecycle (`create/start/stop/restart/delete-server.sh`,
  `download-server-jar.sh`, `autostart-all-servers.sh`, `reap-orphans.sh`), velocity
  (`install/start/stop/restart/reload-velocity.sh`, `register-server-in-velocity.sh`, `apply-forwarding-config.sh`),
  install (`install-plugin|mod|datapack|resourcepack.sh`, `jar-utils.sh`), backups
  (`backup-server|worlds.sh`, `archive/restore-server.sh`, `purge-old-backups.sh`),
  health (`verify-health.sh` = Rule-0 boot smoke-test, `smoke-test.sh` = E2E, `gate-tests.sh`, `health.sh`).
- **Seamless-wake:** `serverwaker/` (Velocity plugin) + `limbo/` (NanoLimbo) → שחקן שמתחבר לשרת כבוי
  נוחת ב-limbo, ה-plugin עושה POST `/start-server`, ומעביר אותו פנימה כשעולה. `limbo/`+`serverwaker/`+`nginx/`+`monitoring/`+`systemd/` = **deploy ידני** (לא ב-CI).

## 🚀 Deploy — הכל דרך `git push origin main`

**אין deploy ידני.** ה-CI מטפל בהכל:

| שינוי | Workflow | פעולה |
|-------|----------|--------|
| `src/**` (Frontend) | `deploy.yml` | build → GitHub Pages |
| `functions/**` + `firestore.rules` | `deploy.yml` (job `deploy-functions`) | `firebase deploy --only functions,firestore` |
| `oracle/scripts/**` + `oracle/manager-api/**` | `deploy-oracle.yml` | rsync ל-VPS + restart manager + `gate-tests.sh` + `smoke-test.sh` |

```bash
git push origin main   # מדפלה את כל השכבות הרלוונטיות אוטומטית
```

⚠️ **אסור `firebase deploy` ידני** — מתנגש עם ה-CI על ה-Firebase lock. ה-CI מדפלה functions+firestore בעצמו.
⚠️ smoke-test.sh נכשל (exit≠0) → **ה-deploy ל-VPS נכשל** (בכוונה — install/boot שבור חוסם deploy).

## 🔐 Auth — admin לפי **מייל** (לא UID!)

- **Anonymous auth** לכל מבקר (ילדים/מכשירים) — אך אנונימי לא בעל שרתים ואינו admin.
- **Admin = מייל מ-allowlist** דרך Google sign-in: `yosijo@gmail.com`, `omri.sokolov@gmail.com`.
  ⚠️ ה-allowlist מוגדר ב-**3 מקומות שחייבים להישאר מסונכרנים**: `src/App.jsx` (`ADMIN_EMAILS`),
  `functions/index.js` (`assertAdmin`), `firestore.rules`. שינוי במקום אחד → עדכן בשלושתם.
- **למה מייל ולא UID:** anonymous UID מתאפס בניקוי storage/SW והפיל admin בשקט. מייל = יציב. (root-cause fix)
- **הרשאות:** admin רואה/עורך הכל; משתמש רגיל רואה רק `ownerUid === uid` ויכול רק **לבקש** שרת (`requestServer`) → admin מאשר.

## 🔥 Firestore

- **Project:** `omricraft-74735`. **אין hosting** (הוסר 2026-06-07; frontend = Pages בלבד).
- **Paths (משותפים לכל המכשירים — לא per-user!):**
  - `omricraft/main/servers/{id}` — כל השרתים
  - `omricraft/main/customAddons/{id}` — תוספי-קטלוג מותאמים
  - `omricraft/main/config/admin` — `adminUid` (legacy; כתיבה חסומה עכשיו)
  - `omricraft/main/dismissedDiagnostics/{serverId}` — issues שהוסתרו בחמ"ל
- **Rules:** servers → read owner-או-admin, write admin-בלבד. customAddons → read authed, write admin.
  config/admin → read authed, write חסום. שאר הנתיבים → חסום.

## 🔄 Server lifecycle
```
Create:  UI → createServer (admin) / requestServer→approve (user) → Manager API /create-server
         → create-server.sh (folder, props, ops, forwarding, addons) → start-server.sh
         → register-server-in-velocity.sh → Firestore setDoc (status 'starting')
Delete:  UI → DeleteServerModal → deleteServer → /delete-server
         soft = archive 30-יום (recycle bin) · permanent = מחיקה קשה → Firestore deleteDoc
```

## 🛑 חוקים קריטיים — אסור להפר

1. **READ-BEFORE-EDIT** — לעולם אל תערוך קובץ (ריפו או VPS) בלי לקרוא את הגרסה הנוכחית המלאה. אל תשחזר מהזיכרון.
2. **מקור-אמת יחיד = הריפו.** אל תערוך runtime על ה-VPS ידנית. hotfix דחוף → commit מיידי לריפו באותו session.
3. **אל תשכתב `server.js` כקובץ שלם** — עריכה נקודתית בלבד (Edit על בלוק). שכתוב מלא = endpoint נעלם בלי `-` אדום ב-diff. `gate-tests.sh` בודק נוכחות routes.
4. **VERIFY-AFTER-CHANGE** — אחרי נגיעה ב-VPS/Velocity: MC ping מקצה-לקצה + `gate-tests.sh` עובר.
5. **לא לשנות** Firestore path (היה `users/{uid}`, תוקן ל-`omricraft/main/servers` — לא לחזור).
6. `SERVER_ID` ו-`SLUG` — רק `^[a-z0-9_-]+$`.
7. `online-mode=false` על כל Paper (Velocity מטפל ב-auth); `forwarding.secret` זהה בין Velocity לכל backend.
8. **wget/הורדות תמיד עם `-L`** + **0-byte / ZIP-magic check** (URLs נרקבים). אל תניח שהורדה הצליחה.
9. **RCON deop חובה** — בהסרת OP שלח `deop <name>` לפני כתיבת `ops.json` החדש (קרא ops.json הישן קודם).
10. **RAM guard** — `MEM_RUNNING_CAP_MB = 18000` (סך live), `MEM_TOTAL_CAP_MB = 12000` (סך מוקצה, `/update-memory`). בדוק לפני create/start.
11. **`velocity.toml` / `servers.json`** = runtime-state שחי רק על ה-VPS — לא לסנכרן, רק לגבות.
12. **אל תיגע בקבצים מחוץ ל-`/home/ubuntu/omricraft/`** ב-scripts. File Manager scoped לתיקיית השרת + path-traversal guard.
13. **אל תשנה שם פונקציה** ב-`functions/index.js` בלי לעדכן `src/lib/api.js`.
14. **אל תוסיף ספריות** בלי לוודא שהן חינמיות.
15. **catch ריק אסור** — כל פעולת Firestore→VPS חייבת rollback ל-Firestore אם ה-VPS נכשל (ראה `.claude/CLAUDE.md`).

## ⚠️ חוק גרסאות — 5 שכבות תלויות

```
MC Client → Velocity Proxy → ViaVersion → Paper/Purpur → Manager API (RCON)
```
כל שינוי גרסה חייב לעבור בכל השכבות:

| שינוי | מה לעדכן |
|-------|----------|
| Paper חדש | ViaVersion (תמיכה), Velocity (פרוטוקול client) |
| Velocity חדש | תאימות Plugins (PlasmoVoice, ServerWaker וכו') |
| ViaVersion חדש | תמיכה בכל גרסאות ה-server הפעילות |

**גרסאות מאומתות (עדכן כאן אחרי בדיקה):**
- Velocity: 3.4.0-SNAPSHOT build 559 · ViaVersion: 5.9.1 · Paper: 1.21.11 (שרתים חדשים)
- MC Client נתמך: 1.7.1 – 1.21.11
- Server software נתמך: Paper / Purpur / Folia / Vanilla / Fabric / Forge / NeoForge / Mohist / Youer (ראה `SOFTWARE_TYPES` ב-`constants.js`)

## 🧪 פיתוח מקומי
```bash
npm install
npm run dev      # Vite dev server
npm run build    # בדיקת קומפילציה (ה-CI בונה שוב)
npm run lint     # ESLint
```

## מצב פיצ'רים (הושלמו מאז ה-backlog הישן)
✅ File Manager · ✅ Console (RCON) · ✅ Backups + Recycle Bin (soft-delete 30-יום) ·
✅ Users/Admin (email-based) + request→approve · ✅ חמ"ל / War Room diagnostics ·
✅ Seamless-wake (ServerWaker+limbo) · ✅ בוני-AI (modpack/datapack/texture) ·
✅ Rule-0 boot smoke-test (verify-health).
**עדיין פתוח:** live log streaming (Console = פקודות בלבד), scheduled start/stop.
