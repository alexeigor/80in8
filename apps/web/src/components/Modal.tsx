import type { ComponentChildren, JSX } from 'preact'
import { useLayoutEffect, useRef } from 'preact/hooks'

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'

/** Modal keyboard handling shared by the shortcuts and abort sheets. */
export function Modal({
  label,
  testId,
  onClose,
  children,
}: {
  label: string
  testId: string
  onClose: () => void
  children: ComponentChildren
}): JSX.Element {
  const root = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose

  useLayoutEffect(() => {
    const dialog = root.current
    if (!dialog) return
    const previous = document.activeElement
    const outside = new Map<HTMLElement, boolean>()
    // The abort sheet is nested inside the run. Inert the siblings at every
    // ancestor level, while leaving the dialog's own ancestors interactive.
    let branch: HTMLElement = dialog
    while (branch.parentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling instanceof HTMLElement && sibling !== branch) {
          outside.set(sibling, sibling.inert)
          sibling.inert = true
        }
      }
      branch = branch.parentElement
      if (branch === document.body) break
    }
    const controls = () =>
      [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (node) => node.tabIndex >= 0 && !node.hidden,
      )
    const focusFirst = () =>
      (dialog.querySelector<HTMLElement>('[data-autofocus]') ?? controls()[0] ?? dialog).focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        close.current()
      } else if (event.key === 'Tab') {
        event.preventDefault()
        const items = controls()
        const index = items.indexOf(document.activeElement as HTMLElement)
        const next = event.shiftKey ? (index <= 0 ? items.length - 1 : index - 1) : (index + 1) % items.length
        ;(items[next] ?? dialog).focus()
      }
    }
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusFirst()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocus, true)
    focusFirst()
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocus, true)
      for (const [node, inert] of outside) node.inert = inert
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus()
    }
  }, [])

  return (
    <div
      ref={root}
      class="overlay"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabIndex={-1}
      data-testid={testId}
    >
      {children}
    </div>
  )
}
