/**
 * The six series hues, in the order they are handed out.
 *
 * A category keeps the same colour everywhere it appears on a screen because
 * the colour is assigned by its rank in the breakdown, and every chart is fed
 * the same ranked list. Colour is identity here, not decoration — nothing is
 * coloured that does not stand for a distinct thing.
 */
const SERIES = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'] as const

export function seriesColor(index: number): string {
  return `var(${SERIES[index % SERIES.length]})`
}

/**
 * Bind colours to categories once, from the ranked breakdown, and hand the
 * same lookup to every chart on the page. Each chart filters that breakdown
 * differently, so colouring by each chart's own row index would drift — the
 * same category would change colour between two panels sitting side by side.
 */
export function categoryColors(order: string[]): (category: string) => string {
  const rank = new Map(order.map((category, index) => [category, index]))
  return (category) => seriesColor(rank.get(category) ?? order.length)
}

/** The muted hue for everything past the named entries in a legend. */
export const REST_COLOR = 'var(--text-faint)'
