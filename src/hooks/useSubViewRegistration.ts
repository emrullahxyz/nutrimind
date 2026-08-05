import { useEffect } from "react";
import { enterSubView, exitSubView } from "../lib/subViewRegistry";

/**
 * Bir bileşenin şu an gömülü bir alt-görünüm (Ayarlar > Profil, Geçmiş >
 * hafta/gün gibi) gösterdiğini paylaşılan kayıt defterine bildirir — bkz.
 * `../lib/subViewRegistry` başındaki not. App.tsx'in global geri-tuşu
 * dinleyicisi bunu okuyarak "az önce bir alt-görünümden mi çıkıldı" sorusunu
 * yanıtlar ve sahte çıkış toast'ını bastırır.
 */
export function useSubViewRegistration(isActive: boolean) {
  useEffect(() => {
    if (!isActive) return;
    enterSubView();
    return () => exitSubView();
  }, [isActive]);
}
