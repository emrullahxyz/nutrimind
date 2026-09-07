// server/meals.js — /api/day gövde doğrulayıcısı. İzole modül sözleşmesi:
// asla throw etmez; düzgünse {ok:true, meals}, değilse {ok:false, error}.
"use strict";

const MAX_MEALS = 50;
const MAX_NAME_LEN = 200;

function capString(v, max) {
  if (typeof v !== "string") return "";
  return v.length > max ? v.slice(0, max) : v;
}

/** Öğün listesini doğrular. Öğelerin iç şeması bilerek serbest (besinler
 *  ileride genişleyebilir); yalnızca yapısal sınırlar uygulanır:
 *  (a) her öğe bir nesne olmalı (dizi/string/primitive değil),
 *  (b) öğe sayısı ve ad uzunluğu sınırlı.
 *  Çok büyük içerik zaten index.js'teki 1MB gövde sınırıyla kesilir. */
function normalizeMeals(raw) {
  if (!Array.isArray(raw)) return { ok: false, error: "meals bir dizi olmalı" };
  if (raw.length > MAX_MEALS) return { ok: false, error: `en fazla ${MAX_MEALS} öğün kaydedilebilir` };
  for (const item of raw) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: "her öğün bir nesne olmalı" };
    }
    if (typeof item.name === "string") item.name = capString(item.name, MAX_NAME_LEN);
  }
  return { ok: true, meals: raw };
}

module.exports = { normalizeMeals, MAX_MEALS };
