import { defineClientConfig } from 'vuepress/client'
// import RepoCard from 'vuepress-theme-plume/features/RepoCard.vue'
// import NpmBadge from 'vuepress-theme-plume/features/NpmBadge.vue'
// import NpmBadgeGroup from 'vuepress-theme-plume/features/NpmBadgeGroup.vue'
// import Swiper from 'vuepress-theme-plume/features/Swiper.vue'

// import './theme/styles/custom.css'
// import './styles/home-custom.scss'

export default defineClientConfig({
  enhance({ app, router }) {
    // built-in components
    // app.component('RepoCard', RepoCard)
    // app.component('NpmBadge', NpmBadge)
    // app.component('NpmBadgeGroup', NpmBadgeGroup)
    // app.component('Swiper', Swiper) // you should install `swiper`

    // your custom components
    // app.component('CustomComponent', CustomComponent)

    // 延迟注册 Redirect 组件以避免初始化冲突
    import('./components/Redirect.vue').then((module) => {
      app.component('Redirect', module.default)
    })

    // Fix breadcrumb RDFa structured data
    if (router) {
      router.onAfterRouteUpdate = () => {
        fixBreadcrumbRDFa()
      }
    }

    // Also run on initial load
    if (typeof window !== 'undefined') {
      window.addEventListener('load', fixBreadcrumbRDFa)
    }
  },
})

function fixBreadcrumbRDFa() {
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
