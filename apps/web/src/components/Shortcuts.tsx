import type { JSX } from 'preact'
import { Modal } from './Modal.js'

/** The binding table from DESIGN.md §7.8, rendered verbatim so the docs stay honest. */

const ROWS: [string, string, string][] = [
  ['Home', 'Enter', 'Start'],
  ['Countdown', 'Enter', 'Skip the countdown'],
  ['Run', 'Esc', 'Abort (confirms after 5 answers)'],
  ['Run', '→', 'Skip, when the profile allows it'],
  ['Run · multiple choice', '1 – 4', 'Select that option'],
  ['Run · typed', '0 – 9', 'Digit'],
  ['Run · typed', '. ,', 'Decimal separator'],
  ['Run · typed', '/', 'Fraction bar'],
  ['Run · typed', '- −', 'Toggle the sign'],
  ['Run · typed', 'Space', 'Mixed-number separator (2␣1/4) — never skips'],
  ['Run · typed', 'Backspace', 'Delete the last character'],
  ['Run · typed', 'Enter', 'Submit'],
  ['Results', 'Enter (outside controls)', 'Again, with a new seed'],
  ['Anywhere', 'Tab / Shift+Tab', 'Next / previous control'],
  ['Results', 'S', 'Same seed'],
  ['Results', 'M', 'Retry mistakes'],
  ['Results', 'R', 'Review'],
  ['Anywhere', '?', 'This table'],
]

export function Shortcuts({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <Modal label="Keyboard shortcuts" testId="shortcuts" onClose={onClose}>
      <button type="button" class="backdrop" tabIndex={-1} aria-label="Close" onClick={onClose} />
      <div class="sheet">
        <div class="masthead">
          <h2>Keyboard</h2>
          <button type="button" class="ghost" data-testid="shortcuts-close" onClick={onClose}>
            Close
          </button>
        </div>
        <div class="scroller">
          <table>
            <thead>
              <tr>
                <th>Where</th>
                <th>Key</th>
                <th>Does</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([where, key, action]) => (
                <tr key={`${where}-${key}`}>
                  <td>{where}</td>
                  <td>
                    <kbd>{key}</kbd>
                  </td>
                  <td>{action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}
