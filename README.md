# OmriCraft Panel

פאנל ניהול שרתי Minecraft — יוצרים שרת Paper עצמאי בלחיצה, מקבלים כתובת `{slug}.omricraft.com`.

---

## הפעלה מקומית

```powershell
cd C:\Users\yosij\omricraft-panel
npm install
npm run dev
```

## Deploy

```powershell
npm run build
npx firebase-tools deploy        # hosting + functions
```

---

## ארכיטקטורה

ראה [`ARCHITECTURE.md`](./ARCHITECTURE.md) — כולל stack, DNS, VPS structure, lifecycle.

## גישה ל-VPS

```powershell
ssh -i "D:\Apps Webs\Oracle_Code\ssh-key-2026-04-20.key" ubuntu@151.145.94.177
```

## Firebase Project

`omricraft-74735` — Auth (anonymous), Firestore, Functions, Hosting

**Firestore path:** `omricraft/main/servers` (משותף לכל המכשירים)

---

## מבנה תיקיות

```
src/           — React app (App.jsx — קומפוננטה אחת גדולה)
functions/     — Firebase Functions (index.js)
oracle/
  scripts/     — Bash scripts → deployed to VPS via GitHub Actions
  manager-api/ — Express.js API on VPS port 3001
```
