import { describe, expect, it } from 'vitest'
import {
  METHODS,
  ORIGIN_LABEL,
  REVIEW_INTERVAL_MONTHS,
  methodsNeedingReview,
  needsReview,
} from '../insights/methodology'

describe('methodology register', () => {
  it('gives every reference a source, an origin and a review date', () => {
    for (const [id, method] of Object.entries(METHODS)) {
      expect(method.name, id).toBeTruthy()
      expect(method.source, id).toBeTruthy()
      expect(method.origin, id).toBeTruthy()
      expect(method.reviewedOn, id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('labels a jurisdiction rather than implying a universal rule', () => {
    // Most published budgeting guidance is written for one country. Showing a
    // US figure unlabelled would present a market's rule as a fact about money.
    expect(ORIGIN_LABEL.US).toBe('ABŞ mənbəyi')
    expect(Object.values(METHODS).some((m) => m.origin === 'US')).toBe(true)
    expect(Object.values(METHODS).some((m) => m.origin === 'app')).toBe(true)
  })

  it("only claims an external source when there is one", () => {
    for (const [id, method] of Object.entries(METHODS)) {
      if (method.origin === 'app') expect(method.url, id).toBeNull()
      else expect(method.url, id).toMatch(/^https:\/\//)
    }
  })
})

describe('going out of date', () => {
  const method = { ...METHODS.anomaly, reviewedOn: '2026-01-15' }

  it('is current inside the review interval', () => {
    expect(needsReview(method, '2026-06-01')).toBe(false)
  })

  it('is flagged once the interval has passed', () => {
    // The app cannot know a framework changed after it was built; it can
    // refuse to present an unchecked reference as though it were current.
    expect(needsReview(method, '2027-01-15')).toBe(true)
    expect(needsReview(method, '2030-01-01')).toBe(true)
  })

  it('measures the interval in whole months', () => {
    const start = '2026-01-15'
    const justUnder = { ...method, reviewedOn: start }
    expect(needsReview(justUnder, '2026-12-31')).toBe(false)
    expect(needsReview(justUnder, '2027-01-01')).toBe(true)
    expect(REVIEW_INTERVAL_MONTHS).toBe(12)
  })

  it('lists everything due a check, so the screen can say so once', () => {
    expect(methodsNeedingReview('2026-08-19')).toEqual([])
    expect(methodsNeedingReview('2030-01-01').length).toBe(Object.keys(METHODS).length)
  })
})
