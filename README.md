# MCP Tailwind CSS Context

<div align="center">

![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-v4.1-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-Compatible-5B5BD6?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)

**Servidor MCP (Model Context Protocol) para fornecer contexto completo da biblioteca Tailwind CSS**

[Instalação](#instalação) • [Ferramentas](#ferramentas-disponíveis) • [Frameworks](#integração-com-frameworks) • [v3 vs v4](#tailwind-v3-vs-v4)

</div>

---

## 📋 Sobre

Este servidor MCP fornece acesso completo ao código-fonte do **Tailwind CSS** (repositório oficial `tailwindlabs/tailwindcss`), permitindo que assistentes de IA como Claude e GitHub Copilot tenham contexto profundo sobre:

- ✅ Configuração e Theme Variables
- ✅ Utilities e Plugins
- ✅ Integração com frameworks (Vite, Next.js, Nuxt, Astro, etc.)
- ✅ Diferenças entre Tailwind v3 e v4
- ✅ AST parsing para tipos TypeScript
- ✅ Auto-download e atualização do repositório oficial

---

## 🚀 Instalação

### Via NPM (recomendado)

```bash
npm install -g mcp-tailwindcss
```

### Configuração no Claude Desktop

Adicione ao seu arquivo `claude_desktop_config.json`:

**Windows:**
```json
{
  "mcpServers": {
    "tailwindcss": {
      "command": "npx",
      "args": ["-y", "mcp-tailwindcss"]
    }
  }
}
```

**macOS/Linux:**
```json
{
  "mcpServers": {
    "tailwindcss": {
      "command": "npx",
      "args": ["-y", "mcp-tailwindcss"]
    }
  }
}
```

### Configuração no VS Code (GitHub Copilot)

Adicione ao seu `settings.json`:

```json
{
  "github.copilot.chat.mcpServers": {
    "tailwindcss": {
      "command": "npx",
      "args": ["-y", "mcp-tailwindcss"]
    }
  }
}
```

---

## 🛠️ Ferramentas Disponíveis

### 📁 Exploração de Código

| Ferramenta | Descrição |
|------------|-----------|
| `tailwind_estrutura` | Lista a estrutura de arquivos do Tailwind CSS (`packages/tailwindcss/src`) |
| `tailwind_ler_arquivo` | Lê o conteúdo de um arquivo específico do Tailwind |

### 🔍 Análise de Tipos (AST)

| Ferramenta | Descrição |
|------------|-----------|
| `tailwind_extrair_tipos` | Extrai interfaces, types, enums, funções via AST |
| `tailwind_buscar_tipo` | Busca definição de tipo específico pelo nome |
| `tailwind_buscar_fuzzy` | Busca aproximada quando não sabe o nome exato |
| `tailwind_listar_exports` | Lista todos os exports públicos agrupados |
| `tailwind_categorias` | Lista declarações por categoria específica |
| `tailwind_constantes` | Lista constantes e variáveis exportadas |
| `tailwind_hierarquia` | Mostra hierarquia de herança de um tipo |
| `tailwind_estatisticas` | Estatísticas detalhadas da biblioteca |
| `tailwind_dependencias` | Analisa dependências entre módulos |
| `tailwind_enums` | Lista todas as enumerações com valores |
| `tailwind_interfaces` | Lista interfaces com propriedades/métodos |
| `tailwind_funcoes` | Lista funções exportadas com assinaturas |

### 🔄 Atualizações

| Ferramenta | Descrição |
|------------|-----------|
| `tailwind_check_updates` | Verifica se há atualizações disponíveis |
| `tailwind_update` | Atualiza o repositório local |
| `tailwind_status` | Status atual do repositório (commit SHA, etc.) |

### 🎯 Integrações

| Ferramenta | Descrição |
|------------|-----------|
| `tailwind_integracoes` | Guias de integração com frameworks |

### 🎨 Referência de Classes

| Ferramenta | Descrição |
|------------|-----------|
| `tailwind_utilities` | Lista completa de utilities por categoria (layout, flexbox, grid, spacing, typography, etc.) |
| `tailwind_variants` | Todos os variants/modificadores (hover, focus, responsive, dark, etc.) |
| `tailwind_cores` | Paleta completa de cores com valores hex (slate, gray, red, blue, etc.) |
| `tailwind_spacing` | Escala de espaçamento (0-96, px, frações) |
| `tailwind_breakpoints` | Breakpoints responsivos e container queries |

### 🍳 Receitas e Padrões

| Ferramenta | Descrição |
|------------|-----------|
| `tailwind_receitas` | Receitas prontas de componentes (button, card, form, modal, navbar, hero, grid, alert, etc.) |
| `tailwind_migracao_v4` | Guia de migração v3 → v4 (breaking changes, nova sintaxe, etc.) |
| `tailwind_boas_praticas` | Boas práticas (organização, componentes, performance, responsivo, dark mode, etc.) |

---

## 🎨 Integração com Frameworks

O MCP fornece guias completos para integrar Tailwind CSS com os principais frameworks:

### Vite (Tailwind v4)

```bash
npm install tailwindcss @tailwindcss/vite
```

```javascript
// vite.config.js
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss()]
})
```

```css
/* app.css */
@import "tailwindcss";
```

### Next.js (Tailwind v4)

```bash
npm install tailwindcss @tailwindcss/postcss postcss
```

```javascript
// postcss.config.mjs
export default {
  plugins: {
    '@tailwindcss/postcss': {}
  }
}
```

### PostCSS (Universal)

```bash
npm install tailwindcss @tailwindcss/postcss postcss
```

```javascript
// postcss.config.js
export default {
  plugins: {
    '@tailwindcss/postcss': {}
  }
}
```

### CLI

```bash
npm install tailwindcss @tailwindcss/cli
npx @tailwindcss/cli -i input.css -o output.css --watch
```

---

## ⚡ Tailwind v3 vs v4

### Principais Diferenças

| Aspecto | Tailwind v3 | Tailwind v4 |
|---------|-------------|-------------|
| **Configuração** | `tailwind.config.js` | CSS-first com `@theme` |
| **Instalação Vite** | Plugin PostCSS | `@tailwindcss/vite` nativo |
| **Theme** | JavaScript object | CSS Variables (`--color-*`) |
| **Import** | `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| **Cores** | HEX/RGB | oklch() por padrão |

### Tailwind v4 - Nova Sintaxe CSS

```css
@import "tailwindcss";

@theme {
  /* Cores customizadas */
  --color-brand: oklch(0.72 0.11 221.19);
  
  /* Breakpoints */
  --breakpoint-3xl: 120rem;
  
  /* Fontes */
  --font-display: "Satoshi", sans-serif;
  
  /* Espaçamento base */
  --spacing: 0.25rem;
}
```

### Theme Variable Namespaces (v4)

| Namespace | Utilities Geradas |
|-----------|-------------------|
| `--color-*` | `bg-*`, `text-*`, `border-*`, `fill-*` |
| `--font-*` | `font-*` |
| `--text-*` | `text-xs`, `text-sm`, `text-lg`, etc. |
| `--spacing-*` | `p-*`, `m-*`, `gap-*`, `w-*`, `h-*` |
| `--radius-*` | `rounded-*` |
| `--shadow-*` | `shadow-*` |
| `--breakpoint-*` | `sm:`, `md:`, `lg:`, `xl:` |
| `--animate-*` | `animate-*` |

### Tailwind v3 - Configuração JavaScript

```javascript
// tailwind.config.js (v3)
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#06B6D4',
      },
      fontFamily: {
        display: ['Satoshi', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

```css
/* styles.css (v3) */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## 📚 Exemplos de Uso

### Buscar configuração de cores

```
Use tailwind_buscar_tipo com nome "Theme" para ver a estrutura de tema
```

### Explorar utilities disponíveis

```
Use tailwind_extrair_tipos com apenas_kind "function" para ver todas as funções utilitárias
```

### Verificar integração com Next.js

```
Use tailwind_integracoes com framework "next" para ver o passo a passo
```

### Ver estrutura do projeto

```
Use tailwind_estrutura para explorar a organização do código-fonte
```

---

## 🔧 Variáveis de Ambiente

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `TAILWIND_SRC_PATH` | Caminho customizado para o código-fonte | Auto-detectado |

---

## 📁 Estrutura do Repositório

O MCP baixa automaticamente o repositório oficial do Tailwind CSS na primeira execução:

```
~/.mcp-tailwindcss/
└── tailwindcss/
    ├── packages/
    │   └── tailwindcss/
    │       └── src/           <- Código-fonte principal
    │           ├── index.ts
    │           ├── theme.css
    │           ├── preflight.css
    │           ├── utilities.css
    │           ├── compat/
    │           ├── utils/
    │           └── ...
    ├── crates/                 <- Engine Oxide (Rust)
    └── integrations/           <- Testes de integração
```

---

## 🎯 Utilities Reference (v4)

### Layout
- `container`, `columns-*`
- `break-after-*`, `break-before-*`, `break-inside-*`
- `box-decoration-*`, `box-sizing-*`
- `block`, `inline-block`, `inline`, `flex`, `inline-flex`, `grid`, `inline-grid`
- `flow-root`, `contents`, `hidden`

### Flexbox & Grid
- `flex-*`, `flex-row`, `flex-col`, `flex-wrap`, `flex-nowrap`
- `grid-cols-*`, `grid-rows-*`, `gap-*`
- `justify-*`, `items-*`, `content-*`
- `place-*`, `self-*`

### Spacing
- `p-*`, `px-*`, `py-*`, `pt-*`, `pr-*`, `pb-*`, `pl-*`
- `m-*`, `mx-*`, `my-*`, `mt-*`, `mr-*`, `mb-*`, `ml-*`
- `space-x-*`, `space-y-*`

### Sizing
- `w-*`, `min-w-*`, `max-w-*`
- `h-*`, `min-h-*`, `max-h-*`
- `size-*`

### Typography
- `font-*`, `text-*`, `tracking-*`, `leading-*`
- `text-left`, `text-center`, `text-right`, `text-justify`
- `underline`, `line-through`, `no-underline`
- `uppercase`, `lowercase`, `capitalize`, `normal-case`

### Backgrounds
- `bg-*`, `bg-gradient-*`
- `from-*`, `via-*`, `to-*`
- `bg-cover`, `bg-contain`, `bg-center`, `bg-repeat`, `bg-no-repeat`

### Borders
- `border`, `border-*`, `rounded-*`
- `ring-*`, `outline-*`
- `divide-*`

### Effects
- `shadow-*`, `drop-shadow-*`
- `opacity-*`
- `mix-blend-*`, `bg-blend-*`

### Filters
- `blur-*`, `brightness-*`, `contrast-*`
- `grayscale`, `hue-rotate-*`, `invert`, `saturate-*`, `sepia`
- `backdrop-*`

### Transitions & Animation
- `transition`, `transition-*`
- `duration-*`, `ease-*`, `delay-*`
- `animate-*`

### Transforms
- `scale-*`, `rotate-*`, `translate-*`, `skew-*`
- `origin-*`

### Interactivity
- `cursor-*`, `pointer-events-*`
- `resize`, `resize-x`, `resize-y`, `resize-none`
- `select-*`, `touch-*`, `scroll-*`

---

## 🤝 Contribuindo

1. Fork o repositório
2. Crie sua branch: `git checkout -b feature/nova-funcionalidade`
3. Commit suas mudanças: `git commit -m 'feat: adiciona nova funcionalidade'`
4. Push para a branch: `git push origin feature/nova-funcionalidade`
5. Abra um Pull Request

---

## 📄 Licença

MIT © Joseph

---

## 🔗 Links Úteis

- [Tailwind CSS Documentation](https://tailwindcss.com/docs)
- [Tailwind CSS GitHub](https://github.com/tailwindlabs/tailwindcss)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Tailwind v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
- [Theme Variables Reference](https://tailwindcss.com/docs/theme)

---

<div align="center">

**Feito com 💙 para a comunidade Tailwind CSS**

</div>
