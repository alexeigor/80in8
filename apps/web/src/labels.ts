import type { Kind } from '@80in8/core'

/** Human names for the question kinds, shared by Results and History. */
export const KIND_LABELS: Record<Kind, string> = {
  'int.add': 'Integer +',
  'int.sub': 'Integer −',
  'int.mul': 'Integer ×',
  'int.div': 'Integer ÷',
  'dec.add': 'Decimal +',
  'dec.sub': 'Decimal −',
  'dec.mul': 'Decimal ×',
  'dec.div': 'Decimal ÷',
  'frac.add': 'Fraction +',
  'frac.sub': 'Fraction −',
  'frac.mul': 'Fraction ×',
  'frac.div': 'Fraction ÷',
}

export function labelOf(kind: Kind): string {
  return KIND_LABELS[kind] ?? kind
}
