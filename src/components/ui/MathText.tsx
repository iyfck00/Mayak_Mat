import katex from 'katex'

interface MathTextProps {
  text: string
  className?: string
}

function renderSegment(segment: string, key: number) {
  // Блочная формула: $$...$$
  if (segment.startsWith('$$') && segment.endsWith('$$') && segment.length > 4) {
    const formula = segment.slice(2, -2).trim()
    try {
      const html = katex.renderToString(formula, {
        displayMode: true,
        throwOnError: false,
      })
      return <div key={key} dangerouslySetInnerHTML={{ __html: html }} />
    } catch {
      return <div key={key}>{segment}</div>
    }
  }

  // Строчная формула: $...$
  if (segment.startsWith('$') && segment.endsWith('$') && segment.length > 2) {
    const formula = segment.slice(1, -1).trim()
    try {
      const html = katex.renderToString(formula, {
        displayMode: false,
        throwOnError: false,
      })
      return <span key={key} dangerouslySetInnerHTML={{ __html: html }} />
    } catch {
      return <span key={key}>{segment}</span>
    }
  }

  // Обычный текст
  return <span key={key}>{segment}</span>
}

export default function MathText({ text, className }: MathTextProps) {
  if (!text) return null

  // Разбиваем строку на части: $$...$$, $...$ или обычный текст
  const parts = text.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g).filter(Boolean)

  return (
    <span className={className}>
      {parts.map((part, idx) => renderSegment(part, idx))}
    </span>
  )
}