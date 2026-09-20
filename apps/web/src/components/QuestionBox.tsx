import { BLANK, type Question } from '@80in8/core'
import type { JSX } from 'preact'
import { Value } from './Value.js'

/**
 * The question, in a box of fixed height so that a stacked fraction never pushes the
 * input surface down. `aria-live="polite"` announces each new question; the id in the
 * `data-` attribute is what the E2E identity test compares.
 */

export interface QuestionBoxProps {
  question: Question
  stacked: boolean
}

function Slot({ text, stacked }: { text: string; stacked: boolean }): JSX.Element {
  if (text === BLANK) {
    return (
      <>
        <span class="blank" data-testid="blank" aria-hidden="true">
          ?
        </span>
        <span class="sr-only">missing value</span>
      </>
    )
  }
  return <Value text={text} stacked={stacked} />
}

export function QuestionBox({ question, stacked }: QuestionBoxProps): JSX.Element {
  const { left, op, right, result } = question.display
  return (
    <div
      class="question nums"
      data-testid="question"
      data-question-id={question.id}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span>
        <Slot text={left} stacked={stacked} /> {op} <Slot text={right} stacked={stacked} /> ={' '}
        <Slot text={result} stacked={stacked} />
      </span>
    </div>
  )
}
