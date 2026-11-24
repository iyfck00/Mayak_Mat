import { useMemo } from 'react'
import { supabase, q } from '../lib/supabase'
import { useAsync } from '../hooks/useAsync'
import { useAttempts } from '../features/results/useAttempts'
import ProgressChart from '../features/results/ProgressChart'
import { useAuth } from '../app/providers/AuthProvider'
import { pct } from '../lib/format'
import type { LessonRow } from '../types'

interface StudentLessonSummary {
  studentKey: string
  studentName: string
  doneCount: number
  plannedCount: number
  cancelledCount: number
  rescheduledCount: number
}

export default function StatsPage() {
  const { role } = useAuth()
  const isTeacher = role === 'teacher'

  const { data } = useAttempts()
  const all = data ?? []

  const { data: lessonsData } = useAsync(
    async () =>
      q<LessonRow[]>(
        (supabase.from(isTeacher ? 'lessons' : 'my_lessons') as any)
          .select(isTeacher ? '*,students(full_name)' : '*')
          .order('starts_at', { ascending: false })
      ),
    [role]
  )

  const lessons = lessonsData ?? []

  const avg = pct(
    all.reduce((s, a) => s + a.score, 0),
    all.reduce((s, a) => s + a.total, 0)
  )
  const series = [...all]
    .reverse()
    .slice(-20)
    .map(a => pct(a.score, a.total))

  const per: Record<string, { n: number; s: number; t: number }> = {}
  all.forEach(a => {
    const k = a.students?.full_name ?? '—'
    const r = (per[k] ||= { n: 0, s: 0, t: 0 })
    r.n++
    r.s += a.score
    r.t += a.total
  })

  const lessonSummary = useMemo(() => {
    const doneCount = lessons.filter(l => l.status === 'done').length
    const plannedCount = lessons.filter(l => l.status === 'planned').length
    const cancelledCount = lessons.filter(l => l.status === 'cancelled').length
    const rescheduledCount = lessons.filter(l => l.rescheduled).length
    const nonCancelledTotal = lessons.filter(l => l.status !== 'cancelled').length
    const completionRate = pct(doneCount, nonCancelledTotal)

    return {
      doneCount,
      plannedCount,
      cancelledCount,
      rescheduledCount,
      completionRate,
    }
  }, [lessons])

  const lessonsByStudent = useMemo<StudentLessonSummary[]>(() => {
    if (!isTeacher) return []
    const map = new Map<string, StudentLessonSummary>()

    for (const l of lessons) {
      const key = l.student_id || l.students?.full_name || 'unknown'
      const name = l.students?.full_name || 'Ученик'

      const cur = map.get(key) ?? {
        studentKey: key,
        studentName: name,
        doneCount: 0,
        plannedCount: 0,
        cancelledCount: 0,
        rescheduledCount: 0,
      }

      if (l.status === 'done') cur.doneCount += 1
      else if (l.status === 'planned') cur.plannedCount += 1
      else if (l.status === 'cancelled') cur.cancelledCount += 1

      if (l.rescheduled) cur.rescheduledCount += 1

      map.set(key, cur)
    }

    return Array.from(map.values()).sort(
      (a, b) => b.doneCount - a.doneCount || a.studentName.localeCompare(b.studentName, 'ru')
    )
  }, [lessons, isTeacher])

  return (
    <div className="stack">
      <h1>{isTeacher ? 'Статистика' : 'Мой прогресс'}</h1>

      <div className="tiles">
        <div className="card">
          <span className="muted">Прохождений</span>
          <h1>{all.length}</h1>
        </div>
        <div className="card">
          <span className="muted">Правильных ответов</span>
          <h1>{avg}%</h1>
        </div>
      </div>

      <div className="card stack">
        <h2>Занятия и посещаемость</h2>
        <div className="tiles">
          <div className="card">
            <span className="muted">Проведено занятий</span>
            <h1>{lessonSummary.doneCount}</h1>
          </div>
          <div className="card">
            <span className="muted">Доля проведённых</span>
            <h1>{lessonSummary.completionRate}%</h1>
          </div>
        </div>
        <div className="muted" style={{ fontSize: '0.9em' }}>
          Запланировано: {lessonSummary.plannedCount} · Отменено: {lessonSummary.cancelledCount} ·
          Перенесено: {lessonSummary.rescheduledCount}
        </div>
      </div>

      <div className="card">
        <h2>Динамика</h2>
        <ProgressChart values={series} />
      </div>

      {isTeacher && (
        <div className="card stack">
          <h2>Занятия по ученикам</h2>
          {lessonsByStudent.map(item => (
            <div key={item.studentKey} className="row between" style={{ padding: '4px 0', gap: 8 }}>
              <div>
                <b>{item.studentName}</b>
                <div className="muted" style={{ fontSize: '0.85em' }}>
                  План: {item.plannedCount} · Отменено: {item.cancelledCount}
                  {item.rescheduledCount > 0 ? ` · Перенесено: ${item.rescheduledCount}` : ''}
                </div>
              </div>
              <b>Проведено: {item.doneCount}</b>
            </div>
          ))}
          {!lessonsByStudent.length && <p className="muted">Данных по занятиям пока нет.</p>}
        </div>
      )}

      {isTeacher && (
        <div className="card">
          <h2>По ученикам (тесты)</h2>
          {Object.entries(per).map(([k, v]) => (
            <div key={k} className="row between">
              <span>{k}</span>
              <b>
                {v.n} · {pct(v.s, v.t)}%
              </b>
            </div>
          ))}
          {!all.length && <p className="muted">Данных пока нет.</p>}
        </div>
      )}
    </div>
  )
}