import type { Plugin } from 'vuepress/core'
import type MarkdownIt from 'markdown-it'

/**
 * Fix indented closing markers in `@mdit/plugin-container`.
 *
 * When a hint container (`::: tip`, `::: warning`, etc.) contains a list,
 * prettier indents the closing `:::` to match the list (2-3 spaces). But
 * `@mdit/plugin-container` requires **exact** indent match
 * (`sCount === openerIndent`), so indented closers are treated as literal
 * list-item text — the container never closes and swallows headings below.
 *
 * This plugin patches every `container_*` block rule so that a closing
 * `:::` at **any** indent >= the opener's indent is recognized, matching
 * CommonMark fenced-code-block behaviour.
 *
 * @see https://github.com/MAA1999/M9A/pull/867
 */
export default (): Plugin => ({
  name: 'markdown-container-close-fix',

  extendsMarkdown: (md: MarkdownIt): void => {
    const rules = (md.block.ruler as unknown as {
      __rules__: Array<{
        name: string
        fn: (state: any, startLine: number, endLine: number, silent: boolean) => boolean
      }>
    }).__rules__

    for (const rule of rules) {
      if (!rule.name.startsWith('container_')) continue
      const originalFn = rule.fn
      rule.fn = (state, startLine, endLine, silent) =>
        patchContainerClose(state, startLine, originalFn, endLine, silent)
    }
  },
})

/**
 * Temporarily adjust sCount for indented closing-marker lines so the
 * original container rule treats them as flush with the opener.
 */
function patchContainerClose(
  state: any,
  startLine: number,
  originalFn: (state: any, startLine: number, endLine: number, silent: boolean) => boolean,
  endLine: number,
  silent: boolean
): boolean {
  const openerIndent = state.sCount[startLine]
  const markerChar = state.src[state.bMarks[startLine] + state.tShift[startLine]]

  // If opener is not at column 0, there's no prettier-indent issue —
  // the container is already nested inside something with known indent.
  // (We still patch for correctness, but it's irrelevant for the bug.)
  if (!markerChar) return originalFn(state, startLine, endLine, silent)

  // Scan forward from startLine+1 and collect lines that look like
  // indented closing markers (marker-only lines with indent >= opener).
  const restored: Array<[number, number]> = []

  for (let line = startLine + 1; line < endLine; line++) {
    const lineIndent = state.sCount[line]

    // Dedent below opener: container search would stop here anyway
    if (
      state.bMarks[line] + state.tShift[line] < state.eMarks[line] &&
      lineIndent < openerIndent
    ) {
      break
    }

    if (lineIndent <= openerIndent) continue

    const lineStart = state.bMarks[line] + state.tShift[line]
    const lineEnd = state.eMarks[line]

    // First non-space char must be the marker
    if (state.src[lineStart] !== markerChar) continue

    // Count consecutive markers
    let p = lineStart
    while (p < lineEnd && state.src[p] === markerChar) p++
    if (p - lineStart < 3) continue

    // Rest of line must be whitespace only
    p = state.skipSpaces(p)
    if (p < lineEnd) continue

    // This line looks like an indented closer — fake its sCount to
    // match the opener so the original rule recognizes it.
    restored.push([line, state.sCount[line]])
    state.sCount[line] = openerIndent
  }

  try {
    return originalFn(state, startLine, endLine, silent)
  } finally {
    for (const [line, value] of restored) {
      state.sCount[line] = value
    }
  }
}
