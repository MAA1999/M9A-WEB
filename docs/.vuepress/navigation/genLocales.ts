import type { LocaleConfig, SiteLocaleConfig } from 'vuepress'
import type { ThemeLocaleData } from 'vuepress-theme-plume'

import { locales } from './i18n'
import { genNavigationComponents } from './genNavigationComponents'

export function genSiteLocales(): SiteLocaleConfig {
  const siteLocales: SiteLocaleConfig = {}
  for (const locale of locales) {
    siteLocales[`/${locale.name}/`] = {
      lang: locale.htmlLang,
      title: locale.siteTitle,
      description: locale.siteDescription,
    }
  }
  return siteLocales
}

export function genThemeLocales(): LocaleConfig<ThemeLocaleData> {
  const themeLocales: LocaleConfig<ThemeLocaleData> = {}
  for (const locale of locales) {
    const navigationComponents = genNavigationComponents(locale)
    themeLocales[`/${locale.name}/`] = {
      ...locale.themeText,
      navbar: navigationComponents.navbar,
      collections: navigationComponents.collections,
    }
  }

  /**
   * 中文首页在根路径 `/`，`/zh_cn/` 只是跳转到 `/` 的壳（见 `docs/zh_cn/README.md`）。
   *
   * 根路径不属于任何一个站点语言，主题只给它套中文预设：中文首页的导航栏因此
   * 没有栏目入口（英文首页 `/en_us/` 有），站内不存在的路径也拿不到上面改过的 404 文案。
   * 这里让根路径沿用中文的文案与导航栏；不带 collections，根路径下没有文档目录。
   *
   * 中文页面的站标同时直接指向 `/`，不再先落到跳转壳上、再整页刷新一次。
   */
  const zh = locales.find((locale) => locale.name === 'zh_cn')
  const zhTheme = themeLocales['/zh_cn/']
  if (zh && zhTheme) {
    themeLocales['/'] = { ...zh.themeText, navbar: zhTheme.navbar }
    zhTheme.home = '/'
  }

  return themeLocales
}
