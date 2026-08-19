/**
 * Every number the advice engine judges by, in one place.
 *
 * Each is marked either **framework** — it comes from a published methodology
 * and is cited — or **app rule** — it is a product decision about when
 * something is worth a line on screen. Mixing the two silently is how an
 * arbitrary cutoff ends up looking like established guidance.
 */

export interface Threshold {
  value: number
  basis: 'framework' | 'app-rule'
  why: string
}

const t = (value: number, basis: Threshold['basis'], why: string): Threshold => ({
  value,
  basis,
  why,
})

export const THRESHOLDS = {
  /** Below this share, a variance is noise rather than a pattern. Matches the
   *  MATERIAL_CHANGE already used by the dashboard's insights. */
  materialRatio: t(0.1, 'app-rule', 'Mövcud panelin 10% həddi ilə eyni'),

  /** Below this, the manat amount is too small to be worth a sentence. */
  materialAmount: t(5, 'app-rule', 'Kiçik məbləğlər siyahını doldurmasın'),

  /**
   * Robust outlier cutoff. Leys et al. (2013) recommend 2.5 as a reasonable
   * default, applied to the median absolute deviation rather than the standard
   * deviation — the mean and SD are themselves dragged by the outlier being
   * looked for.
   */
  anomalyScore: t(2.5, 'framework', 'Leys et al. (2013), J. Exp. Soc. Psych.'),

  /** Median and MAD need a run of months behind them to mean anything. */
  anomalyMinMonths: t(4, 'app-rule', 'İki nöqtə üzərində median mənasızdır'),

  /** A category counts as repeatedly over plan at this many of the last four. */
  repeatedOverruns: t(3, 'app-rule', 'Son 4 ayın 3-ü — təsadüf deyil, vərdiş'),
  repeatedWindow: t(4, 'app-rule', 'Baxılan ay sayı'),

  /** Change against the previous three-month average worth reporting. */
  trendRatio: t(0.15, 'app-rule', 'Aylıq dalğalanmadan yuxarı'),
  trendMinMonths: t(4, 'app-rule', '3 aylıq baza + cari ay'),

  /** A single category taking at least this share of spending is worth naming. */
  concentrationShare: t(0.35, 'app-rule', 'Xərcin üçdə birindən çoxu bir yerdə'),

  /** Unplanned spending worth surfacing, as a share of the month's expenses. */
  unexpectedShare: t(0.2, 'app-rule', 'Xərcin beşdə birindən çoxu plandan kənar'),

  /** Standing commitments taking at least this share of income. */
  recurringShare: t(0.5, 'app-rule', 'Gəlirin yarısı öhdəliklərə bağlıdır'),

  /** Lifestyle inflation needs two comparable three-month blocks. */
  lifestyleMinMonths: t(6, 'app-rule', 'Müqayisə üçün 3 + 3 ay'),
  lifestyleGap: t(0.1, 'app-rule', 'Xərc artımı gəlir artımını bu qədər ötəndə'),
} as const

export type ThresholdName = keyof typeof THRESHOLDS
