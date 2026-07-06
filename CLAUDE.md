# OmriCraft Panel — הקשר לסוכן

## מה הפרויקט
פאנל ניהול שרתי Minecraft. משתמש יוצר שרת → מקבל `{slug}.omricraft.com` → משחק מיד.

## קבצים קריטיים
- `src/App.jsx` — כל ה-frontend (קומפוננטה אחת גדולה)
- `functions/index.js` — כל Firebase Functions
- `oracle/scripts/` — bash scripts שרצים על ה-VPS
- `oracle/manager-api/server.js` — Express API על ה-VPS
- `ARCHITECTURE.md` — תיעוד מלא של המערכת (קרא לפני כל שינוי גדול)
- **`MINECRAFT_RULES.md` — חוקי הברזל להתקנת תוספים/אוטומציות. חובה לקרוא לפני כל נגיעה ב-`oracle/scripts/*` או בלוגיקת addons ב-`src/`. מונע קריסות שרת + לולאות באגים.**

## גישה ל-VPS
```
IP: 151.145.94.177
SSH: ssh -i "D:\Apps Webs\Oracle_Code\ssh-key-2026-04-20.key" ubuntu@151.145.94.177
```

## Deploy
```powershell
npm run build
npx firebase-tools deploy --only hosting   # אתר
npx firebase-tools deploy --only functions # פונקציות
# oracle scripts → deploy אוטומטי ב-git push לmain
```

## Firestore
- Path: `omricraft/main/servers` (משותף לכל המכשירים — לא per-user!)
- Project: `omricraft-74735`

## כללים קריטיים
1. **לא לשנות** את Firestore path — היה `users/{uid}` ותוקן, לא לחזור לזה
2. **wget תמיד עם `-L`** בסקריפטי bash (redirects)
3. **stop-velocity.sh** — חייב `pkill -f velocity.jar` כדי לא להשאיר Velocity ישן
4. `SERVER_ID` ו-`SLUG` — רק `[a-z0-9_-]`
5. `online-mode=false` על כל Paper (Velocity מטפל ב-auth)

## מה לא לעשות
- לא לשנות את שם הפונקציות ב-`functions/index.js` בלי לעדכן את `src/App.jsx`
- לא להוסיף ספריות חדשות בלי לבדוק שהן חינמיות
- לא לגעת ב-`velocity.toml` ידנית — רק דרך הסקריפטים

## ⚠️ חוק גרסאות — חובה לקרוא לפני כל שינוי

המערכת מורכבת מ-5 שכבות שתלויות אחת בשנייה:

```
Minecraft Client
      ↓ (פרוטוקול)
Velocity Proxy  ← צריך לתמוך בגרסת ה-client
      ↓ (MODERN forwarding)
ViaVersion      ← צריך לתמוך בגרסת server + client
      ↓ (תרגום פרוטוקול)
Paper Server    ← גרסת MC
      ↓ (RCON)
Manager API
```

**כל שינוי גרסה חייב לעבור בכל השכבות:**
| שינוי | מה צריך לעדכן |
|-------|--------------|
| גרסת Paper חדשה | ViaVersion (תמיכה בגרסה), Velocity (פרוטוקול client) |
| גרסת Velocity חדשה | בדוק תאימות Plugins (PlasmoVoice וכו') |
| גרסת ViaVersion חדשה | בדוק שתומך בכל גרסאות ה-server הפעילות |

**גרסאות מאומתות (עדכן כאן אחרי בדיקה):**
- Velocity: 3.4.0-SNAPSHOT build 559
- ViaVersion: 5.9.1
- Paper: 1.21.11 (לשרתים חדשים)
- MC Client נתמך: 1.7.1 – 1.21.11
