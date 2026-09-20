import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The router reads `BASE_URL` when it loads, so the sub-path cases import a fresh
 * copy with the environment arranged first.
 */

async function load(base: string) {
  vi.stubEnv('BASE_URL', base)
  vi.resetModules()
  return import('./router.js')
}

afterEach(() => {
  vi.unstubAllEnvs()
  history.replaceState(null, '', '/')
})

describe('at the root', () => {
  it('reads the path, adds nothing to hrefs, and pushes or replaces on navigate', async () => {
    history.replaceState(null, '', '/history?x=1')
    const router = await load('/')
    expect(router.path.value).toBe('/history')
    expect(router.search.value).toBe('?x=1')
    expect(router.params().get('x')).toBe('1')
    expect(router.href('/settings')).toBe('/settings')
    expect(router.href('settings')).toBe('/settings')

    const before = history.length
    router.navigate('/settings')
    expect(location.pathname).toBe('/settings')
    expect(router.path.value).toBe('/settings')
    expect(history.length).toBe(before + 1)
    router.navigate('/results', { replace: true })
    expect(location.pathname).toBe('/results')
    expect(history.length).toBe(before + 1)
  })

  it('normalises index.html and trailing slashes', async () => {
    history.replaceState(null, '', '/index.html')
    let router = await load('/')
    expect(router.path.value).toBe('/')
    history.replaceState(null, '', '/history/')
    router = await load('/')
    expect(router.path.value).toBe('/history')
  })

  it('follows Back and Forward through the popstate listener until stopped', async () => {
    const router = await load('/')
    const stop = router.startRouter()
    router.navigate('/history')
    history.replaceState(null, '', '/settings')
    dispatchEvent(new PopStateEvent('popstate'))
    expect(router.path.value).toBe('/settings')
    stop()
    history.replaceState(null, '', '/history')
    dispatchEvent(new PopStateEvent('popstate'))
    expect(router.path.value).toBe('/settings')
  })

  it('routes a plain left click in place and leaves modified or secondary clicks to the browser', async () => {
    const router = await load('/')
    const plain = new MouseEvent('click', { button: 0, cancelable: true })
    router.onNavigate(plain, '/history')
    expect(plain.defaultPrevented).toBe(true)
    expect(router.path.value).toBe('/history')

    for (const init of [
      { button: 1 },
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
    ]) {
      const event = new MouseEvent('click', { button: 0, cancelable: true, ...init })
      router.onNavigate(event, '/settings')
      expect(event.defaultPrevented).toBe(false)
    }
    const handled = new MouseEvent('click', { button: 0, cancelable: true })
    handled.preventDefault()
    router.onNavigate(handled, '/settings')
    expect(router.path.value).toBe('/history')
  })
})

describe('under a deployment base', () => {
  it('strips the base from the location and adds it back to every href', async () => {
    history.replaceState(null, '', '/80in8/q/1.optiver-classic%401.int-add.0000000')
    const router = await load('/80in8/')
    expect(router.path.value).toBe('/q/1.optiver-classic%401.int-add.0000000')
    expect(router.href('/history')).toBe('/80in8/history')
    router.navigate('/history')
    expect(location.pathname).toBe('/80in8/history')
    expect(router.path.value).toBe('/history')
  })

  it('treats the base itself, with or without its slash, as home', async () => {
    history.replaceState(null, '', '/80in8')
    let router = await load('/80in8/')
    expect(router.path.value).toBe('/')
    history.replaceState(null, '', '/80in8/')
    router = await load('/80in8/')
    expect(router.path.value).toBe('/')
    history.replaceState(null, '', '/80in8/index.html')
    router = await load('/80in8/')
    expect(router.path.value).toBe('/')
  })
})
