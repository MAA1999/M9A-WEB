import type { HeadConfig } from 'vuepress/shared'
import type { Plugin } from 'vuepress/core'

/**
 * Pages whose content is served from a different URL, so the page must not
 * claim itself as canonical.
 *
 * `/zh_cn/` is a meta-refresh stub pointing at `/` (see `docs/zh_cn/README.md`);
 * the Chinese home page lives at the site root.
 */
const CANONICAL_OVERRIDES: Record<string, string> = {
  '/zh_cn/': '/',
}

interface CanonicalPluginOptions {
  hostname: string
}

/**
 * Emit a self-referencing `<link rel="canonical">` for every page.
 *
 * GitHub Pages serves each generated `foo.html` at both `/foo.html` and
 * `/foo`, with identical bodies and no redirect in between. Without a
 * canonical, those pairs are reported as duplicate pages and Google picks the
 * canonical itself.
 *
 * The theme never sets `canonical` on `@vuepress/plugin-seo`, so nothing emits
 * this tag by default.
 */
export default ({ hostname }: CanonicalPluginOptions): Plugin => ({
  name: 'seo-canonical',

  extendsPage: (page): void => {
    const head = (page.frontmatter.head ??= [])

    // Leave an explicit canonical alone rather than emitting a second one.
    if (head.some(isCanonicalLink)) return

    const path = CANONICAL_OVERRIDES[page.path] ?? page.path
    head.push(['link', { rel: 'canonical', href: `${hostname}${path}` }])
  },
})

function isCanonicalLink([tag, attrs]: HeadConfig): boolean {
  return tag === 'link' && attrs.rel === 'canonical'
}
