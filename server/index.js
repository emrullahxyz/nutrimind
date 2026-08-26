// ============================================================================
// Nutrimind API — sıfır bağımlılık (node:http + node:sqlite). Node 22+ gerekir.
// GET    /api/data                  -> { goals, days, aliases }
// POST   /api/day                   -> { date, meals:[{name,nutrition}] }       (upsert)
// DELETE /api/day/:date              -> günü sil
// PUT    /api/goals                 -> düz besin nesnesi VEYA v2 profil yapısı (bkz. goalsError)
// GET    /api/config/:key           -> { ok, key, value } (yoksa value:null)
// PUT    /api/config/:key           -> { ok, key }  (gövde düz nesne olmalı; ayrılmış anahtar: goals, seeded)
// POST   /api/alias                 -> { id?, triggers[], name, brand?, serving_g?, nutrition,
//                                        units?, barcode?, off_id?, recipe? }   (upsert)
// DELETE /api/alias/:id              -> alias sil
// GET    /api/off/product/:barcode   -> Open Food Facts ürün proxy'si (önbellekli)
// GET    /api/off/search?q=&limit=   -> OFF ürün arama, Polonya kataloğu (önbellekli)
// GET    /api/health                -> { ok, off:{…} }
// POST   /api/ai/vision              -> { image, mimeType, mode } -> { items:[...] }
// Veritabanı: SQLite dosyası (NUTRI_DB). nginx basic-auth ile korunur.
// ============================================================================
const http = require("node:http");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { parseMealText, parseMealImage } = require("./ai.js");
const { migrate, OWNER_ID } = require("./migrate.js");
const authRoutes = require("./authRoutes.js");
const { OFF_UA } = require("./offUA.js");

const PORT = Number(process.env.NUTRI_PORT || 8790);
const DB_PATH = process.env.NUTRI_DB || path.join(__dirname, "data.db");

const db = new DatabaseSync(DB_PATH);
// v0 şeması: yalnızca YENİ bir dosyada oluşur. Mevcut veritabanlarında
// `IF NOT EXISTS` sayesinde hiçbir etkisi yok; göç bir sonraki adımda
// birincil anahtarları composite hâle getiriyor.
db.exec(`
  CREATE TABLE IF NOT EXISTS days (date TEXT PRIMARY KEY, meals TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS aliases (id TEXT PRIMARY KEY, data TEXT NOT NULL);
`);

// Şema göçü v0 → v2 (çok kullanıcı). İdempotent: `PRAGMA user_version` zaten 2
// ise hiçbir şey yapmaz. Fırlatırsa süreç AÇILMAMALI — yarı göçmüş bir
// veritabanıyla servis vermek, veriyi sessizce bozmaktan daha kötü değil ama
// teşhisi çok daha zor olurdu.
const migrationResult = migrate(db, { ownerEmail: process.env.NUTRIMIND_OWNER_EMAIL });
if (migrationResult.migrated) {
  console.log(`şema göçü: v${migrationResult.from} → v${migrationResult.to}`, migrationResult.rows);
}

/**
 * O anki isteğin sahibi.
 *
 * BAYRAK KAPALIYKEN (varsayılan) her istek sabit sahibe ait sayılıyor — yani
 * uygulama aynen bugünkü gibi davranıyor ve kimlik özelliği tamamen inaktif.
 *
 * BAYRAK AÇIKKEN oturumdan çözülüyor ve oturumsuz istek `null` alıyor; çağıran
 * 401 döner. Tüm sorgular Faz D'de kapsamlandığı için değişen TEK yer burası
 * oldu — parametreyi fonksiyonlara eklemenin asıl kazancı buydu.
 */
const currentUserId = (req) => {
  if (!authRoutes.AUTH_ENABLED) return OWNER_ID;
  const s = authRoutes.resolveSession(db, req, Date.now());
  return s ? s.userId : null;
};

/** Oturum gerektirmeyen uçlar. `/api/health` açık kalıyor: yalnızca canlılık ve
 *  OFF önbellek sayaçlarını sızdırıyor, karşılığında sunucu dışından izlenebilir
 *  oluyor. Bunun DIŞINDAKİ her uç oturum ister — AI ve OFF proxy'leri DAHİL,
 *  çünkü basic-auth kalktığında `/api/ai/vision` internete açık kalırsa
 *  kullanıcının Gemini kotasını yakar. */
const PUBLIC_PATHS = new Set(["/api/health"]);

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

// --- Tohumlama: veritabanının ÖMRÜNDE EN FAZLA BİR KEZ -----------------------
// Eski davranış "tablo BOŞSA tohumla" idi. Yani tüm günlerini silip sunucuyu
// yeniden başlatınca 4 sahte Temmuz 2026 günü geri geliyordu — Faz 9'daki
// içe aktarma/geri yükleme işini de bozardı. Artık config'te bir `seeded`
// bayrağı tutuluyor.
//
// Bayrağı OLMAYAN mevcut üretim veritabanı için güvenli: bayrak yoksa DB'nin
// GERÇEKTEN yeni olup olmadığına bakılır (günler VE alias'lar boş VE hedef
// satırı yok). Zaten verisi olan bir DB tohumlanmaz, sadece bayrağı yazılır —
// yani bir daha asla tohumlanamaz. "Bir zamanlar veri görmüş" bir DB'ye sahte
// geçmiş geri gelmez.
const SEED_FLAG_KEY = "seeded";
// ⚠️ TOHUMLAMA YALNIZCA SAHİBE, YALNIZCA AÇILIŞTA. Bu blok modül yüklenirken bir
// kez çalışır, istek başına DEĞİL — dolayısıyla sonradan açılan hesaplar (eş,
// misafir) buraya HİÇ uğramaz ve boş başlar. Bunu istek yoluna taşımak, yeni bir
// kullanıcının karşısına 4 sahte Temmuz günü + 6 demo besin çıkarırdı.
// Sabit `OWNER_ID` — `currentUserId()` DEĞİL. Burası modül yüklenirken, ortada
// hiçbir istek yokken çalışıyor; `currentUserId(undefined)` bayrak açıkken
// doğru biçimde `null` döner ve `user_id NOT NULL` kısıtı sunucuyu açılışta
// düşürürdü. Tohumlama zaten tanımı gereği SAHİBE ait.
const SEED_OWNER = OWNER_ID;
if (!db.prepare("SELECT value FROM config WHERE user_id = ? AND key = ?").get(SEED_OWNER, SEED_FLAG_KEY)) {
  const fresh =
    db.prepare("SELECT COUNT(*) AS c FROM days WHERE user_id = ?").get(SEED_OWNER).c === 0 &&
    db.prepare("SELECT COUNT(*) AS c FROM aliases WHERE user_id = ?").get(SEED_OWNER).c === 0 &&
    !db.prepare("SELECT 1 FROM config WHERE user_id = ? AND key = 'goals'").get(SEED_OWNER);

  if (fresh) {
    const insDay = db.prepare("INSERT INTO days(user_id, date, meals) VALUES(?, ?, ?)");
    for (const [date, meals] of Object.entries(SEED_DAYS)) insDay.run(SEED_OWNER, date, JSON.stringify(meals));
    const insAlias = db.prepare("INSERT INTO aliases(id, data, user_id) VALUES(?, ?, ?)");
    for (const { id, ...rest } of SEED_ALIASES) insAlias.run(id, JSON.stringify(rest), SEED_OWNER);
  }
  db.prepare("INSERT INTO config(user_id, key, value) VALUES(?, ?, ?)").run(
    SEED_OWNER,
    SEED_FLAG_KEY,
    JSON.stringify({ at: new Date().toISOString(), seeded: fresh }),
  );
  console.log(fresh ? "yeni veritabanı: örnek veri yazıldı" : "mevcut veritabanı: tohumlama ATLANDI, bayrak kondu");
}

// Hedef satırı her koşulda bulunmalı — tohumlamadan BAĞIMSIZ. Bu "sahte geçmiş"
// değil, uygulamanın açılabilmesi için gereken tek yapılandırma satırı.
if (!db.prepare("SELECT 1 FROM config WHERE user_id = ? AND key = 'goals'").get(SEED_OWNER)) {
  db.prepare("INSERT INTO config(user_id, key, value) VALUES(?, 'goals', ?)").run(
    SEED_OWNER,
    JSON.stringify(DEFAULT_GOALS),
  );
}

/** Hedefler. SAVUNMACI: eskiden satırın varlığını ve JSON'un geçerliliğini
 *  varsayıyordu; bozuk/eksik satır fırlatıp TÜM `/api/data` ucunu 500'e
 *  çeviriyordu (uygulama tamamen açılmıyordu). Artık varsayılana düşer.
 *  ŞEKİL doğrulaması BİLEREK yok: Faz 8'in v2 profil yapısı da buradan
 *  olduğu gibi geçmeli. */
// Dördü de artık `userId` ZORUNLU alıyor. Parametreyi eklemenin sebebi kozmetik
// değil: "bu sorgu kapsamlandı mı?" sorusu, "bu fonksiyonun userId parametresi
// var mı?" sorusuna indirgenmiş oluyor — gözle taranabilir bir değişmez.
const getGoals = (userId) => {
  try {
    const row = db.prepare("SELECT value FROM config WHERE user_id = ? AND key='goals'").get(userId);
    if (!row) return { ...DEFAULT_GOALS };
    const parsed = JSON.parse(row.value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...DEFAULT_GOALS };
    return parsed;
  } catch {
    return { ...DEFAULT_GOALS };
  }
};
const getDays = (userId) => {
  const out = {};
  for (const r of db.prepare("SELECT date, meals FROM days WHERE user_id = ?").all(userId)) {
    out[r.date] = JSON.parse(r.meals);
  }
  return out;
};
const getAliases = (userId) =>
  db
    .prepare("SELECT id, data FROM aliases WHERE user_id = ?")
    .all(userId)
    .map((r) => ({ id: r.id, ...JSON.parse(r.data) }));
const getConfig = (userId) => {
  const out = {};
  for (const r of db.prepare("SELECT key, value FROM config WHERE user_id = ?").all(userId)) {
    if (RESERVED_CONFIG_KEYS.has(r.key)) continue;
    try {
      const parsed = JSON.parse(r.value);
      if (isPlainObject(parsed)) out[r.key] = parsed;
    } catch {
      // bozuk satır sessizce atlanır — tüm /api/data'yı düşürmemeli
    }
  }
  return out;
};

/** Yanıt kodunu taşıyan hata. Router'ın catch'i bunu 500 yerine kendi koduyla
 *  döndürür; `extra` gövdeye eklenir (ör. 429'da `retryAfter`). */
class HttpError extends Error {
  constructor(code, message, extra) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

function send(res, code, obj, headers) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(obj));
}

const MAX_BODY_BYTES = 1_000_000;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let aborted = false;
    req.on("data", (c) => {
      if (aborted) return;
      // Eskiden `b += c` ile Buffer'lar metne ekleniyordu: sınır BAYT değil
      // UTF-16 birimi sayıyordu, yani Türkçe/Lehçe bir gövde bambaşka bir
      // gerçek boyutta patlıyordu. Artık Buffer olarak, bayt üzerinden sayılıyor.
      bytes += c.length;
      if (bytes > MAX_BODY_BYTES) {
        aborted = true;
        // Eskiden burada çıplak `req.destroy()` vardı: ne `end` ne `error`
        // yayıyordu, promise HİÇ ÇÖZÜLMÜYORDU — handler terk ediliyor, istemci
        // hiçbir yanıt almadan bağlantının düşmesini görüyordu. Artık düzgün 413.
        reject(new HttpError(413, `gövde çok büyük (en fazla ${MAX_BODY_BYTES} bayt)`));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (aborted) return;
      const text = Buffer.concat(chunks).toString("utf8");
      try {
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new HttpError(400, "geçersiz JSON gövdesi"));
      }
    });
    req.on("error", (e) => {
      if (!aborted) reject(e);
    });
  });
}

// --- Doğrulama yardımcıları -------------------------------------------------

const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const CONFIG_KEY_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;
const RESERVED_CONFIG_KEYS = new Set(["goals", "seeded"]);

/** `Nutrition`'ın çekirdek alanları. Doğrulama bunlardan EN AZ BİRİNİ arar. */
const CORE_NUTRIENT_KEYS = ["kcal", "protein", "carbs", "fat", "fiber"];

/** Düz besin nesnesi mi?
 *  Anahtar listesi BİLEREK dar tutulmadı: ileride eklenecek bir besin
 *  (potasyum, D vitamini…) backend'e ikinci kez dokunmadan geçebilsin diye
 *  yalnızca iki şey aranıyor — tanınan en az bir çekirdek alan, ve tüm
 *  değerlerin sayı (ya da "bilinmiyor" için null) olması. */
function isNutritionLike(v) {
  if (!isPlainObject(v)) return false;
  const keys = Object.keys(v);
  if (keys.length === 0) return false;
  if (!CORE_NUTRIENT_KEYS.some((k) => k in v)) return false;
  return keys.every((k) => v[k] === null || (typeof v[k] === "number" && Number.isFinite(v[k])));
}

/** `PUT /api/goals` gövdesini doğrular. İKİ şekil kabul edilir:
 *
 *  1) BUGÜNKÜ düz besin nesnesi:
 *     { kcal, protein, carbs, fat, fiber, sugar?, satFat?, sodium?, … }
 *  2) FAZ 8'in profil yapısı — henüz yazılmadı, ama backend'e ikinci kez
 *     dokunmak zorunda kalmamak için şimdiden kabul ediliyor:
 *     { version:2, profiles:[{id,name,nutrition}], defaultProfileId,
 *       weekday:{0..6 -> profileId}, overrides:{"YYYY-AA-GG" -> profileId} }
 *
 *  Eskiden gövde HİÇ kontrol edilmiyordu: boş bir `{}` kullanıcının tüm
 *  hedeflerini sessizce siliyordu.
 *  Dönüş: null = geçerli, metin = 400 mesajı. */
function goalsError(b) {
  if (!isPlainObject(b)) return "hedef gövdesi bir nesne olmalı";
  if (Object.keys(b).length === 0) return "boş hedef gövdesi kabul edilmiyor";

  // v2 profil yapısı mı? Üç ayırt edici alandan biri varsa öyle kabul edilir —
  // böylece yarım/bozuk bir v2 gövdesi sessizce "düz besin" sanılmaz.
  if ("version" in b || "profiles" in b || "defaultProfileId" in b) {
    if (b.version !== 2) return "desteklenmeyen hedef sürümü (yalnızca version:2)";
    if (!Array.isArray(b.profiles) || b.profiles.length === 0) return "profiles boş olmayan bir dizi olmalı";
    const ids = new Set();
    for (const pr of b.profiles) {
      if (!isPlainObject(pr)) return "her profil bir nesne olmalı";
      if (typeof pr.id !== "string" || !pr.id.trim()) return "profil id'si boş olmayan bir metin olmalı";
      if (typeof pr.name !== "string" || !pr.name.trim()) return "profil adı boş olmayan bir metin olmalı";
      if (!isNutritionLike(pr.nutrition)) return `"${pr.id}" profilinin nutrition alanı geçersiz`;
      ids.add(pr.id);
    }
    if (typeof b.defaultProfileId !== "string" || !ids.has(b.defaultProfileId))
      return "defaultProfileId var olan bir profili göstermeli";
    for (const field of ["weekday", "overrides"]) {
      if (b[field] === undefined) continue;
      if (!isPlainObject(b[field])) return `${field} bir nesne olmalı`;
      // Değerler profil id'si (metin) olmalı. Var olan bir profile İŞARET ETME
      // zorunluluğu BİLEREK yok: Faz 8, silinmiş bir profilin atamasını geçici
      // olarak taşıyabilmeli, yoksa kaydetme akışı kilitlenir.
      for (const v of Object.values(b[field]))
        if (typeof v !== "string") return `${field} değerleri profil id'si (metin) olmalı`;
    }
    return null;
  }

  if (!isNutritionLike(b))
    return "hedefler ya düz besin nesnesi (kcal/protein/carbs/fat/fiber…) ya da version:2 profil yapısı olmalı";
  return null;
}

/** Faz 5 birimleri: [{name:"adet", grams:50}]. Yalnızca bu iki alan saklanır. */
function normalizeUnits(v) {
  if (!Array.isArray(v)) throw new HttpError(400, "units bir dizi olmalı");
  if (v.length > 20) throw new HttpError(400, "en fazla 20 birim tanımlanabilir");
  return v.map((unit) => {
    if (!isPlainObject(unit)) throw new HttpError(400, "her birim bir nesne olmalı");
    const name = typeof unit.name === "string" ? unit.name.trim() : "";
    if (!name) throw new HttpError(400, "birim adı boş olamaz");
    const grams = Number(unit.grams);
    if (!Number.isFinite(grams) || grams <= 0)
      throw new HttpError(400, `"${name}" biriminin grams değeri pozitif bir sayı olmalı`);
    return { name, grams };
  });
}

/** Barkod / OFF ürün kimliği. OFF kodları rakamdır; yerel/özel kodlara pay
 *  bırakmak için harf, nokta, alt çizgi ve tire de kabul ediliyor. */
function normalizeCode(v, field) {
  const s = String(v).trim();
  if (!/^[0-9A-Za-z._-]{1,64}$/.test(s)) throw new HttpError(400, `${field} geçersiz`);
  return s;
}

/** Faz 7 tarifi: { ingredients:[…], totalG }.
 *  `ingredients` İÇERİĞİ bilerek doğrulanmıyor — malzeme şeklini Faz 7
 *  belirleyecek ve o yüzden backend'e ikinci kez dokunmak istemiyoruz. Dizi
 *  olması ve makul uzunlukta kalması yeterli. */
function normalizeRecipe(v) {
  if (!isPlainObject(v)) throw new HttpError(400, "recipe bir nesne olmalı");
  if (!Array.isArray(v.ingredients)) throw new HttpError(400, "recipe.ingredients bir dizi olmalı");
  if (v.ingredients.length > 200) throw new HttpError(400, "recipe en fazla 200 malzeme alabilir");
  const totalG = Number(v.totalG);
  if (!Number.isFinite(totalG) || totalG <= 0) throw new HttpError(400, "recipe.totalG pozitif bir sayı olmalı");
  return { ingredients: v.ingredients, totalG };
}

// BİLEREK KAPSAMSIZ — unutulmuş değil. Bu sorgu yeni bir id üretirken çakışma
// arıyor; id'lerin TÜM kullanıcılar arasında benzersiz olması gerekiyor, çünkü
// `aliases.id` hâlâ tekil birincil anahtar (göç sırasında bu tabloyu yeniden
// yaratmamamızın sebebi de buydu). Kullanıcıya kapsamlansaydı iki kullanıcı aynı
// id'yi alabilir ve ikincisinin yazması birincisininkini ezerdi.
const aliasExists = db.prepare("SELECT 1 FROM aliases WHERE id = ?");

/** Yeni alias kimliği.
 *  Eski üretici `a_${Date.now().toString(36)}` idi: aynı MİLİSANİYE içindeki iki
 *  oluşturma AYNI id'yi veriyor, `ON CONFLICT DO UPDATE` de ikincisini
 *  birincinin üstüne SESSİZCE yazıyordu (ilk alias kayboluyordu). Artık
 *  rastgele son ek + gerçek varlık kontrolü var. */
function newAliasId() {
  for (let i = 0; i < 12; i++) {
    const id = `a_${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
    if (!aliasExists.get(id)) return id;
  }
  throw new HttpError(500, "benzersiz alias id üretilemedi");
}

// ============================================================================
// Open Food Facts proxy'si
// ----------------------------------------------------------------------------
// NEDEN SUNUCUDA? OFF, uygulamayı tanıtan ÖZEL bir `User-Agent` başlığı
// zorunlu tutuyor ve tarayıcı `fetch`'i bu başlığı AYARLAYAMAZ. Üstelik hız
// sınırı IP başına işliyor; aşılırsa IP banlanıyor. Bu yüzden önbellek ve
// jeton kovası isteğe bağlı süsleme değil, zorunlu koruma.
// Node 22+ küresel `fetch` ile geliyor — yeni bağımlılık YOK.
// ============================================================================
const OFF_TIMEOUT_MS = 8000;
const OFF_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 saat
const OFF_MISS_TTL_MS = 10 * 60 * 1000; // "ürün yok" daha kısa yaşar: kullanıcı OFF'a ekleyebilir
const OFF_CACHE_MAX = 500; // uzun ömürlü süreçte sınırsız büyümesin
const OFF_PL_TAG = "en:poland";

// Hız sınırları ve temel adresler env ile ezilebilir — YALNIZCA test içindir
// (429 yolunu ve "OFF çökmüş" yolunu gerçek kotayı yakmadan sınayabilmek için).
const OFF_RATE_PRODUCT = Number(process.env.NUTRI_OFF_RATE_PRODUCT || 15);
const OFF_RATE_SEARCH = Number(process.env.NUTRI_OFF_RATE_SEARCH || 10);
const OFF_PRODUCT_BASE = process.env.NUTRI_OFF_PRODUCT_BASE || "https://world.openfoodfacts.org";
const OFF_SEARCH_BASE = process.env.NUTRI_OFF_SEARCH_BASE || "https://search.openfoodfacts.org";

const OFF_PRODUCT_FIELDS =
  "code,product_name,product_name_pl,brands,quantity,serving_size,nutriments,image_small_url,countries_tags";
const OFF_SEARCH_FIELDS = "code,product_name,brands,quantity,nutriments,image_small_url,countries_tags";

// --- Bellek içi önbellek (LRU + TTL) ---
const offCache = new Map();
let offUpstreamCalls = 0;

function cacheGet(key) {
  const hit = offCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.exp) {
    offCache.delete(key);
    return null;
  }
  offCache.delete(key); // LRU: en son kullanılanı sona taşı
  offCache.set(key, hit);
  return hit.value;
}
function cacheSet(key, value, ttl = OFF_CACHE_TTL_MS) {
  offCache.delete(key);
  offCache.set(key, { value, exp: Date.now() + ttl });
  // Map ekleme sırasını korur: baştaki = en eski kullanılan.
  while (offCache.size > OFF_CACHE_MAX) offCache.delete(offCache.keys().next().value);
}

// --- Jeton kovası: dakikada `perMin` istek, `perMin` kadar da patlama payı ---
// OFF'un yayımladığı sınırlar: ürün 15/dk, arama 10/dk (IP başına).
function makeBucket(perMin) {
  return { tokens: perMin, cap: perMin, perMs: perMin / 60000, last: Date.now() };
}
const offBuckets = { product: makeBucket(OFF_RATE_PRODUCT), search: makeBucket(OFF_RATE_SEARCH) };

function peekTokens(b) {
  const now = Date.now();
  b.tokens = Math.min(b.cap, b.tokens + (now - b.last) * b.perMs);
  b.last = now;
  return b.tokens;
}
/** 0 = izin verildi; >0 = kaç saniye sonra tekrar denenmeli. */
function takeToken(b) {
  if (peekTokens(b) < 1) return Math.max(1, Math.ceil((1 - b.tokens) / b.perMs / 1000));
  b.tokens -= 1;
  return 0;
}

/** OFF'a tek istek: kota → zaman aşımı → JSON olmayan yanıt, hepsi TEMİZ JSON
 *  hataya çevrilir. Hiçbir koşulda askıda kalmaz ya da yakalanmamış promise
 *  reddi üretmez. */
async function offFetch(url, kind) {
  const wait = takeToken(offBuckets[kind]);
  if (wait > 0)
    throw new HttpError(429, `Open Food Facts hız sınırı korunuyor; ${wait} sn sonra tekrar deneyin`, {
      retryAfter: wait,
    });

  offUpstreamCalls++;
  let r;
  let text;
  try {
    r = await fetch(url, {
      headers: { "User-Agent": OFF_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(OFF_TIMEOUT_MS),
    });
    text = await r.text();
  } catch (e) {
    const timedOut = e && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new HttpError(
      504,
      timedOut ? "Open Food Facts zaman aşımına uğradı" : `Open Food Facts'e ulaşılamadı: ${(e && e.message) || e}`,
    );
  }

  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* aşağıda ele alınıyor */
  }
  // OFF arıza anında JSON değil HTML hata sayfası döndürüyor (kullanımdan
  // kalkan cgi/search.pl 503'te tam olarak bunu yapıyor). Sayfa gövdesi ASLA
  // istemciye sızdırılmaz.
  if (!json) throw new HttpError(502, `Open Food Facts JSON yerine HTTP ${r.status} döndürdü (${text.length} bayt)`);
  // 404 geçerli bir cevap: "ürün bulunamadı".
  if (!r.ok && r.status !== 404) throw new HttpError(502, `Open Food Facts hatası: HTTP ${r.status}`);
  return json;
}

/** Kullanıcı metnini OFF sorgu diline sokmadan önce temizler.
 *
 *  NEDEN ŞART: search-a-licious sorguyu ayrıştıramazsa SESSİZCE tüm metni
 *  serbest metin sayıyor — ve o an `countries_tags:"en:poland"` süzgeci de
 *  metnin İÇİNDE kalıp tamamen ETKİSİZLEŞİYOR. Yani tek bir kaçak tırnak
 *  Polonya kapsamasını sessizce kapatıyor. Deneyle doğrulandı: `skyr" OR (`
 *  girdisi Kanada, İtalya ve ABD ürünleri döndürdü. */
function sanitizeSearch(raw) {
  return String(raw ?? "")
    .replace(/[+\-=&|><!(){}\[\]^"~*?:\\/]/g, " ")
    .split(/\s+/)
    // Lucene anahtar sözcükleri yalnızca BÜYÜK harfliyken operatördür; küçük
    // harfli "to"/"or" gerçek kelime olabilir, onlara dokunulmuyor.
    .filter((w) => w && !/^(AND|OR|NOT|TO)$/.test(w))
    .slice(0, 8)
    .join(" ");
}

async function offSearch(terms, limit) {
  // TEK terim: süzgeci sorgunun içine koyabiliyoruz; OFF dizininin TAMAMINDA
  // Polonya kapsaması olur (derin sonuç + doğru toplam).
  // ÇOK terim: aynı numara ayrıştırıcıda bozuluyor (deneyle: `twaróg chudy AND
  // countries_tags:"en:poland"` → 0 sonuç), bu yüzden serbest metin gönderip
  // fazladan çekiyor ve Polonya'ya göre BURADA süzüyoruz.
  const single = !terms.includes(" ");
  const url = new URL(`${OFF_SEARCH_BASE}/search`);
  url.searchParams.set("q", single ? `${terms} AND countries_tags:"${OFF_PL_TAG}"` : terms);
  url.searchParams.set("fields", OFF_SEARCH_FIELDS);
  url.searchParams.set("page_size", String(single ? limit : Math.min(100, limit * 5)));

  const json = await offFetch(url, "search");

  // SON SAVUNMA: yukarıdaki iki yol da bozulsa bile Polonya kapsaması burada,
  // VERİNİN KENDİSİNDEN doğrulanıyor. Kapsama artık sorgu diline emanet değil.
  const products = (Array.isArray(json.hits) ? json.hits : [])
    .filter((h) => Array.isArray(h.countries_tags) && h.countries_tags.includes(OFF_PL_TAG))
    .slice(0, limit);

  return {
    ok: true,
    query: terms,
    scope: single ? "index" : "post-filter",
    count: products.length,
    upstreamCount: typeof json.count === "number" ? json.count : null,
    products,
  };
}

async function offProduct(barcode) {
  const url = new URL(`${OFF_PRODUCT_BASE}/api/v2/product/${barcode}.json`);
  url.searchParams.set("fields", OFF_PRODUCT_FIELDS);
  const json = await offFetch(url, "product");
  const found = json.status === 1 && isPlainObject(json.product);
  return { ok: true, found, barcode, product: found ? json.product : null };
}

// ============================================================================

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const p = u.pathname;
  const uid = currentUserId(req);
  try {
    // Tüm kimlik uçları TEK bir önek bloğundan geçiyor. Bu şekilde yazılmasının
    // sebebi: Google girişi (Faz H) iki uç daha ekleyecek ve index.js'e SIFIR
    // satır eklemesi gerekecek. `handleAuth` asla throw etmez, `{status, body,
    // headers?}` döner; `send()` zaten bir headers nesnesi alıyor.
    if (p.startsWith("/api/auth/")) {
      const r = await authRoutes.handleAuth({ db, req, method: req.method, path: p, readBody });
      return send(res, r.status, r.body, r.headers);
    }

    // OTURUM KAPISI. `uid` yalnızca bayrak AÇIKKEN ve geçerli oturum YOKKEN
    // null olur; bayrak kapalıyken bu satır hiçbir şey yapmaz.
    // Kapı, kimlik uçlarından SONRA: giriş yapabilmek için giriş ucuna
    // oturumsuz erişebilmek gerekiyor.
    if (uid === null && !PUBLIC_PATHS.has(p)) {
      return send(res, 401, { error: "oturum gerekli" });
    }

    if (req.method === "GET" && p === "/api/data")
      return send(res, 200, {
        goals: getGoals(uid),
        days: getDays(uid),
        aliases: getAliases(uid),
        config: getConfig(uid),
      });

    if (req.method === "POST" && p === "/api/ai/parse") {
      const b = await readBody(req);
      // Besin hafızası isteme giriyor — kullanıcıya özel olmak ZORUNDA, yoksa
      // AI bir kullanıcının besinlerini diğerine önerirdi.
      const { status, body } = await parseMealText({ text: b.text, aliases: getAliases(uid) });
      return send(res, status, body);
    }
    if (req.method === "POST" && p === "/api/ai/vision") {
      const b = await readBody(req);
      const { status, body } = await parseMealImage({
        imageBase64: b.image,
        mimeType: b.mimeType,
        mode: b.mode,
        aliases: getAliases(uid),
      });
      return send(res, status, body);
    }
    if (req.method === "GET" && p === "/api/health")
      return send(res, 200, {
        ok: true,
        // Faz 3b canlıda OFF kotasını yakmadan proxy'nin durumunu görebilsin diye.
        off: {
          cached: offCache.size,
          upstreamCalls: offUpstreamCalls,
          tokens: { product: Math.floor(peekTokens(offBuckets.product)), search: Math.floor(peekTokens(offBuckets.search)) },
        },
      });

    if (req.method === "POST" && p === "/api/day") {
      const b = await readBody(req);
      if (!b.date || !Array.isArray(b.meals)) return send(res, 400, { error: "date + meals[] gerekli" });
      db.prepare(
        "INSERT INTO days(user_id, date, meals) VALUES(?, ?, ?) ON CONFLICT(user_id, date) DO UPDATE SET meals = excluded.meals",
      ).run(uid, b.date, JSON.stringify(b.meals));
      return send(res, 200, { ok: true, date: b.date });
    }
    if (req.method === "DELETE" && p.startsWith("/api/day/")) {
      const date = decodeURIComponent(p.slice("/api/day/".length));
      db.prepare("DELETE FROM days WHERE user_id = ? AND date = ?").run(uid, date);
      return send(res, 200, { ok: true, date });
    }
    if (req.method === "PUT" && p === "/api/goals") {
      const b = await readBody(req);
      const bad = goalsError(b);
      if (bad) return send(res, 400, { error: bad });
      // Doğrulanan gövde OLDUĞU GİBİ saklanır: blob tasarımı bilerek geçirgen,
      // ileride eklenecek besinler ve Faz 8 alanları backend'e dokunmadan geçer.
      db.prepare(
        "INSERT INTO config(user_id, key, value) VALUES(?, 'goals', ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
      ).run(uid, JSON.stringify(b));
      return send(res, 200, { ok: true });
    }
    if (req.method === "GET" && p.startsWith("/api/config/")) {
      const key = decodeURIComponent(p.slice("/api/config/".length));
      if (!CONFIG_KEY_PATTERN.test(key)) return send(res, 400, { error: "geçersiz config anahtarı" });
      if (RESERVED_CONFIG_KEYS.has(key))
        return send(res, 400, { error: `"${key}" ayrılmış bir anahtar, bu uçtan erişilemez` });
      const row = db.prepare("SELECT value FROM config WHERE user_id = ? AND key = ?").get(uid, key);
      let value = null;
      if (row) {
        try {
          const parsed = JSON.parse(row.value);
          value = isPlainObject(parsed) ? parsed : null;
        } catch {
          value = null;
        }
      }
      return send(res, 200, { ok: true, key, value });
    }
    if (req.method === "PUT" && p.startsWith("/api/config/")) {
      const key = decodeURIComponent(p.slice("/api/config/".length));
      if (!CONFIG_KEY_PATTERN.test(key)) return send(res, 400, { error: "geçersiz config anahtarı" });
      if (RESERVED_CONFIG_KEYS.has(key))
        return send(res, 400, { error: `"${key}" ayrılmış bir anahtar, bu uçtan yazılamaz` });
      const b = await readBody(req);
      if (!isPlainObject(b)) return send(res, 400, { error: "config değeri bir nesne olmalı" });
      db.prepare(
        "INSERT INTO config(user_id, key, value) VALUES(?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value",
      ).run(uid, key, JSON.stringify(b));
      return send(res, 200, { ok: true, key });
    }

    if (req.method === "POST" && p === "/api/alias") {
      const b = await readBody(req);
      if (!Array.isArray(b.triggers) || b.triggers.length === 0 || !b.name || !b.nutrition)
        return send(res, 400, { error: "triggers[], name, nutrition gerekli" });

      const isUpdate = typeof b.id === "string" && b.id.length > 0;
      const id = isUpdate ? b.id : newAliasId();

      // Güncellemede, GÖVDEDE BULUNMAYAN yeni alanlar KORUNUR. Gerekçe: barkod,
      // birim ya da tarif taşıyan bir alias'ı bu alanları göndermeyen eski bir
      // istemci kaydederse veri sessizce silinirdi. Alanı temizlemek için açıkça
      // `null` (units için `[]`) gönderilir.
      let prev = {};
      if (isUpdate) {
        // SAHİPLİK KAPISI: id'ler tahmin edilebilir olmasa da, kapsamsız bir
        // güncelleme başka bir kullanıcının besinini id'sini bilerek EZMEYE
        // izin verirdi. Kayıt yoksa ya da başkasınınsa 404 — "var ama senin
        // değil" ile "hiç yok" arasındaki farkı da sızdırmıyoruz.
        const row = db.prepare("SELECT data FROM aliases WHERE user_id = ? AND id = ?").get(uid, id);
        if (!row) return send(res, 404, { error: "besin bulunamadı" });
        try {
          prev = JSON.parse(row.data) || {};
        } catch {
          prev = {};
        }
      }

      // Uç NORMALLEŞTİRİCİ kalıyor: alanlar tek tek yazılıyor, bilinmeyen
      // anahtarlar (körlemesine `...b` yayılımı YOK) düşürülüyor.
      const data = {
        triggers: b.triggers,
        name: b.name,
        brand: b.brand ?? null,
        serving_g: b.serving_g ?? 100,
        nutrition: b.nutrition,
      };

      // --- Faz 4/5/7 alanları: doğrula, gövdede yoksa öncekini taşı ---------
      const carry = (key, normalize) => {
        if (!(key in b)) {
          if (prev[key] !== undefined) data[key] = prev[key];
          return;
        }
        if (b[key] === null || b[key] === undefined) return; // açık temizleme
        data[key] = normalize(b[key]);
      };
      carry("units", normalizeUnits); // Faz 5
      carry("barcode", (v) => normalizeCode(v, "barcode")); // Faz 4
      carry("off_id", (v) => normalizeCode(v, "off_id")); // Faz 4
      carry("recipe", normalizeRecipe); // Faz 7

      // `WHERE aliases.user_id = excluded.user_id`: yukarıdaki sahiplik kapısına
      // ek ikinci savunma. Bir yol onu atlasa bile başkasının satırı EZİLMEZ.
      db.prepare(
        "INSERT INTO aliases(id, data, user_id) VALUES(?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data WHERE aliases.user_id = excluded.user_id",
      ).run(id, JSON.stringify(data), uid);
      return send(res, 200, { ok: true, id });
    }
    if (req.method === "DELETE" && p.startsWith("/api/alias/")) {
      const id = decodeURIComponent(p.slice("/api/alias/".length));
      db.prepare("DELETE FROM aliases WHERE user_id = ? AND id = ?").run(uid, id);
      return send(res, 200, { ok: true, id });
    }

    // --- Open Food Facts proxy'si (önbellek isteği kotadan ÖNCE karşılar) ---
    if (req.method === "GET" && p.startsWith("/api/off/product/")) {
      const barcode = decodeURIComponent(p.slice("/api/off/product/".length)).trim();
      if (!/^[0-9]{4,20}$/.test(barcode)) return send(res, 400, { error: "barkod 4-20 hanelik bir sayı olmalı" });
      const key = `product:${barcode}`;
      const hit = cacheGet(key);
      if (hit) return send(res, 200, { ...hit, cached: true });
      const payload = await offProduct(barcode);
      cacheSet(key, payload, payload.found ? OFF_CACHE_TTL_MS : OFF_MISS_TTL_MS);
      return send(res, 200, { ...payload, cached: false });
    }
    if (req.method === "GET" && p === "/api/off/search") {
      const terms = sanitizeSearch(u.searchParams.get("q"));
      if (!terms) return send(res, 400, { error: "arama terimi (q) gerekli" });
      const limit = Math.min(Math.max(Math.trunc(Number(u.searchParams.get("limit"))) || 20, 1), 50);
      const key = `search:${terms}:${limit}`;
      const hit = cacheGet(key);
      if (hit) return send(res, 200, { ...hit, cached: true });
      const payload = await offSearch(terms, limit);
      cacheSet(key, payload);
      return send(res, 200, { ...payload, cached: false });
    }

    return send(res, 404, { error: "bulunamadı" });
  } catch (e) {
    const code = e instanceof HttpError ? e.code : 500;
    const headers = {};
    // 413'te bağlantı kapatılır: istemci kalan gövdeyi yüklemeye devam etmesin.
    if (code === 413) headers.Connection = "close";
    if (code === 429 && e.extra && e.extra.retryAfter) headers["Retry-After"] = String(e.extra.retryAfter);
    return send(res, code, { error: String((e && e.message) || e), ...(e && e.extra) }, headers);
  }
});

server.listen(PORT, "127.0.0.1", () => console.log(`nutri-api dinliyor :${PORT}  db=${DB_PATH}`));
