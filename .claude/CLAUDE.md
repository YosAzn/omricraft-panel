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

## Deploy

| מה | פקודה |
|----|--------|
| Frontend (A) | `git push origin main` → GitHub Actions → Pages |
| Backend (C) | `firebase deploy --only functions,firestore` |
| VPS scripts (B) | push ל-`oracle/**` → workflow "Deploy to Oracle" |

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
- Anonymous auth — `adminUid` = UID ראשון ב-`config/admin`
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

## Backlog פתוח
- #8 File Manager (endpoints קיימים, UI עדיין mock)
- #9 Console live log
- #10 Users/Admin
- #11 Plugin Browser
- #12 Backups
