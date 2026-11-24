import { pct } from '../../lib/format'
import type { AttemptRow } from '../../types'

interface TopicStats {
  topic: string
  attemptsCount: number
  correctSum: number
  totalSum: number
  errorsSum: number
  avgPct: number
}

function buildTopicStats(attempts: AttemptRow[]): TopicStats[] {
  const map = new Map<
    string,
    { topic: string; attemptsCount: number; correctSum: number; totalSum: number; errorsSum: number; pctSum: number }
  >()

  for (const a of attempts) {
    const topic = a.assignments?.title?.trim() || 'Без названия'
    const total = Math.max(0, a.total)
    const score = Math.max(0, Math.min(a.score, total))
    const errors = Math.max(0, total - score)
    const attemptPct = pct(score, total)

    const cur = map.get(topic) ?? {
      topic,
      attemptsCount: 0,
      correctSum: 0,
      totalSum: 0,
      errorsSum: 0,
      pctSum: 0,
    }

    cur.attemptsCount += 1
    cur.correctSum += score
    cur.totalSum += total
    cur.errorsSum += errors
    cur.pctSum += attemptPct
    map.set(topic, cur)
  }

  return Array.from(map.values())
    .map(item => ({
      topic: item.topic,
      attemptsCount: item.attemptsCount,
      correctSum: item.correctSum,
      totalSum: item.totalSum,
      errorsSum: item.errorsSum,
      avgPct: item.attemptsCount ? Math.round(item.pctSum / item.attemptsCount) : 0,
    }))
    .sort((a, b) => b.errorsSum - a.errorsSum || a.avgPct - b.avgPct)
}

export default function TopicErrorsChart({ attempts }: { attempts: AttemptRow[] }) {
  const stats = buildTopicStats(attempts)

  if (!stats.length) {
    return <p className="muted">Недостаточно данных для диаграммы — попыток пока нет.</p>
  }

  const maxErrors = Math.max(1, ...stats.map(s => s.errorsSum))

  return (
    <div className="stack" style={{ gap: 12 }}>
      {stats.map(item => {
        const errorBarWidth = Math.round((item.errorsSum / maxErrors) * 100)
        const hasErrors = item.errorsSum > 0

        return (
          <div key={item.topic} className="stack" style={{ gap: 4 }}>
            <div className="row between" style={{ gap: 8 }}>
              <b>{item.topic}</b>
              <span
                style={{
                  fontSize: '0.85em',
                  color: hasErrors ? 'var(--bad)' : 'var(--ok, #16a34a)',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                Ошибок: {item.errorsSum} · ср. {item.avgPct}%
              </span>
            </div>

            <div
              style={{
                height: 10,
                borderRadius: 999,
                background: 'rgba(148, 163, 184, 0.2)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${hasErrors ? Math.max(errorBarWidth, 6) : 0}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: item.avgPct < 50 ? 'var(--bad)' : '#f59e0b',
                  transition: 'width 0.25s ease',
                }}
              />
            </div>

            <div className="muted" style={{ fontSize: '0.8em' }}>
              Верно: {item.correctSum} из {item.totalSum} · Попыток: {item.attemptsCount}
            </div>
          </div>
        )
      })}
    </div>
  )
}