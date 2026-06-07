# OmriCraft — Change Flow (נוהל קבוע)

> ⚠️ קובץ זה **לא נמחק, לא עובר לארכיון, לא מתקצר**.
> מעדכן כל פעם שנוהל משתנה.

---

## 🗺️ מפת המערכת

```
[Browser / לקוח]
       │ HTTPS
       ▼
[Firebase Hosting] ← omricraft.com
       │ React App (App.jsx)
       │
       ├──► [Firestore] ← state שרתים, users, config
       │
       └──► [Firebase Functions] ← לוגיקה עסקית
                    │ HTTP → Manager API :3001
                    ▼
            [Oracle VPS — 151.145.94.177]
                    │
                    ├── Manager API :3001 (Node.js)
                    │      └── scripts/create|start|stop|delete
                    │
                    ├── Velocity Proxy :25565
                    │      ├── bbb.omricraft.com    → :25569
                    │      ├── fffff.omricraft.com  → :25568
                    │      └── trial.omricraft.com  → :25567
                    │
                    └── Paper Servers
                           ├── :25566 (fffff)  RCON :25576
                           ├── :25567 (trial)  RCON :25577
                           ├── :25568          RCON :25578
                           └── :25569 (bbb)    RCON :25579
```

---

## 📋 לפני כל עבודה — קרא תחילה

```
1. FLOW.md זה
2. omricraft-session.md  ← מצב נוכחי + מה פתוח
```

---

## 🔄 Flow A — שינוי קוד (React / Firebase Functions)

```
עריכת קוד מקומי
D:\Apps Webs\OmriCraft-Panel\
        │
        ▼
npm run dev          ← בדיקה מקומית (אופציונלי)
        │
        ▼
npm run build        ← מקמפל React → dist/
        │
        ▼
npx firebase-tools deploy
   ├── hosting  → dist/ → omricraft.com
   ├── functions → Firebase Functions
   └── firestore → rules (אם השתנו)
        │
        ▼
✅ בדוק על omricraft.com
   └── Console browser נקי? פעולה עובדת?
        │
        ▼
git add -A
git commit -m "תיאור"
git push origin main    ← קוד מקור בלבד (dist/ ב-.gitignore)
        │
        ▼
עדכן omricraft-session.md
```

### Deploy חלקי (כשצריך):
```bash
npx firebase-tools deploy --only hosting          # UI בלבד
npx firebase-tools deploy --only functions        # Functions בלבד
npx firebase-tools deploy --only firestore        # Rules בלבד
npx firebase-tools deploy --only hosting,firestore
```

---

## 🖥️ Flow B — שינוי VPS / Manager API / Scripts

```
SSH לVPS:
ssh -i "D:\Apps Webs\Oracle_Code\ssh-key-2026-04-20.key" ubuntu@151.145.94.177
        │
        ├── שינוי ב-Manager API (server.js)?
        │      ▼
        │   sudo systemctl restart omricraft-manager
        │   sudo systemctl status omricraft-manager
        │   curl http://localhost:3001/servers   ← אמת
        │
        ├── שינוי ב-Velocity (velocity.toml)?
        │      ▼
        │   sudo systemctl restart velocity
        │   # בדוק שport 25565 עונה
        │
        ├── שינוי ב-script (create/start/stop/delete)?
        │      ▼
        │   chmod +x /home/ubuntu/omricraft/manager/scripts/*.sh
        │   # בדוק את הscript ידנית לפני שמשתמשים ב-UI
        │
        └── שינוי ב-templates/plugins/?
               ▼
            השינוי ייכנס לכל שרת חדש שייווצר מעכשיו
            שרתים קיימים — צריך להעתיק ידנית
```

### נתיבים חשובים ב-VPS:
```
/home/ubuntu/omricraft/
  servers/server-{id}/
    server.properties    ← RCON password (שונה לכל שרת!)
    plugins/             ← JARs
    logs/latest.log
  templates/plugins/     ← EssentialsX, LuckPerms, PlasmoVoice, ViaVersion
  velocity/velocity.toml ← forced-hosts
  manager/
    manager-api/server.js
    scripts/
```

---

## ⚔️ Flow C — שרת Minecraft ספציפי (נפתח / תקלה / עדכון)

```
יצירת שרת חדש:
UI → createServer Function → VPS script → Firestore doc
   └── מעתיק templates/plugins לספריית השרת החדש
   └── כותב server.properties עם RCON password random
   └── מוסיף forced-host ב-velocity.toml
   └── Velocity reload נדרש לאחר מכן!

הפעלה/כיבוי:
UI → startServer/stopServer Function → Manager API → script
   └── Firestore: status → 'starting' | 'online' | 'offline'

בעיה בשרת ספציפי:
1. בדוק logs: cat /home/ubuntu/omricraft/servers/{id}/logs/latest.log
2. בדוק שהprocess רץ: ps aux | grep {port}
3. restart ידני דרך UI (או Manager API ישירות)

עדכון plugin בשרת קיים:
1. העתק JAR ל: /home/ubuntu/omricraft/servers/{id}/plugins/
2. restart השרת
```

### טבלת שרתים נוכחית:
```
ID                      │ slug   │ port  │ RCON  │ Paper
────────────────────────┼────────┼───────┼───────┼──────────
server-1780756114963    │ fffff  │ 25566 │ 25576 │ 1.21.11
server-1780757053385    │ trial  │ 25567 │ 25577 │ 1.21.1
server-1780759933546    │ —      │ 25568 │ 25578 │ 1.21.11
server-1780813501890    │ bbb    │ 25569 │ 25579 │ 1.21.11
```
> ⚠️ RCON password — תמיד קרא מ-server.properties של השרת הספציפי!

---

## 📡 Flow D — RCON (פקודות לשרת)

```
דרך UI (כשיהיה Console — Issue #9):
  Panel → Console tab → הקלד פקודה → Enter

דרך Firebase Function (כרגע):
  sendMcCommand({ serverId, command })

דרך Manager API ישירות:
  POST http://localhost:3001/rcon
  Body: { serverId: "server-xxx", command: "/list" }

דרך SSH ישיר (debug בלבד):
  ssh לVPS
  # השתמש ב-mcrcon או nc
  echo -e "\x00\x00\x00\x00\x00\x00\x00\x00\x03/list" | nc localhost {RCON_PORT}
```

### פקודות RCON שימושיות:
```
/list                    ← מי מחובר
/op <player>             ← הוסף OP
/deop <player>           ← הסר OP
/whitelist add <player>  ← הוסף לwhitelist
/whitelist on/off        ← הפעל/כבה whitelist
/gamemode <mode> <player>
/stop                    ← כיבוי מסודר
/reload confirm          ← reload plugins
```

---

## 🔥 Flow E — Firestore Rules (אם משתנות)

```
ערוך: D:\Apps Webs\OmriCraft-Panel\firestore.rules
        │
        ▼
npx firebase-tools deploy --only firestore
        │
        ▼
בדוק ב-Firebase Console → Firestore → Rules
```

### Rules נוכחיות (סיכום):
```
servers:       read/write לכל authenticated
customAddons:  read/write לכל authenticated
config/admin:  read לכל authenticated | create פעם אחת | update=false
```

---

## ⚠️ כללים שלא להפר — אף פעם

| כלל | למה |
|-----|-----|
| RCON password — תמיד קרא מ-server.properties | שונה לכל שרת |
| אל תגע בקבצים מחוץ ל-`/home/ubuntu/omricraft/` | סיכון VPS |
| build לפני deploy | Firebase צריך dist/ |
| deploy לפני git push | git שומר source, לא build |
| Paper + ViaVersion + Velocity — בדוק תאימות | ראה חוק גרסאות |
| ownerUid תמיד ב-Firestore doc | privacy בין users |
| config/admin — נכתב פעם אחת | adminUid קבוע |
| Velocity reload אחרי הוספת forced-host | חדש → לא נראה בלי reload |

---

## 📦 מה חסר — Backlog (לא לגעת עד שפתרנו)

| פיצ'ר | עדיפות | Issue |
|--------|--------|-------|
| File Manager (VPS files ב-UI) | 🔴 גבוהה | [#8](https://github.com/YosAzn/squad-hub/issues/8) |
| Console UI (RCON live) | 🔴 גבוהה | [#9](https://github.com/YosAzn/squad-hub/issues/9) |
| User / Admin system | 🔴 גבוהה | [#10](https://github.com/YosAzn/squad-hub/issues/10) |
| Plugin browser | 🟡 בינונית | [#11](https://github.com/YosAzn/squad-hub/issues/11) |
| Backups | 🟡 בינונית | [#12](https://github.com/YosAzn/squad-hub/issues/12) |
| Log viewer | 🟡 בינונית | — |
| Scheduled start/stop | 🟢 נמוכה | — |
