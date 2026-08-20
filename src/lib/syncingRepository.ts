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
  /**
   * False when the browser could not keep its own copy of the last change —
   * a full quota, storage a private window will not hand over.
   *
   * Kept apart from `status` because it answers a different question. The
   * status says whether the server has the change; this says whether closing
   * the tab would lose it. Both can be true at once, and the promise the app
   * makes — that an edit is saved before anything is asked of the network —
   * is the one this reports on.
   */
  stored: boolean
}

/**
 * The working copy — what the app reads and writes, online or not.
 *
 * This bare key belongs to the browser rather than to any account: it is what
 * local-storage mode uses, and what a browser held before it had an account.
 * A signed-in account gets its own key, from `workingKey`.
 */
const WORKING_KEY = 'spendly.data.v1'

/** The last snapshot known to be on the server, used to tell this browser's
 *  unsent work from rows it simply has not seen yet. */
const SYNCED_KEY = 'spendly.synced.v1'

/**
 * One account, one key.
 *
 * These used to be one key per browser, shared by every account that ever
 * signed in there — and the sync treats whatever the key holds as work this
 * browser has not sent yet. So signing in handed the previous occupant's rows
 * to the new account and uploaded them, and after that they belonged to it:
 * records its owner never entered, in their totals, on every device they own.
 */
export const workingKey = (userId?: string | null) =>
  userId ? `${WORKING_KEY}:${userId}` : WORKING_KEY

export const syncedKey = (userId?: string | null) =>
  userId ? `${SYNCED_KEY}:${userId}` : SYNCED_KEY

export function readSnapshot(key: string): FinanceData | null {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : normaliseData(JSON.parse(raw))
  } catch {
    // Corrupt or unavailable storage must not brick the app.
    return null
  }
}

/**
 * True when the snapshot is in this browser's storage.
 *
 * A full quota is not a reason to throw: the edit is already on screen and the
 * caller has a server to try. It is a reason to say so, which is what the
 * return value is for — silently dropping the working copy would leave the app
 * promising an offline safety net it no longer has, and the banner underneath
 * saying the change was kept here when it was not.
 */
export function writeSnapshot(key: string, data: FinanceData): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(data))
    return true
  } catch {
    return false
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
  private state: SyncState = { status: 'synced', message: null, stored: true }
  private listeners = new Set<(state: SyncState) => void>()

  /** Whether the last change reached this browser's own storage. */
  private stored = true

  /** False until a load has actually reached the server this session. */
  private reconciled = false

  /** Serialised, so a sync triggered by the network coming back cannot
   *  interleave with a save the user just made. */
  private queue: Promise<unknown> = Promise.resolve()

  private readonly working: string
  private readonly synced: string

  constructor(
    private readonly remote: FinanceRepository,
    /** Whose snapshots these are. Absent only in the modes with no account. */
    userId?: string | null,
  ) {
    this.working = workingKey(userId)
    this.synced = syncedKey(userId)
  }

  /**
   * Work entered before there was an account to put it in.
   *
   * It is taken over once, by the first account to sign in in this browser,
   * and the key is removed as it is taken — so the second account to sign in
   * here inherits nothing. That distinction is the whole point: carrying
   * somebody's pre-account work forward is a feature, and handing it to
   * whoever signs in next is how records nobody wrote end up in an account
   * and, from there, in every total it computes.
   */
  private adoptPreAccountWork(): FinanceData | null {
    if (this.working === WORKING_KEY) return null
    const carried = readSnapshot(WORKING_KEY)
    if (!carried) return null
    // Only hand it over once it is somewhere else; a browser that cannot write
    // must not lose the work it was carrying.
    if (!writeSnapshot(this.working, carried)) return carried
    try {
      localStorage.removeItem(WORKING_KEY)
    } catch {
      // Nothing to do about a storage that will not forget.
    }
    return carried
  }

  subscribe(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async load(): Promise<FinanceData> {
    return this.serialise(async () => {
      const local = readSnapshot(this.working) ?? this.adoptPreAccountWork() ?? emptyData
      return (await this.reconcile(local)) ?? local
    })
  }

  async save(data: FinanceData): Promise<void> {
    await this.serialise(async () => {
      // The browser first, always. Everything after this is delivery.
      this.stored = writeSnapshot(this.working, data)

      try {
        if (this.reconciled) {
          await this.remote.save(data)
          writeSnapshot(this.synced, data)
          this.publish('synced')
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
      const local = readSnapshot(this.working)
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
        const base = readSnapshot(this.synced) ?? emptyData
        this.publish(hasPendingWork(base, local) ? 'pending' : 'offline')
      } else {
        this.publish('failed', describeError(cause))
      }
      return null
    }

    this.reconciled = true

    /* No baseline means this browser has never synced: everything it holds is
       treated as unsent rather than as already-known, because the other
       reading loses work that was entered before the account existed. */
    const base = readSnapshot(this.synced) ?? emptyData
    const merged = mergeFinanceData(base, local, remoteData)

    try {
      if (JSON.stringify(merged) !== JSON.stringify(remoteData)) {
        await this.remote.save(merged)
      }
      this.stored = writeSnapshot(this.working, merged)
      writeSnapshot(this.synced, merged)
      this.publish('synced')
      return merged
    } catch (cause) {
      // The read got through and the write did not; the merge is still the
      // best copy this browser has, so it is kept and queued.
      this.stored = writeSnapshot(this.working, merged)
      this.report(cause)
      return merged
    }
  }

  private report(cause: unknown): void {
    if (isOfflineError(cause)) {
      this.publish('pending')
    } else {
      this.publish('failed', describeError(cause))
    }
  }

  private publish(status: SyncStatus, message: string | null = null): void {
    this.state = { status, message, stored: this.stored }
    for (const listener of this.listeners) listener(this.state)
  }

  /** Every entry point goes through here, so two of them cannot overlap. */
  private serialise<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work)
    this.queue = next.catch(() => undefined)
    return next
  }
}
