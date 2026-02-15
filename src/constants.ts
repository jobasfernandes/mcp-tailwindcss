import type { ExtractedKind } from './ast-parser.js'

export const CATEGORY_EMOJI: Record<ExtractedKind, string> = {
  interface: '📋',
  type: '📝',
  enum: '🔢',
  function: '⚡',
  class: '🏛️',
  variable: '📦',
  namespace: '📁',
  're-export': '🔗',
}

export const CATEGORY_LABELS: Record<ExtractedKind, string> = {
  interface: 'Interfaces',
  type: 'Type Aliases',
  enum: 'Enumerations',
  function: 'Functions',
  class: 'Classes',
  variable: 'Variables/Constants',
  namespace: 'Namespaces',
  're-export': 'Re-exports',
}
