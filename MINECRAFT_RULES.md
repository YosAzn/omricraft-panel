# MINECRAFT_RULES.md — חוקי הברזל לבניית סקריפטים/אוטומציות (OmriCraft)

> **חובה לכל סוכן/מתכנת** שנוגע ב-`oracle/scripts/*`, `oracle/manager-api/server.js`, או בלוגיקת התקנת-תוספים ב-`src/`.
> קרא לפני כתיבת קוד. הטעויות כאן מפילות **שרתים של לקוחות** — לא רק builds. עוגן בקוד הקיים; כל חוק מסומן ✅ נאכף / ❌ פער.

## חוק 0 — הזהב: VERIFY, אל תניח (Boot Smoke-Test)
כל install / create / restart חייב **לאמת שהוא עבד בפועל**, לא להניח.
- אחרי התקנה: הפעל את השרת (או `/reload` ב-RCON) וסרוק את `logs/latest.log` ל-`Failed to load`, `Exception`, `incompatible`.
- כשל → **auto-disable את התוסף + החזר "X לא תואם לגרסה Y"**. אל תשאיר שרת חצי-שבור בשקט.
- **למה:** "הצהרת תאימות" ≠ "עובד". `mob-heads` v4.7.1 הצהיר תמיכה ב-1.21.11, עבר את כל בדיקות ה-jar, ועדיין קרס בטעינת פונקציה (dialog API). רק boot-test תופס את זה.
- STATUS: ❌ **חסר — הפער העיקרי. TODO #1.**

## חוק 1 — טקסונומיית תוספים: 4 קטגוריות, אף פעם לא "הכל אוטומטי"
| קטגוריה | טיפול נכון | STATUS |
|---|---|---|
| **פלאגין חינמי** (Paper/Purpur/Spigot) | הורדה אוטומטית (Modrinth/Hangar/GitHub-release) | ✅ `install-plugin.sh` |
| **פלאגין בתשלום** (ItemsAdder, MythicMobs) | **אסור להוריד**. exit-loud + הצג ב-UI מדריך העלאת-JAR ידני | ✅ `PAID_PLUGINS` (exit 2) |
| **תלות** (ProtocolLib עבור ItemsAdder) | התקן אוטומטית לפני המארח | ⚠️ ProtocolLib זמין (`p37`, GitHub) — auto-inject-כשמתקינים-מארח: לבדוק |
| **Resource/Content pack** (Custom Hats) | תלוי-פלאגין → הזרק לתיקיית התוכן של המארח או `server-resource-pack`, לא כפלאגין עצמאי | ✅ `install-resourcepack.sh` + `CLIENT_REQUIREMENTS` |

## חוק 2 — גרסה דינמית, לעולם לא Hardcoded
- **אסור:** מיפוי קבוע גרסה→קובץ (כמו `installPluginVersion("mob_heads_v3.0_for_1.21")`). זה בדיוק מה שמפיל שרת כשמשתמש בגרסה אחרת.
- **חובה:** קרא את `server.version` → משוך את ה-build המתאים **דרך API עם סנן-גרסה**.
- **הדפוס הנכון (פסאודו):**
```
resolve(slug, serverVersion, loader):
    builds = ModrinthAPI(slug, game_versions=[serverVersion], loaders=[loader])
    if empty(builds): return SKIP_LOUD("אין build של " + slug + " ל-" + serverVersion)  # אל תתקין crasher
    file = newest(builds); validate(file); install(file); SMOKE_TEST()                    # חוק 0
```
- STATUS: ✅ `install-datapack.sh` / `install-mod.sh` / `install-resourcepack.sh` (Modrinth version-resolve). ❌ **`install-plugin.sh` = URLs נעוצים** (`p-axiom` נעוץ ל-`...for-MC1.21.11.jar` — יישבר על 1.20). **TODO #2.**

## חוק 3 — Loader Gating: פלאגין רץ רק על משפחת Bukkit
- פלאגינים: Paper/Purpur/Spigot/Folia/Mohist/Youer בלבד. **Vanilla/Fabric/Forge/NeoForge → חסום** התקנת פלאגין; הצע החלפת Server Software בכפתור או datapack/mod חלופי. אל תמשיך בהתקנה כושלת.
- STATUS: ✅ `constants.js` (SOFTWARE_TYPES + התאמת loader+mcVersion + CLIENT_REQUIREMENTS).

## חוק 4 — Validation Pipeline (לפני restart/apply)
סדר חובה: `jar/zip תקין (ZIP-magic + גודל-רצפה)` → `declared-version ⊇ server-version` → **`boot smoke-test`** → כשל = rollback.
- ⚠️ **אל תסמוך על `unzip` על ה-VPS — הוא לא מותקן.** השתמש ב-`validate_jar_or_fail` (jar-utils.sh) או python `zipfile`.
- STATUS: jar-validate ✅ · declared-version חלקי · smoke-test ❌ (חוק 0).

## חוק 5 — Client-side ≠ Server-side
- תוסף client-side (shaders, mods גרפיים, resource-pack ונילה) → **אל תיגע בשרת**. הכן קובץ להורדה למחשב + מדריך, סמן "שרת נשאר ונילה נקי".
- STATUS: ✅ `CLIENT_REQUIREMENTS`.

## חוק 6 — Fail Loud + Reversible
- כל כשל: exit non-zero + הודעה עם קונטקסט. **אסור fallback שקט** שמסתיר כשל.
- התקנה/הסרה = **הפיכה**: הזז ל-`*-removed/` לפני מחיקה קשה (כמו שעשינו ל-Mob-Heads ב-gd-3).

## מלכודות קנוניות (קרו באמת — 2026-07)
- **Mob-Heads dialog:** `mob-heads` v4.7.1 datapack — dialog API של 1.21.11. הצהיר תאימות, קרס בטעינה. פתרון: **`amh` (All Mob Heads) V10.21**. לקח → **חוק 0**.
- **Velocity root-orphan:** תהליך root בן-7-ימים תפס `:25565`, systemd (ubuntu) לא הצליח `pkill`. לקח: **הרוג לפי PID+sudo, לא לפי שם**; אל תבליע כשל-kill ב-`|| true`.

## 5-שכבות גרסה (מ-CLAUDE.md — לא לשבור)
`MC Client → Velocity → ViaVersion → Paper/Purpur → Manager API`. כל שינוי גרסה עובר בכל השכבות. גרסאות מאומתות ב-`CLAUDE.md`.
