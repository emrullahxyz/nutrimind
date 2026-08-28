// ============================================================================
// Nutrimind — tarayıcı çevrimdışı mı? (tek soruluk yardımcı)
//
// `navigator.onLine` yalnızca tarayıcıda anlamlıdır; Node 22'de tanımsızdır.
// Yalnızca KESİN `false` çevrimdışı sayılır — `undefined ≠ offline` — aksi
// halde Node test ortamındaki her istek çevrimdışı sanılırdı.
// ============================================================================

export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}