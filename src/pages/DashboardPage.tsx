import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../lib/supabase'
import { useAsync } from '../hooks/useAsync'
import { useAuth } from '../app/providers/AuthProvider'
import { fmtTime } from '../lib/format'
import type { LessonRow, Assignment } from '../types'

const TILES: [string, string][] = [
  ['/students', 'Ученики'],
  ['/schedule', 'Расписание'],
  ['/finance', 'Финансы'],
  ['/library', 'Библиотека'],
  ['/assigned', 'Выданные'],
  ['/results', 'Результаты'],
  ['/stats', 'Статистика'],
]

const STUDENT_TILES: [string, string][] = [
  ['/tasks', 'Задания'],
  ['/results', 'Результаты'],
  ['/stats', 'Прогресс'],
  ['/schedule', 'Расписание'],
]

function normalizeStudentRelation<T extends { students?: unknown }>(item: T): T {
  const rel = item.students
  const normalized = Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null)
  return {
    ...item,
    students: normalized as T['students'],
  }
}

function CountdownTimer({ targetDate }: { targetDate: string }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    function update() {
      const diff = new Date(targetDate).getTime() - Date.now()
      if (diff <= 0) {
        setTimeLeft('Занятие начинается!')
        return
      }

      const totalSeconds = Math.floor(diff / 1000)
      const days = Math.floor(totalSeconds / 86400)
      const hours = Math.floor((totalSeconds % 86400) / 3600)
      const minutes = Math.floor((totalSeconds % 3600) / 60)
      const seconds = totalSeconds % 60

      if (days > 0) {
        setTimeLeft(`через ${days} дн. ${hours} ч.`)
      } else if (hours > 0) {
        setTimeLeft(`через ${hours} ч. ${minutes} мин.`)
      } else {
        const pad = (n: number) => String(n).padStart(2, '0')
        setTimeLeft(`через ${pad(minutes)}:${pad(seconds)}`)
      }
    }

    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [targetDate])

  return <strong>{timeLeft}</strong>
}

export default function DashboardPage() {
  const { role, name } = useAuth()
  const t = role === 'teacher'

  const { data } = useAsync(async () => {
    const nowIso = new Date().toISOString()
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    const endOfDay = new Date(startOfDay)
    endOfDay.setDate(endOfDay.getDate() + 1)

    // Занятия на сегодня
    const rawLessons = await q<LessonRow[]>(
      (supabase.from(t ? 'lessons' : 'my_lessons') as any)
        .select(t ? '*,students(full_name)' : '*')
        .gte('starts_at', startOfDay.toISOString())
        .lt('starts_at', endOfDay.toISOString())
        .neq('status', 'cancelled')
        .order('starts_at')
    )

    // Ближайшее предстоящее занятие (для отсчёта таймера)
    const rawUpcoming = await q<LessonRow[]>(
      (supabase.from(t ? 'lessons' : 'my_lessons') as any)
        .select(t ? '*,students(full_name)' : '*')
        .gt('starts_at', nowIso)
        .neq('status', 'cancelled')
        .order('starts_at')
        .limit(1)
    )

    const rawRecent = await q<Assignment[]>(
      supabase
        .from('assignments')
        .select('id,title,created_at,student_id,snapshot,comment,students(full_name)')
        .order('created_at', { ascending: false })
        .limit(3) as any
    )

    const lessons = (rawLessons ?? []).map(normalizeStudentRelation)
    const upcoming = rawUpcoming && rawUpcoming[0] ? normalizeStudentRelation(rawUpcoming[0]) : null
    const recent = (rawRecent ?? []).map(normalizeStudentRelation)

    return { lessons, upcoming, recent }
  }, [role, t])

  return (
    <div className="stack">
      <h1>Привет{name ? `, ${name.split(' ')[0]}` : ''}</h1>

      {!t && data?.upcoming && (
        <div className="card" style={{ borderColor: 'var(--accent, #3b82f6)' }}>
          <div className="row between">
            <div>
              <span className="muted" style={{ fontSize: '0.9em' }}>Ближайшее занятие</span>
              <div style={{ marginTop: 4 }}>
                {data.upcoming.topic ? <span>{data.upcoming.topic} · </span> : null}
                {fmtTime(data.upcoming.starts_at)}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <CountdownTimer targetDate={data.upcoming.starts_at} />
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Сегодня</h2>
        {data?.lessons.length ? (
          data.lessons.map(l => (
            <div key={l.id} className="row between">
              <span>
                {fmtTime(l.starts_at)}
                {t && l.students?.full_name ? ` · ${l.students.full_name}` : ''}
              </span>
              <span className="muted">{l.topic}</span>
            </div>
          ))
        ) : (
          <p className="muted">Занятий на сегодня нет.</p>
        )}
      </div>

      {t && (
        <div className="row wrap">
          <Link className="btn" to="/schedule">
            Новое занятие
          </Link>
          <Link className="btn ghost" to="/library/task/new">
            Новое задание
          </Link>
          <Link className="btn ghost" to="/students">
            Добавить ученика
          </Link>
        </div>
      )}

      <div className="tiles">
        {(t ? TILES : STUDENT_TILES).map(([to, l]) => (
          <Link key={to} to={to} className="card">
            {l}
          </Link>
        ))}
      </div>

      <div className="card">
        <h2>{t ? 'Недавно выданные' : 'Последние задания'}</h2>
        {data?.recent.length ? (
          data.recent.map(a => (
            <div key={a.id} className="row between">
              <span>{a.title}</span>
              <span className="muted">{t ? a.students?.full_name ?? '' : ''}</span>
            </div>
          ))
        ) : (
          <p className="muted">Пока ничего нет.</p>
        )}
      </div>
    </div>
  )
}