# GlassProfile Architecture v3 — DECISIONS (Phase 0)

> מסמך החלטות רשמי. מקבע הגדרות, מיפויים והחלטות פתוחות.
> מקור אמת: `GlassProfile_Architecture_v3_Combined_HE_final.txt`.
> סטטוס: **Foundation scaffolded locally; NOT deployed to VPS. Namespace + repo RESOLVED (sec.6). Phase 2 in local prep.**

---

## 1. הגדרות פורמליות (Formal Definitions)

### Dome / Glass Dome / כיפה
יחידת המשתמש. מה שהמשתמש קורא לו "השרת שלי". יכולה להיות world אחד, קבוצת
worlds, או סביבת משחק אישית בתוך GlassProfile Server. **Dome אינה בהכרח Java
process נפרד**. Dome מחזיקה:
`id`, `ownerUserId`, `displayName`, `slug`, `publicHost`, `serverInstanceId`,
`targetWorld`, `requestedAddons`, `allowedCapabilities`, `entryPolicy`, `status`.

Dome אינה זהה ל-world, כי היא כוללת גם route, capabilities, owner, addons,
status ומדיניות כניסה.

### GlassProfile Server (GPS)
שרת Minecraft **אמיתי** — Java process נפרד עם תיקייה, `server.jar`,
`server.properties`, game/backend port, RCON port, RAM allocation,
plugins/mods/logs, ו-metadata. יכול להריץ **כמה Domes תואמות** ולטעון את קבוצת
האיחוד המינימלית (static union) של ה-addons הנדרשים לכיפות שבתוכו.

### CapacityStatus (Capacity / Isolation State)
סטטוס קיבולת/בידוד של GlassProfile Server. קובע אם אפשר להכניס Domes חדשות.

| סטטוס | משמעות | דוגמת שימוש |
|-------|--------|-------------|
| `open` | אפשר לשבץ Domes נוספות אם יש תאימות. | Paper עם 2 Domes קלות ו-RAM פנוי. |
| `near_capacity` | עדיין עובד, אבל עדיף להיזהר משיבוץ נוסף. | הרבה players/chunks פעילים או RAM מתקרב לסף. |
| `sealed` | לא מקבל Domes חדשות, אך אינו בהכרח שרת פרטי. | שתי Domes כבדות הגיעו למגבלת capacity. |
| `dedicated` | שרת ייעודי או כמעט ייעודי למשתמש/מודפאק/תצורה. | Forge modpack, Multi-World Server, plugin בסיכון גבוה. |
| `maintenance` | לא משבצים אליו Domes; מיועד לעדכון/תיקון. | restart pending או שינוי addon. |

> **Dedicated הוא מצב, לא בהכרח שרת עם Dome אחת בלבד.**

### Route (Proxy / Domain / Public Route)
שער כניסה מבודד לכל Dome. הפרוקסי מסתיר IP/ports ומאפשר לשנות את מיקום ה-Dome
בלי שהמשתמש משנה כתובת. מבנה:
`publicHost` → Velocity proxy → Route Resolver (host → domeId → serverInstanceId)
→ GPS backend → `targetWorld`.

שדות route: `host`, `domeId`, `serverInstanceId`, `proxyTarget`, `targetWorld`,
`entryMode`, `status`.

### Cluster
משפחת runtime תואמת. נבחר לפי אפשרות המשתמש באתר; המימוש הפנימי יכול להיות
מדויק יותר. ערכים: `vanilla-like-paper`, `paper`, `purpur`, `fabric`, `forge`,
`true-vanilla`.

### Addon
יחידת יכולת מתוך קטלוג מאושר (אין jar upload חופשי). סוגים: `plugin`, `mod`,
`datapack`, `resource_pack`, `modpack`. כל addon חייב metadata מלא (ראה סעיף 4).

---

## 2. מיפוי אתר → Cluster פנימי

| אפשרות באתר | Cluster פנימי (MVP) | מדיניות התחלתית |
|-------------|---------------------|------------------|
| Vanilla | `vanilla-like-paper` | MVP מומלץ. runtime Paper עם תוספי תשתית בלבד; **אין התקנת plugins למשתמש**. |
| Paper | `paper` | משותף אם addons תואמים; sealed לפי עומס/סיכון. |
| Purpur | `purpur` | להוסיף אחרי Paper MVP, או כ-option מתקדם. |
| Fabric | `fabric` | בדרך כלל new/sealed/dedicated לפי modpack. |
| Forge | `forge` | בדרך כלל sealed/dedicated; client-modded ורגיש. |
| (פנימי בלבד) True Vanilla | `true-vanilla` | לא MVP לשיתוף Domes; מתאים ל-single-dome/dedicated. |

**החלטת מוצר:** Vanilla באתר = חוויית Vanilla למשתמש, אבל פנימית `vanilla-like-paper`
(Paper) כדי לאפשר ניהול, routing ובידוד יכולות. True Vanilla נשמר כאפשרות
dedicated/single-dome מתקדמת יותר.

---

## 3. Multiverse כ-internal tool

Multiverse-Core הוא `internal_runtime_tool` בלבד — כלי של המערכת ליצירת/ניהול
worlds בשרתי Paper/Purpur. **המשתמש לא מקבל** `/mv create`, `/mv delete`,
`/mv import`, `/mvtp`. אם משתמש רוצה "שרת רב-עולמות", זה מוצר נפרד בשם
**Multi-World Server / Multi-World Dome** (`placementPolicy: sealed_recommended`,
`managedViaPanel: true`, `rawMultiverseCommands: false`).

---

## 4. Addon metadata schema

כל addon ב-`addons.json` נושא לכל הפחות:
`id`, `name`, `platform`, `type`, `scope`, `glassCompatible`, `supportsPerWorld`,
`canBeAddedToExistingProfile`, `canBeHotAdded`, `requiresRestart`,
`requiresClientMod`, `changesBlocks`, `changesItems`, `changesEntities`,
`changesWorldGen`, `changesProtocol`, `globalRecipes`, `capabilitiesProvided`,
`conflictsWith`, `riskLevel`, `placementPolicy`.

תוספות ל-resource_pack: `clientImpact`, `requiresClientAccept`, `canBeOptional`,
`canBeRequired`. תוספות ל-internal addons: `visibility`, `userSelectable`, `usedBy`.

### Placement policies
| Policy | משמעות |
|--------|--------|
| `shared_allowed` | שיבוץ בשרת משותף אם runtime/version/addons/capacity תואמים. |
| `profile_only` | חולק שרת רק עם Domes בעלות אותו profile. |
| `sealed_recommended` | אפשרי לשיתוף מוגבל, אבל עדיף לא לקבל Domes חדשות אחר כך. |
| `sealed_required` | דורש בידוד קיבולת/תאימות; לא לערבב. |
| `dedicated_required` | דורש שרת ייעודי מלא. |
| `reject_for_now` | לא נתמך בשלב הנוכחי. |

---

## 5. דוגמאות reference (לא live data)

> אלה דוגמאות בלבד מתוך Appendix A. הקבצים החיים
> (`servers.json`/`domes.json`/`routes.json`) מתחילים ריקים.

### servers.json (דוגמה)
```json
{
  "servers": [
    {
      "id": "gps-001",
      "cluster": "vanilla-like-paper",
      "runtime": "paper",
      "version": "1.21.1",
      "backendAddress": "127.0.0.1:25566",
      "gamePort": 25566,
      "rconPort": 25576,
      "memoryMb": 3072,
      "loadedAddons": ["glassprofile", "luckperms", "multiverse-core"],
      "capacityStatus": "open",
      "capacityReason": null,
      "domes": ["dome-1001"],
      "status": "online"
    }
  ]
}
```

### domes.json (דוגמה)
```json
{
  "domes": [
    {
      "id": "dome-1001",
      "ownerUserId": "user-123",
      "displayName": "Shahar Server",
      "slug": "shahar",
      "publicHost": "shahar.omricraft.net",
      "serverInstanceId": "gps-001",
      "targetWorld": "world_dome_1001",
      "requestedAddons": [],
      "allowedCapabilities": ["vanilla.basic"],
      "entryPolicy": "direct_to_world",
      "status": "online"
    }
  ]
}
```

### routes.json (דוגמה)
```json
{
  "routes": [
    {
      "host": "shahar.omricraft.net",
      "domeId": "dome-1001",
      "serverInstanceId": "gps-001",
      "proxyTarget": "gps-001",
      "targetWorld": "world_dome_1001",
      "entryMode": "direct_world_join",
      "status": "active"
    }
  ]
}
```

---

## 6. RESOLVED — namespace + repo

> **סטטוס: RESOLVED (2026-06-08).** היה OPEN DECISION; נסגר. כל 7 הסקריפטים כבר
> משתמשים בערך הסופי.

### הרקע (למה זו הייתה שאלה)
ה-spec (חלק ה') מניח ש-`/home/ubuntu/omricraft` הוא תיקייה **greenfield** לבנייה,
ו-`/home/ubuntu/minecraft` הוא ה-prototype הישן. **במציאות זה הפוך:**
לפי `FLOW.md` ו-`CLAUDE.md`, מערכת OmriCraft החיה כבר רצה תחת
**`/home/ubuntu/omricraft`** — 4 שרתי Paper פעילים, Velocity proxy :25565,
Manager API :3001, `templates/`, `velocity/velocity.toml`, `manager/scripts/`.
בנייה ישירה לתוך `/home/ubuntu/omricraft` (שמות תיקיות זהים) הייתה מתנגשת.

### ✅ ההחלטה (RESOLVED)
**namespace VPS:**
```
GLASS_ROOT="/home/ubuntu/omricraft/glassprofile"
```
תת-תיקייה **מקוננת** בתוך אזור OmriCraft החי, **במקביל** לשרתים הרצים ולא נוגעת בהם
(`servers/`, `velocity/`, `manager/` החיים נשארים כפי שהם, רמה אחת מעל).
היתרון: כל נכסי OmriCraft תחת עץ אחד, אבל Glass Dome מבודדת בתת-תיקייה ייעודית.

- כל 7 הסקריפטים מגדירים `GLASS_ROOT="/home/ubuntu/omricraft/glassprofile"`
  כמשתנה יחיד בראש הקובץ.
- אפס מגע ב-`servers/`, `velocity/velocity.toml`, `manager/scripts/` החיים שמעל,
  ואפס מגע ב-`/home/ubuntu/minecraft`.
- השרתים החיים (fffff/trial/bbb/…) הם מבחינה רעיונית **"dedicated single-dome"
  GlassProfile Servers** — כל אחד שרת Paper אמיתי שמריץ Dome אחת. הם לא מהוגרים
  פיזית אל `glassprofile/` בשלב זה; ההגדרה היא רעיונית בלבד.

**GitHub repo:**
נשארים ב-`omricraft-panel` תחת `glassprofile/` — **בלי repo חדש**.
- מקומית: `D:\Apps Webs\OmriCraft-Panel\glassprofile\` — **מחוץ** ל-`oracle/`
  (שמתפרסם אוטומטית ל-VPS דרך CI). לכן הקבצים **לא** מתפרסמים לבד; deploy ידרוש
  העתקה/החלטה מפורשת.

### הערה לעתיד (לא חלק מה-foundation)
אם בעתיד רוצים לאחד את 4 השרתים החיים פיזית למודל GlassProfile — זו עבודת הגירה
נפרדת, לא חלק מה-foundation הזה.

> עד אישור deploy: **אין deploy**. הקבצים נשארים מקומיים בלבד.
