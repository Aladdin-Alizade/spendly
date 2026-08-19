/**
 * Offline-first persistence.
 *
 * The browser's own snapshot is the working copy: every change is written
 * there first and the write to Supabase follows. That ordering is the whole
 * point — an edit made on a flaky connection is saved before anything is asked
 * of the network, so closing the tab cannot lose it.
 *
 * What the server holds is still the shared truth across devices. On every
 * load the two are brought together by `mergeFinanceData`, and whatever this
 * browser has not managed to send is sent then. A change that could not be
 * sent is not an error, it is work in the queue, and the UI says so in those
 * terms.
 */

import { emptyData, normaliseData } from './storage'
import type { FinanceRepository } from './storage'
import { hasPendingWork, mergeFinanceData } from './merge'
import { describeError } from './setupHints'
import type { FinanceData } from './types'

export type SyncStatus =
  /** Everything in this browser is on the server. */
  | 'synced'
  /** There is work here the server has not taken yet. */
  | 'pending'
  /** The server could not be reached at all. */
  | 'offline'
  /** The server answered, and said no. This one needs a person. */
  | 'failed'

export interface SyncState {
  status: SyncStatus
  /** Set for `failed`, where the reason is actionable. */
  message: string | null
}

/** The working copy — what the app reads and writes, online or not. */
const WORKING_KEY = 'spendly.data.v1'

/** The last snapshot known to be on the server, used to tell this browser's
 *  unsent work from rows it simply has not seen yet. */
const SYNCED_KEY = 'spendly.synced.v1'

export function readSnapshot(key: string): FinanceData | null {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : normaliseData(JSON.parse(raw))
  } catch {
    // Corrupt or unavailable storage must not brick the app.
    return null
  }
}

export function writeSnapshot(key: string, data: FinanceData): void {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch {
    // Quota or private-mode failures are non-fatal; the session still works.
  }
}

/**
 * Whether a rejection means "could not reach the server" rather than "the
 * server said no". The two mean opposite things: one is worth queueing and
 * retrying, the other needs a person to change something.
 */
export function isOfflineError(cause: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true

  const message =
    typeof cause === 'string'
      ? cause
      : cause && typeof cause === 'object' && 'message' in cause
        ? String((cause as { message: unknown }).message)
        : ''

  return /failed to fetch|networkerror|load failed|fetch failed|err_internet|timeout/i.test(
    message,
  )
}

export class SyncingRepository implements FinanceRepository {
  private state: SyncState = { status: 'synced', message: null }
  private listeners = new Set<(state: SyncState) => void>()

  /** False until a load has actually reached the server this session. */
  private reconciled = false

  /** Serialised, so a sync triggered by the network coming back cannot
   *  interleave with a save the user just made. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly remote: FinanceRepository) {}

  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async load(): Promise<FinanceData> {
    return this.serialise(async () => {
      const local = readSnapshot(WORKING_KEY) ?? emptyData
      return (await this.reconcile(local)) ?? local
    })
  }

  async save(data: FinanceData): Promise<void> {
    await this.serialise(async () => {
      // The browser first, always. Everything after this is delivery.
      writeSnapshot(WORKING_KEY, data)

      try {
        if (this.reconciled) {
          await this.remote.save(data)
          writeSnapshot(SYNCED_KEY, data)
          this.set({ status: 'synced', message: null })
        } else {
          // Nothing has been reconciled with the server yet this session, so
          // pushing a diff would be against a baseline that may not be the
          // server's. Go the long way round.
          await this.reconcile(data)
        }
      } catch (cause) {
        this.report(cause)
      }
    })
  }

  /**
   * Send whatever is waiting. Called when the browser comes back online and
   * when the tab is shown again; safe to call when there is nothing to do.
   */
  async sync(): Promise<FinanceData | null> {
    return this.serialise(async () => {
      const local = readSnapshot(WORKING_KEY)
      return local === null ? null : await this.reconcile(local)
    })
  }

  /**
   * Bring this browser and the server together, and push whatever is being
   * held. Returns the merged snapshot, or null when the server could not be
   * reached — in which case the caller keeps using the local copy.
   */
  private async reconcile(local: FinanceData): Promise<FinanceData | null> {
    let remoteData: FinanceData
    try {
      remoteData = await this.remote.load()
    } catch (cause) {
      if (isOfflineError(cause)) {
        const base = readSnapshot(SYNCED_KEY) ?? emptyData
        this.set({
          status: hasPendingWork(base, local) ? 'pending' : 'offline',
          message: null,
        })
      } else {
        this.set({ status: 'failed', message: describeError(cause) })
      }
      return null
    }

    this.reconciled = true

    /* No baseline means this browser has never synced: everything it holds is
       treated as unsent rather than as already-known, because the other
       reading loses work that was entered before the account existed. */
    const base = readSnapshot(SYNCED_KEY) ?? emptyData
    const merged = mergeFinanceData(base, local, remoteData)

    try {
      if (JSON.stringify(merged) !== JSON.stringify(remoteData)) {
        await this.remote.save(merged)
      }
      writeSnapshot(WORKING_KEY, merged)
      writeSnapshot(SYNCED_KEY, merged)
      this.set({ status: 'synced', message: null })
      return merged
    } catch (cause) {
      // The read got through and the write did not; the merge is still the
      // best copy this browser has, so it is kept and queued.
      writeSnapshot(WORKING_KEY, merged)
      this.report(cause)
      return merged
    }
  }

  private report(cause: unknown): void {
    if (isOfflineError(cause)) {
      this.set({ status: 'pending', message: null })
    } else {
      this.set({ status: 'failed', message: describeError(cause) })
    }
  }

  private set(state: SyncState): void {
    this.state = state
    for (const listener of this.listeners) listener(state)
  }

  /** Every entry point goes through here, so two of them cannot overlap. */
  private serialise<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work)
    this.queue = next.catch(() => undefined)
    return next
  }
}
