// ============================================================================
// Nutrimind — trend grafiği. Elle yazılmış SVG, yeni bağımlılık YOK.
//
// Neden HİBRİT (geometri SVG, metin HTML):
// viewBox 720×260 sabit ve grafik `w-full` ile kabına göre ölçekleniyor. SVG
// içindeki `font-size` de kullanıcı biriminde olduğu için mobilde (~0.45 ölçek)
// 10 birimlik bir etiket gerçek 4,5 piksele düşer — okunmaz. Bu yüzden çizgi,
// daire ve dolgular SVG'de; TÜM METİN, SVG'nin üstüne yüzde koordinatlarla
// oturan bir HTML katmanında (gerçek piksel, gerçek Tailwind sınıfı). Aynı desen
// zaten WeekBars'ta var: oradaki hedef etiketi de HTML.
//
// Grafiğin asıl kahramanı ham günlük değerler değil, 7 GÜNLÜK ORTALAMA çizgisi.
// Ham değerler okunamayacak kadar gürültülü; onlar arka planda soluk kalır.
// ============================================================================
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { formatNumber, formatShortDate, weekdayShort } from "../lib/format";
import { formatNutrientValue } from "../lib/trend";
import type { TrendSeries } from "../lib/trend";
import type { NutrientDef } from "../lib/nutrients";

const W = 720;
const H = 260;
const PAD = { l: 44, r: 12, t: 16, b: 28 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;
const BASE_Y = PAD.t + PLOT_H;

/** Bundan fazla veri noktası varsa daireler birbirine girer → soluk ince çizgi.
 *  (90 günlük dolu bir aralıkta 90 daire okunabilirliği bitiriyor.) */
const DOT_LIMIT = 45;
/** Hedeflenen yatay kılavuz sayısı — "yuvarlak adım" sonrası 3–5 çizgi çıkar. */
const Y_TICK_TARGET = 4;
/** Tooltip bu orandan sağdaysa sola açılır (viewBox dışına taşmasın). */
const TOOLTIP_FLIP_AT = 0.62;

type Run = { i: number; v: number }[];

/** Değer dizisini `null` koşularında KOPAN parçalara böler.
 *  Boşluğun üstünden düz çizgi çekmek iki haftalık bir deliği "sabit gitmiş"
 *  gibi gösterirdi — grafiğin söyleyebileceği en büyük yalan bu. */
function runsOf(values: readonly (number | null)[]): Run[] {
  const out: Run[] = [];
  let run: Run = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (run.length) out.push(run);
      run = [];
    } else {
      run.push({ i, v });
    }
  });
  if (run.length) out.push(run);
  return out;
}

/** 0'dan yMax'a "yuvarlak" adımlı kılavuz değerleri (1 / 2 / 2,5 / 5 × 10ⁿ). */
function niceTicks(yMax: number, target: number): { values: number[]; step: number } {
  const raw = yMax / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const values: number[] = [];
  for (let v = 0; v <= yMax + step * 1e-6; v += step) values.push(v);
  return { values, step };
}

/** 0 ve n-1 dahil, eşit aralıklı etiket indeksleri. Sayı sınırlı tutulur ki
 *  mobilde tarih etiketleri birbirinin üstüne binmesin. */
function tickIndices(n: number, count: number): number[] {
  if (n <= 1) return [0];
  const c = Math.max(2, Math.min(count, n));
  const out: number[] = [];
  for (let k = 0; k < c; k++) out.push(Math.round((k * (n - 1)) / (c - 1)));
  return [...new Set(out)];
}

/** Ortalama çizgisi. `src/index.css`'teki `drawIn` keyframe'i `--len` özelliğini
 *  okuyor; uzunluk ancak DOM'da ölçülebildiği için hem `--len` hem dasharray
 *  ölçümden sonra yazılır ve animasyon elle YENİDEN tetiklenir — yaşayan bir
 *  elemanın stilini değiştirmek animasyonu baştan başlatmaz. */
function DrawnLine({ d, color }: { d: string; color: string }) {
  const ref = useRef<SVGPathElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.getTotalLength !== "function") return;
    const len = el.getTotalLength();
    if (!Number.isFinite(len) || len <= 0) return;
    el.style.setProperty("--len", String(len));
    el.style.strokeDasharray = String(len);
    el.style.animation = "none";
    void el.getBoundingClientRect(); // reflow — sıradaki atama animasyonu baştan oynatır
    el.style.animation = "drawIn 1.15s cubic-bezier(0.33, 1, 0.68, 1) backwards";
  }, [d]);

  return (
    <path
      ref={ref}
      d={d}
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export function TrendChart({ series, def }: { series: TrendSeries; def: NutrientDef }) {
  const points = series.points;
  const n = points.length;
  const [active, setActive] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Aynı sayfada birden fazla grafik olursa gradyan id'leri çakışmasın.
  const gradId = `trend-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const geo = useMemo(() => {
    // n === 1 iken (n-1) sıfır olur; tek nokta ortaya konur.
    const gx = (i: number) => (n <= 1 ? PAD.l + PLOT_W / 2 : PAD.l + (i * PLOT_W) / (n - 1));
    const gy = (v: number) => PAD.t + (1 - v / series.yMax) * PLOT_H;
    const at = (r: Run) =>
      r
        .map((p, k) => `${k === 0 ? "M" : "L"}${gx(p.i).toFixed(2)} ${gy(p.v).toFixed(2)}`)
        .join(" ");

    const avgRuns = runsOf(points.map((p) => p.avg));
    const avgLines = avgRuns.filter((r) => r.length > 1).map(at);
    // Tek başına kalmış ortalama noktası çizgi olamaz — daire olarak görünür.
    const avgSolo = avgRuns
      .filter((r) => r.length === 1)
      .map((r) => ({ cx: gx(r[0].i), cy: gy(r[0].v) }));
    const avgAreas = avgRuns
      .filter((r) => r.length > 1)
      .map(
        (r) =>
          `${at(r)} L${gx(r[r.length - 1].i).toFixed(2)} ${BASE_Y} L${gx(r[0].i).toFixed(2)} ${BASE_Y} Z`,
      );

    const rawRuns = runsOf(points.map((p) => p.value));
    const dots = points.flatMap((p, i) =>
      p.value === null ? [] : [{ i, cx: gx(i), cy: gy(p.value) }],
    );
    const rawLines = rawRuns.filter((r) => r.length > 1).map(at);

    return { gx, gy, avgLines, avgAreas, avgSolo, dots, rawLines };
  }, [points, series.yMax, n]);

  const yTicks = useMemo(() => niceTicks(series.yMax, Y_TICK_TARGET), [series.yMax]);
  // Eksende "50,0" gibi yapay ondalık istemiyoruz: hassasiyet ancak adım
  // 1'in altına inince (mikro besinler) anlam kazanır.
  const tickDecimals = yTicks.step < 1 ? def.decimals : 0;

  const xTicks = useMemo(() => tickIndices(n, n <= 10 ? 4 : 5), [n]);
  // "Tümü" aralığı yıl atlayabiliyor; o zaman tarihler yılsız okunmaz olur.
  const spansYears = n > 1 && points[0].date.slice(0, 4) !== points[n - 1].date.slice(0, 4);
  const xLabel = (iso: string) =>
    spansYears ? `${formatShortDate(iso)} ${iso.slice(2, 4)}` : formatShortDate(iso);

  // --- Seyrek veri: boş bir koordinat sistemi çizmenin anlamı yok -----------
  if (series.dataCount < 2) {
    return (
      <div className="grid min-h-[160px] place-items-center rounded-2xl border border-dashed border-line bg-app/50 px-6 py-8 text-center">
        <div>
          <p className="text-sm font-bold text-ink-secondary">
            Trend için en az 2 günlük veri gerekiyor
          </p>
          <p className="mt-1 text-[11px] text-ink-tertiary">
            {series.dataCount === 0
              ? "Bu aralıkta hiç kayıt yok — daha geniş bir aralık seç."
              : "Bu aralıkta yalnızca 1 kayıtlı gün var."}
          </p>
        </div>
      </div>
    );
  }

  /** Yüzde koordinatlar: HTML katmanı SVG ile birebir aynı kutuyu kapladığı için
   *  kullanıcı birimi → yüzde dönüşümü ölçekten bağımsız doğru kalır. */
  const px = (ux: number) => `${(ux / W) * 100}%`;
  const py = (uy: number) => `${(uy / H) * 100}%`;

  /** İşaretçinin x'inden en yakın gün indeksi. Nokta başına görünmez `<rect>`
   *  koymak yerine tek hesap: 90 noktada da aynı maliyet. */
  function indexAt(clientX: number): number | null {
    const el = wrapRef.current;
    if (!el || n === 0) return null;
    if (n === 1) return 0;
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return null;
    const ux = ((clientX - r.left) / r.width) * W;
    const i = Math.round(((ux - PAD.l) / PLOT_W) * (n - 1));
    return Math.min(n - 1, Math.max(0, i));
  }

  const act = active !== null && active < n ? points[active] : null;
  const actX = act ? geo.gx(active!) : 0;
  const flip = actX > PAD.l + PLOT_W * TOOLTIP_FLIP_AT;
  // Nokta yukarıdaysa tooltip aşağı iner; kutu değerin üstünü kapatmasın.
  const actTop = act
    ? Math.min(act.value !== null ? geo.gy(act.value) : H, act.avg !== null ? geo.gy(act.avg) : H)
    : H;
  const tipTop = actTop < PAD.t + PLOT_H * 0.5 ? BASE_Y - 74 : PAD.t + 4;

  const goalY = series.goal !== null ? geo.gy(series.goal) : null;

  return (
    <div
      ref={wrapRef}
      className="relative touch-pan-y select-none"
      onPointerDown={(e) => setActive(indexAt(e.clientX))}
      onPointerMove={(e) => setActive(indexAt(e.clientX))}
      onPointerLeave={(e) => {
        // Dokunmada parmak kalkınca da `pointerleave` gelir; tap ile açılan
        // tooltip'in hemen kapanmaması için yalnızca fare için temizlenir.
        if (e.pointerType === "mouse") setActive(null);
      }}
      onPointerCancel={() => setActive(null)}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={`${def.label} trendi — ${n} gün, ${series.dataCount} günde kayıt var`}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={def.hex} stopOpacity="0.25" />
            <stop offset="100%" stopColor={def.hex} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* yatay kılavuzlar */}
        {yTicks.values.map((t) => (
          <line
            key={t}
            x1={PAD.l}
            x2={W - PAD.r}
            y1={geo.gy(t)}
            y2={geo.gy(t)}
            className={t === 0 ? "stroke-white/[0.14]" : "stroke-white/[0.06]"}
            strokeWidth={1}
          />
        ))}

        {/* hedef çizgisi — deseni WeekBars'tan (kesikli teal + sağda etiket) */}
        {goalY !== null && (
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={goalY}
            y2={goalY}
            className="stroke-teal-400/45"
            strokeWidth={1.25}
            strokeDasharray="6 5"
          />
        )}

        {/* ortalamanın altındaki yumuşak alan (boşluklarda o da kopuyor) */}
        {geo.avgAreas.map((d, i) => (
          <path key={`a${i}-${d.length}`} d={d} fill={`url(#${gradId})`} className="anim-fadeup" />
        ))}

        {/* ham günlük değerler — yoğun aralıkta daire yerine soluk ince çizgi */}
        {geo.dots.length > DOT_LIMIT
          ? geo.rawLines.map((d, i) => (
              <path
                key={`r${i}-${d.length}`}
                d={d}
                fill="none"
                stroke={def.hex}
                strokeOpacity={0.28}
                strokeWidth={1}
                strokeLinejoin="round"
              />
            ))
          : geo.dots.map((p) => (
              <circle key={p.i} cx={p.cx} cy={p.cy} r={2.5} fill={def.hex} fillOpacity={0.45} />
            ))}

        {/* 7 günlük ortalama — grafiğin kahramanı */}
        {geo.avgSolo.map((p, i) => (
          <circle key={`s${i}`} cx={p.cx} cy={p.cy} r={3} fill={def.hex} />
        ))}
        {geo.avgLines.map((d, i) => (
          <DrawnLine key={`l${i}-${d.length}`} d={d} color={def.hex} />
        ))}

        {/* etkin gün: dikey kılavuz + vurgulu noktalar */}
        {act && (
          <>
            <line
              x1={actX}
              x2={actX}
              y1={PAD.t}
              y2={BASE_Y}
              className="stroke-white/30"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            {act.value !== null && (
              <circle
                cx={actX}
                cy={geo.gy(act.value)}
                r={3.5}
                fill="none"
                stroke={def.hex}
                strokeOpacity={0.9}
                strokeWidth={1.5}
              />
            )}
            {act.avg !== null && (
              <circle
                cx={actX}
                cy={geo.gy(act.avg)}
                r={4.5}
                fill={def.hex}
                stroke="#08090a"
                strokeWidth={2}
              />
            )}
          </>
        )}
      </svg>

      {/* ---- HTML metin katmanı (gerçek piksel; SVG ölçeğinden bağımsız) ---- */}
      <div className="pointer-events-none absolute inset-0">
        {/* y ekseni: sol boşlukta, sağa dayalı. Boşluk grafiğin GENİŞLİĞİNİN
            %6,1'i (44/720) — mobilde ~19 piksel. "2.000" oraya sığmayıp sola
            taşar; 8 piksel + dar iç boşlukla taşma kartın kendi payının içinde
            kalır. sm'den itibaren yer bol, etiket büyür. */}
        {yTicks.values.map((t) => (
          <div
            key={t}
            className="absolute whitespace-nowrap pr-1 text-right font-mono text-[8px] leading-none text-ink-faint sm:pr-1.5 sm:text-[10px]"
            style={{ left: 0, width: px(PAD.l), top: py(geo.gy(t)), transform: "translateY(-50%)" }}
          >
            {formatNumber(t, tickDecimals)}
          </div>
        ))}

        {/* x ekseni: ilk etiket sola, son etiket sağa yaslanır — taşma olmaz */}
        {xTicks.map((i, k) => (
          <div
            key={i}
            className="absolute whitespace-nowrap font-mono text-[9px] leading-none text-ink-faint sm:text-[10px]"
            style={{
              left: px(geo.gx(i)),
              top: py(BASE_Y + 8),
              transform:
                k === 0
                  ? "translateX(0)"
                  : k === xTicks.length - 1
                    ? "translateX(-100%)"
                    : "translateX(-50%)",
            }}
          >
            {xLabel(points[i].date)}
          </div>
        ))}

        {/* hedef etiketi */}
        {goalY !== null && series.goal !== null && (
          <div
            className="absolute"
            style={{ right: px(PAD.r), top: py(goalY), transform: "translateY(-118%)" }}
          >
            <span className="whitespace-nowrap rounded-full border border-teal-400/30 bg-app/90 px-2 py-0.5 font-mono text-[9px] font-bold leading-none text-teal-200 backdrop-blur-md">
              hedef {formatNumber(series.goal, tickDecimals)}
            </span>
          </div>
        )}

        {/* tooltip */}
        {act && (
          <div
            className="absolute z-20"
            style={{
              left: px(actX),
              top: py(tipTop),
              transform: flip ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
            }}
          >
            <div className="w-max rounded-xl border border-line bg-elevated-2/95 px-2.5 py-1.5 shadow-card backdrop-blur-md">
              <div className="font-mono text-[10px] font-semibold text-ink-tertiary">
                {weekdayShort(act.date)} · {formatShortDate(act.date)}
              </div>
              <div className={`mt-0.5 font-mono text-[11px] font-extrabold ${def.classes.text}`}>
                {act.value === null ? "kayıt yok" : formatNutrientValue(def, act.value)}
              </div>
              <div className="font-mono text-[10px] text-ink-secondary">
                7g ort · {act.avg === null ? "—" : formatNutrientValue(def, act.avg)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
