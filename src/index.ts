#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import {
  AstParser,
  ExtractedType,
  ExtractedKind,
  PropertyInfo,
  LibraryStatistics,
  DependencyInfo,
} from './ast-parser.js'
import {
  checkAndUpdate,
  checkForUpdates,
  getRepositoryStatus,
  scheduleUpdateCheck,
  ensureRepository,
} from './auto-updater.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let TAILWIND_SRC_PATH = process.env.TAILWIND_SRC_PATH || ''

const CATEGORY_EMOJI: Record<ExtractedKind, string> = {
  interface: '📋',
  type: '📝',
  enum: '🔢',
  function: '⚡',
  class: '🏛️',
  variable: '📦',
  namespace: '📁',
  're-export': '🔗',
}

const CATEGORY_LABELS: Record<ExtractedKind, string> = {
  interface: 'Interfaces',
  type: 'Type Aliases',
  enum: 'Enumerations',
  function: 'Functions',
  class: 'Classes',
  variable: 'Variables/Constants',
  namespace: 'Namespaces',
  're-export': 'Re-exports',
}

const mcpServer = new McpServer(
  {
    name: 'mcp-tailwindcss',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
)

function getDirectoryTree(dirPath: string, prefix = ''): string {
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

function formatProperty(prop: PropertyInfo): string {
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

function formatExtractedType(type: ExtractedType, detailed = false): string {
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

function formatStatistics(stats: LibraryStatistics): string {
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

function formatDependencies(deps: DependencyInfo[]): string {
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

mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'tailwind_estrutura',
        description:
          'Lista a estrutura de arquivos do pacote Tailwind CSS (packages/tailwindcss/src). Útil para entender a organização do código.',
        inputSchema: {
          type: 'object',
          properties: {
            subpasta: {
              type: 'string',
              description:
                'Subpasta específica para listar (ex: utils, compat). Deixe vazio para listar tudo.',
            },
          },
          required: [],
        },
      },
      {
        name: 'tailwind_ler_arquivo',
        description: 'Lê o conteúdo de um arquivo específico da biblioteca Tailwind CSS.',
        inputSchema: {
          type: 'object',
          properties: {
            caminho: {
              type: 'string',
              description: 'Caminho relativo do arquivo dentro de src/ (ex: utils/resolve-config.ts)',
            },
          },
          required: ['caminho'],
        },
      },
      {
        name: 'tailwind_extrair_tipos',
        description:
          'Extrai interfaces, types, enums, funções, classes, variáveis e namespaces exportados do Tailwind usando análise de AST. Economiza tokens mostrando apenas assinaturas.',
        inputSchema: {
          type: 'object',
          properties: {
            modulo: {
              type: 'string',
              description:
                'Nome do módulo para extrair tipos (ex: utils, compat, intellisense). Deixe vazio para todos.',
            },
            apenas_kind: {
              type: 'string',
              enum: ['interface', 'type', 'enum', 'function', 'class', 'variable', 'namespace', 're-export'],
              description: 'Filtrar por tipo específico de declaração.',
            },
          },
          required: [],
        },
      },
      {
        name: 'tailwind_buscar_tipo',
        description:
          'Busca a definição de um tipo específico do Tailwind pelo nome. Retorna assinatura completa, propriedades, métodos e documentação.',
        inputSchema: {
          type: 'object',
          properties: {
            nome: {
              type: 'string',
              description:
                'Nome do tipo a buscar (ex: Config, PluginCreator, ThemeValue)',
            },
          },
          required: ['nome'],
        },
      },
      {
        name: 'tailwind_buscar_fuzzy',
        description:
          'Busca tipos do Tailwind usando correspondência aproximada. Útil quando não sabe o nome exato.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Termo de busca (ex: "message send", "auth state", "socket config")',
            },
            limite: {
              type: 'number',
              description: 'Número máximo de resultados (default: 20)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'tailwind_listar_exports',
        description:
          'Lista todos os exports públicos do Tailwind, agrupados por módulo e categoria.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'tailwind_categorias',
        description:
          'Lista declarações de uma categoria específica (interfaces, types, enums, functions, classes, variables, namespaces) do Tailwind.',
        inputSchema: {
          type: 'object',
          properties: {
            categoria: {
              type: 'string',
              enum: ['interface', 'type', 'enum', 'function', 'class', 'variable', 'namespace', 're-export'],
              description: 'Categoria de declarações para listar.',
            },
            modulo: {
              type: 'string',
              description: 'Filtrar por módulo específico (opcional).',
            },
          },
          required: ['categoria'],
        },
      },
      {
        name: 'tailwind_constantes',
        description:
          'Lista todas as constantes e variáveis exportadas do Tailwind (configurações, defaults, etc).',
        inputSchema: {
          type: 'object',
          properties: {
            modulo: {
              type: 'string',
              description: 'Filtrar por módulo específico (ex: Defaults, WABinary).',
            },
          },
          required: [],
        },
      },
      {
        name: 'tailwind_hierarquia',
        description:
          'Mostra a hierarquia de herança de um tipo (extends/implements, pais e filhos).',
        inputSchema: {
          type: 'object',
          properties: {
            nome: {
              type: 'string',
              description: 'Nome do tipo para analisar hierarquia.',
            },
          },
          required: ['nome'],
        },
      },
      {
        name: 'tailwind_estatisticas',
        description:
          'Retorna estatísticas detalhadas do Tailwind: contagem por categoria, por módulo, top tipos.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'tailwind_dependencias',
        description:
          'Analisa as dependências entre módulos do Tailwind: o que cada módulo exporta e re-exporta.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'tailwind_enums',
        description:
          'Lista todas as enumerações exportadas do Tailwind com seus valores.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'tailwind_interfaces',
        description:
          'Lista todas as interfaces do Tailwind com suas propriedades e métodos.',
        inputSchema: {
          type: 'object',
          properties: {
            modulo: {
              type: 'string',
              description: 'Filtrar por módulo específico.',
            },
            detalhado: {
              type: 'boolean',
              description: 'Incluir propriedades e métodos (default: false).',
            },
          },
          required: [],
        },
      },
      {
        name: 'tailwind_funcoes',
        description:
          'Lista todas as funções exportadas do Tailwind com suas assinaturas.',
        inputSchema: {
          type: 'object',
          properties: {
            modulo: {
              type: 'string',
              description: 'Filtrar por módulo específico (ex: Utils, Socket).',
            },
          },
          required: [],
        },
      },
      {
        name: 'tailwind_check_updates',
        description:
          'Verifica se há atualizações disponíveis no repositório oficial do Tailwind CSS (GitHub). Não aplica atualizações, apenas verifica.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'tailwind_update',
        description:
          'Atualiza o repositório local do Tailwind CSS para a versão mais recente do GitHub. Executa git pull automaticamente.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'tailwind_status',
        description:
          'Mostra o status atual do repositório Tailwind: SHA do commit, se há atualizações pendentes, caminho do repositório.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'tailwind_integracoes',
        description:
          'Passo a passo e snippets para integrar Tailwind CSS com frameworks (Vite, Next.js, Nuxt, SvelteKit, Remix, Astro, Vue, React).',
        inputSchema: {
          type: 'object',
          properties: {
            framework: {
              type: 'string',
              description: 'Framework alvo (vite, next, nuxt, sveltekit, remix, astro, vue, react).',
            },
          },
          required: ['framework'],
        },
      },
      {
        name: 'tailwind_utilities',
        description:
          'Lista completa de classes utilitárias do Tailwind CSS organizadas por categoria (layout, flexbox, grid, spacing, sizing, typography, backgrounds, borders, effects, filters, transitions, transforms). Inclui sintaxe e CSS gerado.',
        inputSchema: {
          type: 'object',
          properties: {
            categoria: {
              type: 'string',
              enum: ['layout', 'flexbox', 'grid', 'spacing', 'sizing', 'typography', 'backgrounds', 'borders', 'effects', 'filters', 'transitions', 'transforms', 'interactivity', 'svg', 'tables', 'accessibility'],
              description: 'Categoria de utilities para listar. Se omitido, lista todas as categorias disponíveis.',
            },
          },
          required: [],
        },
      },
      {
        name: 'tailwind_variants',
        description:
          'Lista completa de variants (modificadores) do Tailwind CSS: pseudo-classes (hover, focus, active), pseudo-elements (before, after), media queries (sm, md, lg), estados (disabled, checked), dark mode, e variants compostos (group-hover, peer-focus).',
        inputSchema: {
          type: 'object',
          properties: {
            tipo: {
              type: 'string',
              enum: ['pseudo-classes', 'pseudo-elements', 'responsive', 'dark-mode', 'state', 'compound', 'aria', 'data'],
              description: 'Tipo de variant para listar. Se omitido, lista todos os tipos.',
            },
          },
          required: [],
        },
      },
      {
        name: 'tailwind_cores',
        description:
          'Paleta completa de cores do Tailwind CSS v4 com valores em OKLCH e equivalentes hex. Inclui todas as escalas (50-950) para cada cor (slate, gray, red, orange, yellow, green, blue, indigo, purple, pink).',
        inputSchema: {
          type: 'object',
          properties: {
            cor: {
              type: 'string',
              description: 'Nome da cor específica (slate, gray, zinc, neutral, stone, red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose). Se omitido, lista todas.',
            },
          },
          required: [],
        },
      },
      {
        name: 'tailwind_spacing',
        description:
          'Escala completa de espaçamento do Tailwind CSS. Mostra todos os valores de spacing (0, 0.5, 1, 1.5, 2, ... 96, px) com seus valores em rem/px. Usado para margin, padding, gap, width, height, etc.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'tailwind_breakpoints',
        description:
          'Breakpoints responsivos do Tailwind CSS com valores e exemplos de uso. Mostra sm, md, lg, xl, 2xl e como usar min-*, max-* e container queries (@sm, @md, etc).',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'tailwind_receitas',
        description:
          'Receitas e exemplos prontos de componentes comuns com Tailwind CSS: buttons, cards, forms, modals, navbars, footers, heroes, grids responsivos. Código HTML+classes pronto para copiar.',
        inputSchema: {
          type: 'object',
          properties: {
            componente: {
              type: 'string',
              enum: ['button', 'card', 'form', 'input', 'modal', 'navbar', 'footer', 'hero', 'grid', 'alert', 'badge', 'avatar', 'dropdown', 'tabs', 'breadcrumb', 'pagination', 'skeleton'],
              description: 'Componente específico para ver a receita.',
            },
          },
          required: ['componente'],
        },
      },
      {
        name: 'tailwind_migracao_v4',
        description:
          'Guia completo de migração do Tailwind CSS v3 para v4. Mudanças de sintaxe, novas features, breaking changes, e exemplos de código antes/depois.',
        inputSchema: {
          type: 'object',
          properties: {
            topico: {
              type: 'string',
              enum: ['overview', 'css-first', 'theme-config', 'utilities', 'variants', 'plugins', 'breaking-changes', 'postcss-vite'],
              description: 'Tópico específico da migração. Se omitido, mostra overview completo.',
            },
          },
          required: [],
        },
      },
      {
        name: 'tailwind_boas_praticas',
        description:
          'Boas práticas e dicas para usar Tailwind CSS de forma eficiente: organização de classes, extração de componentes, performance, acessibilidade, responsive design, dark mode.',
        inputSchema: {
          type: 'object',
          properties: {
            topico: {
              type: 'string',
              enum: ['organizacao', 'componentes', 'performance', 'acessibilidade', 'responsivo', 'dark-mode', 'animacoes', 'forms'],
              description: 'Tópico específico. Se omitido, mostra dicas gerais.',
            },
          },
          required: [],
        },
      },
    ],
  }
})

mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params

  try {
    switch (name) {
      case 'tailwind_estrutura': {
        const subpasta = (args as { subpasta?: string })?.subpasta
        const targetPath = subpasta ? path.join(TAILWIND_SRC_PATH, subpasta) : TAILWIND_SRC_PATH

        if (!fs.existsSync(targetPath)) {
          return {
            content: [{ type: 'text', text: `❌ Pasta não encontrada: ${subpasta || 'src'}` }],
            isError: true,
          }
        }

        const tree = getDirectoryTree(targetPath)
        return {
          content: [
            {
              type: 'text',
              text: `# 📁 Estrutura de ${subpasta || 'tailwindcss/packages/tailwindcss/src'}\n\n\`\`\`\n${tree}\`\`\``,
            },
          ],
        }
      }

      case 'tailwind_ler_arquivo': {
        const caminho = (args as { caminho: string }).caminho
        const fullPath = path.join(TAILWIND_SRC_PATH, caminho)

        if (!fs.existsSync(fullPath)) {
          return {
            content: [{ type: 'text', text: `❌ Arquivo não encontrado: ${caminho}` }],
            isError: true,
          }
        }

        const content = fs.readFileSync(fullPath, 'utf-8')
        const ext = path.extname(caminho).slice(1) || 'typescript'

        return {
          content: [
            {
              type: 'text',
              text: `# 📄 ${caminho}\n\n\`\`\`${ext}\n${content}\n\`\`\``,
            },
          ],
        }
      }

      case 'tailwind_extrair_tipos': {
        const { modulo, apenas_kind } = args as { modulo?: string; apenas_kind?: ExtractedKind }

        const parser = new AstParser(TAILWIND_SRC_PATH)
        let types: ExtractedType[]

        if (modulo) {
          types = parser.getTypesFromModule(modulo)
        } else {
          types = parser.extractAllTypes()
        }

        if (apenas_kind) {
          types = types.filter((t) => t.kind === apenas_kind)
        }

        const grouped: Record<string, ExtractedType[]> = {}
        for (const type of types) {
          if (!grouped[type.module]) grouped[type.module] = []
          grouped[type.module].push(type)
        }

        let result = `# 📚 Tipos Exportados${modulo ? ` (${modulo})` : ''}${apenas_kind ? ` - ${CATEGORY_LABELS[apenas_kind]}` : ''}\n\n`
        result += `**Total:** ${types.length} declarações\n\n`

        for (const [mod, moduleTypes] of Object.entries(grouped)) {
          result += `## 📁 ${mod}\n\n`
          for (const type of moduleTypes) {
            result += formatExtractedType(type, false)
          }
        }

        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'tailwind_buscar_tipo': {
        const nome = (args as { nome: string }).nome

        const parser = new AstParser(TAILWIND_SRC_PATH)
        const found = parser.searchType(nome)

        if (!found) {
          const fuzzyResults = parser.fuzzySearch(nome, 5)
          let suggestion = ''
          if (fuzzyResults.length > 0) {
            suggestion = '\n\n**Você quis dizer:**\n' + fuzzyResults.map((t) => `- \`${t.name}\` (${t.kind})`).join('\n')
          }
          return {
            content: [
              {
                type: 'text',
                text: `❌ Tipo "${nome}" não encontrado.${suggestion}`,
              },
            ],
            isError: true,
          }
        }

        return {
          content: [{ type: 'text', text: formatExtractedType(found, true) }],
        }
      }

      case 'tailwind_buscar_fuzzy': {
        const { query, limite } = args as { query: string; limite?: number }

        const parser = new AstParser(TAILWIND_SRC_PATH)
        const results = parser.fuzzySearch(query, limite || 20)

        if (results.length === 0) {
          return {
            content: [{ type: 'text', text: `❌ Nenhum resultado encontrado para "${query}"` }],
            isError: true,
          }
        }

        let result = `# 🔍 Resultados para "${query}"\n\n`
        result += `**Encontrados:** ${results.length} tipos\n\n`

        for (const type of results) {
          result += `- ${CATEGORY_EMOJI[type.kind]} **\`${type.name}\`** (${type.kind}) - \`${type.file}\`\n`
          if (type.docs) result += `  > ${type.docs.substring(0, 100)}...\n`
        }

        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'tailwind_listar_exports': {
        const parser = new AstParser(TAILWIND_SRC_PATH)
        const types = parser.extractAllTypes()

        const byModule: Record<string, Record<ExtractedKind, string[]>> = {}

        for (const type of types) {
          if (!byModule[type.module]) {
            byModule[type.module] = {} as Record<ExtractedKind, string[]>
          }
          if (!byModule[type.module][type.kind]) {
            byModule[type.module][type.kind] = []
          }
          byModule[type.module][type.kind].push(type.name)
        }

        let result = '# 📚 Exports da Biblioteca Tailwind CSS\n\n'
        result += `**Total:** ${types.length} declarações exportadas\n\n`

        for (const [module, kinds] of Object.entries(byModule)) {
          const total = Object.values(kinds).flat().length
          result += `## 📁 ${module} (${total})\n\n`

          for (const [kind, names] of Object.entries(kinds)) {
            result += `### ${CATEGORY_EMOJI[kind as ExtractedKind]} ${CATEGORY_LABELS[kind as ExtractedKind]} (${names.length})\n`
            for (const name of names.slice(0, 10)) {
              result += `- \`${name}\`\n`
            }
            if (names.length > 10) {
              result += `- ... e mais ${names.length - 10}\n`
            }
            result += '\n'
          }
        }

        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'tailwind_categorias': {
        const { categoria, modulo } = args as { categoria: ExtractedKind; modulo?: string }

        const parser = new AstParser(TAILWIND_SRC_PATH)
        let types = parser.getTypesByKind(categoria)

        if (modulo) {
          types = types.filter((t) => t.module.toLowerCase() === modulo.toLowerCase())
        }

        let result = `# ${CATEGORY_EMOJI[categoria]} ${CATEGORY_LABELS[categoria]}\n\n`
        result += `**Total:** ${types.length}\n\n`

        for (const type of types) {
          result += formatExtractedType(type, categoria === 'enum' || categoria === 'interface')
        }

        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'tailwind_constantes': {
        const { modulo } = args as { modulo?: string }

        const parser = new AstParser(TAILWIND_SRC_PATH)
        let constants = parser.getConstants()

        if (modulo) {
          constants = constants.filter((c) => c.module.toLowerCase() === modulo.toLowerCase())
        }

        let result = '# 📦 Constantes e Variáveis Exportadas\n\n'
        result += `**Total:** ${constants.length}\n\n`

        const byModule: Record<string, ExtractedType[]> = {}
        for (const c of constants) {
          if (!byModule[c.module]) byModule[c.module] = []
          byModule[c.module].push(c)
        }

        for (const [mod, vars] of Object.entries(byModule)) {
          result += `## 📁 ${mod}\n\n`
          for (const v of vars) {
            result += `### \`${v.name}\`\n`
            result += `**Tipo:** \`${v.signature.replace(`const ${v.name}: `, '')}\`\n`
            if (v.value) {
              result += `**Valor:** \`${v.value}\`\n`
            }
            result += '\n'
          }
        }

        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'tailwind_hierarquia': {
        const { nome } = args as { nome: string }

        const parser = new AstParser(TAILWIND_SRC_PATH)
        const hierarchy = parser.getTypeHierarchy(nome)

        if (!hierarchy) {
          return {
            content: [{ type: 'text', text: `❌ Tipo "${nome}" não encontrado.` }],
            isError: true,
          }
        }

        let result = `# 🌳 Hierarquia de \`${hierarchy.type.name}\`\n\n`
        result += formatExtractedType(hierarchy.type, false)

        if (hierarchy.parents.length > 0) {
          result += '## ⬆️ Herda de (Parents)\n\n'
          for (const parent of hierarchy.parents) {
            result += `- \`${parent}\`\n`
          }
          result += '\n'
        }

        if (hierarchy.children.length > 0) {
          result += '## ⬇️ Herdado por (Children)\n\n'
          for (const child of hierarchy.children) {
            result += `- \`${child}\`\n`
          }
          result += '\n'
        }

        if (hierarchy.parents.length === 0 && hierarchy.children.length === 0) {
          result += '*Este tipo não possui relacionamentos de herança.*\n'
        }

        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'tailwind_estatisticas': {
        const parser = new AstParser(TAILWIND_SRC_PATH)
        const stats = parser.getStatistics()

        return {
          content: [{ type: 'text', text: formatStatistics(stats) }],
        }
      }

      case 'tailwind_dependencias': {
        const parser = new AstParser(TAILWIND_SRC_PATH)
        const deps = parser.analyzeDependencies()

        return {
          content: [{ type: 'text', text: formatDependencies(deps) }],
        }
      }

      case 'tailwind_enums': {
        const parser = new AstParser(TAILWIND_SRC_PATH)
        const enums = parser.getEnums()

        let result = '# 🔢 Enumerações da Biblioteca\n\n'
        result += `**Total:** ${enums.length}\n\n`

        for (const e of enums) {
          result += `## \`${e.name}\`\n\n`
          result += `**Arquivo:** \`${e.file}\`\n\n`
          if (e.docs) result += `> ${e.docs}\n\n`

          if (e.members && e.members.length > 0) {
            result += '**Valores:**\n'
            for (const member of e.members) {
              result += `- \`${member}\`\n`
            }
          }
          result += '\n'
        }

        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'tailwind_interfaces': {
        const { modulo, detalhado } = args as { modulo?: string; detalhado?: boolean }

        const parser = new AstParser(TAILWIND_SRC_PATH)
        let interfaces = parser.getInterfaces()

        if (modulo) {
          interfaces = interfaces.filter((i) => i.module.toLowerCase() === modulo.toLowerCase())
        }

        let result = '# 📋 Interfaces da Biblioteca\n\n'
        result += `**Total:** ${interfaces.length}\n\n`

        for (const iface of interfaces) {
          result += formatExtractedType(iface, detalhado || false)
        }

        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'tailwind_funcoes': {
        const { modulo } = args as { modulo?: string }

        const parser = new AstParser(TAILWIND_SRC_PATH)
        let functions = parser.getFunctions()

        if (modulo) {
          functions = functions.filter((f) => f.module.toLowerCase() === modulo.toLowerCase())
        }

        let result = '# ⚡ Funções da Biblioteca\n\n'
        result += `**Total:** ${functions.length}\n\n`

        const byModule: Record<string, ExtractedType[]> = {}
        for (const f of functions) {
          if (!byModule[f.module]) byModule[f.module] = []
          byModule[f.module].push(f)
        }

        for (const [mod, funcs] of Object.entries(byModule)) {
          result += `## 📁 ${mod}\n\n`
          for (const func of funcs) {
            result += formatExtractedType(func, true)
          }
        }

        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'tailwind_integracoes': {
        const { framework } = args as { framework: string }
        const key = framework.toLowerCase()

        const guides: Record<
          string,
          {
            title: string
            v4: { steps: string[]; configSnippet: string; cssSnippet: string }
            v3: { steps: string[]; configSnippet: string; cssSnippet: string }
            contentGlob: string
          }
        > = {
          vite: {
            title: 'Vite (React/Vue/Svelte)',
            v4: {
              steps: [
                'Instale deps: npm install tailwindcss @tailwindcss/vite',
                'Configure o plugin no vite.config.ts',
                'Crie o CSS com @import "tailwindcss"',
                'Importe o CSS no entry (main.tsx/main.ts)',
              ],
              configSnippet: `// vite.config.ts
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss()]
})`,
              cssSnippet: `/* app.css */
@import "tailwindcss";

@theme {
  /* Customize theme variables */
  --color-brand: oklch(0.72 0.11 221.19);
}`,
            },
            v3: {
              steps: [
                'Instale deps: npm install -D tailwindcss postcss autoprefixer',
                'Gere config: npx tailwindcss init -p',
                'Configure content no tailwind.config.js',
                'Crie CSS com diretivas @tailwind',
              ],
              configSnippet: `// tailwind.config.js
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx,vue,svelte}'],
  theme: { extend: {} },
  plugins: [],
}`,
              cssSnippet: `/* src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;`,
            },
            contentGlob: './index.html, ./src/**/*.{js,ts,jsx,tsx,vue,svelte}',
          },
          next: {
            title: 'Next.js (App Router)',
            v4: {
              steps: [
                'Instale deps: npm install tailwindcss @tailwindcss/postcss postcss',
                'Configure postcss.config.mjs',
                'Crie app/globals.css com @import "tailwindcss"',
                'Importe em app/layout.tsx',
              ],
              configSnippet: `// postcss.config.mjs
export default {
  plugins: {
    '@tailwindcss/postcss': {}
  }
}`,
              cssSnippet: `/* app/globals.css */
@import "tailwindcss";

@theme {
  --color-primary: oklch(0.62 0.21 259.81);
}`,
            },
            v3: {
              steps: [
                'Instale deps: npm install -D tailwindcss postcss autoprefixer',
                'Gere config: npx tailwindcss init -p',
                'Configure content no tailwind.config.js',
                'Crie globals.css com diretivas @tailwind',
              ],
              configSnippet: `// tailwind.config.js
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: { extend: {} },
  plugins: [],
}`,
              cssSnippet: `/* app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;`,
            },
            contentGlob: './app/**/*.{js,ts,jsx,tsx,mdx}, ./components/**/*.{js,ts,jsx,tsx}',
          },
          nuxt: {
            title: 'Nuxt 3',
            v4: {
              steps: [
                'Instale deps: npm install tailwindcss @tailwindcss/postcss postcss',
                'Configure postcss no nuxt.config.ts',
                'Crie assets/css/main.css com @import "tailwindcss"',
                'Adicione o CSS ao nuxt.config.ts',
              ],
              configSnippet: `// nuxt.config.ts
export default defineNuxtConfig({
  css: ['~/assets/css/main.css'],
  postcss: {
    plugins: {
      '@tailwindcss/postcss': {}
    }
  }
})`,
              cssSnippet: `/* assets/css/main.css */
@import "tailwindcss";

@theme {
  --color-brand: oklch(0.69 0.17 162.48);
}`,
            },
            v3: {
              steps: [
                'Instale deps: npm install -D tailwindcss postcss autoprefixer',
                'Gere config: npx tailwindcss init -p',
                'Configure content e adicione CSS ao nuxt.config.ts',
              ],
              configSnippet: `// tailwind.config.js
module.exports = {
  content: [
    './components/**/*.{vue,js,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './app.vue',
    './plugins/**/*.{js,ts}',
  ],
  theme: { extend: {} },
  plugins: [],
}`,
              cssSnippet: `/* assets/css/tailwind.css */
@tailwind base;
@tailwind components;
@tailwind utilities;`,
            },
            contentGlob: './components/**/*.{vue,js,ts}, ./pages/**/*.vue, ./app.vue',
          },
          sveltekit: {
            title: 'SvelteKit',
            v4: {
              steps: [
                'Instale deps: npm install tailwindcss @tailwindcss/vite',
                'Configure o plugin no vite.config.ts',
                'Crie src/app.css com @import "tailwindcss"',
                'Importe em src/routes/+layout.svelte',
              ],
              configSnippet: `// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()]
})`,
              cssSnippet: `/* src/app.css */
@import "tailwindcss";`,
            },
            v3: {
              steps: [
                'Instale deps: npm install -D tailwindcss postcss autoprefixer',
                'Gere config: npx tailwindcss init -p',
                'Crie src/app.css e importe em +layout.svelte',
              ],
              configSnippet: `// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: { extend: {} },
  plugins: [],
}`,
              cssSnippet: `/* src/app.css */
@tailwind base;
@tailwind components;
@tailwind utilities;`,
            },
            contentGlob: './src/**/*.{html,js,svelte,ts}',
          },
          astro: {
            title: 'Astro',
            v4: {
              steps: [
                'Instale deps: npm install tailwindcss @tailwindcss/vite',
                'Configure o plugin no astro.config.mjs',
                'Crie src/styles/global.css com @import "tailwindcss"',
                'Importe em layouts/Layout.astro',
              ],
              configSnippet: `// astro.config.mjs
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  }
})`,
              cssSnippet: `/* src/styles/global.css */
@import "tailwindcss";`,
            },
            v3: {
              steps: [
                'Use: npx astro add tailwind (recomendado)',
                'Ou manual: npm install -D tailwindcss @astrojs/tailwind',
              ],
              configSnippet: `// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte}'],
  theme: { extend: {} },
  plugins: [],
}`,
              cssSnippet: `/* src/styles/global.css */
@tailwind base;
@tailwind components;
@tailwind utilities;`,
            },
            contentGlob: './src/**/*.{astro,html,js,jsx,ts,tsx,vue,svelte}',
          },
          remix: {
            title: 'Remix',
            v4: {
              steps: [
                'Instale deps: npm install tailwindcss @tailwindcss/vite',
                'Configure o plugin no vite.config.ts',
                'Crie app/tailwind.css com @import "tailwindcss"',
                'Importe em app/root.tsx via links()',
              ],
              configSnippet: `// vite.config.ts
import { vitePlugin as remix } from '@remix-run/dev'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), remix()]
})`,
              cssSnippet: `/* app/tailwind.css */
@import "tailwindcss";`,
            },
            v3: {
              steps: [
                'Instale deps: npm install -D tailwindcss postcss autoprefixer',
                'Gere config: npx tailwindcss init -p',
                'Crie app/tailwind.css e importe em root.tsx',
              ],
              configSnippet: `// tailwind.config.js
module.exports = {
  content: ['./app/**/*.{ts,tsx,js,jsx}'],
  theme: { extend: {} },
  plugins: [],
}`,
              cssSnippet: `/* app/tailwind.css */
@tailwind base;
@tailwind components;
@tailwind utilities;`,
            },
            contentGlob: './app/**/*.{ts,tsx,js,jsx}',
          },
          vue: {
            title: 'Vue 3 (Vite)',
            v4: {
              steps: [
                'Instale deps: npm install tailwindcss @tailwindcss/vite',
                'Configure o plugin no vite.config.ts',
                'Crie src/assets/main.css com @import "tailwindcss"',
                'Importe em src/main.ts',
              ],
              configSnippet: `// vite.config.ts
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()]
})`,
              cssSnippet: `/* src/assets/main.css */
@import "tailwindcss";`,
            },
            v3: {
              steps: [
                'Instale deps: npm install -D tailwindcss postcss autoprefixer',
                'Gere config: npx tailwindcss init -p',
                'Crie src/assets/tailwind.css e importe em main.ts',
              ],
              configSnippet: `// tailwind.config.js
module.exports = {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
}`,
              cssSnippet: `/* src/assets/tailwind.css */
@tailwind base;
@tailwind components;
@tailwind utilities;`,
            },
            contentGlob: './index.html, ./src/**/*.{vue,js,ts,jsx,tsx}',
          },
          react: {
            title: 'React (Vite)',
            v4: {
              steps: [
                'Instale deps: npm install tailwindcss @tailwindcss/vite',
                'Configure o plugin no vite.config.ts',
                'Crie src/index.css com @import "tailwindcss"',
                'Importe em src/main.tsx',
              ],
              configSnippet: `// vite.config.ts
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()]
})`,
              cssSnippet: `/* src/index.css */
@import "tailwindcss";`,
            },
            v3: {
              steps: [
                'Instale deps: npm install -D tailwindcss postcss autoprefixer',
                'Gere config: npx tailwindcss init -p',
                'Crie src/index.css e importe em main.tsx/index.tsx',
              ],
              configSnippet: `// tailwind.config.js
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
}`,
              cssSnippet: `/* src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;`,
            },
            contentGlob: './index.html, ./src/**/*.{js,ts,jsx,tsx}',
          },
          postcss: {
            title: 'PostCSS (Universal)',
            v4: {
              steps: [
                'Instale deps: npm install tailwindcss @tailwindcss/postcss postcss',
                'Configure postcss.config.js',
                'Crie CSS com @import "tailwindcss"',
              ],
              configSnippet: `// postcss.config.js
export default {
  plugins: {
    '@tailwindcss/postcss': {}
  }
}`,
              cssSnippet: `/* styles.css */
@import "tailwindcss";`,
            },
            v3: {
              steps: [
                'Instale deps: npm install -D tailwindcss postcss autoprefixer',
                'Configure postcss.config.js',
                'Crie CSS com diretivas @tailwind',
              ],
              configSnippet: `// postcss.config.js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  }
}`,
              cssSnippet: `/* styles.css */
@tailwind base;
@tailwind components;
@tailwind utilities;`,
            },
            contentGlob: './src/**/*.{html,js,ts,jsx,tsx}',
          },
          cli: {
            title: 'CLI (Standalone)',
            v4: {
              steps: [
                'Instale: npm install tailwindcss @tailwindcss/cli',
                'Execute: npx @tailwindcss/cli -i input.css -o output.css --watch',
              ],
              configSnippet: `# Comando para build
npx @tailwindcss/cli -i input.css -o output.css

# Comando para watch
npx @tailwindcss/cli -i input.css -o output.css --watch

# Minificado para produção
npx @tailwindcss/cli -i input.css -o output.css --minify`,
              cssSnippet: `/* input.css */
@import "tailwindcss";`,
            },
            v3: {
              steps: [
                'Instale: npm install -D tailwindcss',
                'Gere config: npx tailwindcss init',
                'Execute: npx tailwindcss -i input.css -o output.css --watch',
              ],
              configSnippet: `# Comando para watch
npx tailwindcss -i ./src/input.css -o ./dist/output.css --watch

# Minificado para produção  
npx tailwindcss -i ./src/input.css -o ./dist/output.css --minify`,
              cssSnippet: `/* input.css */
@tailwind base;
@tailwind components;
@tailwind utilities;`,
            },
            contentGlob: './src/**/*.{html,js}',
          },
        }

        const guide = guides[key]
        if (!guide) {
          const available = Object.keys(guides).join(', ')
          return {
            content: [{ type: 'text', text: `❌ Framework não suportado: ${framework}\n\nFrameworks disponíveis: ${available}` }],
            isError: true,
          }
        }

        let result = `# 🚀 Integração Tailwind CSS + ${guide.title}\n\n`
        
        result += '---\n\n'
        result += '## ⚡ Tailwind v4 (Recomendado)\n\n'
        result += '**Passos:**\n'
        for (let i = 0; i < guide.v4.steps.length; i++) {
          result += `${i + 1}. ${guide.v4.steps[i]}\n`
        }
        result += '\n**Configuração:**\n```ts\n' + guide.v4.configSnippet + '\n```\n\n'
        result += '**CSS:**\n```css\n' + guide.v4.cssSnippet + '\n```\n\n'
        
        result += '---\n\n'
        result += '## 📦 Tailwind v3 (Legado)\n\n'
        result += '**Passos:**\n'
        for (let i = 0; i < guide.v3.steps.length; i++) {
          result += `${i + 1}. ${guide.v3.steps[i]}\n`
        }
        result += '\n**Configuração:**\n```js\n' + guide.v3.configSnippet + '\n```\n\n'
        result += '**CSS:**\n```css\n' + guide.v3.cssSnippet + '\n```\n\n'
        
        result += '---\n\n'
        result += `**Content glob recomendado:** \`${guide.contentGlob}\`\n`

        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'tailwind_utilities': {
        const categoria = args?.categoria as string | undefined

        const utilities: Record<string, { desc: string; classes: Array<{ class: string; css: string; desc?: string }> }> = {
          layout: {
            desc: 'Controle de layout e posicionamento',
            classes: [
              { class: 'block', css: 'display: block;' },
              { class: 'inline-block', css: 'display: inline-block;' },
              { class: 'inline', css: 'display: inline;' },
              { class: 'flex', css: 'display: flex;' },
              { class: 'inline-flex', css: 'display: inline-flex;' },
              { class: 'grid', css: 'display: grid;' },
              { class: 'inline-grid', css: 'display: inline-grid;' },
              { class: 'hidden', css: 'display: none;' },
              { class: 'container', css: 'width: 100%; max-width: breakpoint;' },
              { class: 'static', css: 'position: static;' },
              { class: 'fixed', css: 'position: fixed;' },
              { class: 'absolute', css: 'position: absolute;' },
              { class: 'relative', css: 'position: relative;' },
              { class: 'sticky', css: 'position: sticky;' },
              { class: 'inset-{n}', css: 'inset: {value};', desc: 'top, right, bottom, left' },
              { class: 'top-{n}', css: 'top: {value};' },
              { class: 'right-{n}', css: 'right: {value};' },
              { class: 'bottom-{n}', css: 'bottom: {value};' },
              { class: 'left-{n}', css: 'left: {value};' },
              { class: 'z-{n}', css: 'z-index: {n};', desc: '0, 10, 20, 30, 40, 50, auto' },
              { class: 'visible', css: 'visibility: visible;' },
              { class: 'invisible', css: 'visibility: hidden;' },
              { class: 'collapse', css: 'visibility: collapse;' },
            ],
          },
          flexbox: {
            desc: 'Flexbox utilities',
            classes: [
              { class: 'flex-row', css: 'flex-direction: row;' },
              { class: 'flex-row-reverse', css: 'flex-direction: row-reverse;' },
              { class: 'flex-col', css: 'flex-direction: column;' },
              { class: 'flex-col-reverse', css: 'flex-direction: column-reverse;' },
              { class: 'flex-wrap', css: 'flex-wrap: wrap;' },
              { class: 'flex-wrap-reverse', css: 'flex-wrap: wrap-reverse;' },
              { class: 'flex-nowrap', css: 'flex-wrap: nowrap;' },
              { class: 'flex-1', css: 'flex: 1 1 0%;' },
              { class: 'flex-auto', css: 'flex: 1 1 auto;' },
              { class: 'flex-initial', css: 'flex: 0 1 auto;' },
              { class: 'flex-none', css: 'flex: none;' },
              { class: 'grow', css: 'flex-grow: 1;' },
              { class: 'grow-0', css: 'flex-grow: 0;' },
              { class: 'shrink', css: 'flex-shrink: 1;' },
              { class: 'shrink-0', css: 'flex-shrink: 0;' },
              { class: 'basis-{n}', css: 'flex-basis: {value};' },
              { class: 'justify-start', css: 'justify-content: flex-start;' },
              { class: 'justify-end', css: 'justify-content: flex-end;' },
              { class: 'justify-center', css: 'justify-content: center;' },
              { class: 'justify-between', css: 'justify-content: space-between;' },
              { class: 'justify-around', css: 'justify-content: space-around;' },
              { class: 'justify-evenly', css: 'justify-content: space-evenly;' },
              { class: 'items-start', css: 'align-items: flex-start;' },
              { class: 'items-end', css: 'align-items: flex-end;' },
              { class: 'items-center', css: 'align-items: center;' },
              { class: 'items-baseline', css: 'align-items: baseline;' },
              { class: 'items-stretch', css: 'align-items: stretch;' },
              { class: 'gap-{n}', css: 'gap: {value};' },
              { class: 'gap-x-{n}', css: 'column-gap: {value};' },
              { class: 'gap-y-{n}', css: 'row-gap: {value};' },
            ],
          },
          grid: {
            desc: 'Grid utilities',
            classes: [
              { class: 'grid-cols-{n}', css: 'grid-template-columns: repeat({n}, minmax(0, 1fr));', desc: '1-12, none' },
              { class: 'grid-rows-{n}', css: 'grid-template-rows: repeat({n}, minmax(0, 1fr));', desc: '1-12, none' },
              { class: 'col-span-{n}', css: 'grid-column: span {n} / span {n};', desc: '1-12, full' },
              { class: 'col-start-{n}', css: 'grid-column-start: {n};' },
              { class: 'col-end-{n}', css: 'grid-column-end: {n};' },
              { class: 'row-span-{n}', css: 'grid-row: span {n} / span {n};' },
              { class: 'row-start-{n}', css: 'grid-row-start: {n};' },
              { class: 'row-end-{n}', css: 'grid-row-end: {n};' },
              { class: 'grid-flow-row', css: 'grid-auto-flow: row;' },
              { class: 'grid-flow-col', css: 'grid-auto-flow: column;' },
              { class: 'grid-flow-dense', css: 'grid-auto-flow: dense;' },
              { class: 'auto-cols-auto', css: 'grid-auto-columns: auto;' },
              { class: 'auto-cols-min', css: 'grid-auto-columns: min-content;' },
              { class: 'auto-cols-max', css: 'grid-auto-columns: max-content;' },
              { class: 'auto-cols-fr', css: 'grid-auto-columns: minmax(0, 1fr);' },
              { class: 'auto-rows-auto', css: 'grid-auto-rows: auto;' },
              { class: 'auto-rows-min', css: 'grid-auto-rows: min-content;' },
              { class: 'auto-rows-max', css: 'grid-auto-rows: max-content;' },
              { class: 'auto-rows-fr', css: 'grid-auto-rows: minmax(0, 1fr);' },
            ],
          },
          spacing: {
            desc: 'Margin e Padding',
            classes: [
              { class: 'p-{n}', css: 'padding: {value};', desc: '0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96, px' },
              { class: 'px-{n}', css: 'padding-left: {value}; padding-right: {value};' },
              { class: 'py-{n}', css: 'padding-top: {value}; padding-bottom: {value};' },
              { class: 'pt-{n}', css: 'padding-top: {value};' },
              { class: 'pr-{n}', css: 'padding-right: {value};' },
              { class: 'pb-{n}', css: 'padding-bottom: {value};' },
              { class: 'pl-{n}', css: 'padding-left: {value};' },
              { class: 'm-{n}', css: 'margin: {value};' },
              { class: 'mx-{n}', css: 'margin-left: {value}; margin-right: {value};' },
              { class: 'my-{n}', css: 'margin-top: {value}; margin-bottom: {value};' },
              { class: 'mt-{n}', css: 'margin-top: {value};' },
              { class: 'mr-{n}', css: 'margin-right: {value};' },
              { class: 'mb-{n}', css: 'margin-bottom: {value};' },
              { class: 'ml-{n}', css: 'margin-left: {value};' },
              { class: '-m-{n}', css: 'margin: -{value};', desc: 'Negative margin' },
              { class: 'space-x-{n}', css: '> * + * { margin-left: {value}; }' },
              { class: 'space-y-{n}', css: '> * + * { margin-top: {value}; }' },
              { class: 'space-x-reverse', css: '--tw-space-x-reverse: 1;' },
              { class: 'space-y-reverse', css: '--tw-space-y-reverse: 1;' },
            ],
          },
          sizing: {
            desc: 'Width e Height',
            classes: [
              { class: 'w-{n}', css: 'width: {value};', desc: '0-96, auto, full, screen, svw, lvw, dvw, min, max, fit' },
              { class: 'w-1/2', css: 'width: 50%;' },
              { class: 'w-1/3', css: 'width: 33.333333%;' },
              { class: 'w-2/3', css: 'width: 66.666667%;' },
              { class: 'w-1/4', css: 'width: 25%;' },
              { class: 'w-full', css: 'width: 100%;' },
              { class: 'w-screen', css: 'width: 100vw;' },
              { class: 'w-auto', css: 'width: auto;' },
              { class: 'min-w-{n}', css: 'min-width: {value};' },
              { class: 'max-w-{n}', css: 'max-width: {value};', desc: 'xs, sm, md, lg, xl, 2xl, 3xl, 4xl, 5xl, 6xl, 7xl, full, prose, screen-sm, screen-md, screen-lg, screen-xl, screen-2xl' },
              { class: 'h-{n}', css: 'height: {value};' },
              { class: 'h-full', css: 'height: 100%;' },
              { class: 'h-screen', css: 'height: 100vh;' },
              { class: 'h-svh', css: 'height: 100svh;' },
              { class: 'h-lvh', css: 'height: 100lvh;' },
              { class: 'h-dvh', css: 'height: 100dvh;' },
              { class: 'min-h-{n}', css: 'min-height: {value};' },
              { class: 'min-h-screen', css: 'min-height: 100vh;' },
              { class: 'max-h-{n}', css: 'max-height: {value};' },
              { class: 'size-{n}', css: 'width: {value}; height: {value};', desc: 'v4: shorthand for w + h' },
            ],
          },
          typography: {
            desc: 'Tipografia e texto',
            classes: [
              { class: 'text-xs', css: 'font-size: 0.75rem; line-height: 1rem;' },
              { class: 'text-sm', css: 'font-size: 0.875rem; line-height: 1.25rem;' },
              { class: 'text-base', css: 'font-size: 1rem; line-height: 1.5rem;' },
              { class: 'text-lg', css: 'font-size: 1.125rem; line-height: 1.75rem;' },
              { class: 'text-xl', css: 'font-size: 1.25rem; line-height: 1.75rem;' },
              { class: 'text-2xl', css: 'font-size: 1.5rem; line-height: 2rem;' },
              { class: 'text-3xl', css: 'font-size: 1.875rem; line-height: 2.25rem;' },
              { class: 'text-4xl', css: 'font-size: 2.25rem; line-height: 2.5rem;' },
              { class: 'text-5xl', css: 'font-size: 3rem; line-height: 1;' },
              { class: 'text-6xl', css: 'font-size: 3.75rem; line-height: 1;' },
              { class: 'font-thin', css: 'font-weight: 100;' },
              { class: 'font-light', css: 'font-weight: 300;' },
              { class: 'font-normal', css: 'font-weight: 400;' },
              { class: 'font-medium', css: 'font-weight: 500;' },
              { class: 'font-semibold', css: 'font-weight: 600;' },
              { class: 'font-bold', css: 'font-weight: 700;' },
              { class: 'font-extrabold', css: 'font-weight: 800;' },
              { class: 'font-black', css: 'font-weight: 900;' },
              { class: 'italic', css: 'font-style: italic;' },
              { class: 'not-italic', css: 'font-style: normal;' },
              { class: 'text-left', css: 'text-align: left;' },
              { class: 'text-center', css: 'text-align: center;' },
              { class: 'text-right', css: 'text-align: right;' },
              { class: 'text-justify', css: 'text-align: justify;' },
              { class: 'underline', css: 'text-decoration-line: underline;' },
              { class: 'overline', css: 'text-decoration-line: overline;' },
              { class: 'line-through', css: 'text-decoration-line: line-through;' },
              { class: 'no-underline', css: 'text-decoration-line: none;' },
              { class: 'uppercase', css: 'text-transform: uppercase;' },
              { class: 'lowercase', css: 'text-transform: lowercase;' },
              { class: 'capitalize', css: 'text-transform: capitalize;' },
              { class: 'normal-case', css: 'text-transform: none;' },
              { class: 'truncate', css: 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' },
              { class: 'leading-{n}', css: 'line-height: {value};', desc: '3-10, none, tight, snug, normal, relaxed, loose' },
              { class: 'tracking-{n}', css: 'letter-spacing: {value};', desc: 'tighter, tight, normal, wide, wider, widest' },
            ],
          },
          backgrounds: {
            desc: 'Backgrounds e gradientes',
            classes: [
              { class: 'bg-{color}', css: 'background-color: {color};', desc: 'Qualquer cor da paleta' },
              { class: 'bg-transparent', css: 'background-color: transparent;' },
              { class: 'bg-current', css: 'background-color: currentColor;' },
              { class: 'bg-inherit', css: 'background-color: inherit;' },
              { class: 'bg-gradient-to-{dir}', css: 'background-image: linear-gradient(to {dir}, ...);', desc: 't, tr, r, br, b, bl, l, tl' },
              { class: 'from-{color}', css: '--tw-gradient-from: {color};' },
              { class: 'via-{color}', css: '--tw-gradient-via: {color};' },
              { class: 'to-{color}', css: '--tw-gradient-to: {color};' },
              { class: 'bg-none', css: 'background-image: none;' },
              { class: 'bg-cover', css: 'background-size: cover;' },
              { class: 'bg-contain', css: 'background-size: contain;' },
              { class: 'bg-auto', css: 'background-size: auto;' },
              { class: 'bg-fixed', css: 'background-attachment: fixed;' },
              { class: 'bg-local', css: 'background-attachment: local;' },
              { class: 'bg-scroll', css: 'background-attachment: scroll;' },
              { class: 'bg-center', css: 'background-position: center;' },
              { class: 'bg-top', css: 'background-position: top;' },
              { class: 'bg-bottom', css: 'background-position: bottom;' },
              { class: 'bg-repeat', css: 'background-repeat: repeat;' },
              { class: 'bg-no-repeat', css: 'background-repeat: no-repeat;' },
              { class: 'bg-repeat-x', css: 'background-repeat: repeat-x;' },
              { class: 'bg-repeat-y', css: 'background-repeat: repeat-y;' },
            ],
          },
          borders: {
            desc: 'Borders e border-radius',
            classes: [
              { class: 'border', css: 'border-width: 1px;' },
              { class: 'border-0', css: 'border-width: 0px;' },
              { class: 'border-2', css: 'border-width: 2px;' },
              { class: 'border-4', css: 'border-width: 4px;' },
              { class: 'border-8', css: 'border-width: 8px;' },
              { class: 'border-t', css: 'border-top-width: 1px;' },
              { class: 'border-r', css: 'border-right-width: 1px;' },
              { class: 'border-b', css: 'border-bottom-width: 1px;' },
              { class: 'border-l', css: 'border-left-width: 1px;' },
              { class: 'border-{color}', css: 'border-color: {color};' },
              { class: 'border-solid', css: 'border-style: solid;' },
              { class: 'border-dashed', css: 'border-style: dashed;' },
              { class: 'border-dotted', css: 'border-style: dotted;' },
              { class: 'border-double', css: 'border-style: double;' },
              { class: 'border-hidden', css: 'border-style: hidden;' },
              { class: 'border-none', css: 'border-style: none;' },
              { class: 'rounded', css: 'border-radius: 0.25rem;' },
              { class: 'rounded-none', css: 'border-radius: 0px;' },
              { class: 'rounded-sm', css: 'border-radius: 0.125rem;' },
              { class: 'rounded-md', css: 'border-radius: 0.375rem;' },
              { class: 'rounded-lg', css: 'border-radius: 0.5rem;' },
              { class: 'rounded-xl', css: 'border-radius: 0.75rem;' },
              { class: 'rounded-2xl', css: 'border-radius: 1rem;' },
              { class: 'rounded-3xl', css: 'border-radius: 1.5rem;' },
              { class: 'rounded-full', css: 'border-radius: 9999px;' },
              { class: 'divide-x', css: '> * + * { border-left-width: 1px; }' },
              { class: 'divide-y', css: '> * + * { border-top-width: 1px; }' },
              { class: 'divide-{color}', css: '> * + * { border-color: {color}; }' },
              { class: 'ring-{n}', css: 'box-shadow: 0 0 0 {n}px ...;', desc: '0, 1, 2, 4, 8, inset' },
              { class: 'ring-{color}', css: '--tw-ring-color: {color};' },
              { class: 'outline', css: 'outline-style: solid;' },
              { class: 'outline-none', css: 'outline: 2px solid transparent; outline-offset: 2px;' },
            ],
          },
          effects: {
            desc: 'Sombras e opacidade',
            classes: [
              { class: 'shadow-sm', css: 'box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);' },
              { class: 'shadow', css: 'box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);' },
              { class: 'shadow-md', css: 'box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);' },
              { class: 'shadow-lg', css: 'box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);' },
              { class: 'shadow-xl', css: 'box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);' },
              { class: 'shadow-2xl', css: 'box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);' },
              { class: 'shadow-inner', css: 'box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);' },
              { class: 'shadow-none', css: 'box-shadow: 0 0 #0000;' },
              { class: 'shadow-{color}', css: '--tw-shadow-color: {color};' },
              { class: 'opacity-{n}', css: 'opacity: {n/100};', desc: '0, 5, 10, 15, 20, 25, 30, ..., 100' },
              { class: 'mix-blend-{mode}', css: 'mix-blend-mode: {mode};', desc: 'normal, multiply, screen, overlay, darken, lighten, etc.' },
              { class: 'bg-blend-{mode}', css: 'background-blend-mode: {mode};' },
            ],
          },
          filters: {
            desc: 'Filtros CSS',
            classes: [
              { class: 'blur', css: 'filter: blur(8px);' },
              { class: 'blur-sm', css: 'filter: blur(4px);' },
              { class: 'blur-md', css: 'filter: blur(12px);' },
              { class: 'blur-lg', css: 'filter: blur(16px);' },
              { class: 'blur-xl', css: 'filter: blur(24px);' },
              { class: 'blur-2xl', css: 'filter: blur(40px);' },
              { class: 'blur-3xl', css: 'filter: blur(64px);' },
              { class: 'blur-none', css: 'filter: blur(0);' },
              { class: 'brightness-{n}', css: 'filter: brightness({n/100});', desc: '0, 50, 75, 90, 95, 100, 105, 110, 125, 150, 200' },
              { class: 'contrast-{n}', css: 'filter: contrast({n/100});' },
              { class: 'grayscale', css: 'filter: grayscale(100%);' },
              { class: 'grayscale-0', css: 'filter: grayscale(0);' },
              { class: 'hue-rotate-{n}', css: 'filter: hue-rotate({n}deg);', desc: '0, 15, 30, 60, 90, 180' },
              { class: 'invert', css: 'filter: invert(100%);' },
              { class: 'invert-0', css: 'filter: invert(0);' },
              { class: 'saturate-{n}', css: 'filter: saturate({n/100});' },
              { class: 'sepia', css: 'filter: sepia(100%);' },
              { class: 'sepia-0', css: 'filter: sepia(0);' },
              { class: 'backdrop-blur-{n}', css: 'backdrop-filter: blur({value});' },
              { class: 'backdrop-brightness-{n}', css: 'backdrop-filter: brightness({n/100});' },
              { class: 'backdrop-contrast-{n}', css: 'backdrop-filter: contrast({n/100});' },
              { class: 'backdrop-grayscale', css: 'backdrop-filter: grayscale(100%);' },
              { class: 'backdrop-invert', css: 'backdrop-filter: invert(100%);' },
              { class: 'backdrop-opacity-{n}', css: 'backdrop-filter: opacity({n/100});' },
              { class: 'backdrop-saturate-{n}', css: 'backdrop-filter: saturate({n/100});' },
              { class: 'backdrop-sepia', css: 'backdrop-filter: sepia(100%);' },
            ],
          },
          transitions: {
            desc: 'Transições e animações',
            classes: [
              { class: 'transition', css: 'transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter; transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); transition-duration: 150ms;' },
              { class: 'transition-none', css: 'transition-property: none;' },
              { class: 'transition-all', css: 'transition-property: all;' },
              { class: 'transition-colors', css: 'transition-property: color, background-color, border-color, text-decoration-color, fill, stroke;' },
              { class: 'transition-opacity', css: 'transition-property: opacity;' },
              { class: 'transition-shadow', css: 'transition-property: box-shadow;' },
              { class: 'transition-transform', css: 'transition-property: transform;' },
              { class: 'duration-{n}', css: 'transition-duration: {n}ms;', desc: '0, 75, 100, 150, 200, 300, 500, 700, 1000' },
              { class: 'ease-linear', css: 'transition-timing-function: linear;' },
              { class: 'ease-in', css: 'transition-timing-function: cubic-bezier(0.4, 0, 1, 1);' },
              { class: 'ease-out', css: 'transition-timing-function: cubic-bezier(0, 0, 0.2, 1);' },
              { class: 'ease-in-out', css: 'transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);' },
              { class: 'delay-{n}', css: 'transition-delay: {n}ms;' },
              { class: 'animate-none', css: 'animation: none;' },
              { class: 'animate-spin', css: 'animation: spin 1s linear infinite;' },
              { class: 'animate-ping', css: 'animation: ping 1s cubic-bezier(0, 0, 0.2, 1) infinite;' },
              { class: 'animate-pulse', css: 'animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;' },
              { class: 'animate-bounce', css: 'animation: bounce 1s infinite;' },
            ],
          },
          transforms: {
            desc: 'Transformações CSS',
            classes: [
              { class: 'scale-{n}', css: 'transform: scale({n/100});', desc: '0, 50, 75, 90, 95, 100, 105, 110, 125, 150' },
              { class: 'scale-x-{n}', css: 'transform: scaleX({n/100});' },
              { class: 'scale-y-{n}', css: 'transform: scaleY({n/100});' },
              { class: 'rotate-{n}', css: 'transform: rotate({n}deg);', desc: '0, 1, 2, 3, 6, 12, 45, 90, 180' },
              { class: '-rotate-{n}', css: 'transform: rotate(-{n}deg);' },
              { class: 'translate-x-{n}', css: 'transform: translateX({value});' },
              { class: 'translate-y-{n}', css: 'transform: translateY({value});' },
              { class: '-translate-x-{n}', css: 'transform: translateX(-{value});' },
              { class: '-translate-y-{n}', css: 'transform: translateY(-{value});' },
              { class: 'skew-x-{n}', css: 'transform: skewX({n}deg);', desc: '0, 1, 2, 3, 6, 12' },
              { class: 'skew-y-{n}', css: 'transform: skewY({n}deg);' },
              { class: 'origin-center', css: 'transform-origin: center;' },
              { class: 'origin-top', css: 'transform-origin: top;' },
              { class: 'origin-top-right', css: 'transform-origin: top right;' },
              { class: 'origin-right', css: 'transform-origin: right;' },
              { class: 'origin-bottom-right', css: 'transform-origin: bottom right;' },
              { class: 'origin-bottom', css: 'transform-origin: bottom;' },
              { class: 'origin-bottom-left', css: 'transform-origin: bottom left;' },
              { class: 'origin-left', css: 'transform-origin: left;' },
              { class: 'origin-top-left', css: 'transform-origin: top left;' },
            ],
          },
          interactivity: {
            desc: 'Cursor, scroll, resize',
            classes: [
              { class: 'cursor-auto', css: 'cursor: auto;' },
              { class: 'cursor-default', css: 'cursor: default;' },
              { class: 'cursor-pointer', css: 'cursor: pointer;' },
              { class: 'cursor-wait', css: 'cursor: wait;' },
              { class: 'cursor-text', css: 'cursor: text;' },
              { class: 'cursor-move', css: 'cursor: move;' },
              { class: 'cursor-not-allowed', css: 'cursor: not-allowed;' },
              { class: 'cursor-grab', css: 'cursor: grab;' },
              { class: 'cursor-grabbing', css: 'cursor: grabbing;' },
              { class: 'select-none', css: 'user-select: none;' },
              { class: 'select-text', css: 'user-select: text;' },
              { class: 'select-all', css: 'user-select: all;' },
              { class: 'select-auto', css: 'user-select: auto;' },
              { class: 'resize-none', css: 'resize: none;' },
              { class: 'resize', css: 'resize: both;' },
              { class: 'resize-x', css: 'resize: horizontal;' },
              { class: 'resize-y', css: 'resize: vertical;' },
              { class: 'scroll-auto', css: 'scroll-behavior: auto;' },
              { class: 'scroll-smooth', css: 'scroll-behavior: smooth;' },
              { class: 'snap-start', css: 'scroll-snap-align: start;' },
              { class: 'snap-end', css: 'scroll-snap-align: end;' },
              { class: 'snap-center', css: 'scroll-snap-align: center;' },
              { class: 'snap-none', css: 'scroll-snap-type: none;' },
              { class: 'snap-x', css: 'scroll-snap-type: x var(--tw-scroll-snap-strictness);' },
              { class: 'snap-y', css: 'scroll-snap-type: y var(--tw-scroll-snap-strictness);' },
              { class: 'snap-mandatory', css: '--tw-scroll-snap-strictness: mandatory;' },
              { class: 'snap-proximity', css: '--tw-scroll-snap-strictness: proximity;' },
              { class: 'touch-auto', css: 'touch-action: auto;' },
              { class: 'touch-none', css: 'touch-action: none;' },
              { class: 'touch-manipulation', css: 'touch-action: manipulation;' },
              { class: 'pointer-events-none', css: 'pointer-events: none;' },
              { class: 'pointer-events-auto', css: 'pointer-events: auto;' },
            ],
          },
          svg: {
            desc: 'SVG fill e stroke',
            classes: [
              { class: 'fill-none', css: 'fill: none;' },
              { class: 'fill-inherit', css: 'fill: inherit;' },
              { class: 'fill-current', css: 'fill: currentColor;' },
              { class: 'fill-transparent', css: 'fill: transparent;' },
              { class: 'fill-{color}', css: 'fill: {color};' },
              { class: 'stroke-none', css: 'stroke: none;' },
              { class: 'stroke-inherit', css: 'stroke: inherit;' },
              { class: 'stroke-current', css: 'stroke: currentColor;' },
              { class: 'stroke-transparent', css: 'stroke: transparent;' },
              { class: 'stroke-{color}', css: 'stroke: {color};' },
              { class: 'stroke-{n}', css: 'stroke-width: {n};', desc: '0, 1, 2' },
            ],
          },
          tables: {
            desc: 'Tabelas',
            classes: [
              { class: 'border-collapse', css: 'border-collapse: collapse;' },
              { class: 'border-separate', css: 'border-collapse: separate;' },
              { class: 'border-spacing-{n}', css: 'border-spacing: {value};' },
              { class: 'border-spacing-x-{n}', css: 'border-spacing: {value} 0;' },
              { class: 'border-spacing-y-{n}', css: 'border-spacing: 0 {value};' },
              { class: 'table-auto', css: 'table-layout: auto;' },
              { class: 'table-fixed', css: 'table-layout: fixed;' },
              { class: 'caption-top', css: 'caption-side: top;' },
              { class: 'caption-bottom', css: 'caption-side: bottom;' },
            ],
          },
          accessibility: {
            desc: 'Acessibilidade',
            classes: [
              { class: 'sr-only', css: 'position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border-width: 0;' },
              { class: 'not-sr-only', css: 'position: static; width: auto; height: auto; padding: 0; margin: 0; overflow: visible; clip: auto; white-space: normal;' },
              { class: 'forced-color-adjust-auto', css: 'forced-color-adjust: auto;' },
              { class: 'forced-color-adjust-none', css: 'forced-color-adjust: none;' },
            ],
          },
        }

        if (!categoria) {
          let result = '# 📚 Categorias de Utilities do Tailwind CSS\n\n'
          result += 'Use `tailwind_utilities` com uma categoria específica para ver as classes.\n\n'
          result += '| Categoria | Descrição | Classes |\n'
          result += '|-----------|-----------|--------|\n'
          for (const [key, value] of Object.entries(utilities)) {
            result += `| \`${key}\` | ${value.desc} | ${value.classes.length} |\n`
          }
          result += '\n**Exemplo:** `tailwind_utilities({ categoria: "flexbox" })`\n'
          return { content: [{ type: 'text', text: result }] }
        }

        const cat = utilities[categoria]
        if (!cat) {
          return {
            content: [{ type: 'text', text: `❌ Categoria não encontrada: ${categoria}\n\nCategorias disponíveis: ${Object.keys(utilities).join(', ')}` }],
            isError: true,
          }
        }

        let result = `# 🎨 Utilities: ${categoria}\n\n`
        result += `**${cat.desc}**\n\n`
        result += '| Classe | CSS Gerado | Notas |\n'
        result += '|--------|------------|-------|\n'
        for (const u of cat.classes) {
          const notes = u.desc || '-'
          result += `| \`${u.class}\` | \`${u.css}\` | ${notes} |\n`
        }
        result += `\n**Total:** ${cat.classes.length} classes\n`

        return { content: [{ type: 'text', text: result }] }
      }

      case 'tailwind_variants': {
        const tipo = args?.tipo as string | undefined

        const variants: Record<string, { desc: string; items: Array<{ variant: string; desc: string; example: string }> }> = {
          'pseudo-classes': {
            desc: 'Estados interativos e de formulário',
            items: [
              { variant: 'hover', desc: 'Mouse sobre o elemento', example: 'hover:bg-blue-500' },
              { variant: 'focus', desc: 'Elemento focado', example: 'focus:ring-2' },
              { variant: 'focus-within', desc: 'Filho tem foco', example: 'focus-within:border-blue-500' },
              { variant: 'focus-visible', desc: 'Foco visível (teclado)', example: 'focus-visible:outline-2' },
              { variant: 'active', desc: 'Clique ativo', example: 'active:bg-blue-700' },
              { variant: 'visited', desc: 'Link visitado', example: 'visited:text-purple-500' },
              { variant: 'target', desc: 'Alvo de âncora', example: 'target:bg-yellow-200' },
              { variant: 'first', desc: 'Primeiro filho', example: 'first:mt-0' },
              { variant: 'last', desc: 'Último filho', example: 'last:mb-0' },
              { variant: 'only', desc: 'Filho único', example: 'only:mx-auto' },
              { variant: 'odd', desc: 'Filhos ímpares', example: 'odd:bg-gray-100' },
              { variant: 'even', desc: 'Filhos pares', example: 'even:bg-gray-50' },
              { variant: 'first-of-type', desc: 'Primeiro do tipo', example: 'first-of-type:pt-0' },
              { variant: 'last-of-type', desc: 'Último do tipo', example: 'last-of-type:pb-0' },
              { variant: 'only-of-type', desc: 'Único do tipo', example: 'only-of-type:mx-auto' },
              { variant: 'empty', desc: 'Sem filhos', example: 'empty:hidden' },
              { variant: 'enabled', desc: 'Input habilitado', example: 'enabled:cursor-pointer' },
              { variant: 'disabled', desc: 'Input desabilitado', example: 'disabled:opacity-50' },
              { variant: 'checked', desc: 'Checkbox/radio marcado', example: 'checked:bg-blue-500' },
              { variant: 'indeterminate', desc: 'Estado indeterminado', example: 'indeterminate:bg-gray-300' },
              { variant: 'default', desc: 'Opção padrão', example: 'default:ring-2' },
              { variant: 'required', desc: 'Campo obrigatório', example: 'required:border-red-500' },
              { variant: 'valid', desc: 'Input válido', example: 'valid:border-green-500' },
              { variant: 'invalid', desc: 'Input inválido', example: 'invalid:border-red-500' },
              { variant: 'in-range', desc: 'Valor no range', example: 'in-range:border-green-500' },
              { variant: 'out-of-range', desc: 'Valor fora do range', example: 'out-of-range:border-red-500' },
              { variant: 'placeholder-shown', desc: 'Placeholder visível', example: 'placeholder-shown:border-gray-300' },
              { variant: 'autofill', desc: 'Preenchido pelo browser', example: 'autofill:bg-yellow-100' },
              { variant: 'read-only', desc: 'Campo somente leitura', example: 'read-only:bg-gray-100' },
            ],
          },
          'pseudo-elements': {
            desc: 'Pseudo-elementos CSS',
            items: [
              { variant: 'before', desc: 'Pseudo-elemento ::before', example: 'before:content-[""] before:absolute' },
              { variant: 'after', desc: 'Pseudo-elemento ::after', example: 'after:content-["✓"] after:ml-2' },
              { variant: 'placeholder', desc: 'Texto do placeholder', example: 'placeholder:text-gray-400' },
              { variant: 'file', desc: 'Botão de input file', example: 'file:bg-blue-500 file:text-white' },
              { variant: 'marker', desc: 'Marcador de lista', example: 'marker:text-blue-500' },
              { variant: 'selection', desc: 'Texto selecionado', example: 'selection:bg-blue-200' },
              { variant: 'first-line', desc: 'Primeira linha', example: 'first-line:font-bold' },
              { variant: 'first-letter', desc: 'Primeira letra', example: 'first-letter:text-4xl' },
              { variant: 'backdrop', desc: 'Backdrop de dialog', example: 'backdrop:bg-black/50' },
            ],
          },
          responsive: {
            desc: 'Breakpoints responsivos (mobile-first)',
            items: [
              { variant: 'sm', desc: '≥640px', example: 'sm:flex sm:flex-row' },
              { variant: 'md', desc: '≥768px', example: 'md:grid md:grid-cols-2' },
              { variant: 'lg', desc: '≥1024px', example: 'lg:grid-cols-3' },
              { variant: 'xl', desc: '≥1280px', example: 'xl:grid-cols-4' },
              { variant: '2xl', desc: '≥1536px', example: '2xl:max-w-7xl' },
              { variant: 'min-[{n}px]', desc: 'Breakpoint customizado', example: 'min-[320px]:text-sm' },
              { variant: 'max-sm', desc: '<640px', example: 'max-sm:hidden' },
              { variant: 'max-md', desc: '<768px', example: 'max-md:flex-col' },
              { variant: 'max-lg', desc: '<1024px', example: 'max-lg:px-4' },
              { variant: 'max-xl', desc: '<1280px', example: 'max-xl:grid-cols-2' },
              { variant: 'max-2xl', desc: '<1536px', example: 'max-2xl:container' },
              { variant: 'max-[{n}px]', desc: 'Max breakpoint custom', example: 'max-[600px]:text-xs' },
              { variant: '@sm', desc: 'Container query ≥320px', example: '@sm:flex' },
              { variant: '@md', desc: 'Container query ≥384px', example: '@md:grid-cols-2' },
              { variant: '@lg', desc: 'Container query ≥512px', example: '@lg:p-6' },
              { variant: '@xl', desc: 'Container query ≥672px', example: '@xl:text-lg' },
              { variant: '@[{n}px]', desc: 'Container query custom', example: '@[400px]:flex-row' },
            ],
          },
          'dark-mode': {
            desc: 'Modo escuro e preferências de mídia',
            items: [
              { variant: 'dark', desc: 'Modo escuro', example: 'dark:bg-gray-900 dark:text-white' },
              { variant: 'motion-safe', desc: 'Animações permitidas', example: 'motion-safe:animate-bounce' },
              { variant: 'motion-reduce', desc: 'Animações reduzidas', example: 'motion-reduce:animate-none' },
              { variant: 'contrast-more', desc: 'Alto contraste', example: 'contrast-more:border-2' },
              { variant: 'contrast-less', desc: 'Baixo contraste', example: 'contrast-less:opacity-80' },
              { variant: 'print', desc: 'Impressão', example: 'print:hidden print:text-black' },
              { variant: 'portrait', desc: 'Orientação retrato', example: 'portrait:flex-col' },
              { variant: 'landscape', desc: 'Orientação paisagem', example: 'landscape:flex-row' },
            ],
          },
          state: {
            desc: 'Estados especiais',
            items: [
              { variant: 'open', desc: 'Elemento open (details, dialog)', example: 'open:bg-white open:shadow-lg' },
              { variant: 'closed', desc: 'Elemento fechado', example: 'closed:opacity-0' },
              { variant: 'modal', desc: 'Dialog modal', example: 'modal:backdrop:bg-black/50' },
              { variant: 'fullscreen', desc: 'Modo fullscreen', example: 'fullscreen:p-0' },
              { variant: 'starting', desc: 'Estado inicial (v4)', example: 'starting:opacity-0' },
              { variant: 'inert', desc: 'Elemento inert', example: 'inert:opacity-50' },
            ],
          },
          compound: {
            desc: 'Variants compostos (group, peer, has)',
            items: [
              { variant: 'group-hover', desc: 'Hover no elemento pai .group', example: 'group-hover:text-blue-500' },
              { variant: 'group-focus', desc: 'Focus no elemento pai .group', example: 'group-focus:ring-2' },
              { variant: 'group-active', desc: 'Active no elemento pai .group', example: 'group-active:scale-95' },
              { variant: 'group-[.custom]', desc: 'Seletor custom no group', example: 'group-[.is-open]:block' },
              { variant: 'peer-hover', desc: 'Hover no irmão .peer', example: 'peer-hover:visible' },
              { variant: 'peer-focus', desc: 'Focus no irmão .peer', example: 'peer-focus:ring-2' },
              { variant: 'peer-checked', desc: 'Peer checkbox marcado', example: 'peer-checked:bg-blue-500' },
              { variant: 'peer-invalid', desc: 'Peer input inválido', example: 'peer-invalid:text-red-500' },
              { variant: 'peer-[.custom]', desc: 'Seletor custom no peer', example: 'peer-[.is-active]:font-bold' },
              { variant: 'has-[selector]', desc: 'Contém elemento (v4)', example: 'has-[input:focus]:ring-2' },
              { variant: 'has-checked', desc: 'Contém checkbox marcado', example: 'has-checked:bg-blue-100' },
              { variant: 'in-[selector]', desc: 'Está dentro de (v4)', example: 'in-[.dark]:text-white' },
              { variant: 'not-[selector]', desc: 'Negação (v4)', example: 'not-[.active]:opacity-50' },
            ],
          },
          aria: {
            desc: 'Atributos ARIA para acessibilidade',
            items: [
              { variant: 'aria-checked', desc: 'aria-checked="true"', example: 'aria-checked:bg-blue-500' },
              { variant: 'aria-disabled', desc: 'aria-disabled="true"', example: 'aria-disabled:opacity-50' },
              { variant: 'aria-expanded', desc: 'aria-expanded="true"', example: 'aria-expanded:rotate-180' },
              { variant: 'aria-hidden', desc: 'aria-hidden="true"', example: 'aria-hidden:invisible' },
              { variant: 'aria-pressed', desc: 'aria-pressed="true"', example: 'aria-pressed:bg-gray-700' },
              { variant: 'aria-selected', desc: 'aria-selected="true"', example: 'aria-selected:border-blue-500' },
              { variant: 'aria-required', desc: 'aria-required="true"', example: 'aria-required:border-red-500' },
              { variant: 'aria-invalid', desc: 'aria-invalid="true"', example: 'aria-invalid:border-red-500' },
              { variant: 'aria-busy', desc: 'aria-busy="true"', example: 'aria-busy:animate-pulse' },
              { variant: 'aria-[attr=value]', desc: 'ARIA customizado', example: 'aria-[current=page]:font-bold' },
            ],
          },
          data: {
            desc: 'Atributos data-*',
            items: [
              { variant: 'data-[state=open]', desc: 'data-state="open"', example: 'data-[state=open]:bg-white' },
              { variant: 'data-[state=closed]', desc: 'data-state="closed"', example: 'data-[state=closed]:hidden' },
              { variant: 'data-[active]', desc: 'data-active presente', example: 'data-[active]:font-bold' },
              { variant: 'data-[disabled]', desc: 'data-disabled presente', example: 'data-[disabled]:opacity-50' },
              { variant: 'data-[selected=true]', desc: 'data-selected="true"', example: 'data-[selected=true]:bg-blue-100' },
              { variant: 'data-[orientation=vertical]', desc: 'Orientação vertical', example: 'data-[orientation=vertical]:flex-col' },
              { variant: 'data-[side=left]', desc: 'Posição lado', example: 'data-[side=left]:mr-2' },
            ],
          },
        }

        if (!tipo) {
          let result = '# 🎯 Variants do Tailwind CSS\n\n'
          result += 'Variants são modificadores que aplicam estilos condicionalmente.\n\n'
          result += '**Sintaxe:** `variant:classe` → `hover:bg-blue-500`\n\n'
          result += '**Empilhamento:** `variant1:variant2:classe` → `dark:hover:bg-blue-600`\n\n'
          result += '| Tipo | Descrição | Variants |\n'
          result += '|------|-----------|----------|\n'
          for (const [key, value] of Object.entries(variants)) {
            result += `| \`${key}\` | ${value.desc} | ${value.items.length} |\n`
          }
          result += '\n**Exemplo:** `tailwind_variants({ tipo: "responsive" })`\n'
          return { content: [{ type: 'text', text: result }] }
        }

        const varType = variants[tipo]
        if (!varType) {
          return {
            content: [{ type: 'text', text: `❌ Tipo não encontrado: ${tipo}\n\nTipos disponíveis: ${Object.keys(variants).join(', ')}` }],
            isError: true,
          }
        }

        let result = `# 🎯 Variants: ${tipo}\n\n`
        result += `**${varType.desc}**\n\n`
        result += '| Variant | Descrição | Exemplo |\n'
        result += '|---------|-----------|----------|\n'
        for (const v of varType.items) {
          result += `| \`${v.variant}:\` | ${v.desc} | \`${v.example}\` |\n`
        }
        result += `\n**Total:** ${varType.items.length} variants\n`

        return { content: [{ type: 'text', text: result }] }
      }

      case 'tailwind_cores': {
        const corArg = args?.cor as string | undefined

        const colors: Record<string, Record<string, string>> = {
          slate: { '50': '#f8fafc', '100': '#f1f5f9', '200': '#e2e8f0', '300': '#cbd5e1', '400': '#94a3b8', '500': '#64748b', '600': '#475569', '700': '#334155', '800': '#1e293b', '900': '#0f172a', '950': '#020617' },
          gray: { '50': '#f9fafb', '100': '#f3f4f6', '200': '#e5e7eb', '300': '#d1d5db', '400': '#9ca3af', '500': '#6b7280', '600': '#4b5563', '700': '#374151', '800': '#1f2937', '900': '#111827', '950': '#030712' },
          zinc: { '50': '#fafafa', '100': '#f4f4f5', '200': '#e4e4e7', '300': '#d4d4d8', '400': '#a1a1aa', '500': '#71717a', '600': '#52525b', '700': '#3f3f46', '800': '#27272a', '900': '#18181b', '950': '#09090b' },
          neutral: { '50': '#fafafa', '100': '#f5f5f5', '200': '#e5e5e5', '300': '#d4d4d4', '400': '#a3a3a3', '500': '#737373', '600': '#525252', '700': '#404040', '800': '#262626', '900': '#171717', '950': '#0a0a0a' },
          stone: { '50': '#fafaf9', '100': '#f5f5f4', '200': '#e7e5e4', '300': '#d6d3d1', '400': '#a8a29e', '500': '#78716c', '600': '#57534e', '700': '#44403c', '800': '#292524', '900': '#1c1917', '950': '#0c0a09' },
          red: { '50': '#fef2f2', '100': '#fee2e2', '200': '#fecaca', '300': '#fca5a5', '400': '#f87171', '500': '#ef4444', '600': '#dc2626', '700': '#b91c1c', '800': '#991b1b', '900': '#7f1d1d', '950': '#450a0a' },
          orange: { '50': '#fff7ed', '100': '#ffedd5', '200': '#fed7aa', '300': '#fdba74', '400': '#fb923c', '500': '#f97316', '600': '#ea580c', '700': '#c2410c', '800': '#9a3412', '900': '#7c2d12', '950': '#431407' },
          amber: { '50': '#fffbeb', '100': '#fef3c7', '200': '#fde68a', '300': '#fcd34d', '400': '#fbbf24', '500': '#f59e0b', '600': '#d97706', '700': '#b45309', '800': '#92400e', '900': '#78350f', '950': '#451a03' },
          yellow: { '50': '#fefce8', '100': '#fef9c3', '200': '#fef08a', '300': '#fde047', '400': '#facc15', '500': '#eab308', '600': '#ca8a04', '700': '#a16207', '800': '#854d0e', '900': '#713f12', '950': '#422006' },
          lime: { '50': '#f7fee7', '100': '#ecfccb', '200': '#d9f99d', '300': '#bef264', '400': '#a3e635', '500': '#84cc16', '600': '#65a30d', '700': '#4d7c0f', '800': '#3f6212', '900': '#365314', '950': '#1a2e05' },
          green: { '50': '#f0fdf4', '100': '#dcfce7', '200': '#bbf7d0', '300': '#86efac', '400': '#4ade80', '500': '#22c55e', '600': '#16a34a', '700': '#15803d', '800': '#166534', '900': '#14532d', '950': '#052e16' },
          emerald: { '50': '#ecfdf5', '100': '#d1fae5', '200': '#a7f3d0', '300': '#6ee7b7', '400': '#34d399', '500': '#10b981', '600': '#059669', '700': '#047857', '800': '#065f46', '900': '#064e3b', '950': '#022c22' },
          teal: { '50': '#f0fdfa', '100': '#ccfbf1', '200': '#99f6e4', '300': '#5eead4', '400': '#2dd4bf', '500': '#14b8a6', '600': '#0d9488', '700': '#0f766e', '800': '#115e59', '900': '#134e4a', '950': '#042f2e' },
          cyan: { '50': '#ecfeff', '100': '#cffafe', '200': '#a5f3fc', '300': '#67e8f9', '400': '#22d3ee', '500': '#06b6d4', '600': '#0891b2', '700': '#0e7490', '800': '#155e75', '900': '#164e63', '950': '#083344' },
          sky: { '50': '#f0f9ff', '100': '#e0f2fe', '200': '#bae6fd', '300': '#7dd3fc', '400': '#38bdf8', '500': '#0ea5e9', '600': '#0284c7', '700': '#0369a1', '800': '#075985', '900': '#0c4a6e', '950': '#082f49' },
          blue: { '50': '#eff6ff', '100': '#dbeafe', '200': '#bfdbfe', '300': '#93c5fd', '400': '#60a5fa', '500': '#3b82f6', '600': '#2563eb', '700': '#1d4ed8', '800': '#1e40af', '900': '#1e3a8a', '950': '#172554' },
          indigo: { '50': '#eef2ff', '100': '#e0e7ff', '200': '#c7d2fe', '300': '#a5b4fc', '400': '#818cf8', '500': '#6366f1', '600': '#4f46e5', '700': '#4338ca', '800': '#3730a3', '900': '#312e81', '950': '#1e1b4b' },
          violet: { '50': '#f5f3ff', '100': '#ede9fe', '200': '#ddd6fe', '300': '#c4b5fd', '400': '#a78bfa', '500': '#8b5cf6', '600': '#7c3aed', '700': '#6d28d9', '800': '#5b21b6', '900': '#4c1d95', '950': '#2e1065' },
          purple: { '50': '#faf5ff', '100': '#f3e8ff', '200': '#e9d5ff', '300': '#d8b4fe', '400': '#c084fc', '500': '#a855f7', '600': '#9333ea', '700': '#7e22ce', '800': '#6b21a8', '900': '#581c87', '950': '#3b0764' },
          fuchsia: { '50': '#fdf4ff', '100': '#fae8ff', '200': '#f5d0fe', '300': '#f0abfc', '400': '#e879f9', '500': '#d946ef', '600': '#c026d3', '700': '#a21caf', '800': '#86198f', '900': '#701a75', '950': '#4a044e' },
          pink: { '50': '#fdf2f8', '100': '#fce7f3', '200': '#fbcfe8', '300': '#f9a8d4', '400': '#f472b6', '500': '#ec4899', '600': '#db2777', '700': '#be185d', '800': '#9d174d', '900': '#831843', '950': '#500724' },
          rose: { '50': '#fff1f2', '100': '#ffe4e6', '200': '#fecdd3', '300': '#fda4af', '400': '#fb7185', '500': '#f43f5e', '600': '#e11d48', '700': '#be123c', '800': '#9f1239', '900': '#881337', '950': '#4c0519' },
        }

        const specialColors = {
          inherit: 'Herda do pai',
          current: 'currentColor',
          transparent: 'transparent',
          black: '#000000',
          white: '#ffffff',
        }

        if (!corArg) {
          let result = '# 🎨 Paleta de Cores do Tailwind CSS\n\n'
          result += '## Cores Especiais\n\n'
          result += '| Classe | Valor |\n'
          result += '|--------|-------|\n'
          for (const [name, value] of Object.entries(specialColors)) {
            result += `| \`{type}-${name}\` | ${value} |\n`
          }
          result += '\n## Paleta Completa\n\n'
          result += 'Use `tailwind_cores({ cor: "blue" })` para ver uma cor específica.\n\n'
          result += '| Cor | Preview (500) | Escalas |\n'
          result += '|-----|---------------|--------|\n'
          for (const [name, shades] of Object.entries(colors)) {
            result += `| \`${name}\` | ${shades['500']} | 50-950 |\n`
          }
          result += '\n**Uso:** `text-{cor}-{escala}`, `bg-{cor}-{escala}`, `border-{cor}-{escala}`\n'
          result += '\n**Exemplo:** `bg-blue-500`, `text-gray-900`, `border-red-300`\n'
          return { content: [{ type: 'text', text: result }] }
        }

        const colorShades = colors[corArg]
        if (!colorShades) {
          return {
            content: [{ type: 'text', text: `❌ Cor não encontrada: ${corArg}\n\nCores disponíveis: ${Object.keys(colors).join(', ')}` }],
            isError: true,
          }
        }

        let result = `# 🎨 Cor: ${corArg}\n\n`
        result += '| Escala | Hex | Classes |\n'
        result += '|--------|-----|--------|\n'
        for (const [shade, hex] of Object.entries(colorShades)) {
          result += `| ${shade} | ${hex} | \`text-${corArg}-${shade}\` \`bg-${corArg}-${shade}\` \`border-${corArg}-${shade}\` |\n`
        }
        result += `\n**Exemplos de uso:**\n`
        result += '```html\n'
        result += `<div class="bg-${corArg}-500 text-white">Background</div>\n`
        result += `<p class="text-${corArg}-700">Texto</p>\n`
        result += `<div class="border border-${corArg}-300">Border</div>\n`
        result += `<div class="ring-2 ring-${corArg}-500">Ring</div>\n`
        result += '```\n'

        return { content: [{ type: 'text', text: result }] }
      }

      case 'tailwind_spacing': {
        const spacing: Array<{ key: string; rem: string; px: string }> = [
          { key: '0', rem: '0', px: '0px' },
          { key: 'px', rem: '1px', px: '1px' },
          { key: '0.5', rem: '0.125rem', px: '2px' },
          { key: '1', rem: '0.25rem', px: '4px' },
          { key: '1.5', rem: '0.375rem', px: '6px' },
          { key: '2', rem: '0.5rem', px: '8px' },
          { key: '2.5', rem: '0.625rem', px: '10px' },
          { key: '3', rem: '0.75rem', px: '12px' },
          { key: '3.5', rem: '0.875rem', px: '14px' },
          { key: '4', rem: '1rem', px: '16px' },
          { key: '5', rem: '1.25rem', px: '20px' },
          { key: '6', rem: '1.5rem', px: '24px' },
          { key: '7', rem: '1.75rem', px: '28px' },
          { key: '8', rem: '2rem', px: '32px' },
          { key: '9', rem: '2.25rem', px: '36px' },
          { key: '10', rem: '2.5rem', px: '40px' },
          { key: '11', rem: '2.75rem', px: '44px' },
          { key: '12', rem: '3rem', px: '48px' },
          { key: '14', rem: '3.5rem', px: '56px' },
          { key: '16', rem: '4rem', px: '64px' },
          { key: '20', rem: '5rem', px: '80px' },
          { key: '24', rem: '6rem', px: '96px' },
          { key: '28', rem: '7rem', px: '112px' },
          { key: '32', rem: '8rem', px: '128px' },
          { key: '36', rem: '9rem', px: '144px' },
          { key: '40', rem: '10rem', px: '160px' },
          { key: '44', rem: '11rem', px: '176px' },
          { key: '48', rem: '12rem', px: '192px' },
          { key: '52', rem: '13rem', px: '208px' },
          { key: '56', rem: '14rem', px: '224px' },
          { key: '60', rem: '15rem', px: '240px' },
          { key: '64', rem: '16rem', px: '256px' },
          { key: '72', rem: '18rem', px: '288px' },
          { key: '80', rem: '20rem', px: '320px' },
          { key: '96', rem: '24rem', px: '384px' },
        ]

        let result = '# 📏 Escala de Espaçamento do Tailwind CSS\n\n'
        result += 'A escala de spacing é usada para margin, padding, gap, width, height, e outras propriedades.\n\n'
        result += '| Valor | Rem | Pixels | Exemplo Classes |\n'
        result += '|-------|-----|--------|----------------|\n'
        for (const s of spacing) {
          result += `| \`${s.key}\` | ${s.rem} | ${s.px} | \`p-${s.key}\` \`m-${s.key}\` \`gap-${s.key}\` \`w-${s.key}\` |\n`
        }
        result += '\n## Valores Especiais\n\n'
        result += '| Valor | Descrição | Exemplo |\n'
        result += '|-------|-----------|--------|\n'
        result += '| `auto` | auto | `m-auto`, `ml-auto` |\n'
        result += '| `full` | 100% | `w-full`, `h-full` |\n'
        result += '| `screen` | 100vw/100vh | `w-screen`, `h-screen` |\n'
        result += '| `svh/lvh/dvh` | viewport units | `h-svh`, `h-lvh`, `h-dvh` |\n'
        result += '| `min` | min-content | `w-min`, `h-min` |\n'
        result += '| `max` | max-content | `w-max`, `h-max` |\n'
        result += '| `fit` | fit-content | `w-fit`, `h-fit` |\n'
        result += '\n## Frações (Width/Basis)\n\n'
        result += '| Valor | CSS | Exemplo |\n'
        result += '|-------|-----|--------|\n'
        result += '| `1/2` | 50% | `w-1/2`, `basis-1/2` |\n'
        result += '| `1/3` | 33.333% | `w-1/3`, `basis-1/3` |\n'
        result += '| `2/3` | 66.666% | `w-2/3`, `basis-2/3` |\n'
        result += '| `1/4` | 25% | `w-1/4`, `basis-1/4` |\n'
        result += '| `3/4` | 75% | `w-3/4`, `basis-3/4` |\n'
        result += '| `1/5` | 20% | `w-1/5`, `basis-1/5` |\n'
        result += '| `2/5` | 40% | `w-2/5`, `basis-2/5` |\n'
        result += '| `3/5` | 60% | `w-3/5`, `basis-3/5` |\n'
        result += '| `4/5` | 80% | `w-4/5`, `basis-4/5` |\n'
        result += '| `1/6` | 16.666% | `w-1/6`, `basis-1/6` |\n'
        result += '| `5/6` | 83.333% | `w-5/6`, `basis-5/6` |\n'
        result += '| `1/12` | 8.333% | `w-1/12`, `basis-1/12` |\n'

        return { content: [{ type: 'text', text: result }] }
      }

      case 'tailwind_breakpoints': {
        let result = '# 📱 Breakpoints Responsivos do Tailwind CSS\n\n'
        result += '## Breakpoints Padrão (Mobile-First)\n\n'
        result += '| Prefixo | Min-Width | CSS Media Query |\n'
        result += '|---------|-----------|----------------|\n'
        result += '| `sm:` | 640px | `@media (min-width: 640px)` |\n'
        result += '| `md:` | 768px | `@media (min-width: 768px)` |\n'
        result += '| `lg:` | 1024px | `@media (min-width: 1024px)` |\n'
        result += '| `xl:` | 1280px | `@media (min-width: 1280px)` |\n'
        result += '| `2xl:` | 1536px | `@media (min-width: 1536px)` |\n'
        result += '\n## Max-Width Variants\n\n'
        result += '| Prefixo | Max-Width | CSS Media Query |\n'
        result += '|---------|-----------|----------------|\n'
        result += '| `max-sm:` | <640px | `@media (max-width: 639px)` |\n'
        result += '| `max-md:` | <768px | `@media (max-width: 767px)` |\n'
        result += '| `max-lg:` | <1024px | `@media (max-width: 1023px)` |\n'
        result += '| `max-xl:` | <1280px | `@media (max-width: 1279px)` |\n'
        result += '| `max-2xl:` | <1536px | `@media (max-width: 1535px)` |\n'
        result += '\n## Breakpoints Arbitrários\n\n'
        result += '```html\n'
        result += '<!-- Min-width customizado -->\n'
        result += '<div class="min-[320px]:text-sm min-[480px]:text-base">\n\n'
        result += '<!-- Max-width customizado -->\n'
        result += '<div class="max-[600px]:hidden">\n'
        result += '```\n'
        result += '\n## Container Queries (v4)\n\n'
        result += '| Prefixo | Container Width | Uso |\n'
        result += '|---------|----------------|-----|\n'
        result += '| `@xs:` | ≥320px | `@xs:flex-row` |\n'
        result += '| `@sm:` | ≥384px | `@sm:grid-cols-2` |\n'
        result += '| `@md:` | ≥448px | `@md:p-6` |\n'
        result += '| `@lg:` | ≥512px | `@lg:text-lg` |\n'
        result += '| `@xl:` | ≥576px | `@xl:gap-8` |\n'
        result += '| `@2xl:` | ≥672px | `@2xl:grid-cols-4` |\n'
        result += '\n```html\n'
        result += '<!-- Uso de container queries -->\n'
        result += '<div class="@container">\n'
        result += '  <div class="@sm:flex @lg:grid @lg:grid-cols-2">\n'
        result += '    <!-- Responde ao tamanho do container pai -->\n'
        result += '  </div>\n'
        result += '</div>\n\n'
        result += '<!-- Container query arbitrário -->\n'
        result += '<div class="@[400px]:flex-row">\n'
        result += '```\n'
        result += '\n## Exemplo Responsivo Completo\n\n'
        result += '```html\n'
        result += '<div class="\n'
        result += '  flex flex-col        /* Mobile: coluna */\n'
        result += '  sm:flex-row          /* ≥640px: linha */\n'
        result += '  gap-2 sm:gap-4       /* Gap responsivo */\n'
        result += '  p-4 md:p-6 lg:p-8    /* Padding responsivo */\n'
        result += '">\n'
        result += '  <div class="w-full sm:w-1/2 lg:w-1/3">Item 1</div>\n'
        result += '  <div class="w-full sm:w-1/2 lg:w-1/3">Item 2</div>\n'
        result += '  <div class="hidden lg:block lg:w-1/3">Item 3</div>\n'
        result += '</div>\n'
        result += '```\n'

        return { content: [{ type: 'text', text: result }] }
      }

      case 'tailwind_receitas': {
        const componente = args?.componente as string

        const receitas: Record<string, { desc: string; html: string }> = {
          button: {
            desc: 'Botões com variantes',
            html: `<!-- Botão Primário -->
<button class="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors">
  Botão Primário
</button>

<!-- Botão Secundário -->
<button class="px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors">
  Botão Secundário
</button>

<!-- Botão Outline -->
<button class="px-4 py-2 border-2 border-blue-600 text-blue-600 font-medium rounded-lg hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors">
  Botão Outline
</button>

<!-- Botão com Ícone -->
<button class="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700">
  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
  </svg>
  Confirmar
</button>

<!-- Botão Disabled -->
<button disabled class="px-4 py-2 bg-gray-400 text-gray-200 font-medium rounded-lg cursor-not-allowed opacity-50">
  Desabilitado
</button>

<!-- Botão Loading -->
<button class="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg" disabled>
  <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24">
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
  Carregando...
</button>`,
          },
          card: {
            desc: 'Cards com imagem, conteúdo e ações',
            html: `<!-- Card Básico -->
<div class="max-w-sm bg-white rounded-xl shadow-md overflow-hidden">
  <img class="w-full h-48 object-cover" src="image.jpg" alt="Card image">
  <div class="p-6">
    <h3 class="text-xl font-bold text-gray-900 mb-2">Título do Card</h3>
    <p class="text-gray-600 mb-4">Descrição breve do conteúdo do card.</p>
    <a href="#" class="text-blue-600 hover:text-blue-800 font-medium">Saiba mais →</a>
  </div>
</div>

<!-- Card Horizontal -->
<div class="flex max-w-2xl bg-white rounded-xl shadow-md overflow-hidden">
  <img class="w-48 object-cover" src="image.jpg" alt="">
  <div class="p-6 flex flex-col justify-between">
    <div>
      <span class="text-sm text-blue-600 font-semibold">Categoria</span>
      <h3 class="text-xl font-bold text-gray-900 mt-1">Título do Card</h3>
      <p class="text-gray-600 mt-2">Descrição do conteúdo.</p>
    </div>
    <div class="flex items-center gap-4 mt-4">
      <button class="px-4 py-2 bg-blue-600 text-white rounded-lg">Ação</button>
    </div>
  </div>
</div>

<!-- Card com Footer -->
<div class="max-w-sm bg-white rounded-xl shadow-md overflow-hidden">
  <div class="p-6">
    <h3 class="text-xl font-bold text-gray-900">Título</h3>
    <p class="text-gray-600 mt-2">Conteúdo do card.</p>
  </div>
  <div class="px-6 py-4 bg-gray-50 border-t flex justify-end gap-2">
    <button class="px-4 py-2 text-gray-600 hover:text-gray-800">Cancelar</button>
    <button class="px-4 py-2 bg-blue-600 text-white rounded-lg">Salvar</button>
  </div>
</div>`,
          },
          form: {
            desc: 'Formulário completo com validação visual',
            html: `<form class="max-w-md mx-auto space-y-6">
  <!-- Input com Label -->
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
    <input type="email" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors" placeholder="seu@email.com">
  </div>

  <!-- Input com Erro -->
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-1">Senha</label>
    <input type="password" class="w-full px-4 py-2 border border-red-500 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none">
    <p class="mt-1 text-sm text-red-500">Senha deve ter no mínimo 8 caracteres</p>
  </div>

  <!-- Select -->
  <div>
    <label class="block text-sm font-medium text-gray-700 mb-1">País</label>
    <select class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white">
      <option>Brasil</option>
      <option>Portugal</option>
      <option>EUA</option>
    </select>
  </div>

  <!-- Checkbox -->
  <div class="flex items-center gap-2">
    <input type="checkbox" id="terms" class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500">
    <label for="terms" class="text-sm text-gray-700">Aceito os termos de uso</label>
  </div>

  <!-- Submit -->
  <button type="submit" class="w-full px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors">
    Enviar
  </button>
</form>`,
          },
          input: {
            desc: 'Campos de input com variantes',
            html: `<!-- Input Padrão -->
<input type="text" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" placeholder="Digite aqui...">

<!-- Input com Ícone à Esquerda -->
<div class="relative">
  <div class="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
    <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
    </svg>
  </div>
  <input type="search" class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" placeholder="Buscar...">
</div>

<!-- Input com Botão -->
<div class="flex">
  <input type="email" class="flex-1 px-4 py-2 border border-r-0 border-gray-300 rounded-l-lg focus:ring-2 focus:ring-blue-500" placeholder="seu@email.com">
  <button class="px-4 py-2 bg-blue-600 text-white rounded-r-lg hover:bg-blue-700">Inscrever</button>
</div>

<!-- Textarea -->
<textarea rows="4" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none" placeholder="Sua mensagem..."></textarea>`,
          },
          modal: {
            desc: 'Modal/Dialog com backdrop',
            html: `<!-- Modal Container -->
<div class="fixed inset-0 z-50 flex items-center justify-center">
  <!-- Backdrop -->
  <div class="fixed inset-0 bg-black/50 backdrop-blur-sm"></div>
  
  <!-- Modal -->
  <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b">
      <h3 class="text-lg font-semibold text-gray-900">Título do Modal</h3>
      <button class="p-1 hover:bg-gray-100 rounded-lg">
        <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
    
    <!-- Body -->
    <div class="px-6 py-4">
      <p class="text-gray-600">Conteúdo do modal aqui...</p>
    </div>
    
    <!-- Footer -->
    <div class="flex justify-end gap-2 px-6 py-4 bg-gray-50 border-t">
      <button class="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
      <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Confirmar</button>
    </div>
  </div>
</div>`,
          },
          navbar: {
            desc: 'Navbar responsiva',
            html: `<nav class="bg-white shadow-md">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="flex justify-between h-16">
      <!-- Logo -->
      <div class="flex items-center">
        <a href="#" class="text-xl font-bold text-blue-600">Logo</a>
      </div>
      
      <!-- Desktop Menu -->
      <div class="hidden md:flex items-center gap-8">
        <a href="#" class="text-gray-600 hover:text-blue-600">Home</a>
        <a href="#" class="text-gray-600 hover:text-blue-600">Sobre</a>
        <a href="#" class="text-gray-600 hover:text-blue-600">Serviços</a>
        <a href="#" class="text-gray-600 hover:text-blue-600">Contato</a>
        <button class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Login</button>
      </div>
      
      <!-- Mobile Menu Button -->
      <div class="md:hidden flex items-center">
        <button class="p-2 rounded-lg hover:bg-gray-100">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
          </svg>
        </button>
      </div>
    </div>
  </div>
  
  <!-- Mobile Menu (toggle com JS) -->
  <div class="md:hidden border-t">
    <div class="px-4 py-2 space-y-1">
      <a href="#" class="block py-2 text-gray-600">Home</a>
      <a href="#" class="block py-2 text-gray-600">Sobre</a>
      <a href="#" class="block py-2 text-gray-600">Serviços</a>
      <a href="#" class="block py-2 text-gray-600">Contato</a>
    </div>
  </div>
</nav>`,
          },
          footer: {
            desc: 'Footer com múltiplas colunas',
            html: `<footer class="bg-gray-900 text-gray-300">
  <div class="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
    <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
      <!-- Brand -->
      <div>
        <h3 class="text-white text-lg font-bold mb-4">Empresa</h3>
        <p class="text-sm">Descrição breve da empresa ou produto.</p>
      </div>
      
      <!-- Links -->
      <div>
        <h4 class="text-white font-semibold mb-4">Produto</h4>
        <ul class="space-y-2 text-sm">
          <li><a href="#" class="hover:text-white">Features</a></li>
          <li><a href="#" class="hover:text-white">Preços</a></li>
          <li><a href="#" class="hover:text-white">FAQ</a></li>
        </ul>
      </div>
      
      <div>
        <h4 class="text-white font-semibold mb-4">Empresa</h4>
        <ul class="space-y-2 text-sm">
          <li><a href="#" class="hover:text-white">Sobre</a></li>
          <li><a href="#" class="hover:text-white">Blog</a></li>
          <li><a href="#" class="hover:text-white">Carreiras</a></li>
        </ul>
      </div>
      
      <div>
        <h4 class="text-white font-semibold mb-4">Legal</h4>
        <ul class="space-y-2 text-sm">
          <li><a href="#" class="hover:text-white">Privacidade</a></li>
          <li><a href="#" class="hover:text-white">Termos</a></li>
        </ul>
      </div>
    </div>
    
    <div class="border-t border-gray-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
      <p class="text-sm">© 2024 Empresa. Todos os direitos reservados.</p>
      <div class="flex gap-4 mt-4 md:mt-0">
        <a href="#" class="hover:text-white">Twitter</a>
        <a href="#" class="hover:text-white">GitHub</a>
        <a href="#" class="hover:text-white">LinkedIn</a>
      </div>
    </div>
  </div>
</footer>`,
          },
          hero: {
            desc: 'Hero section para landing pages',
            html: `<!-- Hero com Background -->
<section class="relative bg-gradient-to-br from-blue-600 to-purple-700 text-white">
  <div class="max-w-7xl mx-auto px-4 py-24 sm:px-6 lg:px-8">
    <div class="text-center">
      <h1 class="text-4xl md:text-6xl font-bold mb-6">
        Título Impactante
      </h1>
      <p class="text-xl md:text-2xl text-blue-100 mb-8 max-w-2xl mx-auto">
        Subtítulo explicando o valor do seu produto ou serviço.
      </p>
      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <button class="px-8 py-3 bg-white text-blue-600 font-semibold rounded-lg hover:bg-blue-50">
          Começar Agora
        </button>
        <button class="px-8 py-3 border-2 border-white text-white font-semibold rounded-lg hover:bg-white/10">
          Saiba Mais
        </button>
      </div>
    </div>
  </div>
</section>

<!-- Hero com Imagem -->
<section class="bg-white">
  <div class="max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
    <div class="grid md:grid-cols-2 gap-12 items-center">
      <div>
        <h1 class="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
          Título Principal
        </h1>
        <p class="text-xl text-gray-600 mb-8">
          Descrição do produto com benefícios claros para o usuário.
        </p>
        <button class="px-8 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700">
          Call to Action
        </button>
      </div>
      <div>
        <img src="hero-image.png" alt="Hero" class="rounded-xl shadow-2xl">
      </div>
    </div>
  </div>
</section>`,
          },
          grid: {
            desc: 'Grid responsivo para layouts',
            html: `<!-- Grid de 3 colunas responsivo -->
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
  <div class="p-6 bg-white rounded-lg shadow">Item 1</div>
  <div class="p-6 bg-white rounded-lg shadow">Item 2</div>
  <div class="p-6 bg-white rounded-lg shadow">Item 3</div>
</div>

<!-- Grid de 4 colunas com span -->
<div class="grid grid-cols-4 gap-4">
  <div class="col-span-4 md:col-span-2 lg:col-span-1 p-4 bg-blue-100 rounded">1</div>
  <div class="col-span-4 md:col-span-2 lg:col-span-1 p-4 bg-blue-200 rounded">2</div>
  <div class="col-span-4 md:col-span-2 lg:col-span-1 p-4 bg-blue-300 rounded">3</div>
  <div class="col-span-4 md:col-span-2 lg:col-span-1 p-4 bg-blue-400 rounded">4</div>
</div>

<!-- Grid de 12 colunas (dashboard) -->
<div class="grid grid-cols-12 gap-4">
  <div class="col-span-12 lg:col-span-8 p-6 bg-white rounded-lg shadow">Conteúdo Principal</div>
  <div class="col-span-12 lg:col-span-4 p-6 bg-white rounded-lg shadow">Sidebar</div>
  <div class="col-span-12 md:col-span-6 lg:col-span-4 p-6 bg-white rounded-lg shadow">Card 1</div>
  <div class="col-span-12 md:col-span-6 lg:col-span-4 p-6 bg-white rounded-lg shadow">Card 2</div>
  <div class="col-span-12 md:col-span-12 lg:col-span-4 p-6 bg-white rounded-lg shadow">Card 3</div>
</div>

<!-- Auto-fit Grid -->
<div class="grid grid-cols-[repeat(auto-fit,minmax(250px,1fr))] gap-4">
  <div class="p-6 bg-white rounded-lg shadow">Auto 1</div>
  <div class="p-6 bg-white rounded-lg shadow">Auto 2</div>
  <div class="p-6 bg-white rounded-lg shadow">Auto 3</div>
  <div class="p-6 bg-white rounded-lg shadow">Auto 4</div>
</div>`,
          },
          alert: {
            desc: 'Alertas e notificações',
            html: `<!-- Alert Info -->
<div class="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg">
  <svg class="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
  </svg>
  <p>Informação importante para o usuário.</p>
</div>

<!-- Alert Success -->
<div class="flex items-center gap-3 p-4 bg-green-50 border border-green-200 text-green-800 rounded-lg">
  <svg class="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
  </svg>
  <p>Operação realizada com sucesso!</p>
</div>

<!-- Alert Warning -->
<div class="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg">
  <svg class="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
  </svg>
  <p>Atenção! Verifique os dados antes de continuar.</p>
</div>

<!-- Alert Error -->
<div class="flex items-center gap-3 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg">
  <svg class="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
  </svg>
  <p>Erro! Algo deu errado. Tente novamente.</p>
</div>

<!-- Alert Dismissible -->
<div class="flex items-center justify-between gap-3 p-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg">
  <p>Notificação que pode ser fechada.</p>
  <button class="p-1 hover:bg-blue-100 rounded">
    <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
    </svg>
  </button>
</div>`,
          },
          badge: {
            desc: 'Badges e tags',
            html: `<!-- Badges Coloridos -->
<span class="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">Novo</span>
<span class="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Ativo</span>
<span class="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Pendente</span>
<span class="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">Urgente</span>
<span class="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Default</span>

<!-- Badge com Dot -->
<span class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
  <span class="w-2 h-2 bg-green-500 rounded-full"></span>
  Online
</span>

<!-- Badge Pill -->
<span class="px-3 py-1 text-sm font-semibold bg-purple-600 text-white rounded-full">PRO</span>

<!-- Badge com Ícone -->
<span class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
  <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
  </svg>
  Verificado
</span>`,
          },
          avatar: {
            desc: 'Avatares e fotos de perfil',
            html: `<!-- Avatar Circular -->
<img class="w-12 h-12 rounded-full object-cover" src="avatar.jpg" alt="Avatar">

<!-- Avatar com Iniciais -->
<div class="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
  JD
</div>

<!-- Avatar com Status -->
<div class="relative">
  <img class="w-12 h-12 rounded-full object-cover" src="avatar.jpg" alt="">
  <span class="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></span>
</div>

<!-- Avatar Group -->
<div class="flex -space-x-2">
  <img class="w-10 h-10 rounded-full border-2 border-white" src="avatar1.jpg" alt="">
  <img class="w-10 h-10 rounded-full border-2 border-white" src="avatar2.jpg" alt="">
  <img class="w-10 h-10 rounded-full border-2 border-white" src="avatar3.jpg" alt="">
  <div class="w-10 h-10 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center text-sm text-gray-600">+5</div>
</div>

<!-- Avatar Tamanhos -->
<img class="w-8 h-8 rounded-full" src="avatar.jpg" alt="XS">
<img class="w-10 h-10 rounded-full" src="avatar.jpg" alt="SM">
<img class="w-12 h-12 rounded-full" src="avatar.jpg" alt="MD">
<img class="w-16 h-16 rounded-full" src="avatar.jpg" alt="LG">
<img class="w-20 h-20 rounded-full" src="avatar.jpg" alt="XL">`,
          },
          dropdown: {
            desc: 'Dropdown menu',
            html: `<!-- Dropdown Container -->
<div class="relative inline-block">
  <!-- Trigger Button -->
  <button class="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
    Opções
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
    </svg>
  </button>
  
  <!-- Dropdown Menu -->
  <div class="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10">
    <a href="#" class="block px-4 py-2 text-gray-700 hover:bg-gray-100">Editar</a>
    <a href="#" class="block px-4 py-2 text-gray-700 hover:bg-gray-100">Duplicar</a>
    <a href="#" class="block px-4 py-2 text-gray-700 hover:bg-gray-100">Arquivar</a>
    <hr class="my-1 border-gray-200">
    <a href="#" class="block px-4 py-2 text-red-600 hover:bg-red-50">Excluir</a>
  </div>
</div>

<!-- Dropdown com Ícones -->
<div class="w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
  <a href="#" class="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-100">
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
    </svg>
    Editar
  </a>
  <a href="#" class="flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-100">
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
    </svg>
    Duplicar
  </a>
</div>`,
          },
          tabs: {
            desc: 'Abas de navegação',
            html: `<!-- Tabs Underline -->
<div class="border-b border-gray-200">
  <nav class="flex gap-8">
    <a href="#" class="py-4 px-1 border-b-2 border-blue-500 text-blue-600 font-medium">Tab Ativa</a>
    <a href="#" class="py-4 px-1 border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300">Tab 2</a>
    <a href="#" class="py-4 px-1 border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300">Tab 3</a>
  </nav>
</div>

<!-- Tabs Pills -->
<div class="flex gap-2 bg-gray-100 p-1 rounded-lg">
  <button class="px-4 py-2 bg-white text-gray-900 rounded-md shadow-sm font-medium">Tab Ativa</button>
  <button class="px-4 py-2 text-gray-600 hover:text-gray-900 rounded-md font-medium">Tab 2</button>
  <button class="px-4 py-2 text-gray-600 hover:text-gray-900 rounded-md font-medium">Tab 3</button>
</div>

<!-- Tabs com Ícones -->
<div class="flex border-b border-gray-200">
  <a href="#" class="flex items-center gap-2 py-4 px-4 border-b-2 border-blue-500 text-blue-600">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
    </svg>
    Home
  </a>
  <a href="#" class="flex items-center gap-2 py-4 px-4 text-gray-500 hover:text-gray-700">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
    </svg>
    Perfil
  </a>
</div>`,
          },
          breadcrumb: {
            desc: 'Breadcrumb de navegação',
            html: `<!-- Breadcrumb Simples -->
<nav class="flex" aria-label="Breadcrumb">
  <ol class="flex items-center gap-2">
    <li>
      <a href="#" class="text-gray-500 hover:text-gray-700">Home</a>
    </li>
    <li class="text-gray-400">/</li>
    <li>
      <a href="#" class="text-gray-500 hover:text-gray-700">Produtos</a>
    </li>
    <li class="text-gray-400">/</li>
    <li>
      <span class="text-gray-900 font-medium">Detalhes</span>
    </li>
  </ol>
</nav>

<!-- Breadcrumb com Chevron -->
<nav class="flex" aria-label="Breadcrumb">
  <ol class="flex items-center">
    <li>
      <a href="#" class="text-gray-500 hover:text-gray-700">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/>
        </svg>
      </a>
    </li>
    <li class="flex items-center">
      <svg class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
      </svg>
      <a href="#" class="ml-2 text-gray-500 hover:text-gray-700">Categoria</a>
    </li>
    <li class="flex items-center">
      <svg class="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd"/>
      </svg>
      <span class="ml-2 text-gray-900 font-medium">Página Atual</span>
    </li>
  </ol>
</nav>`,
          },
          pagination: {
            desc: 'Paginação',
            html: `<!-- Paginação Simples -->
<nav class="flex items-center gap-1">
  <button class="px-3 py-2 text-gray-500 hover:bg-gray-100 rounded-lg disabled:opacity-50" disabled>
    Anterior
  </button>
  <button class="px-3 py-2 bg-blue-600 text-white rounded-lg">1</button>
  <button class="px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">2</button>
  <button class="px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">3</button>
  <span class="px-3 py-2 text-gray-500">...</span>
  <button class="px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">10</button>
  <button class="px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
    Próximo
  </button>
</nav>

<!-- Paginação com Ícones -->
<nav class="flex items-center gap-1">
  <button class="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
    </svg>
  </button>
  <button class="w-10 h-10 bg-blue-600 text-white rounded-lg">1</button>
  <button class="w-10 h-10 text-gray-700 hover:bg-gray-100 rounded-lg">2</button>
  <button class="w-10 h-10 text-gray-700 hover:bg-gray-100 rounded-lg">3</button>
  <button class="p-2 text-gray-500 hover:bg-gray-100 rounded-lg">
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
    </svg>
  </button>
</nav>`,
          },
          skeleton: {
            desc: 'Skeleton loaders',
            html: `<!-- Skeleton de Texto -->
<div class="animate-pulse space-y-3">
  <div class="h-4 bg-gray-200 rounded w-3/4"></div>
  <div class="h-4 bg-gray-200 rounded"></div>
  <div class="h-4 bg-gray-200 rounded w-5/6"></div>
</div>

<!-- Skeleton de Card -->
<div class="animate-pulse">
  <div class="bg-gray-200 h-48 rounded-t-lg"></div>
  <div class="p-4 space-y-3">
    <div class="h-4 bg-gray-200 rounded w-3/4"></div>
    <div class="h-4 bg-gray-200 rounded"></div>
    <div class="h-4 bg-gray-200 rounded w-1/2"></div>
  </div>
</div>

<!-- Skeleton de Avatar + Texto -->
<div class="animate-pulse flex items-center gap-4">
  <div class="w-12 h-12 bg-gray-200 rounded-full"></div>
  <div class="flex-1 space-y-2">
    <div class="h-4 bg-gray-200 rounded w-1/4"></div>
    <div class="h-3 bg-gray-200 rounded w-1/2"></div>
  </div>
</div>

<!-- Skeleton de Lista -->
<div class="animate-pulse space-y-4">
  <div class="flex items-center gap-4">
    <div class="w-10 h-10 bg-gray-200 rounded"></div>
    <div class="flex-1 space-y-2">
      <div class="h-4 bg-gray-200 rounded w-3/4"></div>
      <div class="h-3 bg-gray-200 rounded w-1/2"></div>
    </div>
  </div>
  <div class="flex items-center gap-4">
    <div class="w-10 h-10 bg-gray-200 rounded"></div>
    <div class="flex-1 space-y-2">
      <div class="h-4 bg-gray-200 rounded w-2/3"></div>
      <div class="h-3 bg-gray-200 rounded w-1/3"></div>
    </div>
  </div>
</div>`,
          },
        }

        if (!componente) {
          return {
            content: [{ type: 'text', text: `❌ Parâmetro 'componente' é obrigatório.\n\nComponentes disponíveis: ${Object.keys(receitas).join(', ')}` }],
            isError: true,
          }
        }

        const receita = receitas[componente]
        if (!receita) {
          return {
            content: [{ type: 'text', text: `❌ Componente não encontrado: ${componente}\n\nComponentes disponíveis: ${Object.keys(receitas).join(', ')}` }],
            isError: true,
          }
        }

        let result = `# 🍳 Receita: ${componente}\n\n`
        result += `**${receita.desc}**\n\n`
        result += '```html\n'
        result += receita.html
        result += '\n```\n'

        return { content: [{ type: 'text', text: result }] }
      }

      case 'tailwind_migracao_v4': {
        const topico = args?.topico as string | undefined

        const migracaoContent: Record<string, string> = {
          overview: `# 🚀 Migração Tailwind CSS v3 → v4

## Principais Mudanças

### 1. CSS-First Configuration
O Tailwind v4 usa configuração via CSS ao invés de JavaScript:

\`\`\`css
/* v4: Configuração em CSS */
@import "tailwindcss";

@theme {
  --color-primary: oklch(0.6 0.2 250);
  --font-display: "Inter", sans-serif;
}
\`\`\`

### 2. Nova Sintaxe de Import
\`\`\`css
/* v3 */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* v4 */
@import "tailwindcss";
\`\`\`

### 3. Plugins via CSS
\`\`\`css
/* v4 */
@import "tailwindcss";
@plugin "@tailwindcss/typography";
@plugin "@tailwindcss/forms";
\`\`\`

### 4. Novas Features
- Container Queries nativas
- \`@starting-style\` para animações
- Variantes \`in-*\`, \`has-*\`, \`not-*\`
- Cores em OKLCH
- Performance 10x mais rápida

### 5. Breaking Changes Importantes
- \`text-opacity-*\` → usar modificador de cor \`/opacity\`
- \`bg-opacity-*\` → usar modificador de cor \`/opacity\`
- Algumas classes renomeadas`,

          'css-first': `# 📝 CSS-First Configuration (v4)

## Configuração no CSS

O v4 elimina o \`tailwind.config.js\` para a maioria dos casos:

\`\`\`css
@import "tailwindcss";

/* Customização de tema */
@theme {
  /* Cores customizadas */
  --color-brand: oklch(0.6 0.2 250);
  --color-accent: oklch(0.7 0.15 150);
  
  /* Fontes */
  --font-display: "Cal Sans", sans-serif;
  --font-body: "Inter", sans-serif;
  
  /* Spacing customizado */
  --spacing-18: 4.5rem;
  --spacing-88: 22rem;
  
  /* Breakpoints customizados */
  --breakpoint-3xl: 1920px;
  
  /* Border radius */
  --radius-4xl: 2rem;
  
  /* Shadows */
  --shadow-glow: 0 0 20px oklch(0.6 0.2 250 / 0.5);
}
\`\`\`

## Vantagens
- Tipagem automática das variáveis CSS
- Intellisense melhorado
- Menor bundle size
- Mais rápido para compilar`,

          'theme-config': `# 🎨 Configuração de Tema (v4)

## Variáveis de Tema

\`\`\`css
@theme {
  /* === CORES === */
  /* Substitui colors no config JS */
  --color-*: valor;
  
  /* Exemplo */
  --color-primary-50: oklch(0.97 0.01 250);
  --color-primary-500: oklch(0.6 0.2 250);
  --color-primary-900: oklch(0.3 0.1 250);

  /* === TIPOGRAFIA === */
  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "Fira Code", monospace;
  
  --text-xs: 0.75rem;
  --text-xs--line-height: 1rem;
  
  /* === SPACING === */
  --spacing-*: valor;
  --spacing-13: 3.25rem;
  
  /* === BREAKPOINTS === */
  --breakpoint-sm: 640px;
  --breakpoint-md: 768px;
  --breakpoint-3xl: 1920px;
  
  /* === RADIUS === */
  --radius-sm: 0.25rem;
  --radius-xl: 1rem;
  
  /* === SHADOWS === */
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.05);
  --shadow-xl: 0 20px 25px rgb(0 0 0 / 0.1);
  
  /* === ANIMAÇÕES === */
  --animate-spin: spin 1s linear infinite;
  --animate-custom: myAnimation 2s ease-in-out;
}

@keyframes myAnimation {
  from { opacity: 0; }
  to { opacity: 1; }
}
\`\`\``,

          utilities: `# 🔧 Mudanças em Utilities (v4)

## Classes Renomeadas

| v3 | v4 | Motivo |
|----|----|--------|
| \`shadow-sm\` | \`shadow-xs\` | Mais consistente |
| \`shadow\` | \`shadow-sm\` | Escala ajustada |
| \`drop-shadow-sm\` | \`drop-shadow-xs\` | Consistência |
| \`blur-sm\` | \`blur-xs\` | Consistência |
| \`rounded-sm\` | \`rounded-xs\` | Consistência |

## Opacidade Inline

\`\`\`html
<!-- v3 (deprecated) -->
<div class="bg-blue-500 bg-opacity-50">

<!-- v4 (novo) -->
<div class="bg-blue-500/50">
\`\`\`

## Novas Utilities

\`\`\`html
<!-- Size (width + height) -->
<div class="size-10">  <!-- w-10 h-10 -->

<!-- Inset shortcuts -->
<div class="inset-x-4">  <!-- left-4 right-4 -->
<div class="inset-y-4">  <!-- top-4 bottom-4 -->

<!-- Logical properties -->
<div class="ps-4">  <!-- padding-inline-start -->
<div class="pe-4">  <!-- padding-inline-end -->
<div class="ms-4">  <!-- margin-inline-start -->
<div class="me-4">  <!-- margin-inline-end -->
\`\`\``,

          variants: `# 🎯 Novos Variants (v4)

## Container Queries

\`\`\`html
<div class="@container">
  <div class="@sm:flex @lg:grid @lg:grid-cols-2">
    <!-- Responde ao tamanho do container -->
  </div>
</div>

<!-- Named containers -->
<div class="@container/sidebar">
  <div class="@lg/sidebar:block">
\`\`\`

## Variants Compostos

\`\`\`html
<!-- has-* (parent has child) -->
<div class="has-[input:focus]:ring-2">
  <input type="text">
</div>

<!-- in-* (is inside) -->
<div class="in-[.dark]:text-white">

<!-- not-* (negation) -->
<div class="not-[.active]:opacity-50">
\`\`\`

## Starting Style

\`\`\`html
<!-- Animação de entrada -->
<div class="
  opacity-100 transition-opacity
  starting:opacity-0
">
\`\`\`

## Novos State Variants

\`\`\`html
<!-- Inert state -->
<div class="inert:opacity-50" inert>

<!-- Open/closed (details, dialog) -->
<details class="open:bg-white">
  <summary>Click me</summary>
</details>
\`\`\``,

          plugins: `# 🔌 Plugins no v4

## Import via CSS

\`\`\`css
@import "tailwindcss";

/* Plugins oficiais */
@plugin "@tailwindcss/typography";
@plugin "@tailwindcss/forms";
@plugin "@tailwindcss/aspect-ratio";
@plugin "@tailwindcss/container-queries";

/* Plugin customizado local */
@plugin "./my-plugin.js";
\`\`\`

## Criando Plugin (v4)

\`\`\`js
// my-plugin.js
export default function({ addUtilities, theme }) {
  addUtilities({
    '.text-shadow': {
      'text-shadow': '2px 2px 4px rgb(0 0 0 / 0.1)',
    },
    '.text-shadow-lg': {
      'text-shadow': '4px 4px 8px rgb(0 0 0 / 0.2)',
    },
  })
}
\`\`\`

## Diferenças do v3

| v3 | v4 |
|----|----|
| \`plugins: [require(...)]\` | \`@plugin "..."\` |
| CommonJS | ES Modules |
| \`tailwind.config.js\` | CSS direto |`,

          'breaking-changes': `# ⚠️ Breaking Changes (v3 → v4)

## Classes Removidas/Alteradas

### Opacidade Separada (REMOVIDO)
\`\`\`html
<!-- ❌ NÃO funciona no v4 -->
<div class="bg-blue-500 bg-opacity-50">
<div class="text-red-500 text-opacity-75">

<!-- ✅ Use modificador inline -->
<div class="bg-blue-500/50">
<div class="text-red-500/75">
\`\`\`

### Transform Utilities
\`\`\`html
<!-- ❌ v3 (removido) -->
<div class="transform scale-50">

<!-- ✅ v4 (automático) -->
<div class="scale-50">
\`\`\`

### Filter Utilities
\`\`\`html
<!-- ❌ v3 (removido) -->
<div class="filter blur-sm">

<!-- ✅ v4 (automático) -->
<div class="blur-sm">
\`\`\`

### Ring Width Default
\`\`\`html
<!-- v3: ring = 3px -->
<!-- v4: ring = 1px -->

<!-- Para manter 3px no v4 -->
<div class="ring-3">
\`\`\`

## Configuração

\`\`\`js
// ❌ v3 tailwind.config.js (não necessário no v4)
module.exports = {
  content: ['./src/**/*.{html,js}'],
  theme: { extend: {} },
  plugins: [],
}
\`\`\`

\`\`\`css
/* ✅ v4 - tudo no CSS */
@import "tailwindcss";
@source "./src/**/*.{html,js}";
\`\`\``,

          'postcss-vite': `# 🛠️ Setup PostCSS e Vite (v4)

## Vite (Recomendado)

\`\`\`bash
npm install tailwindcss @tailwindcss/vite
\`\`\`

\`\`\`js
// vite.config.js
import tailwindcss from '@tailwindcss/vite'

export default {
  plugins: [tailwindcss()],
}
\`\`\`

\`\`\`css
/* main.css */
@import "tailwindcss";
\`\`\`

## PostCSS

\`\`\`bash
npm install tailwindcss @tailwindcss/postcss
\`\`\`

\`\`\`js
// postcss.config.js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
\`\`\`

## CLI Standalone

\`\`\`bash
npm install tailwindcss @tailwindcss/cli
npx @tailwindcss/cli -i input.css -o output.css --watch
\`\`\`

## Content Sources

\`\`\`css
/* Detecta automaticamente, mas pode especificar */
@import "tailwindcss";

/* Adicionar sources explícitos */
@source "./src/**/*.{html,js,jsx,ts,tsx}";
@source "./components/**/*.vue";

/* Ignorar paths */
@source not "./src/legacy/**";
\`\`\``,
        }

        if (!topico) {
          let result = '# 📚 Guia de Migração Tailwind CSS v3 → v4\n\n'
          result += 'Escolha um tópico para ver detalhes:\n\n'
          result += '| Tópico | Descrição |\n'
          result += '|--------|----------|\n'
          result += '| `overview` | Visão geral das mudanças |\n'
          result += '| `css-first` | Nova configuração via CSS |\n'
          result += '| `theme-config` | Customização de tema |\n'
          result += '| `utilities` | Mudanças em classes |\n'
          result += '| `variants` | Novos variants |\n'
          result += '| `plugins` | Plugins no v4 |\n'
          result += '| `breaking-changes` | O que quebra |\n'
          result += '| `postcss-vite` | Setup do build |\n'
          result += '\n**Exemplo:** `tailwind_migracao_v4({ topico: "breaking-changes" })`\n'
          return { content: [{ type: 'text', text: result }] }
        }

        const content = migracaoContent[topico]
        if (!content) {
          return {
            content: [{ type: 'text', text: `❌ Tópico não encontrado: ${topico}\n\nTópicos disponíveis: ${Object.keys(migracaoContent).join(', ')}` }],
            isError: true,
          }
        }

        return { content: [{ type: 'text', text: content }] }
      }

      case 'tailwind_boas_praticas': {
        const topico = args?.topico as string | undefined

        const boasPraticas: Record<string, string> = {
          organizacao: `# 📋 Organização de Classes

## Ordem Recomendada

Organize classes nesta ordem para consistência:

1. **Layout** (display, position, flexbox/grid)
2. **Sizing** (width, height)
3. **Spacing** (margin, padding)
4. **Typography** (font, text)
5. **Visual** (background, border, shadow)
6. **Effects** (opacity, filters)
7. **Transitions/Animations**
8. **Variants** (hover, focus, responsive)

\`\`\`html
<button class="
  flex items-center justify-center     /* Layout */
  w-full h-12                           /* Sizing */
  px-4 py-2                             /* Spacing */
  text-sm font-medium text-white        /* Typography */
  bg-blue-600 rounded-lg shadow         /* Visual */
  transition-colors                     /* Transitions */
  hover:bg-blue-700 focus:ring-2        /* Variants */
">
  Botão
</button>
\`\`\`

## Multi-line para Legibilidade

\`\`\`html
<!-- ❌ Difícil de ler -->
<div class="flex items-center justify-between p-4 bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow">

<!-- ✅ Mais legível -->
<div class="
  flex items-center justify-between
  p-4
  bg-white rounded-lg
  shadow-md hover:shadow-lg
  transition-shadow
">
\`\`\``,

          componentes: `# 🧩 Extração de Componentes

## Quando Extrair

Extraia quando:
- Mesmo conjunto de classes usado 3+ vezes
- Componente tem lógica complexa
- Precisa de variantes (primary, secondary)

## React/Vue Components

\`\`\`jsx
// ✅ Componente React
function Button({ variant = 'primary', children }) {
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
    outline: 'border-2 border-blue-600 text-blue-600 hover:bg-blue-50',
  }
  
  return (
    <button className={\`
      px-4 py-2 font-medium rounded-lg
      transition-colors focus:outline-none focus:ring-2
      \${variants[variant]}
    \`}>
      {children}
    </button>
  )
}
\`\`\`

## @apply (Usar com Moderação)

\`\`\`css
/* ⚠️ Use apenas quando necessário */
@layer components {
  .btn {
    @apply px-4 py-2 font-medium rounded-lg transition-colors;
  }
  
  .btn-primary {
    @apply bg-blue-600 text-white hover:bg-blue-700;
  }
}
\`\`\`

## Tailwind Merge (recomendado)

\`\`\`jsx
import { twMerge } from 'tailwind-merge'

// Resolve conflitos de classes
<div className={twMerge('px-4 py-2', className)}>
\`\`\``,

          performance: `# ⚡ Performance

## Content Configuration

\`\`\`css
/* v4: Seja específico nos sources */
@import "tailwindcss";
@source "./src/**/*.{js,jsx,ts,tsx}";
@source "./components/**/*.vue";
@source not "./node_modules/**";
\`\`\`

## Evite Classes Dinâmicas

\`\`\`jsx
// ❌ Tailwind não detecta
<div className={\`bg-\${color}-500\`}>

// ✅ Use objeto de mapeamento
const colors = {
  blue: 'bg-blue-500',
  red: 'bg-red-500',
  green: 'bg-green-500',
}
<div className={colors[color]}>
\`\`\`

## Safelist (quando necessário)

\`\`\`css
/* v4: Forçar inclusão de classes */
@import "tailwindcss";
@utility bg-brand-* {
  /* Garante que bg-brand-{any} seja incluído */
}
\`\`\`

## Minificação

\`\`\`bash
# CLI com minificação
npx @tailwindcss/cli -i input.css -o output.css --minify

# Vite faz automaticamente em build
\`\`\`

## Cache

- Use cache do bundler (Vite/Webpack)
- Tailwind v4 é 10x mais rápido que v3`,

          acessibilidade: `# ♿ Acessibilidade

## Focus Visible

\`\`\`html
<!-- Foco apenas para navegação por teclado -->
<button class="
  focus:outline-none
  focus-visible:ring-2 focus-visible:ring-blue-500
">
  Botão Acessível
</button>
\`\`\`

## Screen Reader Only

\`\`\`html
<!-- Texto só para leitores de tela -->
<span class="sr-only">Fechar menu</span>

<!-- Ícone com label acessível -->
<button aria-label="Fechar">
  <svg class="w-5 h-5" aria-hidden="true">...</svg>
</button>
\`\`\`

## Motion Reduce

\`\`\`html
<!-- Respeitar preferências do usuário -->
<div class="
  animate-bounce
  motion-reduce:animate-none
">
\`\`\`

## Contraste

\`\`\`html
<!-- Alto contraste quando necessário -->
<div class="
  text-gray-600
  contrast-more:text-gray-900
  contrast-more:border-2
">
\`\`\`

## ARIA Variants

\`\`\`html
<!-- Estilos baseados em ARIA -->
<button 
  aria-expanded="true"
  class="aria-expanded:rotate-180"
>
  <svg>...</svg>
</button>
\`\`\``,

          responsivo: `# 📱 Design Responsivo

## Mobile-First

\`\`\`html
<!-- Base = mobile, depois aumenta -->
<div class="
  flex flex-col       /* Mobile: coluna */
  md:flex-row         /* Tablet+: linha */
">
\`\`\`

## Container Queries (v4)

\`\`\`html
<!-- Responde ao container, não à viewport -->
<div class="@container">
  <div class="
    @sm:flex
    @lg:grid @lg:grid-cols-2
  ">
\`\`\`

## Breakpoints Úteis

\`\`\`html
<div class="
  grid grid-cols-1          /* < 640px */
  sm:grid-cols-2            /* ≥ 640px */
  md:grid-cols-3            /* ≥ 768px */
  lg:grid-cols-4            /* ≥ 1024px */
  xl:grid-cols-5            /* ≥ 1280px */
">
\`\`\`

## Max-Width Variants

\`\`\`html
<!-- Esconder apenas em mobile -->
<div class="hidden sm:block">Desktop only</div>

<!-- Mostrar apenas em mobile -->
<div class="sm:hidden">Mobile only</div>
\`\`\`

## Layout Responsivo Completo

\`\`\`html
<div class="min-h-screen flex flex-col">
  <header class="h-16 px-4 md:px-6 lg:px-8">
    Nav
  </header>
  
  <main class="flex-1 container mx-auto px-4 py-6">
    <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      <!-- Cards -->
    </div>
  </main>
  
  <footer class="h-20">
    Footer
  </footer>
</div>
\`\`\``,

          'dark-mode': `# 🌙 Dark Mode

## Setup Básico

\`\`\`html
<!-- Classe no html ou body -->
<html class="dark">
  <body class="bg-white dark:bg-gray-900">
\`\`\`

## Padrões Comuns

\`\`\`html
<!-- Texto -->
<p class="text-gray-900 dark:text-white">
<p class="text-gray-600 dark:text-gray-400">

<!-- Backgrounds -->
<div class="bg-white dark:bg-gray-800">
<div class="bg-gray-50 dark:bg-gray-900">

<!-- Borders -->
<div class="border-gray-200 dark:border-gray-700">

<!-- Shadows -->
<div class="shadow-lg dark:shadow-gray-900/20">
\`\`\`

## Toggle com JavaScript

\`\`\`js
// Alternar dark mode
document.documentElement.classList.toggle('dark')

// Persistir preferência
localStorage.setItem('theme', 'dark')

// Detectar preferência do sistema
if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.documentElement.classList.add('dark')
}
\`\`\`

## Componente Dark Mode Aware

\`\`\`html
<div class="
  bg-white dark:bg-gray-800
  text-gray-900 dark:text-white
  border border-gray-200 dark:border-gray-700
  shadow-lg dark:shadow-none
  rounded-lg p-6
">
  <h2 class="text-xl font-bold">Título</h2>
  <p class="text-gray-600 dark:text-gray-400">
    Conteúdo que funciona nos dois modos.
  </p>
</div>
\`\`\``,

          animacoes: `# 🎬 Animações e Transições

## Transições Básicas

\`\`\`html
<!-- Transição suave -->
<button class="
  bg-blue-500
  transition-colors duration-200
  hover:bg-blue-600
">

<!-- Transição completa -->
<div class="
  transform transition-all duration-300 ease-out
  hover:scale-105 hover:shadow-lg
">
\`\`\`

## Animações Built-in

\`\`\`html
<!-- Spin (loading) -->
<svg class="animate-spin h-5 w-5">

<!-- Pulse -->
<div class="animate-pulse">

<!-- Bounce -->
<div class="animate-bounce">

<!-- Ping (notification) -->
<span class="animate-ping">
\`\`\`

## Animação Customizada

\`\`\`css
@theme {
  --animate-fade-in: fadeIn 0.3s ease-out;
  --animate-slide-up: slideUp 0.4s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from { 
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
\`\`\`

## Starting Style (v4)

\`\`\`html
<!-- Animação de entrada automática -->
<div class="
  opacity-100 transition-opacity duration-300
  starting:opacity-0
">
  Aparece com fade
</div>
\`\`\`

## Motion Safe/Reduce

\`\`\`html
<div class="
  animate-bounce
  motion-reduce:animate-none
  motion-safe:transition-transform
">
\`\`\``,

          forms: `# 📝 Formulários

## Input Estilizado

\`\`\`html
<input
  type="text"
  class="
    w-full px-4 py-2
    border border-gray-300 rounded-lg
    focus:ring-2 focus:ring-blue-500 focus:border-blue-500
    placeholder:text-gray-400
    disabled:bg-gray-100 disabled:cursor-not-allowed
  "
  placeholder="Digite aqui..."
>
\`\`\`

## Estados de Validação

\`\`\`html
<!-- Input válido -->
<input class="
  border-green-500
  focus:ring-green-500
  valid:border-green-500
">

<!-- Input inválido -->
<input class="
  border-red-500
  focus:ring-red-500
  invalid:border-red-500
">
\`\`\`

## Checkbox Customizado

\`\`\`html
<label class="flex items-center gap-2 cursor-pointer">
  <input 
    type="checkbox"
    class="
      w-5 h-5 rounded
      text-blue-600
      border-gray-300
      focus:ring-blue-500
    "
  >
  <span class="text-gray-700">Aceito os termos</span>
</label>
\`\`\`

## Select Estilizado

\`\`\`html
<select class="
  w-full px-4 py-2
  border border-gray-300 rounded-lg
  bg-white
  focus:ring-2 focus:ring-blue-500
">
  <option>Opção 1</option>
  <option>Opção 2</option>
</select>
\`\`\`

## Plugin Forms (Recomendado)

\`\`\`css
@import "tailwindcss";
@plugin "@tailwindcss/forms";
\`\`\`

Aplica estilos base automaticamente a todos os inputs.`,
        }

        if (!topico) {
          let result = '# 💡 Boas Práticas Tailwind CSS\n\n'
          result += 'Escolha um tópico:\n\n'
          result += '| Tópico | Descrição |\n'
          result += '|--------|----------|\n'
          result += '| `organizacao` | Ordem e organização de classes |\n'
          result += '| `componentes` | Extração e reutilização |\n'
          result += '| `performance` | Otimização de bundle |\n'
          result += '| `acessibilidade` | A11y com Tailwind |\n'
          result += '| `responsivo` | Design responsivo |\n'
          result += '| `dark-mode` | Implementação de dark mode |\n'
          result += '| `animacoes` | Transições e animações |\n'
          result += '| `forms` | Estilização de formulários |\n'
          result += '\n**Exemplo:** `tailwind_boas_praticas({ topico: "responsivo" })`\n'
          return { content: [{ type: 'text', text: result }] }
        }

        const content = boasPraticas[topico]
        if (!content) {
          return {
            content: [{ type: 'text', text: `❌ Tópico não encontrado: ${topico}\n\nTópicos disponíveis: ${Object.keys(boasPraticas).join(', ')}` }],
            isError: true,
          }
        }

        return { content: [{ type: 'text', text: content }] }
      }

      case 'tailwind_check_updates': {
        const updateInfo = await checkForUpdates()

        let result = '# 🔍 Verificação de Atualizações\n\n'

        if (updateInfo.hasUpdate) {
          result += '⚠️ **Atualização disponível!**\n\n'
          result += `**Commit local:** \`${updateInfo.currentSha?.substring(0, 7) || 'N/A'}\`\n`
          result += `**Commit remoto:** \`${updateInfo.latestSha?.substring(0, 7) || 'N/A'}\`\n\n`

          if (updateInfo.latestCommit) {
            result += `**Último commit:**\n`
            result += `- Mensagem: ${updateInfo.latestCommit.message}\n`
            result += `- Autor: ${updateInfo.latestCommit.author}\n`
            result += `- Data: ${updateInfo.latestCommit.date}\n\n`
          }

            result += '> Use `tailwind_update` para atualizar o repositório.\n'
        } else {
          result += '✅ **Repositório está atualizado!**\n\n'
          result += `**Commit atual:** \`${updateInfo.currentSha?.substring(0, 7) || 'N/A'}\`\n`
        }

        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'tailwind_update': {
        const updateResult = await checkAndUpdate()

        let result = '# 🔄 Atualização do Repositório\n\n'

        if (updateResult.updated) {
          result += '✅ **Repositório atualizado com sucesso!**\n\n'
          if (updateResult.previousSha) {
            result += `**De:** \`${updateResult.previousSha.substring(0, 7)}\`\n`
          }
          result += `**Para:** \`${updateResult.currentSha?.substring(0, 7) || 'N/A'}\`\n\n`

          if (updateResult.commitMessage) {
            result += `**Commit:** ${updateResult.commitMessage}\n`
          }
          if (updateResult.commitDate) {
            result += `**Data:** ${updateResult.commitDate}\n`
          }

            result += '\n> ⚡ O contexto da biblioteca foi atualizado automaticamente.\n'
        } else if (updateResult.error) {
          result += '❌ **Erro ao atualizar:**\n\n'
          result += `\`\`\`\n${updateResult.error}\n\`\`\`\n`
        } else {
          result += '✅ **Já está na versão mais recente!**\n\n'
          result += `**Commit atual:** \`${updateResult.currentSha?.substring(0, 7) || 'N/A'}\`\n`
        }

        return {
          content: [{ type: 'text', text: result }],
        }
      }

      case 'tailwind_status': {
        const status = await getRepositoryStatus()

        let result = '# 📊 Status do Repositório Tailwind CSS\n\n'

        result += `**Repositório válido:** ${status.isValid ? '✅ Sim' : '❌ Não'}\n`
        result += `**Caminho:** \`${status.repoPath}\`\n\n`

        result += `**Commit local:** \`${status.localSha?.substring(0, 7) || 'N/A'}\`\n`
        result += `**Commit remoto:** \`${status.remoteSha?.substring(0, 7) || 'N/A'}\`\n\n`

        if (status.hasUpdates) {
          result += '⚠️ **Há atualizações disponíveis!**\n\n'
          result += '> Use `tailwind_update` para atualizar.\n'
        } else {
          result += '✅ **Repositório está sincronizado com o GitHub.**\n'
        }

        result += `\n**Última verificação:** ${status.lastCheck}\n`

        return {
          content: [{ type: 'text', text: result }],
        }
      }

      default:
        return {
          content: [{ type: 'text', text: `❌ Ferramenta desconhecida: ${name}` }],
          isError: true,
        }
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `❌ Erro: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    }
  }
})

mcpServer.server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'tailwind://readme',
        name: 'Tailwind CSS README',
        description: 'Documentação principal da biblioteca Tailwind CSS',
        mimeType: 'text/markdown',
      },
      {
        uri: 'tailwind://types',
        name: 'Types Index',
        description: 'Tipos principais expostos pelo Tailwind',
        mimeType: 'text/markdown',
      },
      {
        uri: 'tailwind://statistics',
        name: 'Library Statistics',
        description: 'Estatísticas completas da biblioteca',
        mimeType: 'text/markdown',
      },
    ],
  }
})

mcpServer.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri

  if (uri === 'tailwind://readme') {
    const readmePath = path.join(TAILWIND_SRC_PATH, '..', 'README.md')
    if (fs.existsSync(readmePath)) {
      const content = fs.readFileSync(readmePath, 'utf-8')
      return { contents: [{ uri, mimeType: 'text/markdown', text: content }] }
    }
  }

  if (uri === 'tailwind://types') {
    const indexPath = path.join(TAILWIND_SRC_PATH, 'types.ts')
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, 'utf-8')
      return {
        contents: [
          {
            uri,
            mimeType: 'text/markdown',
            text: `# Types Index\n\n\`\`\`typescript\n${content}\n\`\`\``,
          },
        ],
      }
    }
  }

  if (uri === 'tailwind://statistics') {
    const parser = new AstParser(TAILWIND_SRC_PATH)
    const stats = parser.getStatistics()
    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: formatStatistics(stats),
        },
      ],
    }
  }

  return { contents: [{ uri, mimeType: 'text/plain', text: 'Resource not found' }] }
})

const AUTO_UPDATE_INTERVAL = parseInt(process.env.AUTO_UPDATE_INTERVAL || '3600000', 10)
const AUTO_UPDATE_ENABLED = process.env.AUTO_UPDATE_ENABLED !== 'false'

async function main() {
  const repoResult = await ensureRepository()
  if (!repoResult.success) {
    console.error(`❌ ${repoResult.error}`)
    process.exit(1)
  }
  
  TAILWIND_SRC_PATH = repoResult.path
  console.error(`📁 Usando Tailwind CSS: ${TAILWIND_SRC_PATH}`)
  
  const transport = new StdioServerTransport()
  await mcpServer.connect(transport)
  console.error('MCP Tailwind CSS server v1.0.0 running on stdio')

  if (AUTO_UPDATE_ENABLED) {
    const initialCheck = await checkForUpdates()
    if (initialCheck.hasUpdate) {
      console.error(`⚠️ Atualização disponível: ${initialCheck.latestCommit?.message}`)
    }

    scheduleUpdateCheck(AUTO_UPDATE_INTERVAL)
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
