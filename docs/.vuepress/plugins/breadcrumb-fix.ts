import { readFile, writeFile } from 'fs/promises'

export default () => ({
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
  },
  onGenerated: async (app) => {
    // Fix RDFa structured data in generated HTML
    const destDir = app.dir.dest()
    for (const page of app.pages) {
      let filePath = destDir + page.path
      if (page.path.endsWith('/')) {
        filePath += 'index.html'
      }
      try {
        const html = await readFile(filePath, 'utf-8')
        const modifiedHtml = fixBreadcrumbRDFaInHTML(html, page.path)
        await writeFile(filePath, modifiedHtml)
      } catch (error) {
        console.error(`Error processing ${filePath}:`, error)
      }
    }
  }
})

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

function fixBreadcrumbRDFaInHTML(html, pagePath) {
  // Parse the path to determine breadcrumb levels
  const path = pagePath
  if (path === '/' || path === '/index.html') return html

  const segments = path.split('/').filter(Boolean)

  // Add a marker to see if this function is called
  let modifiedHtml = html.replace('<body>', '<body data-transformed="true">')

  // Find breadcrumb list items and add resource attributes
  const breadcrumbRegex = /<li[^>]*property="itemListElement"[^>]*typeof="ListItem"[^>]*>[\s\S]*?<span[^>]*property="item"[^>]*typeof="WebPage"[^>]*>(.*?)<\/span>[\s\S]*?<\/li>/g

  let match
  let position = 1
  while ((match = breadcrumbRegex.exec(html)) !== null) {
    position++
    if (position <= segments.length + 1) {
      // Calculate URL for this position
      let url = 'https://1999.fan'
      if (position === 1) {
        url += '/'
      } else {
        const pathSegments = segments.slice(0, position - 1)
        url += '/' + pathSegments.join('/') + '/'
      }

      // Add resource attribute to the span
      const originalSpan = match[0]
      const spanWithResource = originalSpan.replace(
        /(<span[^>]*property="item"[^>]*typeof="WebPage"[^>]*)/,
        `$1 resource="${url}"`
      )

      modifiedHtml = modifiedHtml.replace(originalSpan, spanWithResource)
    }
  }

  // Fix Article structured data
  modifiedHtml = fixArticleStructuredDataInHTML(modifiedHtml)

  return modifiedHtml
}

function fixArticleStructuredDataInHTML(html) {
  // Find the Article JSON-LD script
  const articleRegex = /<script type="application\/ld\+json">(\{[^}]*"@type":"Article"[^}]*\})<\/script>/
  const match = html.match(articleRegex)
  if (match) {
    try {
      const articleData = JSON.parse(match[1])
      // Add image if empty or contains only empty strings
      if (!articleData.image || articleData.image.length === 0 || articleData.image.every(img => !img)) {
        articleData.image = ['https://1999.fan/images/m9a-logo_32x32.png']
      }
      // Add author if empty
      if (!articleData.author || articleData.author.length === 0) {
        articleData.author = [{ '@type': 'Organization', 'name': 'M9A Team', 'url': 'https://1999.fan' }]
      }
      const updatedScript = `<script type="application/ld+json">${JSON.stringify(articleData)}</script>`
      return html.replace(match[0], updatedScript)
    } catch (error) {
      console.error('Error parsing Article JSON-LD:', error)
    }
  }
  return html
}