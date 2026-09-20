import type { JSX } from 'preact'

/**
 * Renders a value the core has already formatted. The only decision left here is
 * typography: a fraction can be written inline (`3/8`) or stacked, which is easier to
 * read at a glance and is the default on anything wider than a small phone.
 */

const FRACTION = /^([−-]?)(?:(\d+)\s)?(\d+)\/(\d+)$/

export interface ValueProps {
  text: string
  stacked?: boolean
}

export function Value({ text, stacked = true }: ValueProps): JSX.Element {
  const match = stacked ? FRACTION.exec(text) : null
  if (!match) return <span>{text}</span>
  const [, sign, whole, num, den] = match
  return (
    <span>
      {sign}
      {whole ? <span class="frac-whole">{whole}</span> : null}
      <span class="frac" aria-hidden="true">
        <span class="num">{num}</span>
        <span class="den">{den}</span>
      </span>
      <span class="sr-only">
        {whole ? `${whole} and ` : ''}
        {`${num} over ${den}`}
      </span>
    </span>
  )
}
