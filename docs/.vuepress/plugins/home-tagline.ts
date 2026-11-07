import type { Plugin } from 'vuepress/core'

/**
 * 首页 hero 下的一句话介绍，键为首页路径。
 *
 * 首页的 frontmatter 从 M9A 仓库同步过来（`docs/README.md`、`docs/en_us/README.md`），
 * hero 只有「M9A / 文档站 | Documentation」；导航栏的站点标题又只显示品牌名
 * （见 `components/NavBarTitle.vue`）。不补一句，第一次打开首页的人看不出 M9A 是做什么的。
 * 说法取自 M9A 的 README。
 */
const TAGLINES: Record<string, string> = {
  '/': '《重返未来：1999》自动化小助手，图像识别 + 模拟控制，解放双手',
  '/en_us/': 'Automation assistant for Reverse: 1999, driven by image recognition and simulated input',
}

interface HomeConfigItem {
  type?: string
  hero?: { tagline?: string }
}

/** 首页自己写了 tagline 时以它为准。 */
export default (): Plugin => ({
  name: 'home-tagline',

  extendsPage: (page): void => {
    const tagline = TAGLINES[page.path]
    const config = page.frontmatter.config
    if (!tagline || !Array.isArray(config)) return

    for (const item of config as HomeConfigItem[]) {
      if (item?.type === 'doc-hero' && item.hero) item.hero.tagline ??= tagline
    }
  },
})
