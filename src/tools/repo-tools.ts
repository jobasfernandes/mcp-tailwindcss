import { z } from 'zod'
import * as fs from 'fs'
import * as path from 'path'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { AstParser } from '../ast-parser.js'
import {
  checkAndUpdate,
  checkForUpdates,
  getRepositoryStatus,
  checkPackageUpdate,
  selfUpdate,
} from '../auto-updater.js'
import { getDirectoryTree, formatStatistics } from '../formatters.js'

export function registerRepoTools(mcpServer: McpServer, srcPath: string, appVersion: string) {
  // Tool: tailwind_estrutura
  mcpServer.registerTool(
    'tailwind_estrutura',
    {
      description: 'Lista a estrutura de arquivos do pacote Tailwind CSS (packages/tailwindcss/src). Útil para entender a organização do código.',
      inputSchema: {
        subpasta: z.string().optional().describe(
          'Subpasta específica para listar (ex: utils, compat). Deixe vazio para listar tudo.',
        ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ subpasta }) => {
      const targetPath = subpasta ? path.join(srcPath, subpasta) : srcPath

      if (!fs.existsSync(targetPath)) {
        return {
          content: [{ type: 'text' as const, text: `❌ Pasta não encontrada: ${subpasta || 'src'}` }],
          isError: true,
        }
      }

      const tree = getDirectoryTree(targetPath)
      return {
        content: [{
          type: 'text' as const,
          text: `# 📁 Estrutura de ${subpasta || 'tailwindcss/packages/tailwindcss/src'}\n\n\`\`\`\n${tree}\`\`\``,
        }],
      }
    },
  )

  // Tool: tailwind_ler_arquivo
  mcpServer.registerTool(
    'tailwind_ler_arquivo',
    {
      description: 'Lê o conteúdo de um arquivo específico da biblioteca Tailwind CSS.',
      inputSchema: {
        caminho: z.string().describe(
          'Caminho relativo do arquivo dentro de src/ (ex: utils/resolve-config.ts)',
        ),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ caminho }) => {
      const fullPath = path.join(srcPath, caminho)

      if (!fs.existsSync(fullPath)) {
        return {
          content: [{ type: 'text' as const, text: `❌ Arquivo não encontrado: ${caminho}` }],
          isError: true,
        }
      }

      const content = fs.readFileSync(fullPath, 'utf-8')
      const ext = path.extname(caminho).slice(1) || 'typescript'

      return {
        content: [{
          type: 'text' as const,
          text: `# 📄 ${caminho}\n\n\`\`\`${ext}\n${content}\n\`\`\``,
        }],
      }
    },
  )

  // Tool: tailwind_check_updates
  mcpServer.registerTool(
    'tailwind_check_updates',
    {
      description: 'Verifica se há atualizações disponíveis no repositório oficial do Tailwind CSS (GitHub). Não aplica atualizações, apenas verifica.',
      annotations: { readOnlyHint: true },
    },
    async () => {
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

      return { content: [{ type: 'text' as const, text: result }] }
    },
  )

  // Tool: tailwind_update
  mcpServer.registerTool(
    'tailwind_update',
    {
      description: 'Atualiza o repositório local do Tailwind CSS para a versão mais recente do GitHub. Executa git pull automaticamente.',
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async () => {
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

      return { content: [{ type: 'text' as const, text: result }] }
    },
  )

  // Tool: tailwind_status
  mcpServer.registerTool(
    'tailwind_status',
    {
      description: 'Mostra o status atual do repositório Tailwind: SHA do commit, se há atualizações pendentes, caminho do repositório.',
      annotations: { readOnlyHint: true },
    },
    async () => {
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

      return { content: [{ type: 'text' as const, text: result }] }
    },
  )

  // Tool: tailwind_self_update
  mcpServer.registerTool(
    'tailwind_self_update',
    {
      description: 'Verifica e atualiza o próprio pacote mcp-tailwindcss para a versão mais recente do npm. Útil quando há novas features ou correções.',
      annotations: { readOnlyHint: false, idempotentHint: true },
    },
    async () => {
      const check = await checkPackageUpdate(appVersion)

      if (!check.hasUpdate) {
        return {
          content: [{
            type: 'text' as const,
            text: `# ✅ mcp-tailwindcss está atualizado!\n\n**Versão atual:** v${appVersion}\n**Última versão no npm:** v${check.latestVersion || appVersion}\n`,
          }],
        }
      }

      let result = `# 🔄 Atualizando mcp-tailwindcss\n\n`
      result += `**Versão atual:** v${appVersion}\n`
      result += `**Nova versão:** v${check.latestVersion}\n\n`

      const updateResult = await selfUpdate(appVersion)

      if (updateResult.success && updateResult.method === 'global') {
        result += `✅ **Atualizado com sucesso!**\n\n`
        result += `O pacote foi atualizado de v${updateResult.previousVersion} para v${updateResult.newVersion}.\n`
        result += `\n> ⚠️ Reinicie o MCP server para usar a nova versão.\n`
      } else if (updateResult.success && updateResult.method === 'npx-cache') {
        result += `✅ **Cache do npx limpo!**\n\n`
        result += `Na próxima execução via \`npx mcp-tailwindcss\`, a versão v${updateResult.newVersion} será baixada automaticamente.\n`
        result += `\n> 💡 Para garantir, use: \`npx mcp-tailwindcss@latest\`\n`
      } else {
        result += `❌ **Erro ao atualizar:**\n\n`
        result += `\`\`\`\n${updateResult.error}\n\`\`\`\n\n`
        result += `**Atualize manualmente:**\n`
        result += `- Global: \`npm install -g mcp-tailwindcss@latest\`\n`
        result += `- NPX: \`npx mcp-tailwindcss@latest\`\n`
      }

      return { content: [{ type: 'text' as const, text: result }] }
    },
  )
}

export function registerResources(mcpServer: McpServer, srcPath: string) {
  mcpServer.registerResource(
    'Tailwind CSS README',
    'tailwind://readme',
    { description: 'Documentação principal da biblioteca Tailwind CSS', mimeType: 'text/markdown' },
    async (uri) => {
      const readmePath = path.join(srcPath, '..', 'README.md')
      if (fs.existsSync(readmePath)) {
        const content = fs.readFileSync(readmePath, 'utf-8')
        return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: content }] }
      }
      return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: 'README not found' }] }
    },
  )

  mcpServer.registerResource(
    'Types Index',
    'tailwind://types',
    { description: 'Tipos principais expostos pelo Tailwind', mimeType: 'text/markdown' },
    async (uri) => {
      const indexPath = path.join(srcPath, 'types.ts')
      if (fs.existsSync(indexPath)) {
        const content = fs.readFileSync(indexPath, 'utf-8')
        return {
          contents: [{
            uri: uri.href,
            mimeType: 'text/markdown',
            text: `# Types Index\n\n\`\`\`typescript\n${content}\n\`\`\``,
          }],
        }
      }
      return { contents: [{ uri: uri.href, mimeType: 'text/plain', text: 'Types file not found' }] }
    },
  )

  mcpServer.registerResource(
    'Library Statistics',
    'tailwind://statistics',
    { description: 'Estatísticas completas da biblioteca', mimeType: 'text/markdown' },
    async (uri) => {
      const parser = new AstParser(srcPath)
      const stats = parser.getStatistics()
      return {
        contents: [{
          uri: uri.href,
          mimeType: 'text/markdown',
          text: formatStatistics(stats),
        }],
      }
    },
  )
}
