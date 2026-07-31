import type { Alias } from "../types";

/** Türkçe karakter duyarsız küçük harfe çevirme */
export function normalizeTr(text: string): string {
  return text.toLocaleLowerCase("tr");
}

/**
 * Besin listesini arama sorgusuna göre filtreler.
 * Ad (name), marka (brand) ve tetikleyiciler (triggers) üzerinde Türkçe karakter duyarsız arama yapar.
 */
export function filterAliases(aliases: Alias[], query: string): Alias[] {
  const q = normalizeTr(query.trim());
  if (!q) return aliases;

  return aliases.filter((alias) => {
    if (normalizeTr(alias.name).includes(q)) return true;
    if (alias.brand && normalizeTr(alias.brand).includes(q)) return true;
    if (alias.triggers.some((trigger) => normalizeTr(trigger).includes(q))) return true;
    return false;
  });
}
