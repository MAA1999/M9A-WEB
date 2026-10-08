import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

import type { Plugin } from 'vuepress/core'

/**
 * Retired development-doc pages, keyed by their old slug. Each entry maps to
 * the slug that carries the content today.
 *
 * These paths were live before the docs were reorganised, so search engines
 * still hold them; without a stub every one of them answers 404 and any
 * inbound link is dropped. Targets were taken from the M9A repository history:
 * `interface`/`packaging` were retired in #817 (项目结构重构), `refactor` in
 * #650 (开发文档重新犁一遍), and the i18n page was renamed.
 */
const DEVELOP_REDIRECTS: Record<string, string> = {
  'interface': 'custom',
  'refactor': 'structure',
  'packaging': 'structure',
  'runtime-text-i18n': 'i18n',
  'uv-agent-migration': 'development',
}

const LOCALES = ['zh_cn', 'en_us'] as const

interface LegacyRedirectsOptions {
  hostname: string
}

/**
 * Emit redirect stubs for retired page paths.
 *
 * The stubs are written straight into the build output rather than kept under
 * `docs/.vuepress/public/`: the deploy workflow mirrors `docs/zh_cn` and
 * `docs/en_us` from the M9A repository with `rsync --delete`, so anything
 * parked inside those directories would be wiped on the next deploy.
 *
 * GitHub Pages cannot serve a real 301, so each stub carries a meta refresh
 * plus a canonical pointing at the replacement page.
 */
export default ({ hostname }: LegacyRedirectsOptions): Plugin => ({
  name: 'legacy-redirects',

  onGenerated: async (app): Promise<void> => {
    const dest = app.dir.dest()

    for (const locale of LOCALES) {
      for (const [from, to] of Object.entries(DEVELOP_REDIRECTS)) {
        const file = path.join(dest, locale, 'develop', `${from}.html`)
        await mkdir(path.dirname(file), { recursive: true })
        await writeFile(file, stub(`/${locale}/develop/${to}.html`, hostname))
      }
    }
  },
})

function stub(target: string, hostname: string): string {
  const url = `${hostname}${target}`
  const lang = target.startsWith('/en_us/') ? 'en-US' : 'zh-CN'
  const message =
    lang === 'en-US' ? 'This page has moved to' : '该页面已迁移到'

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>页面已迁移 | M9A 文档站</title>
<link rel="canonical" href="${url}">
<meta http-equiv="refresh" content="0; url=${target}">
</head>
<body>
<p>${message} <a href="${target}">${url}</a></p>
</body>
</html>
`
}
