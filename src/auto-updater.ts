import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const GITHUB_REPO = 'tailwindlabs/tailwindcss'
const GITHUB_API_URL = `https://api.github.com/repos/${GITHUB_REPO}/commits?per_page=1`

function getDefaultTailwindDir(): string {
  if (process.env.TAILWIND_PATH) {
    return process.env.TAILWIND_PATH.replace(/\/packages\/tailwindcss\/src\/?$/, '')
  }

  const localPath = path.resolve(__dirname, '../tailwindcss')
  if (fs.existsSync(path.join(localPath, 'packages', 'tailwindcss', 'src'))) {
    return localPath
  }

  return path.join(os.homedir(), '.mcp-tailwindcss', 'tailwindcss')
}

const TAILWIND_DIR = getDefaultTailwindDir()
const TAILWIND_SRC_PATH = path.join(TAILWIND_DIR, 'packages', 'tailwindcss', 'src')
const CACHE_DIR = path.join(os.homedir(), '.mcp-tailwindcss')
const CACHE_FILE = path.join(CACHE_DIR, '.last-commit-sha')

export function getTailwindSrcPath(): string {
  return TAILWIND_SRC_PATH
}

export interface UpdateResult {
  updated: boolean
  previousSha?: string
  currentSha?: string
  commitMessage?: string
  commitDate?: string
  error?: string
}

export interface CommitInfo {
  sha: string
  message: string
  date: string
  author: string
}

function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
  }
}

export function getLastSavedSha(): string | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return fs.readFileSync(CACHE_FILE, 'utf-8').trim()
    }
  } catch {
    return null
  }
  return null
}

export function saveSha(sha: string): void {
  try {
    ensureCacheDir()
    fs.writeFileSync(CACHE_FILE, sha, 'utf-8')
  } catch (error) {
    console.error('Erro ao salvar SHA:', error)
  }
}

export async function fetchLatestCommit(): Promise<CommitInfo | null> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'mcp-tailwindcss-updater',
    }
    
    if (process.env.GITHUB_TOKEN) {
      headers['Authorization'] = `token ${process.env.GITHUB_TOKEN}`
    }
    
    const response = await fetch(GITHUB_API_URL, { headers })

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`)
    }

    const commits = await response.json() as Array<{
      sha: string
      commit: {
        message: string
        committer: { date: string }
        author: { name: string }
      }
    }>
    
    if (commits.length === 0) return null

    const commit = commits[0]
    return {
      sha: commit.sha,
      message: commit.commit.message.split('\n')[0],
      date: commit.commit.committer.date,
      author: commit.commit.author.name,
    }
  } catch (error) {
    console.error('Erro ao buscar commit:', error)
    return null
  }
}

export function isGitRepository(): boolean {
  const gitDir = path.join(TAILWIND_DIR, '.git')
  return fs.existsSync(gitDir)
}

export function hasTailwindSrc(): boolean {
  return fs.existsSync(TAILWIND_SRC_PATH)
}

export function cloneRepository(): boolean {
  try {
    const parentDir = path.dirname(TAILWIND_DIR)
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true })
    }
    
    if (!fs.existsSync(TAILWIND_DIR)) {
      console.error('📥 Baixando repositório tailwindcss...')
      execSync(`git clone --depth 1 https://github.com/${GITHUB_REPO}.git "${TAILWIND_DIR}"`, {
        stdio: 'pipe',
      })
      console.error('✅ Repositório baixado com sucesso!')
      return true
    }
    return false
  } catch (error) {
    console.error('Erro ao clonar repositório:', error)
    return false
  }
}

export function pullRepository(): { success: boolean; output: string } {
  try {
    const output = execSync('git pull origin main', {
      cwd: TAILWIND_DIR,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    return { success: true, output }
  } catch (error: unknown) {
    return { success: false, output: error instanceof Error ? error.message : String(error) }
  }
}

export function getLocalCommitSha(): string | null {
  try {
    const sha = execSync('git rev-parse HEAD', {
      cwd: TAILWIND_DIR,
      encoding: 'utf-8',
      stdio: 'pipe',
    })
    return sha.trim()
  } catch {
    return null
  }
}

export async function ensureRepository(): Promise<{ success: boolean; path: string; error?: string }> {
  const srcPath = getTailwindSrcPath()

  if (hasTailwindSrc()) {
    return { success: true, path: srcPath }
  }

  console.error('🔍 Repositório tailwindcss não encontrado. Iniciando download...')

  const cloned = cloneRepository()
  if (cloned && hasTailwindSrc()) {
    const sha = getLocalCommitSha()
    if (sha) saveSha(sha)
    return { success: true, path: srcPath }
  }

  return {
    success: false,
    path: srcPath,
    error: 'Falha ao baixar repositório. Verifique sua conexão e se o git está instalado.'
  }
}

export async function checkAndUpdate(): Promise<UpdateResult> {
  try {
    const repoStatus = await ensureRepository()
    if (!repoStatus.success) {
      return { updated: false, error: repoStatus.error }
    }
    
    if (!isGitRepository()) {
      return { updated: false, error: 'Diretório não é um repositório git válido' }
    }

    const latestCommit = await fetchLatestCommit()
    if (!latestCommit) {
      return { updated: false, error: 'Não foi possível obter informações do GitHub' }
    }

    const savedSha = getLastSavedSha()
    const localSha = getLocalCommitSha()

    if (latestCommit.sha !== localSha) {
      const pullResult = pullRepository()
      
      if (pullResult.success) {
        saveSha(latestCommit.sha)
        return {
          updated: true,
          previousSha: localSha || savedSha || undefined,
          currentSha: latestCommit.sha,
          commitMessage: latestCommit.message,
          commitDate: latestCommit.date,
        }
      } else {
        return { updated: false, error: pullResult.output }
      }
    }

    return {
      updated: false,
      currentSha: latestCommit.sha,
      commitMessage: 'Repositório já está atualizado',
    }
  } catch (error: unknown) {
    return { updated: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function checkForUpdates(): Promise<{
  hasUpdate: boolean
  currentSha?: string
  latestSha?: string
  latestCommit?: CommitInfo
}> {
  try {
    const latestCommit = await fetchLatestCommit()
    const localSha = getLocalCommitSha()

    if (!latestCommit) {
      return { hasUpdate: false }
    }

    return {
      hasUpdate: latestCommit.sha !== localSha,
      currentSha: localSha || undefined,
      latestSha: latestCommit.sha,
      latestCommit,
    }
  } catch {
    return { hasUpdate: false }
  }
}

export function scheduleUpdateCheck(
  intervalMs: number = 60 * 60 * 1000,
  onUpdate?: (result: UpdateResult) => void,
): NodeJS.Timeout {
  return setInterval(async () => {
    const result = await checkAndUpdate()
    
    if (result.updated) {
      console.error(`✅ Tailwind CSS atualizado: ${result.currentSha?.substring(0, 7)}`)
      onUpdate?.(result)
    } else if (result.error) {
      console.error(`❌ Erro na atualização: ${result.error}`)
    }
  }, intervalMs)
}

export async function getRepositoryStatus(): Promise<{
  isValid: boolean
  localSha?: string
  remoteSha?: string
  hasUpdates: boolean
  lastCheck: string
  repoPath: string
}> {
  const localSha = getLocalCommitSha()
  const latestCommit = await fetchLatestCommit()
  
  return {
    isValid: isGitRepository(),
    localSha: localSha || undefined,
    remoteSha: latestCommit?.sha,
    hasUpdates: latestCommit ? latestCommit.sha !== localSha : false,
    lastCheck: new Date().toISOString(),
    repoPath: TAILWIND_DIR,
  }
}
