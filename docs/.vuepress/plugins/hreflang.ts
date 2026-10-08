import { readFile, writeFile } from 'fs/promises'
import path from 'path'

import type { Plugin } from 'vuepress/core'

/**
 * Alternate links written by `@vuepress/plugin-seo`. They are replaced
 * wholesale rather than appended to: the plugin only emits the *other*
 * language, so nothing it writes can be reused as-is.
 */
const ALTERNATE_LINK = /<link rel="alternate" hreflang="[^"]*" href="[^"]*">/g

/** `<xhtml:link>` alternates written by `@vuepress/plugin-sitemap`. */
const SITEMAP_ALTERNATE = /<xhtml:link\b[^>]*href="([^"]*)"[^>]*\/>/g

interface HreflangPluginOptions {
  hostname: string
}

/**
 * Emit a complete, self-referencing hreflang cluster on every page.
 *
 * `@vuepress/plugin-seo` maps a page to its counterpart by swapping the locale
 * prefix, which leaves two gaps: it never points a page at itself, and it never
 * emits `x-default`. Google treats a cluster without self-references as
 * incomplete and may discard the annotations entirely.
 *
 * The same swap also breaks the home page pair: the Chinese home is served from
 * `/` while `/zh_cn/` is a meta-refresh stub, so the plugin points the English
 * home's `zh-CN` alternate at the stub. Both home pages are therefore mapped to
 * the `/` + `/en_us/` pair here.
 */
export default ({ hostname }: HreflangPluginOptions): Plugin => ({
  name: 'seo-hreflang',

  onGenerated: async (app): Promise<void> => {
    const dest = app.dir.dest()
    const pages = new Set(app.pages.map((page) => page.path))

    for (const page of app.pages) {
      const file = outputFile(dest, page.path)
      const head = alternates(translationPair(page.path), pages, hostname)
      const html = await readFile(file, 'utf-8')
      await writeFile(file, html.replace(ALTERNATE_LINK, '').replace('</head>', `${head}</head>`))
    }

    await pruneSitemapAlternates(dest)
  },
})

/**
 * The zh-CN and en-US URLs serving the same page, or `null` when the page has
 * no counterpart to declare.
 *
 * The two home pages are not a prefix swap of each other: the Chinese home is
 * served from the root, so `/zh_cn/` — which only redirects to `/` — is left
 * out of the cluster entirely.
 */
function translationPair(pagePath: string): { zh: string, en: string } | null {
  if (pagePath === '/' || pagePath === '/en_us/') return { zh: '/', en: '/en_us/' }
  if (pagePath === '/zh_cn/') return null

  for (const { prefix, isZh } of [
    { prefix: '/zh_cn/', isZh: true },
    { prefix: '/en_us/', isZh: false },
  ]) {
    if (!pagePath.startsWith(prefix)) continue
    const rest = pagePath.slice(prefix.length)
    return isZh
      ? { zh: pagePath, en: `/en_us/${rest}` }
      : { zh: `/zh_cn/${rest}`, en: pagePath }
  }

  return null
}

function alternates(
  pair: { zh: string, en: string } | null,
  pages: Set<string>,
  hostname: string,
): string {
  if (!pair) return ''

  const zh = pages.has(pair.zh)
  const en = pages.has(pair.en)
  const links: string[] = []

  if (zh) links.push(link('zh-CN', `${hostname}${pair.zh}`))
  if (en) links.push(link('en-US', `${hostname}${pair.en}`))
  // Chinese is the site's primary language, so it is the fallback for users
  // whose language matches neither. Only meaningful when a pair really exists.
  if (zh && en) links.push(link('x-default', `${hostname}${pair.zh}`))

  return links.join('')
}

function link(hreflang: string, href: string): string {
  return `<link rel="alternate" hreflang="${hreflang}" href="${href}">`
}

function outputFile(dest: string, pagePath: string): string {
  const relative = pagePath.endsWith('/') ? `${pagePath}index.html` : pagePath
  return path.join(dest, relative.replace(/^\//, ''))
}

/**
 * Drop `<xhtml:link>` alternates pointing at URLs the sitemap does not list.
 *
 * The sitemap plugin builds its clusters from every page, including ones it
 * then excludes from `<loc>`. `/zh_cn/` shows up twice as the `zh-CN` home as a
 * result, which makes the home cluster self-contradictory.
 */
async function pruneSitemapAlternates(dest: string): Promise<void> {
  const file = path.join(dest, 'sitemap.xml')
  const xml = await readFile(file, 'utf-8')
  const listed = new Set(Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1]))

  await writeFile(
    file,
    xml.replace(SITEMAP_ALTERNATE, (tag, href: string) => (listed.has(href) ? tag : '')),
  )
}
