# Glass Dome / GlassProfile Architecture — Project Context

> זהו workspace מבודד ל-Glass Dome. כל session שעובד כאן — קרא קובץ זה ראשון.
> **מפרט מלא (אסמכתא):** `GlassProfile_Architecture_v3_Combined_HE_final.docx`
> טקסט מחולץ: `C:\Users\yosij\AppData\Local\Temp\GlassProfile_Architecture_v3_Combined_HE_final.txt`

## מה זה Glass Dome (במשפט)
מערכת **placement + runtime** לשרתי Minecraft. המשתמש יוצר "שרת" → פנימית נוצרת **Dome** המשובצת ב-**GlassProfile Server** משותף/חדש/מבודד לפי תאימות. לא פאנל Multiverse, ולא Java process לכל משתמש.

## המודל — 6 מושגי ליבה
| מושג | מה |
|------|-----|
| **Dome** | יחידת המשתמש. "השרת שלי". world / קבוצת worlds / סביבה בתוך GPS. מחזיקה slug, publicHost, requestedAddons, allowedCapabilities, targetWorld, entryPolicy |
| **GlassProfile Server (GPS)** | שרת MC אמיתי (Java process, port, RCON, RAM). מריץ כמה Domes תואמות. טוען **union מינימלי** של ה-addons הנדרשים |
| **Capacity State** | open / near_capacity / sealed / dedicated / maintenance |
| **Route** | publicHost → proxy → serverInstanceId → targetWorld. שער כניסה מבודד לכל Dome |
| **Cluster** | משפחת runtime: vanilla-like-paper, paper, purpur, fabric, forge, true-vanilla |
| **Addon** | מקטלוג מאושר בלבד (אין jar upload חופשי). metadata: glassCompatible, riskLevel, placementPolicy, requiresRestart... |

**שני מנגנונים:** `Placement Engine` (בזמן יצירה — איפה לשבץ) ⟂ `Runtime Optimization` (בזמן אמת — worlds/capabilities/load). **לא** טוענים/פורקים plugin JARs חי כמנגנון חיסכון.

## החלטות שננעלו (2026-06-08)
- **GLASS_ROOT** = `/home/ubuntu/omricraft/glassprofile` — מבודד בתוך omricraft החי, **מקביל** לשרתים הרצים, **לא נוגע בהם**.
- **שרתים קיימים** (fffff/trial/bbb) = conceptually **dedicated single-dome** GPS. לא מהגרים אותם פיזית.
- **GitHub** = נשאר ב-`omricraft-panel/glassprofile/`. אין ריפו חדש.
- **לא Cowork** — זו עבודת הנדסה (FS/git/SSH/VPS/subagents) ששייכת ל-Claude Code.

## 🟡 החלטה פתוחה — דרושה לפני שלב 3 (עלות/DNS)
דומיין: המפרט אומר `*.omricraft.net`, החי על `*.omricraft.com`.
המלצה: **(a)** subdomain על ה-.com הקיים (`dome-*.omricraft.com`) — בלי דומיין חדש, בלי עלות. פירוט: `proxy/ROUTING.md §4`.

## כללי בטיחות — לא להפר (חלק ז במפרט)
- עבוד **שלב-שלב**. אחרי כל שינוי — פקודת בדיקה אחת שמוכיחה אותו. בדיקה נכשלת → עצור ותקן רק את השלב.
- ❌ אל תיגע ב-`/home/ubuntu/omricraft/servers|manager-api|velocity` החיים. אל תיגע ב-`/home/ubuntu/minecraft`.
- ❌ אין `git add .`, אין secrets בקוד, אין `rm -rf` בלי path-validation קשיח (target חייב להתחיל ב-`$GLASS_ROOT/servers/`).
- ❌ אין jar upload חופשי. אין שינוי frontend לפני ש-Manager עובד ידנית.
- קבצי `.sh`/config: **UTF-8 ללא BOM, LF** (BOM שובר shebang).

## סטטוס שלבים (מתוך 11 — מלא ב-GLASSDOME.md)
- ✅ **0,1,4,5** — החלטות, מבנה תיקיות, registry (5 JSON), 7 סקריפטים
- ✅ **2 (local prep)** — `velocity-glassdome.draft.toml` (port 25575 provisional), `ROUTING.md`
- ⏳ **3** — שרת Paper שני אמיתי ב-`$GLASS_ROOT/servers/gps-001`. **דורש יוסף נוכח** + אישור namespace/דומיין. **לא משימת רקע.**
- ⬜ 6 create-dome · 7 GlassProfile Plugin · 8 Placement Engine · 9 חיבור frontend · 10 Purpur/resource-packs/multi-world · 11 Fabric/Forge

## מבנה התיקייה
```
glassprofile/
├── CLAUDE.md            ← קובץ זה
├── DECISIONS.md         ← הגדרות פורמליות + ההחלטות
├── GLASSDOME.md         ← tracker 11 שלבים
├── manager/
│   ├── clusters|addons|servers|domes|routes.json
│   └── scripts/         ← 7 סקריפטים (GLASS_ROOT בראש כל אחד)
├── proxy/
│   ├── velocity-glassdome.draft.toml   ← DRAFT, לא פרוס
│   └── ROUTING.md
├── shared-addons/{plugins,mods,datapacks,resource-packs,modpacks}/
└── servers/            ← GPS instances (ריק כרגע)
```

## איך עובדים כאן
- עבודה כבדה → **subagent ברקע** (העדפת יוסף — לא לאכול context הצ'אט).
- לפני placeholders: למלא `CHANGE_ME` (rcon.password random לכל שרת, forwarding-secret, ownerUserId) רק בזמן deploy אמיתי על ה-VPS.
