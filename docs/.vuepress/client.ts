import { defineClientConfig } from 'vuepress/client'
// import RepoCard from 'vuepress-theme-plume/features/RepoCard.vue'
// import NpmBadge from 'vuepress-theme-plume/features/NpmBadge.vue'
// import NpmBadgeGroup from 'vuepress-theme-plume/features/NpmBadgeGroup.vue'
// import Swiper from 'vuepress-theme-plume/features/Swiper.vue'

import './theme/styles/custom.css'
// import './styles/home-custom.scss'
import HomeDownload from './components/HomeDownload.vue'

/**
 * `/zh_cn/` 是跳转到 `/` 的壳（见 `docs/zh_cn/README.md`）。它靠 meta refresh 跳转，
 * 只对整页打开生效；站内路由进入时会先把壳本身渲染出来，再整页刷新一次。
 * 主题的面包屑「首页」与语言切换都会链到这里，在路由层直接改送 `/`。
 *
 * 只在浏览器里、且只对站内跳转生效：
 * - 构建时 VuePress 用同一个 router 依次渲染所有页面，守卫若在服务端生效，
 *   `zh_cn/index.html` 里就会被写进首页的内容，壳与它的 meta refresh 一起丢失；
 * - 首次导航（整页打开）时服务端给的是壳的 HTML，客户端换成首页会水合对不上，
 *   交给壳自己的 meta refresh。VuePress 只有一条兼容全部路径的路由，
 *   `from.matched` 为空即是首次导航。
 */
const ROUTE_ALIASES: Record<string, string> = {
  '/zh_cn/': '/',
  '/zh_cn/index.html': '/',
}

export default defineClientConfig({
  enhance({ app, router }) {
    // built-in components
    // app.component('RepoCard', RepoCard)
    // app.component('NpmBadge', NpmBadge)
    // app.component('NpmBadgeGroup', NpmBadgeGroup)
    // app.component('Swiper', Swiper) // you should install `swiper`

    // your custom components
    app.component('HomeDownload', HomeDownload)

    // 延迟注册 Redirect 组件以避免初始化冲突
    import('./components/Redirect.vue').then((module) => {
      app.component('Redirect', module.default)
    })

    if (router) {
      if (!__VUEPRESS_SSR__) {
        router.beforeEach((to, from) => {
          const target = ROUTE_ALIASES[to.path]
          if (target && from.matched.length > 0) {
            return { path: target, hash: to.hash, query: to.query, replace: true }
          }
        })
      }

      // Fix breadcrumb RDFa structured data
      router.afterEach(() => {
        fixBreadcrumbRDFa()
      })
    }

    // Also run on initial load
    if (typeof window !== 'undefined') {
      window.addEventListener('load', fixBreadcrumbRDFa)
    }
  },
})

function fixBreadcrumbRDFa() {
  if (typeof document === 'undefined') return

  const breadcrumbItems = document.querySelectorAll('.vp-breadcrumb li[typeof="ListItem"]')

  breadcrumbItems.forEach((li, index) => {
    const webPageElement = li.querySelector('[typeof="WebPage"]')
    if (webPageElement && !webPageElement.hasAttribute('resource')) {
      // Calculate the URL for this breadcrumb level
      const position = index + 1
      let url = 'https://1999.fan'

      if (position === 1) {
        url += '/'
      } else {
        // Build URL based on current page path
        const currentPath = window.location.pathname
        const pathSegments = currentPath.split('/').filter(Boolean)

        if (pathSegments.length >= position - 1) {
          url += '/' + pathSegments.slice(0, position - 1).join('/') + '/'
        }
      }

      webPageElement.setAttribute('resource', url)
    }
  })
}
