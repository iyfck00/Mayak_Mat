import { useMemo, useState } from 'react'
import { supabase, q } from '../lib/supabase'
import { useAsync } from '../hooks/useAsync'
import { fmtDate, fmtTime, money } from '../lib/format'
import type { LessonRow } from '../types'

interface StudentIncomeRow {
  studentKey: string
  studentName: string
  earned: number
  donePaidCount: number
  unpaidDoneAmount: number
}

export default function FinancePage() {
  const [m, setM] = useState(new Date().toISOString().slice(0, 7))
  const { data, reload } = useAsync(() => {
    const a = new Date(m + '-01')
    const b = new Date(a)
    b.setMonth(b.getMonth() + 1)
    return q<LessonRow[]>(
      supabase
        .from('lessons')
        .select('*,students(full_name)')
        .neq('status', 'cancelled')
        .gte('starts_at', a.toISOString())
        .lt('starts_at', b.toISOString())
        .order('starts_at')
    )
  }, [m])

  const toggle = async (l: LessonRow) => {
    await q(
      supabase
        .from('lessons')
        .update({ paid: !l.paid, paid_at: l.paid ? null : new Date().toISOString() })
        .eq('id', l.id)
        .select()
    )
    reload()
  }

  const rows = data ?? []

  // Доход учитывает только проведённые (status === 'done') и оплаченные (paid === true) занятия
  const doneAndPaidLessons = rows.filter(l => l.status === 'done' && l.paid)
  const income = doneAndPaidLessons.reduce((s, l) => s + Number(l.price || 0), 0)
  const debt = rows.filter(l => !l.paid && l.status === 'done').reduce((s, l) => s + Number(l.price || 0), 0)

  const byStudent = useMemo<StudentIncomeRow[]>(() => {
    const map = new Map<string, StudentIncomeRow>()

    for (const l of rows) {
      const key = l.student_id || l.students?.full_name || 'unknown'
      const name = l.students?.full_name || 'Ученик'
      const price = Number(l.price || 0)

      const cur = map.get(key) ?? {
        studentKey: key,
        studentName: name,
        earned: 0,
        donePaidCount: 0,
        unpaidDoneAmount: 0,
      }

      if (l.status === 'done' && l.paid) {
        cur.earned += price
        cur.donePaidCount += 1
      } else if (l.status === 'done' && !l.paid) {
        cur.unpaidDoneAmount += price
      }

      map.set(key, cur)
    }

    return Array.from(map.values())
      .filter(item => item.earned > 0 || item.unpaidDoneAmount > 0)
      .sort((a, b) => b.earned - a.earned)
  }, [rows])

  return (
    <div className="stack">
      <h1>Финансы</h1>
      <input className="input" type="month" value={m} onChange={e => setM(e.target.value)} />

      <div className="tiles">
        <div className="card">
          <span className="muted">Доход (проведённые и оплаченные)</span>
          <h1>{money(income)}</h1>
        </div>
        <div className="card">
          <span className="muted">Не оплачено (проведённые)</span>
          <h1>{money(debt)}</h1>
        </div>
      </div>

      <div className="card stack">
        <h2>Доход по ученикам</h2>
        {byStudent.map(item => (
          <div key={item.studentKey} className="row between" style={{ padding: '4px 0' }}>
            <div>
              <b>{item.studentName}</b>
              <div className="muted" style={{ fontSize: '0.85em' }}>
                Оплачено проведённых: {item.donePaidCount}
                {item.unpaidDoneAmount > 0 ? ` · К оплате: ${money(item.unpaidDoneAmount)}` : ''}
              </div>
            </div>
            <b>{money(item.earned)}</b>
          </div>
        ))}
        {!byStudent.length && (
          <p className="muted">За выбранный месяц проведённых занятий с расчётами пока нет.</p>
        )}
      </div>

      <div className="card">
        <h2>Операции</h2>
        {rows.map(l => {
          const countedInIncome = l.status === 'done' && l.paid
          return (
            <div key={l.id} className="row between" style={{ padding: '6px 0', gap: 8 }}>
              <div className="grow">
                <div className="row wrap" style={{ gap: 6 }}>
                  <b>{l.students?.full_name}</b>
                  <span className={`chip ${l.status === 'done' ? 'ok' : ''}`}>
                    {l.status === 'done' ? 'Проведено' : 'Запланировано'}
                  </span>
                  {countedInIncome && <span className="chip ok">В доходе</span>}
                </div>
                <div className="muted">
                  {fmtDate(l.starts_at)}, {fmtTime(l.starts_at)} · {money(Number(l.price || 0))}
                </div>
              </div>
              <button
                className={l.paid ? 'btn sm ghost' : 'btn sm'}
                onClick={() => toggle(l)}
              >
                {l.paid ? 'Оплачено' : 'Отметить оплату'}
              </button>
            </div>
          )
        })}
        {!rows.length && <p className="muted">В этом месяце занятий нет.</p>}
      </div>
    </div>
  )
}