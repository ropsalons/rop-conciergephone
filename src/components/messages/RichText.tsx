import { Fragment, type ReactNode } from 'react'

// Markdown-lite renderer. Builds React nodes (never dangerouslySetInnerHTML), so all user
// text is escaped by React automatically. Supports: **bold**, *italic*/_italic_,
// ~~strike~~, `code`, links, @mentions and newlines.
const PATTERNS: { name: string; re: RegExp }[] = [
  { name: 'code', re: /`([^`]+)`/ },
  { name: 'bold', re: /\*\*([^*]+)\*\*/ },
  { name: 'strike', re: /~~([^~]+)~~/ },
  { name: 'italic', re: /(?:\*([^*\n]+)\*|_([^_\n]+)_)/ },
  { name: 'link', re: /(https?:\/\/[^\s]+)/ },
  { name: 'mention', re: /(@[\w.'-]+(?:\s[\w.'-]+)?)/ },
]

function inline(text: string, mentionNames: Set<string>, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let rest = text
  let idx = 0
  let guard = 0

  while (rest.length && guard++ < 500) {
    let best: { name: string; index: number; match: RegExpMatchArray } | null = null
    for (const { name, re } of PATTERNS) {
      const m = rest.match(re)
      if (m && m.index !== undefined && (!best || m.index < best.index)) {
        best = { name, index: m.index, match: m }
      }
    }
    if (!best) {
      nodes.push(<Fragment key={`${keyPrefix}-t${idx++}`}>{rest}</Fragment>)
      break
    }
    if (best.index > 0) {
      nodes.push(<Fragment key={`${keyPrefix}-t${idx++}`}>{rest.slice(0, best.index)}</Fragment>)
    }
    let content = best.match[1] ?? best.match[2] ?? best.match[0]
    let consumed = best.match[0].length
    const key = `${keyPrefix}-m${idx++}`
    // The mention pattern greedily grabs a following word so "@John Smith" highlights as one. When
    // that two-word phrase isn't a known name/group (e.g. "@stylists heads"), fall back to just the
    // first word so single-word group/person handles still highlight mid-sentence.
    if (best.name === 'mention' && content.includes(' ') && !mentionNames.has(content.slice(1).toLowerCase())) {
      const first = content.split(' ')[0]
      content = first
      consumed = first.length
    }
    switch (best.name) {
      case 'code':
        nodes.push(<code key={key} className="rounded bg-black/40 px-1 py-0.5 font-mono text-[0.85em] text-gold-200">{content}</code>)
        break
      case 'bold':
        nodes.push(<strong key={key} className="font-semibold text-white">{content}</strong>)
        break
      case 'italic':
        nodes.push(<em key={key}>{content}</em>)
        break
      case 'strike':
        nodes.push(<span key={key} className="line-through opacity-70">{content}</span>)
        break
      case 'link':
        nodes.push(
          <a key={key} href={content} target="_blank" rel="noreferrer" className="text-brand-300 underline hover:text-brand-200 break-all">
            {content}
          </a>,
        )
        break
      case 'mention': {
        const isKnown = mentionNames.has(content.slice(1).toLowerCase())
        nodes.push(
          <span key={key} className={isKnown ? 'rounded bg-brand-400/20 px-1 font-medium text-brand-200' : undefined}>
            {content}
          </span>,
        )
        break
      }
    }
    rest = rest.slice(best.index + consumed)
  }
  return nodes
}

export function RichText({
  text,
  mentionNames,
  className,
}: {
  text: string | null | undefined
  mentionNames?: Set<string>
  className?: string
}) {
  const names = mentionNames ?? new Set<string>()
  const lines = (text ?? '').split('\n')
  return (
    <span className={className}>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {inline(line, names, `l${i}`)}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </span>
  )
}
