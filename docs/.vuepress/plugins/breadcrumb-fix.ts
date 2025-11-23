export default {
  name: 'breadcrumb-seo-fix',
  extendsPage: (page) => {
    // Add custom structured data for breadcrumbs
    const breadcrumbData = generateBreadcrumbStructuredData(page)
    if (breadcrumbData) {
      page.frontmatter.head = page.frontmatter.head || []
      page.frontmatter.head.push([
        'script',
        { type: 'application/ld+json' },
        JSON.stringify(breadcrumbData)
      ])
    }
  }
}

function generateBreadcrumbStructuredData(page) {
  const path = page.path
  if (path === '/' || path === '/index.html') return null

  const segments = path.split('/').filter(Boolean)
  const itemListElement = [
    {
      '@type': 'ListItem',
      position: 1,
      name: '首页',
      item: {
        '@id': 'https://1999.fan/'
      }
    }
  ]

  let currentPath = ''
  segments.forEach((segment, index) => {
    currentPath += '/' + segment
    const position = index + 2
    const name = getPageTitle(segment, page.title)
    itemListElement.push({
      '@type': 'ListItem',
      position,
      name,
      item: {
        '@id': `https://1999.fan${currentPath}/`
      }
    })
  })

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement
  }
}

function getPageTitle(segment, fullTitle) {
  // Simple logic to get readable names
  // You might need to customize this based on your routing
  return fullTitle || segment.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}