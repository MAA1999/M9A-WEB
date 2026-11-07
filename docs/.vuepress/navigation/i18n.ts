import type { ThemeLocaleData } from 'vuepress-theme-plume'

export interface Locale {
  name: string
  // displayName: string
  htmlLang: string
  siteTitle: string
  siteDescription: string
  /** 主题界面文案。只写主题预设缺的或不贴切的项，其余沿用主题按语言自带的预设。 */
  themeText: Partial<ThemeLocaleData>
}

export const locales: Locale[] = [
  {
    name: 'zh_cn',
    // displayName: '简体中文',
    htmlLang: 'zh-CN',
    siteTitle: 'M9A 文档站 · 重返未来：1999 小助手',
    siteDescription: 'M9A（亿韭韭韭）是《重返未来：1999》的自动化小助手。本站是它的官方文档：安装配置、功能说明、开发指南与常见问题。',
    themeText: {
      // 主题的中文预设没有这一项，手机上文档页顶栏会露出英文「Menu」
      sidebarMenuLabel: '菜单',
      // 预设的 404 文案是一句格言，换成告诉读者接下来怎么做
      notFound: {
        code: '404',
        title: '页面未找到',
        quote: '这个页面可能已被移动或删除。可以用顶部的搜索找找，或回到首页。',
        linkText: '返回首页',
      },
    },
  },
  {
    name: 'en_us',
    // displayName: 'English',
    htmlLang: 'en-US',
    siteTitle: 'M9A Docs · Reverse: 1999 Assistant',
    siteDescription: 'M9A is an automation assistant for Reverse: 1999. These docs cover installation, feature guides, development, and troubleshooting.',
    themeText: {
      notFound: {
        code: '404',
        title: 'Page not found',
        quote: 'This page may have been moved or removed. Try the search at the top, or go back to the home page.',
        linkText: 'Back to home',
      },
    },
  },
]
