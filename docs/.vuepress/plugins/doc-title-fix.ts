import type MarkdownIt from 'markdown-it'
import type { Plugin } from 'vuepress/core'

/** 正文开头的一段 HTML 注释，后面紧跟一级标题。 */
const LEADING_COMMENTS_THEN_TITLE = /^((?:<!--[\s\S]*?-->\s*)+)(#[ \t]+[^\n]*\n)/

/**
 * 正文以 HTML 注释开头时，仍把紧随其后的一级标题交给主题当页面标题。
 *
 * 主题（md-power 的 docsTitle）只在正文第一行就是 `# 标题` 时，才把它提成页面
 * 标题并从正文删掉。`newbie.md` 开头有一行 `<!-- markdownlint-disable MD033 -->`，
 * 标题因此没被认出：页面顶部先是「新手上路 | 用户手册」，正文里紧接着又是一个
 * 「新手上路」，面包屑也带着栏目后缀，和其他页面不一致。
 *
 * 这里只把开头的注释挪到标题后面，渲染结果不变。用户插件的 `extendsMarkdown`
 * 晚于主题执行，这一层包在 docsTitle 外面，先拿到源码。
 */
export default (): Plugin => ({
  name: 'doc-title-fix',

  extendsMarkdown: (md: MarkdownIt): void => {
    const render = md.render.bind(md)

    md.render = (source, env) => {
      if (!env?.filePathRelative) return render(source, env)

      const { matter, content } = splitFrontmatter(source.trim())
      const body = content.trimStart()
      const fixed = body.replace(
        LEADING_COMMENTS_THEN_TITLE,
        (_, comments: string, title: string) => `${title}\n${comments}`,
      )

      return render(fixed === body ? source : `${matter}\n${fixed}`, env)
    }
  },
})

/** 与 md-power 的拆分方式一致：frontmatter 以 `---` 开头，到下一行 `---` 结束。 */
function splitFrontmatter(source: string): { matter: string, content: string } {
  if (!source.startsWith('---')) return { matter: '', content: source }

  const end = source.indexOf('\n---')
  if (end === -1) return { matter: '', content: source }

  return { matter: source.slice(0, end + 4), content: source.slice(end + 4) }
}
