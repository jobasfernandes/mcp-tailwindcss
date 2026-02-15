import * as fs from 'fs'
import * as path from 'path'
import type { ExtractedType, PropertyInfo, LibraryStatistics, DependencyInfo, ExtractedKind } from './ast-parser.js'
import { CATEGORY_EMOJI, CATEGORY_LABELS } from './constants.js'

export function getDirectoryTree(dirPath: string, prefix = ''): string {
  let result = ''
  const items = fs.readdirSync(dirPath, { withFileTypes: true })

  const dirs = items.filter((i) => i.isDirectory() && !i.name.startsWith('.'))
  const files = items.filter(
    (i) => i.isFile() && (i.name.endsWith('.ts') || i.name.endsWith('.js')),
  )

  for (const file of files) {
    result += `${prefix}├── ${file.name}\n`
  }

  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i]
    const isLast = i === dirs.length - 1
    result += `${prefix}${isLast ? '└── ' : '├── '}${dir.name}/\n`
    result += getDirectoryTree(path.join(dirPath, dir.name), prefix + (isLast ? '    ' : '│   '))
  }

  return result
}

export function formatProperty(prop: PropertyInfo): string {
  if (prop.isMethod || prop.isCallSignature) {
    const params = prop.parameters?.join(', ') || ''
    return `${prop.name}(${params}): ${prop.returnType || prop.type}`
  }
  if (prop.isIndexSignature) {
    return `${prop.name}: ${prop.type}`
  }
  const optional = prop.optional ? '?' : ''
  const readonly = prop.readonly ? 'readonly ' : ''
  return `${readonly}${prop.name}${optional}: ${prop.type}`
}

export function formatExtractedType(type: ExtractedType, detailed = false): string {
  let result = `### ${CATEGORY_EMOJI[type.kind]} ${type.kind}: \`${type.name}\`\n\n`

  result += `**Arquivo:** \`${type.file}\`${type.lineNumber ? ` (linha ${type.lineNumber})` : ''}\n`
  result += `**Módulo:** ${type.module}\n\n`

  if (type.docs) {
    result += `> ${type.docs}\n\n`
  }

  result += '```typescript\n' + type.signature + '\n```\n\n'

  if (detailed) {
    if (type.typeParameters && type.typeParameters.length > 0) {
      result += '**Type Parameters:**\n'
      for (const tp of type.typeParameters) {
        result += `- \`${tp.name}\``
        if (tp.constraint) result += ` extends \`${tp.constraint}\``
        if (tp.default) result += ` = \`${tp.default}\``
        result += '\n'
      }
      result += '\n'
    }

    if (type.extends && type.extends.length > 0) {
      result += `**Extends:** ${type.extends.map((e) => `\`${e}\``).join(', ')}\n\n`
    }

    if (type.implements && type.implements.length > 0) {
      result += `**Implements:** ${type.implements.map((i) => `\`${i}\``).join(', ')}\n\n`
    }

    if (type.properties && type.properties.length > 0) {
      result += '**Properties:**\n'
      for (const prop of type.properties.slice(0, 15)) {
        result += `- \`${formatProperty(prop)}\`\n`
        if (prop.docs) result += `  > ${prop.docs}\n`
      }
      if (type.properties.length > 15) {
        result += `- ... e mais ${type.properties.length - 15} propriedades\n`
      }
      result += '\n'
    }

    if (type.methods && type.methods.length > 0) {
      result += '**Methods:**\n'
      for (const method of type.methods.slice(0, 15)) {
        result += `- \`${formatProperty(method)}\`\n`
        if (method.docs) result += `  > ${method.docs}\n`
      }
      if (type.methods.length > 15) {
        result += `- ... e mais ${type.methods.length - 15} métodos\n`
      }
      result += '\n'
    }

    if (type.members && type.members.length > 0) {
      result += '**Members:**\n'
      for (const member of type.members.slice(0, 20)) {
        result += `- \`${member}\`\n`
      }
      if (type.members.length > 20) {
        result += `- ... e mais ${type.members.length - 20} membros\n`
      }
      result += '\n'
    }

    if (type.value) {
      result += `**Value:** \`${type.value}\`\n\n`
    }
  }

  return result
}

export function formatStatistics(stats: LibraryStatistics): string {
  let result = '# 📊 Estatísticas da Biblioteca Tailwind CSS\n\n'
  result += `**Total de Declarações:** ${stats.totalDeclarations}\n\n`

  result += '## Por Categoria\n\n'
  result += '| Categoria | Quantidade | % |\n'
  result += '|-----------|------------|---|\n'
  for (const [kind, count] of Object.entries(stats.byKind)) {
    const percentage = ((count / stats.totalDeclarations) * 100).toFixed(1)
    result += `| ${CATEGORY_EMOJI[kind as ExtractedKind]} ${CATEGORY_LABELS[kind as ExtractedKind]} | ${count} | ${percentage}% |\n`
  }

  result += '\n## Por Módulo\n\n'
  result += '| Módulo | Total | Interfaces | Types | Functions | Enums | Variables | Classes |\n'
  result += '|--------|-------|------------|-------|-----------|-------|-----------|----------|\n'
  for (const mod of stats.byModule) {
    result += `| **${mod.module}** | ${mod.total} | ${mod.interfaces} | ${mod.types} | ${mod.functions} | ${mod.enums} | ${mod.variables} | ${mod.classes} |\n`
  }

  result += '\n## Top Interfaces\n'
  for (const name of stats.topInterfaces) {
    result += `- \`${name}\`\n`
  }

  result += '\n## Top Types\n'
  for (const name of stats.topTypes) {
    result += `- \`${name}\`\n`
  }

  result += '\n## Top Functions\n'
  for (const name of stats.topFunctions) {
    result += `- \`${name}\`\n`
  }

  return result
}

export function formatDependencies(deps: DependencyInfo[]): string {
  let result = '# 🔗 Análise de Dependências\n\n'

  for (const dep of deps) {
    result += `## 📁 ${dep.module}\n\n`

    if (dep.exports.length > 0) {
      result += `**Exports (${dep.exports.length}):** `
      result += dep.exports.slice(0, 10).map((e) => `\`${e}\``).join(', ')
      if (dep.exports.length > 10) {
        result += `, ... (+${dep.exports.length - 10})`
      }
      result += '\n\n'
    }

    if (dep.reExportsFrom.length > 0) {
      result += `**Re-exports from:** ${dep.reExportsFrom.map((r) => `\`${r}\``).join(', ')}\n\n`
    }
  }

  return result
}
