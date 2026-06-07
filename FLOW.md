# OmriCraft — Change Flow (נוהל קבוע)

> ⚠️ קובץ זה **לא נמחק, לא עובר לארכיון**.
> חייב לעדכן כל פעם שנוהל משתנה.

---

## כל פעם שעושים שינוי — הסדר הזה

### 1. לפני הכל — קרא
```
D:\Apps Webs\OmriCraft-Panel\FLOW.md    ← אתה כאן
~/.claude/projects/.../omricraft-session.md  ← מצב נוכחי, מה פתוח
```

### 2. שינויי קוד (React / Functions)

```bash
# פיתוח מקומי
cd "D:\Apps Webs\OmriCraft-Panel"
npm run dev         # בדיקה מקומית

# בניה
npm run build

# Deploy — הכל (hosting + functions + firestore rules)
npx firebase-tools deploy

# Deploy חלקי (hosting + firestore בלבד)
npx firebase-tools deploy --only hosting,firestore
```

**אחרי deploy — תמיד לאמת:**
- [ ] https://omricraft.com נפתח תקין
- [ ] פעולה שהשתנתה עובדת בפועל
- [ ] Console browser — אין שגיאות

---

### 3. שינויי VPS (Oracle)

```bash
# כניסה
ssh -i "D:\Apps Webs\Oracle_Code\ssh-key-2026-04-20.key" ubuntu@151.145.94.177

# אחרי שינוי ב-Manager API
sudo systemctl restart omricraft-manager
sudo systemctl status omricraft-manager   # לאמת

# אחרי שינוי ב-Velocity
# (Velocity רץ תחת screen/systemd — לבדוק)
sudo systemctl restart velocity

# אחרי שינוי ב-Paper server ספציפי
# שרת חייב restart דרך Manager API
```

**לאמת:**
- [ ] Manager API עונה: `curl http://localhost:3001/servers`
- [ ] Velocity מקבל חיבורים: port 25565

---

### 4. Git Push (לאחר כל שינוי)

```bash
cd "D:\Apps Webs\OmriCraft-Panel"
git add -A
git commit -m "תיאור קצר של מה שהשתנה"
git push origin main
```

> ⚠️ אל תדחוף לפני deploy — Firebase hosting צריך את ה-build, לא הsource.

---

### 5. עדכון session log (חובה)

אחרי כל שיחה שבה נעשה שינוי — עדכן:
```
~/.claude/projects/C--Users-yosij/memory/omricraft-session.md
```

פורמט:
```
## [תאריך] — [תיאור קצר]
**נעשה:** ...
**פתוח:** ...
```

---

### 6. עדכון Firestore Rules (אם השתנו)

```
D:\Apps Webs\OmriCraft-Panel\firestore.rules
```

אחרי עריכה:
```bash
npx firebase-tools deploy --only firestore
```

---

## ⚠️ כללים שלא להפר

| כלל | סיבה |
|-----|------|
| RCON password — תמיד קרא מ-`server.properties` הספציפי | כל שרת יש לו password שונה |
| אל תגע בקבצים מחוץ ל-`/home/ubuntu/omricraft/` | סיכון לשאר ה-VPS |
| Paper version ← ViaVersion ← Velocity — לבדוק תאימות | ראה חוק גרסאות בsession log |
| `ownerUid` — תמיד לשמור על Firestore | privacy בין משתמשים |
| `config/admin` — נכתב פעם אחת, לא לשנות | adminUid קבוע |

---

## מצב שרתים (עדכן ידנית כשמשתנה)

| port | slug | RCON port |
|------|------|-----------|
| 25566 | fffff | 25576 |
| 25567 | trial | 25577 |
| 25568 | — | 25578 |
| 25569 | bbb | 25579 |

Velocity forced-hosts:
```
bbb.omricraft.com    → :25569
fffff.omricraft.com  → :25568
trial.omricraft.com  → :25567
```

---

## מה חסר (Backlog קבוע)

| פיצ'ר | עדיפות | Issues |
|--------|--------|--------|
| File Manager (VPS files) | 🔴 גבוהה | [#8](https://github.com/YosAzn/squad-hub/issues/8) |
| Console ב-UI (RCON live) | 🔴 גבוהה | [#9](https://github.com/YosAzn/squad-hub/issues/9) |
| User/Admin system | 🔴 גבוהה | [#10](https://github.com/YosAzn/squad-hub/issues/10) |
| Plugin browser (חיפוש והתקנה) | 🟡 בינונית | [#11](https://github.com/YosAzn/squad-hub/issues/11) |
| Backups | 🟡 בינונית | [#12](https://github.com/YosAzn/squad-hub/issues/12) |
| Log viewer | 🟡 בינונית | — |
| Scheduled tasks (start/stop אוטומטי) | 🟢 נמוכה | — |
