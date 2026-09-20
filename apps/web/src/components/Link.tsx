import type { ComponentChildren, JSX } from 'preact'
import { href, onNavigate } from '../adapters/router.js'

/** A real `<a href>` (middle-click and "open in new tab" keep working) that routes in place. */
export function Link({
  to,
  children,
  class: className,
  testid,
}: {
  to: string
  children: ComponentChildren
  class?: string
  testid?: string
}): JSX.Element {
  return (
    <a href={href(to)} class={className} data-testid={testid} onClick={(event) => onNavigate(event, to)}>
      {children}
    </a>
  )
}

export function Masthead({ children }: { children?: ComponentChildren }): JSX.Element {
  return (
    <div class="masthead">
      <Link to="/" class="wordmark" testid="wordmark">
        80<span>in</span>8
      </Link>
      <nav class="navlinks">
        {children}
        <Link to="/history" testid="nav-history">
          History
        </Link>
        <Link to="/settings" testid="nav-settings">
          Settings
        </Link>
      </nav>
    </div>
  )
}
