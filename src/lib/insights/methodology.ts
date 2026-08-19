/**
 * Where the guidance comes from, and when it was last checked.
 *
 * No application can know that a published framework changed after it was
 * built. What it can do is refuse to hide the possibility: every reference
 * here carries the date it was last verified against its source, and the app
 * says so on screen. Once an entry passes `REVIEW_INTERVAL_MONTHS` it is
 * marked as needing review rather than quietly presented as current.
 *
 * That makes updating a change to this file alone — no rule, threshold or
 * component has to be touched to correct a reference.
 *
 * `origin` matters because most published budgeting guidance is written for
 * one jurisdiction. A US mortgage ratio is not a fact about money, it is a
 * rule of a particular market, and it is labelled as such rather than shown
 * as though it were universal.
 */

export type MethodOrigin =
  /** Published by a national body; applies to that country's context. */
  | 'US'
  /** Not tied to a jurisdiction — arithmetic, or a statistical method. */
  | 'international'
  /** A product decision of this application, not external guidance. */
  | 'app'

export interface Methodology {
  name: string
  /** What it means, in one sentence. */
  note: string
  source: string
  url: string | null
  origin: MethodOrigin
  /** ISO date the reference was last verified against its source. */
  reviewedOn: string
}

/** How long a reference is presented as current before it is flagged. */
export const REVIEW_INTERVAL_MONTHS = 12

/** The date every entry below was last checked against its source. */
const REVIEWED = '2026-08-19'

export const METHODS: Record<string, Methodology> = {
  'spending-ratio': {
    name: 'Xərc / gəlir nisbəti',
    note: 'Büdcənin əsası: gəlir − xərc = qalan. Nisbət bunun faizlə ifadəsidir.',
    source: 'FDIC Money Smart',
    url: 'https://www.fdic.gov/consumer-resource-center/money-smart-adults',
    origin: 'US',
    reviewedOn: REVIEWED,
  },
  retained: {
    name: 'Qalan pul və onun faizi',
    note: 'BEA-nın şəxsi yığım nisbətinin qarşılığı. Tətbiq pulun saxlanıb-saxlanmadığını görmədiyi üçün "yığım" yox, "qalan" deyilir.',
    source: 'U.S. Bureau of Economic Analysis',
    url: 'https://www.bea.gov/data/income-saving/personal-saving-rate',
    origin: 'US',
    reviewedOn: REVIEWED,
  },
  variance: {
    name: 'Plan və faktiki fərqi',
    note: 'Xərc planını faktiki xərclə müqayisə etmək — büdcə idarəçiliyinin əsas addımı.',
    source: 'FDIC Money Smart',
    url: 'https://www.fdic.gov/consumer-resource-center/money-smart-adults',
    origin: 'US',
    reviewedOn: REVIEWED,
  },
  anomaly: {
    name: 'Qeyri-adi xərcin aşkarlanması',
    note: 'Median mütləq kənarlaşma (MAD) ilə. Orta və standart kənarlaşma axtarılan kənar dəyərin özündən təsirlənir.',
    source: 'Leys et al. (2013), Journal of Experimental Social Psychology',
    url: 'https://dipot.ulb.ac.be/dspace/bitstream/2013/139499/1/Leys_MAD_final-libre.pdf',
    origin: 'international',
    reviewedOn: REVIEWED,
  },
  trend: {
    name: 'Trend (hərəkətli ortalama)',
    note: 'Cari ay əvvəlki üç ayın ortalaması ilə müqayisə olunur.',
    source: 'Təsviri statistika — tətbiqin qaydası',
    url: null,
    origin: 'app',
    reviewedOn: REVIEWED,
  },
  concentration: {
    name: 'Kateqoriya cəmləşməsi',
    note: 'Xərcin kateqoriyalar üzrə paylanması.',
    source: 'CFPB — Your Money, Your Goals',
    url: 'https://www.consumerfinance.gov/consumer-tools/educator-tools/your-money-your-goals/toolkit/',
    origin: 'US',
    reviewedOn: REVIEWED,
  },
  unexpected: {
    name: 'Gözlənilməz xərc',
    note: 'Kateqoriya üzrə min(faktiki, plan) gözlənilən, qalan hissə gözlənilməzdir.',
    source: 'Tətbiqin öz tərifi',
    url: null,
    origin: 'app',
    reviewedOn: REVIEWED,
  },
  recurring: {
    name: 'Təkrarlanan öhdəliklər',
    note: 'Əvvəlki ayda da planlaşdırılmış eyni sətirlər.',
    source: 'Tətbiqin öz tərifi',
    url: null,
    origin: 'app',
    reviewedOn: REVIEWED,
  },
  'zero-based': {
    name: 'Sıfır-baza büdcəsi',
    note: 'Hər manatın təyinatı olur: planlaşdırılan gəlir − planlaşdırılan xərc = 0.',
    source: 'Zero-based budgeting — Peter Pyhrr (1969)',
    url: 'https://en.wikipedia.org/wiki/Zero-based_budgeting',
    origin: 'international',
    reviewedOn: REVIEWED,
  },
  'sinking-fund': {
    name: 'Gələcək xərc üçün aylıq ayırma',
    note: 'Gələcək aya planlaşdırılmış xərc, qalan ay sayına bölünür.',
    source: 'Bölmə əməliyyatı — tətbiqin qaydası',
    url: null,
    origin: 'app',
    reviewedOn: REVIEWED,
  },
  lifestyle: {
    name: 'Həyat tərzi inflyasiyası',
    note: 'Son 3 ayın xərc artımı ilə gəlir artımının müqayisəsi.',
    source: 'Təsviri statistika — tətbiqin qaydası',
    url: null,
    origin: 'app',
    reviewedOn: REVIEWED,
  },
}

export type MethodId = keyof typeof METHODS

/** Months between two `YYYY-MM-DD` dates, by calendar month. */
function monthsSince(iso: string, asOf: string): number {
  const key = (value: string) => {
    const [year, month] = value.split('-').map(Number)
    return year * 12 + (month - 1)
  }
  return key(asOf) - key(iso)
}

/**
 * True when a reference has gone longer than the review interval without
 * being checked. The app shows this rather than assuming the guidance it was
 * built with is still what the source says.
 */
export function needsReview(method: Methodology, asOf: string): boolean {
  return monthsSince(method.reviewedOn, asOf) >= REVIEW_INTERVAL_MONTHS
}

/** Every reference that is due a check, so the screen can say so once. */
export function methodsNeedingReview(asOf: string): Methodology[] {
  return Object.values(METHODS).filter((method) => needsReview(method, asOf))
}

/** How an origin should be described where the reference is shown. */
export const ORIGIN_LABEL: Record<MethodOrigin, string> = {
  US: 'ABŞ mənbəyi',
  international: 'beynəlxalq',
  app: 'tətbiqin qaydası',
}
