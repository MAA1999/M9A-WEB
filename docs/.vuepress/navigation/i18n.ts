export interface Locale {
  name: string
  // displayName: string
  htmlLang: string
  siteTitle: string
  siteDescription: string
}

export const locales: Locale[] = [
  {
    name: 'zh_cn',
    // displayName: '简体中文',
    htmlLang: 'zh-CN',
    siteTitle: 'M9A 文档站 · 重返未来：1999 小助手',
    siteDescription: 'M9A（亿韭韭韭）是《重返未来：1999》的自动化小助手。本站是它的官方文档：安装配置、功能说明、开发指南与常见问题。',
  },
  {
    name: 'en_us',
    // displayName: 'English',
    htmlLang: 'en-US',
    siteTitle: 'M9A Docs · Reverse: 1999 Assistant',
    siteDescription: 'M9A is an automation assistant for Reverse: 1999. These docs cover installation, feature guides, development, and troubleshooting.',
  },
]