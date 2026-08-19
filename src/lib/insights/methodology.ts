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
    note: 'BEA-nın şəxsi yığım nisbətinin qarşılığı. Xərclənməyən puldur — qəsdən kənara qoyulan məbləğ Yığım səhifəsində ayrıca göstərilir, ona görə buna "yığım" yox, "qalan" deyilir.',
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
    note: 'Hər manatın təyinatı olur: planlaşdırılan gəlir − planlaşdırılan xərc = 0. Korporativ metod kimi yaranıb, sonra ev büdcəsinə uyğunlaşdırılıb.',
    source: 'Pyhrr, P. A. (1970). "Zero-base budgeting", Harvard Business Review, 48(6), 111–121',
    url: null,
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
  'needs-wants': {
    name: 'Ehtiyac və istək',
    note: 'Xərcin zəruri və istəyə bağlı hissələrə ayrılması. Bölgü mühakimə deyil — hansı kateqoriyanın hansı olduğunu siz təyin edirsiniz.',
    source: 'CFPB — Budgeting for needs and wants',
    url: 'https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/teach/activities/budgeting-needs-and-wants/',
    origin: 'US',
    reviewedOn: REVIEWED,
  },
  'framework-50-30-20': {
    name: '50/30/20 çərçivəsi',
    note: 'Gəlirin 50%-i zəruri, 30%-i istəyə bağlı, 20%-i yığım. CFPB bunu bir neçə qaydadan biri kimi öyrədir — hamıya uyğun gəlmir.',
    source: 'Warren & Tyagi, All Your Worth (2005); CFPB — Analyzing budgets',
    url: 'https://www.consumerfinance.gov/consumer-tools/educator-tools/youth-financial-education/teach/activities/analyzing-budgets/',
    origin: 'US',
    reviewedOn: REVIEWED,
  },
  'emergency-fund': {
    name: 'Təcili ehtiyat fondu',
    note: 'Zəruri aylıq xərcin medianı × sizin seçdiyiniz ay sayı. CFPB vahid rəqəm vermir: "lazım olan məbləğ vəziyyətinizdən asılıdır".',
    source: 'CFPB — An essential guide to building an emergency fund',
    url: 'https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/',
    origin: 'US',
    reviewedOn: REVIEWED,
  },
  'money-principles': {
    name: 'Beş maliyyə prinsipi',
    note: 'Qazan, yığ və investisiya et, qoru, xərclə, borc al — ABŞ Maliyyə Savadlılığı Komissiyasının çərçivəsi. Bu səhifədəki bölmələrin arxasındakı ümumi məntiq.',
    source: 'MyMoney.gov — MyMoney Five',
    url: 'https://www.mymoney.gov/mymoneyfive',
    origin: 'US',
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
