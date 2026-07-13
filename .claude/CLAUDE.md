# OmriCraft Panel — Project Context

## ארכיטקטורה (5 שכבות)

| # | שם | טכנולוגיה | תפקיד |
|---|-----|-----------|--------|
| A | **Frontend** | React → **GitHub Pages** (omricraft.com) | UI בלבד |
| B | **VPS** | Oracle Cloud `151.145.94.177` | שרתי Minecraft |
| C | **Backend** | Firebase Functions + Firestore + Auth | לוגיקה + נתונים |
| D | **Version Control** | GitHub `YosAzn/omricraft-panel` | קוד + CI/CD |
| E | **Game Control** | RCON | פקודות ישירות ל-Minecraft |

> ⚠️ Firebase Hosting הוסר (2026-06-07). Frontend = GitHub Pages בלבד.

## Deploy — הכל דרך `git push origin main` (אין deploy ידני)

| מה | מנגנון |
|----|--------|
| Frontend (A) | `git push origin main` → GitHub Actions → Pages |
| Backend (C) | `git push origin main` → ה-CI מריץ `firebase deploy --only functions,firestore` (job `deploy-functions` ב-`deploy.yml`) |
| VPS scripts (B) | push ל-`oracle/**` → workflow "Deploy to Oracle" |

⚠️ אסור `firebase deploy` ידני — מתנגש עם ה-CI על ה-Firebase lock (memory: feedback_omricraft_deploy).

## מידע טכני

- **Firestore:** `omricraft/main/servers/{serverId}`
- **Manager API (VPS):** port 3001
- **Velocity proxy:** port 25565
- **SSH:** `ssh -i "D:\Apps Webs\Oracle_Code\ssh-key-2026-04-20.key" ubuntu@151.145.94.177`
- **RCON password:** שונה לכל שרת — קרא מ-`server.properties`

## שרתים פעילים

| slug | port | RCON |
|------|------|------|
| fffff | 25566 | 25576 |
| trial | 25567 | 25577 |
| — | 25568 | 25578 |
| bbb | 25569 | 25579 |

## Auth
- **Admin = מייל מ-allowlist** דרך Google sign-in (`yosijo@gmail.com`, `omri.sokolov@gmail.com`) —
  מסונכרן ב-3 מקומות: `src/App.jsx` (`ADMIN_EMAILS`) · `functions/index.js` (`assertAdmin`) · `firestore.rules`.
- Anonymous auth לכל מבקר; `adminUid` ב-`config/admin` = legacy fallback בלבד (כתיבה חסומה ב-rules).
- Admin רואה הכל; שאר רואים רק שרתים עם `ownerUid === uid`

## כלל עבודה
לפני כל שינוי — ציין באיזה layer (A/B/C/D/E) אתה נוגע.
שינוי cross-layer → פרק לשלבים.

## כללי חוסן — חובה בכל פיצ'ר חדש

### ❌ catch ריק אסור לחלוטין
```js
// אסור:
try { await someVpsFn(...); } catch(e) {}

// חובה:
try {
  const res = await someVpsFn(...);
  if (!res.data?.success) throw new Error(res.data?.error);
} catch(e) {
  console.error('context:', e);
  rollbackFirestore();   // ← חובה אם Firestore עודכן לפני הקריאה
  alert(`שגיאה: ${e.message}`);
}
```

### ✅ כלל Settings → VPS: תמיד rollback אם VPS נכשל
כל פעולת Settings שמשנה Firestore **ואז** קוראת ל-VPS (privacy, ops, whitelist, difficulty):
1. עדכן Firestore אופטימיסטית
2. קרא ל-VPS
3. אם VPS נכשל → **rollback Firestore** + הצג שגיאה למשתמש

### ✅ RCON deop חובה
כשמסירים OP: שלח `deop <name>` ב-RCON לפני כתיבת ops.json החדש.
קרא את ops.json הישן לפני הכתיבה כדי לדעת מי הוסר.

### ✅ RAM guard
כל יצירת שרת חדשה → בדוק סך הזיכרון המוקצה ב-servers.json לפני הרצת create-server.sh.
מקסימום: 12,000MB (משאיר 4GB ל-OS + Velocity + Manager).

## 🛑 פרוטוקול אנטי-רגרסיה — חובה לכל סוכן/session (נוצר 2026-06-13)

נוצר אחרי חקירת שורש: הדפוס של "עובדים שוב ושוב על אותו דבר" נגרם מ-4 שורשים מבניים
(rsync בלי --delete + CRLF, ל-VPS אין git, שכתוב קבצים שלם שמוחק endpoints, URLs נרקבים).
הכללים האלה עוקפים את הדפוס. **אסור לעבור עליהם.**

### 1. READ-BEFORE-EDIT (תמיד)
אסור לערוך שום קובץ — ריפו או VPS — בלי לקרוא את הגרסה המלאה הנוכחית קודם.
אסור לשחזר/לכתוב מהזיכרון. קודם Read, אז Edit.

### 2. מקור-אמת יחיד = הריפו. אסור לערוך runtime ידנית על ה-VPS
- כל שינוי קוד (`server.js`, סקריפטים) → דרך git → `git push` (oracle/** ⇒ workflow Deploy to Oracle).
- אם חייבים hotfix דחוף ישירות על ה-VPS → **commit מיידי של אותו שינוי לריפו באותו session**, אחרת ה-deploy הבא ידרוס אותו.
- קבצי runtime-state בלבד (`velocity.toml`, `servers.json`) חיים על ה-VPS — אותם לא מסנכרנים, אבל **מגבים** (ראה כלל 5).

### 3. אסור לשכתב server.js כקובץ שלם
עורכים נקודתית (Edit על בלוק ספציפי), אף פעם לא כותבים מחדש את כל הקובץ.
שכתוב מלא = endpoint יכול להיעלם בלי שורת `-` אדומה ב-diff. זה מה שהרג את `/players`.
gate-tests.sh כעת בודק נוכחות של כל route קריטי — אם מחקת endpoint, ה-deploy ייכשל.

### 4. VERIFY-AFTER-CHANGE
אחרי כל שינוי שנגע ב-VPS/Velocity/שרתים — הרץ smoke test ותוודא שלא נסוג כלום:
- MC ping מקצה-לקצה: חיבור ל-`<slug>.omricraft.com:25565` מחזיר את השרת הנכון.
- `gate-tests.sh` עובר (כולל Gate 6 — endpoint presence).

### 5. גיבוי runtime-state
`velocity.toml` + `servers.json` הם state ייחודי שחי רק על ה-VPS. אם ה-VPS נמחק — אבד כל הניתוב.
יש cron גיבוי (`backup-worlds.sh` + גיבוי config). לא לגעת בלי לוודא שהגיבוי רץ.

### 6. אסור hardcode של URLs להורדת פלאגינים בלי 0-byte check
URLs נרקבים. כל הורדה → בדוק שהקובץ > 0 bytes (קיים ב-create-server.sh / install-plugin.sh).

## Backlog פתוח
- #9 Console live log streaming (שליחת פקודות כבר עובדת)
- Scheduled start/stop

> הושלמו מהרשימה הישנה: #8 File Manager · #10 Users/Admin (email-based + request→approve) ·
> #11 Plugin Browser (GlobalRepository) · #12 Backups (+Recycle Bin). ראה "מצב פיצ'רים" ב-`CLAUDE.md` הראשי.
