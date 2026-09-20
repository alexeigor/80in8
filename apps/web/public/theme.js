/*
 * Runs before the first paint so the page never flashes the wrong theme.
 * Deliberately dependency-free, synchronous and tiny; it duplicates a few lines of
 * src/adapters/settings.ts because that module cannot load this early.
 */
(function () {
  try {
    var raw = localStorage.getItem('80in8:settings:v1')
    var stored = raw ? JSON.parse(raw) : {}
    var theme = stored.theme
    if (theme !== 'light' && theme !== 'dark') {
      theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    }
    document.documentElement.dataset.theme = theme
    var calm = stored.reducedMotion === true || matchMedia('(prefers-reduced-motion: reduce)').matches
    document.documentElement.dataset.motion = calm ? 'reduced' : 'full'
  } catch (_) {
    /* private mode, blocked storage, corrupt JSON: the default in the markup stands. */
  }
})()
