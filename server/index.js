// ============================================================================
// Nutrimind API — sıfır bağımlılık (node:http + node:sqlite). Node 22+ gerekir.
// GET    /api/data          -> { goals, days, aliases }
// POST   /api/day           -> { date, meals:[{name,nutrition}] }        (upsert)
// DELETE /api/day/:date     -> günü sil
// PUT    /api/goals         -> { kcal,protein,carbs,fat,fiber }
// POST   /api/alias         -> { id?, triggers[], name, brand?, serving_g, nutrition }  (upsert)
// DELETE /api/alias/:id     -> alias sil
// Veritabanı: SQLite dosyası (NUTRI_DB). nginx basic-auth ile korunur.
// ============================================================================
const http = require("node:http");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const PORT = Number(process.env.NUTRI_PORT || 8790);
const DB_PATH = process.env.NUTRI_DB || path.join(__dirname, "data.db");

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS days (date TEXT PRIMARY KEY, meals TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS aliases (id TEXT PRIMARY KEY, data TEXT NOT NULL);
`);

// --- İlk çalıştırmada tohumla (boşsa) ---
const DEFAULT_GOALS = { kcal: 2600, protein: 145, carbs: 360, fat: 72, fiber: 30 };
const SEED_DAYS = {
  "2026-07-20": [
    { name: "Overnight oats", nutrition: { kcal: 625, protein: 52, carbs: 86, fat: 10, fiber: 12 } },
    { name: "Yoğurt + yumurta", nutrition: { kcal: 311, protein: 32, carbs: 7, fat: 16, fiber: 0 } },
    { name: "Kavun", nutrition: { kcal: 70, protein: 1.5, carbs: 17, fat: 0, fiber: 2 } },
    { name: "Kayseri yağlaması", nutrition: { kcal: 1230, protein: 71, carbs: 136, fat: 50, fiber: 6.5 } },
  ],
  "2026-07-21": [
    { name: "Tavuklu makarna", nutrition: { kcal: 641, protein: 61, carbs: 75, fat: 8, fiber: 0 } },
    { name: "Yumurta + mozzarella + hindi füme + süt", nutrition: { kcal: 551, protein: 53, carbs: 17, fat: 27, fiber: 0 } },
    { name: "Spor sonrası shake", nutrition: { kcal: 296, protein: 44, carbs: 11, fat: 8, fiber: 0 } },
    { name: "Kabak kızartması + sarımsaklı yoğurt", nutrition: { kcal: 573, protein: 10.5, carbs: 21, fat: 51.5, fiber: 5 } },
    { name: "Mercimek çorbası", nutrition: { kcal: 240, protein: 12, carbs: 36, fat: 5, fiber: 10 } },
  ],
  "2026-07-22": [
    { name: "Ev yapımı pizza", nutrition: { kcal: 1012.5, protein: 53.2, carbs: 128.7, fat: 29.9, fiber: 4.8 } },
    { name: "Tavuklu patatesli bezelye yemeği + Pilav (%60)", nutrition: { kcal: 942.7, protein: 50.6, carbs: 136.9, fat: 17.8, fiber: 9.6 } },
    { name: "Protein shake", nutrition: { kcal: 175.5, protein: 36, carbs: 2.9, fat: 2.9, fiber: 0 } },
  ],
  "2026-07-23": [
    { name: "Yulaf + protein + süt", nutrition: { kcal: 470.3, protein: 38.6, carbs: 52.6, fat: 11.3, fiber: 5.2 } },
    { name: "Ev yapımı pizza", nutrition: { kcal: 1012.5, protein: 53.2, carbs: 128.7, fat: 29.9, fiber: 4.8 } },
    { name: "Pączki z marmoladą i cukrem pudrem (Auchan)", nutrition: { kcal: 340.5, protein: 5.7, carbs: 54.8, fat: 11.7, fiber: 1.5 } },
    { name: "Taş Fırında Ev Yapımı Kıymalı İskender Pide", nutrition: { kcal: 851.1, protein: 47, carbs: 60.7, fat: 43, fiber: 2.5 } },
  ],
};

// Alias hafızası: kullanıcının ifadeleri -> BELİRLİ besin + makro (serving_g gram için).
const SEED_ALIASES = [
  {
    id: "yogurt",
    triggers: ["yoğurt", "aynı yoğurt", "daha önce attığım yoğurt"],
    name: "Jogurt typu greckiego naturalny (yağsız Yunan yoğurdu)",
    brand: "Auchan",
    serving_g: 150,
    nutrition: { kcal: 77, protein: 13.1, carbs: 6.2, fat: 0, fiber: 0 },
  },
  {
    id: "protein_tozu",
    triggers: ["protein tozu", "aynı protein tozu", "kfd", "kfd wpc 82"],
    name: "KFD WPC 82 protein tozu",
    brand: "KFD",
    serving_g: 100,
    nutrition: { kcal: 388, protein: 82.5, carbs: 5, fat: 5, fiber: 0 },
  },
  {
    id: "lavas",
    triggers: ["lavaş", "o lavaş", "auchan lavaş", "daha önce attığım lavaş", "kayseri yağlaması lavaşı"],
    name: "Lavaş",
    brand: null,
    serving_g: 60,
    nutrition: { kcal: 175, protein: 4.9, carbs: 29.4, fat: 3.5, fiber: 0 },
  },
  {
    id: "yulaf",
    triggers: ["yulaf", "aynı yulaf", "daha önce attığım yulaf", "yulaf ezmesi", "kupiec yulaf"],
    name: "Kupiec Płatki Owsiane (yulaf ezmesi)",
    brand: "Kupiec",
    serving_g: 100,
    nutrition: { kcal: 375, protein: 14, carbs: 60, fat: 7.3, fiber: 6.9 },
  },
  {
    id: "pizza",
    triggers: ["pizza", "ev yapımı pizza", "aynı pizza", "daha önce yaptığım pizza"],
    name: "Ev yapımı pizza (280g hamur + domates sosu + mozzarella + grana padano)",
    brand: null,
    serving_g: 487,
    nutrition: { kcal: 1012.5, protein: 53.2, carbs: 128.7, fat: 29.9, fiber: 4.8 },
  },
  {
    id: "donut",
    triggers: ["donut", "donat", "pudralı donat", "pudralı donut"],
    name: "Pączki z marmoladą i cukrem pudrem (marmelatlı pudralı donut)",
    brand: "Auchan",
    serving_g: 65,
    nutrition: { kcal: 227, protein: 3.8, carbs: 36.5, fat: 7.8, fiber: 1 },
  },
];

if (db.prepare("SELECT COUNT(*) AS c FROM days").get().c === 0) {
  const ins = db.prepare("INSERT INTO days(date, meals) VALUES(?, ?)");
  for (const [date, meals] of Object.entries(SEED_DAYS)) ins.run(date, JSON.stringify(meals));
}
if (!db.prepare("SELECT value FROM config WHERE key='goals'").get()) {
  db.prepare("INSERT INTO config(key, value) VALUES('goals', ?)").run(JSON.stringify(DEFAULT_GOALS));
}
if (db.prepare("SELECT COUNT(*) AS c FROM aliases").get().c === 0) {
  const ins = db.prepare("INSERT INTO aliases(id, data) VALUES(?, ?)");
  for (const a of SEED_ALIASES) {
    const { id, ...rest } = a;
    ins.run(id, JSON.stringify(rest));
  }
}

const getGoals = () => JSON.parse(db.prepare("SELECT value FROM config WHERE key='goals'").get().value);
const getDays = () => {
  const out = {};
  for (const r of db.prepare("SELECT date, meals FROM days").all()) out[r.date] = JSON.parse(r.meals);
  return out;
};
const getAliases = () => db.prepare("SELECT id, data FROM aliases").all().map((r) => ({ id: r.id, ...JSON.parse(r.data) }));

function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = "";
    req.on("data", (c) => {
      b += c;
      if (b.length > 1_000_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(b ? JSON.parse(b) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const p = new URL(req.url, "http://localhost").pathname;
  try {
    if (req.method === "GET" && p === "/api/data")
      return send(res, 200, { goals: getGoals(), days: getDays(), aliases: getAliases() });
    if (req.method === "GET" && p === "/api/health") return send(res, 200, { ok: true });

    if (req.method === "POST" && p === "/api/day") {
      const b = await readBody(req);
      if (!b.date || !Array.isArray(b.meals)) return send(res, 400, { error: "date + meals[] gerekli" });
      db.prepare(
        "INSERT INTO days(date, meals) VALUES(?, ?) ON CONFLICT(date) DO UPDATE SET meals = excluded.meals",
      ).run(b.date, JSON.stringify(b.meals));
      return send(res, 200, { ok: true, date: b.date });
    }
    if (req.method === "DELETE" && p.startsWith("/api/day/")) {
      const date = decodeURIComponent(p.slice("/api/day/".length));
      db.prepare("DELETE FROM days WHERE date = ?").run(date);
      return send(res, 200, { ok: true, date });
    }
    if (req.method === "PUT" && p === "/api/goals") {
      const b = await readBody(req);
      db.prepare(
        "INSERT INTO config(key, value) VALUES('goals', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).run(JSON.stringify(b));
      return send(res, 200, { ok: true });
    }

    if (req.method === "POST" && p === "/api/alias") {
      const b = await readBody(req);
      if (!Array.isArray(b.triggers) || b.triggers.length === 0 || !b.name || !b.nutrition)
        return send(res, 400, { error: "triggers[], name, nutrition gerekli" });
      const id = b.id || `a_${Date.now().toString(36)}`;
      const data = JSON.stringify({
        triggers: b.triggers,
        name: b.name,
        brand: b.brand ?? null,
        serving_g: b.serving_g ?? 100,
        nutrition: b.nutrition,
      });
      db.prepare("INSERT INTO aliases(id, data) VALUES(?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data").run(id, data);
      return send(res, 200, { ok: true, id });
    }
    if (req.method === "DELETE" && p.startsWith("/api/alias/")) {
      const id = decodeURIComponent(p.slice("/api/alias/".length));
      db.prepare("DELETE FROM aliases WHERE id = ?").run(id);
      return send(res, 200, { ok: true, id });
    }

    return send(res, 404, { error: "bulunamadı" });
  } catch (e) {
    return send(res, 500, { error: String((e && e.message) || e) });
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`nutri-api dinliyor :${PORT}  db=${DB_PATH}`));
