import { Link } from 'react-router-dom'
import { supabase, q } from '../lib/supabase'
import { useAsync } from '../hooks/useAsync'
import { fmtDate } from '../lib/format'
import type { Assignment } from '../types'

function formatDueDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function TasksPage() {
  const { data } = useAsync(
    () =>
      q<Assignment[]>(
        supabase
          .from('assignments')
          .select('*,attempts(score,total,created_at)')
          .order('created_at', { ascending: false })
      ),
    []
  )

  return (
    <div className="stack">
      <h1>Задания</h1>
      {data?.map(a => {
        const last = a.attempts?.[a.attempts.length - 1]
        const dueTime = a.due_at ? new Date(a.due_at).getTime() : null
        const isOverdue = dueTime !== null && !Number.isNaN(dueTime) && dueTime < Date.now()

        return (
          <Link key={a.id} to={`/play/${a.id}`} className="card">
            <div className="row between">
              <b>{a.title}</b>
              {last ? (
                <span className="chip ok">
                  {last.score} из {last.total}
                </span>
              ) : (
                <span className="chip">Новое</span>
              )}
            </div>
            <div className="muted">
              {fmtDate(a.created_at)}
              {a.comment ? ` · ${a.comment}` : ''}
            </div>
            {a.due_at && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: '0.85em',
                  color: isOverdue ? 'var(--bad)' : 'var(--muted)',
                  fontWeight: isOverdue ? 600 : 400,
                }}
              >
                Срок сдачи: {formatDueDate(a.due_at)}
                {isOverdue ? ' · просрочено' : ''}
              </div>
            )}
          </Link>
        )
      })}
      {!data?.length && <p className="muted">Преподаватель ещё не выдал тебе заданий.</p>}
    </div>
  )
}