import type { ComponentChildren, JSX } from 'preact'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'

/**
 * A region that may scroll sideways: the tables, on a narrow screen. A region that
 * scrolls must be reachable from the keyboard (WCAG 2.1.1), so it becomes a tab stop
 * exactly when there is something to scroll; where the content fits, an extra stop
 * would only be in the way. Measured after every render, because the content it
 * holds — history rows, say — often arrives after the first one.
 */
export function Scroller({
  label,
  class: className,
  children,
}: {
  label: string
  class?: string
  children: ComponentChildren
}): JSX.Element {
  const region = useRef<HTMLElement>(null)
  const [scrolls, setScrolls] = useState(false)
  const measure = () => {
    const el = region.current
    setScrolls(el !== null && el.scrollWidth > el.clientWidth + 1)
  }
  useLayoutEffect(measure)
  useLayoutEffect(() => {
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  }, [])
  return (
    <section
      ref={region}
      class={className ? `scroller ${className}` : 'scroller'}
      aria-label={label}
      tabIndex={scrolls ? 0 : undefined}
    >
      {children}
    </section>
  )
}
