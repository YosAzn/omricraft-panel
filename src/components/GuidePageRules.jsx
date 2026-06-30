import React from 'react';

// ============================================================================
//  GuidePageRules — the compatibility rules, RAM formula, overlapping
//  alternatives, resource-pack + modpack explainers. Data-driven, faithful to
//  the source summary. Separate file to keep each Guide module small.
// ============================================================================

// ---- Compatibility / "what needs what" rules (the exceptions that matter) --
const COMPAT_RULES = [
  { tone: 'amber', title: 'נעילת-ליבה', body: 'תוספים מסוימים רצים על ליבה אחת בלבד: Sodium / C2ME = Fabric בלבד · Create = Forge / NeoForge בלבד.' },
  { tone: 'orange', title: 'Worldgen datapacks', body: 'Terralith / Tectonic רצים רק על Vanilla / Fabric / Forge / NeoForge (לא Paper / Purpur / Folia) — ודורשים עולם חדש.' },
  { tone: 'purple', title: 'תלויות (Dependencies)', body: 'Slimefun → Vault · ItemsAdder → ProtocolLib · MythicMounts → MythicMobs · ExcellentEnchants → NightCore. במאגר שלנו התלויות מסומנות ומותקנות אוטומטית.' },
  { tone: 'blue', title: 'Server-side mods', body: 'מודים שיושבים רק בשרת (FTB Chunks, Essential Commands) ומחליפים פלאגינים — השחקן נכנס נקי, בלי להתקין כלום.' },
  { tone: 'teal', title: 'ItemsAdder / Slimefun / Oraxen', body: 'אלה פלאגינים (לא טקסטורות!) שמוסיפים פריטים דרך Custom-Model-Data + resource-pack אוטומטי. ItemsAdder = פרימיום בתשלום + דורש ProtocolLib.' },
  { tone: 'pink', title: 'Resource Pack לבד', body: 'לא מוסיף פריטים — רק משנה מראה של פריטים קיימים. פריט חדש דורש פלאגין (ItemsAdder) או datapack.' },
  { tone: 'blue', title: 'Sinytra Connector', body: 'מוד Forge שמריץ מודי Fabric / Quilt (גשר — לא מושלם).' },
  { tone: 'amber', title: 'Folia', body: 'הרבה פלאגינים רגילים קורסים עליו — לא מותאמים למרובה-ליבות.' },
  { tone: 'sky', title: 'ViaVersion', body: 'פלאגין שמתרגם פרוטוקולי-רשת → שחקנים מגרסאות שונות נכנסים לאותו שרת. עובד רק על Paper / Purpur (ונילה). לא על מודים — שם השחקן חייב אותה ליבה+גרסה+מודים בדיוק. החריג: שרת שמריץ רק server-side mods (פקודות, בלי בלוקים חדשים).' },
  { tone: 'green', title: 'Simple Voice Chat', body: 'מוד צ\'אט-קולי שדורש פתיחת פורט UDP בשרת.' },
];
const RULE_TONE = {
  amber: 'border-amber-500/30 bg-amber-500/[0.05]',
  orange: 'border-orange-500/30 bg-orange-500/[0.05]',
  purple: 'border-purple-500/30 bg-purple-500/[0.05]',
  blue: 'border-blue-500/30 bg-blue-500/[0.05]',
  teal: 'border-teal-500/30 bg-teal-500/[0.05]',
  pink: 'border-pink-500/30 bg-pink-500/[0.05]',
  sky: 'border-sky-500/30 bg-sky-500/[0.05]',
  green: 'border-emerald-500/30 bg-emerald-500/[0.05]',
};

export function CompatRules() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
      {COMPAT_RULES.map((r) => (
        <div key={r.title} className={`rounded-xl border p-4 ${RULE_TONE[r.tone]}`}>
          <h4 className="font-bold text-zinc-100 mb-1">{r.title}</h4>
          <p className="text-sm text-zinc-300 leading-relaxed">{r.body}</p>
        </div>
      ))}
    </div>
  );
}

// ---- RAM rule-of-thumb table ----------------------------------------------
const RAM_ROWS = [
  { kind: 'ונילה / Paper', ram: '3GB → 20+ שחקנים (קל)' },
  { kind: 'מודפאק קל (≤50 מודים)', ram: '4GB (1–5 שחקנים)' },
  { kind: 'מודפאק בינוני (50–150)', ram: '6GB + 2GB לכל 5 שחקנים נוספים' },
  { kind: 'מודפאק כבד (150–300+, Better MC / Vault Hunters)', ram: '8GB מינימום (גם ל-2!), 12GB+ ל-10' },
];

export function RamTable() {
  return (
    <>
      <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/50">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wide">
              <th className="text-start p-3 font-bold">סוג שרת</th>
              <th className="text-start p-3 font-bold">זיכרון מומלץ</th>
            </tr>
          </thead>
          <tbody>
            {RAM_ROWS.map((r) => (
              <tr key={r.kind} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
                <td className="p-3 align-top text-zinc-200 font-medium">{r.kind}</td>
                <td className="p-3 align-top text-emerald-300 font-bold">{r.ram}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
        מודים = זללני RAM: כל שחקן דורש עיבוד עצום של מכונות / ביומות. ונילה ו-Paper רצים רזה (~1–2GB);
        מודפאקים כבדים מגיעים ל-8GB ומעלה.
      </p>
    </>
  );
}

// ---- Overlapping alternatives: plugin (Paper) vs mod (Forge/Fabric) -------
const ALT_ROWS = [
  { role: 'פקודות (Home/Spawn)', plugin: 'EssentialsX', mod: 'Essential Commands / FTB Essentials' },
  { role: 'הגנת שטח', plugin: 'GriefPrevention / Lands', mod: 'FTB Chunks' },
  { role: 'מפת-וב', plugin: 'Dynmap / Pl3xMap', mod: 'BlueMap / JourneyMap' },
  { role: 'עריכת עולם', plugin: 'WorldEdit', mod: 'WorldEdit (mod) / Axiom' },
  { role: 'סקילים RPG', plugin: 'McMMO / Aurelium', mod: 'Project MMO' },
  { role: 'חפצים קוסמטיים', plugin: 'ItemsAdder / Oraxen', mod: '(מודים מוסיפים ישירות)' },
  { role: 'אופטימיזציה', plugin: 'ClearLag / Spark', mod: 'Lithium / FerriteCore' },
  { role: 'צ\'אט קולי', plugin: 'Skoice', mod: 'Simple Voice Chat' },
];

export function AltTable() {
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-800 bg-zinc-900/50">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="border-b border-zinc-800 text-zinc-400 text-xs uppercase tracking-wide">
            <th className="text-start p-3 font-bold">תפקיד</th>
            <th className="text-start p-3 font-bold"><span className="text-purple-300">פלאגין (Paper)</span></th>
            <th className="text-start p-3 font-bold"><span className="text-blue-300">מוד (Forge / Fabric)</span></th>
          </tr>
        </thead>
        <tbody>
          {ALT_ROWS.map((r) => (
            <tr key={r.role} className="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/30 transition-colors">
              <td className="p-3 align-top text-zinc-200 font-medium">{r.role}</td>
              <td className="p-3 align-top text-zinc-300">{r.plugin}</td>
              <td className="p-3 align-top text-zinc-300">{r.mod}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---- Resource-pack explainer ----------------------------------------------
export function ResourcePackInfo() {
  return (
    <div className="space-y-3 text-sm text-zinc-300 leading-relaxed">
      <p>
        <span className="font-bold text-teal-300">Resource Pack (חבילת-משאבים / טקסטורות)</span> משנה רק את ה<b>מראה</b> —
        בלוקים, צלילים ומודלים של פריטים קיימים. הוא <b>לא</b> מוסיף פריטים חדשים בעצמו.
      </p>
      <p>
        אפשר לטעון אותו בשתי דרכים: (1) <b>הורדה למחשב</b> של השחקן — אותו קובץ .zip עובד בכל שרת ובסינגל-פלייר;
        או (2) <b>דחיפה אוטומטית מהשרת</b> (server-resource-pack) — כל שחקן שנכנס מתבקש לאשר ולהוריד אותו אוטומטית, בלי להתקין כלום.
      </p>
      <p>
        כדי להוסיף <b>פריט חדש לגמרי</b> (להחזיק, לחבוש, לזרוק, למכור) צריך פלאגין-תשתית כמו
        <b> ItemsAdder / Oraxen</b> (Custom-Model-Data) או datapack — חבילת-טקסטורות לבדה לא מספיקה.
        ItemsAdder = פרימיום בתשלום ודורש ProtocolLib, רץ רק על Paper / Purpur.
      </p>
    </div>
  );
}

// ---- Modpack explainer ----------------------------------------------------
export function ModpackInfo() {
  return (
    <div className="space-y-3 text-sm text-zinc-300 leading-relaxed">
      <p>
        שרת מודפאק הוא <b>מולטי-פלייר מלא</b> — מארח הרבה שחקנים, לא רק שחקן יחיד. הבלבול נובע מכך שרוב המשחק
        במודפאק נעשה בסינגל-פלייר.
      </p>
      <p>
        כל שחקן חייב להריץ את <b>אותו מודפאק בדיוק</b> במחשבו — מותקן בלחיצה דרך CurseForge או Modrinth.
        אין תרגום-גרסאות (ViaVersion לא חל על מודים): כולם חייבים אותו loader, אותה גרסת מיינקראפט ואותם קובצי-מודים.
      </p>
      <p>
        מודפאקים כבדים זללני-זיכרון — ראו טבלת ה-RAM למעלה. גם 2 שחקנים על מודפאק כבד צריכים 8GB ומעלה.
      </p>
    </div>
  );
}
