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

export default function AssignedPage() {
  const { data } = useAsync(
    () =>
      q<Assignment[]>(
        supabase
          .from('assignments')
          .select('*,students(full_name),attempts(score,total,created_at)')
          .order('created_at', { ascending: false })
      ),
    []
  )

  return (
    <div className="stack">
      <h1>Выданные задания</h1>
      {data?.map(a => {
        const last = a.attempts?.[a.attempts.length - 1]
        const dueTime = a.due_at ? new Date(a.due_at).getTime() : null
        const isOverdue = dueTime !== null && !Number.isNaN(dueTime) && dueTime < Date.now()

        return (
          <div key={a.id} className="card">
            <div className="row between">
              <b>{a.title}</b>
              <span className="muted">{fmtDate(a.created_at)}</span>
            </div>
            <div className="muted">
              {a.students?.full_name} ·{' '}
              {last ? `последний результат ${last.score} из ${last.total}` : 'не проходил'}
            </div>
            {a.due_at && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: '0.9em',
                  color: isOverdue ? 'var(--bad)' : 'var(--muted)',
                }}
              >
                Срок сдачи: {formatDueDate(a.due_at)}
                {isOverdue ? ' · просрочено' : ''}
              </div>
            )}
          </div>
        )
      })}
      {!data?.length && <p className="muted">Пока ничего не выдано.</p>}
    </div>
  )
}