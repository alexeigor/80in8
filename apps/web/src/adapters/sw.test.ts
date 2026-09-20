import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  applyUpdate,
  registerServiceWorker,
  resumeUpdates,
  stopUpdateChecks,
  suspendUpdates,
  updateReady,
} from './sw.js'

const update = vi.fn<() => Promise<void>>()
const postMessage = vi.fn()
const reload = vi.fn()
let registration: EventTarget & { update: typeof update; waiting: { postMessage: typeof postMessage } | null }
let workers: EventTarget & { register: ReturnType<typeof vi.fn>; controller: object }

beforeEach(async () => {
  vi.useFakeTimers()
  vi.stubEnv('DEV', false)
  update.mockReset().mockResolvedValue(undefined)
  postMessage.mockReset()
  reload.mockReset()
  registration = Object.assign(new EventTarget(), { update, waiting: { postMessage } })
  workers = Object.assign(new EventTarget(), {
    register: vi.fn().mockResolvedValue(registration),
    controller: {},
  })
  vi.stubGlobal('navigator', { serviceWorker: workers })
  vi.stubGlobal('location', { reload })
  updateReady.value = false
  registerServiceWorker()
  dispatchEvent(new Event('load'))
  await Promise.resolve()
  resumeUpdates()
})

afterEach(() => {
  stopUpdateChecks()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

it('defers periodic network checks for the whole run, then checks once on resume', async () => {
  suspendUpdates()
  await vi.advanceTimersByTimeAsync(3 * 60 * 60 * 1000)
  expect(update).not.toHaveBeenCalled()
  resumeUpdates()
  expect(update).toHaveBeenCalledOnce()
  resumeUpdates()
  expect(update).toHaveBeenCalledOnce()
  // Being offline is expected; an update failure must not reject into the app.
  update.mockRejectedValueOnce(new TypeError('offline'))
  await vi.advanceTimersByTimeAsync(60 * 60 * 1000)
  expect(update).toHaveBeenCalledTimes(2)
})

it('reloads only after the waiting worker takes control, regardless of activation latency', async () => {
  expect(updateReady.value).toBe(true)
  const applying = applyUpdate()
  expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  await vi.advanceTimersByTimeAsync(1000)
  expect(reload).not.toHaveBeenCalled()
  workers.dispatchEvent(new Event('controllerchange'))
  await applying
  expect(reload).toHaveBeenCalledOnce()
})

it('does not reload when no update is waiting', async () => {
  registration.waiting = null
  await applyUpdate()
  expect(postMessage).not.toHaveBeenCalled()
  expect(reload).not.toHaveBeenCalled()
})
