import { Card } from "./Card";
import { useTranslation } from "react-i18next";

interface SkeletonProps {
  className?: string;
}

/** Şekilsiz yükleniyor bloğu — boyutunu/köşe yuvarlaklığını `className` belirler.
 *  `.skeleton` (index.css) shimmer animasyonunu taşır; `prefers-reduced-motion`de
 *  global `*::after` kuralı shimmer'ı otomatik durdurur, burada ayrıca bir şey
 *  yapmaya gerek yok. */
export function Skeleton({ className = "" }: SkeletonProps) {
  return <div aria-hidden="true" className={`skeleton bg-white/[0.06] ${className}`} />;
}

export function SkeletonCircle({ className = "" }: SkeletonProps) {
  return <div aria-hidden="true" className={`skeleton rounded-full bg-white/[0.06] ${className}`} />;
}

/** Uygulama kabuğu + Bugün ekranının iskeleti — `DataProvider` ilk veriyi
 *  çekerken gösterilir. Chrome'u (header + sekme pilleri) DA çizer: yoksa
 *  yükleme sırasında ekran tamamen boş kalır, veri gelince her şey birden
 *  "pat" diye belirir (kötü ilk izlenim). Gerçek `Card` konteynerleri
 *  KORUNUR, yalnızca içerik satırları sahte (`Skeleton`) — kenarlık/gölge
 *  sıçramasın diye. */
export function AppSkeleton() {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="mx-auto w-full max-w-md px-5 py-6 pad-safe sm:px-6 md:max-w-5xl md:px-10 md:py-10"
    >
      <span className="sr-only">{t("common.loading")}</span>

      <div className="mb-5 flex flex-col gap-3 sm:mb-7 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-center justify-between sm:justify-start sm:gap-4">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="hidden h-3 w-24 rounded-chip sm:block" />
            <Skeleton className="h-6 w-32 rounded-chip" />
          </div>
          <SkeletonCircle className="h-9 w-9" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-20 rounded-pill" />
          <Skeleton className="h-9 w-20 rounded-pill" />
          <Skeleton className="h-9 w-20 rounded-pill" />
        </div>
      </div>

      <div className="flex flex-col gap-6 sm:gap-8">
        <Skeleton className="h-5 w-32 rounded-chip" />

        <Card className="flex items-center justify-center px-4 py-7 sm:py-9">
          <SkeletonCircle className="h-[208px] w-[208px] sm:h-[240px] sm:w-[240px]" />
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <Skeleton className="h-6 w-full rounded-chip" />
          <Skeleton className="h-6 w-full rounded-chip" />
          <Skeleton className="h-6 w-full rounded-chip" />
          <Skeleton className="h-6 w-full rounded-chip" />
        </Card>

        <div className="flex flex-col gap-3">
          <Skeleton className="h-5 w-28 rounded-chip" />
          <div className="flex flex-col gap-2.5 sm:gap-3">
            <Skeleton className="h-16 w-full rounded-chip" />
            <Skeleton className="h-16 w-full rounded-chip" />
            <Skeleton className="h-16 w-full rounded-chip" />
          </div>
        </div>
      </div>
    </div>
  );
}
