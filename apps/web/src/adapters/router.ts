import { signal } from '@preact/signals'

/**
 * A router in forty lines. The app has six routes and no need for a dependency.
 *
 * `BASE_URL` is a build-time constant ('/' locally, '/80in8/' on GitHub Pages). Paths
 * in the app are always base-relative; `href()` is the only place the base is added.
 */

const BASE: string = import.meta.env.BASE_URL || '/'

function stripBase(pathname: string): string {
  let path = pathname
  if (BASE !== '/' && path.startsWith(BASE)) path = `/${path.slice(BASE.length)}`
  else if (BASE !== '/' && `${path}/` === BASE) path = '/'
  if (path.endsWith('/index.html')) path = path.slice(0, -'index.html'.length)
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return path || '/'
}

export const path = signal(stripBase(location.pathname))
export const search = signal(location.search)

export function href(to: string): string {
  return `${BASE}${to.replace(/^\//, '')}`
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const url = href(to)
  if (options.replace) history.replaceState(null, '', url)
  else history.pushState(null, '', url)
  sync()
}

export function sync(): void {
  path.value = stripBase(location.pathname)
  search.value = location.search
}

export function params(): URLSearchParams {
  return new URLSearchParams(search.value)
}

/** The `<a>` handler: plain left clicks are routed, everything else is left to the browser. */
export function onNavigate(event: MouseEvent, to: string): void {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  event.preventDefault()
  navigate(to)
}

export function startRouter(): () => void {
  const listener = () => sync()
  addEventListener('popstate', listener)
  return () => removeEventListener('popstate', listener)
}
