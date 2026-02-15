#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createRequire } from 'node:module'
import {
  ensureRepository,
  checkForUpdates,
  scheduleUpdateCheck,
  checkPackageUpdate,
  schedulePackageUpdateCheck,
} from './auto-updater.js'
import { registerAstTools } from './tools/ast-tools.js'
import { registerRepoTools, registerResources } from './tools/repo-tools.js'
import { registerContentTools } from './tools/content-tools.js'

const require = createRequire(import.meta.url)
const APP_VERSION = (require('../package.json') as { version?: string }).version ?? '0.0.0'

const AUTO_UPDATE_INTERVAL = parseInt(process.env.AUTO_UPDATE_INTERVAL || '3600000', 10)
const AUTO_UPDATE_ENABLED = process.env.AUTO_UPDATE_ENABLED !== 'false'

const mcpServer = new McpServer(
  {
    name: 'mcp-tailwindcss',
    version: APP_VERSION,
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
)

async function main() {
  const repoResult = await ensureRepository()
  if (!repoResult.success) {
    console.error(`❌ ${repoResult.error}`)
    process.exit(1)
  }

  const srcPath = repoResult.path
  console.error(`📁 Usando Tailwind CSS: ${srcPath}`)

  // Register all tools and resources
  registerAstTools(mcpServer, srcPath)
  registerRepoTools(mcpServer, srcPath, APP_VERSION)
  registerContentTools(mcpServer, srcPath)
  registerResources(mcpServer, srcPath)

  // Connect transport
  const transport = new StdioServerTransport()
  await mcpServer.connect(transport)
  console.error(`MCP Tailwind CSS server v${APP_VERSION} running on stdio`)

  // Auto-update check (repositório Tailwind)
  if (AUTO_UPDATE_ENABLED) {
    const initialCheck = await checkForUpdates()
    if (initialCheck.hasUpdate) {
      console.error(`⚠️ Atualização do repositório disponível: ${initialCheck.latestCommit?.message}`)
    }
    scheduleUpdateCheck(AUTO_UPDATE_INTERVAL)
  }

  // Self-update check (pacote mcp-tailwindcss no npm)
  const packageCheck = await checkPackageUpdate(APP_VERSION)
  if (packageCheck.hasUpdate) {
    console.error(`\n⚠️  Nova versão do mcp-tailwindcss: v${packageCheck.latestVersion} (atual: v${APP_VERSION})`)
    console.error(`   Atualize: npm install -g mcp-tailwindcss@latest\n`)
  }
  schedulePackageUpdateCheck(APP_VERSION)
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
