import { useMemo, useState } from 'react'
import { supabase, q } from '../lib/supabase'
import { useAsync } from '../hooks/useAsync'
import { useAuth } from '../app/providers/AuthProvider'
import { fmtDate, fmtTime, toLocalInput } from '../lib/format'
import type { LessonRow, Student } from '../types'

type ViewMode = 'month' | 'week' | 'day'

const START_HOUR = 8
const END_HOUR = 22
const HOUR_HEIGHT = 56

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days)
}

function startOfWeekMon(d: Date): Date {
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff)
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function toDateTimeLocalString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatRangeTitle(anchor: Date, mode: ViewMode): string {
  const months = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.']
  const fullMonths = [
    'Январь',
    'Февраль',
    'Март',
    'Апрель',
    'Май',
    'Июнь',
    'Июль',
    'Август',
    'Сентябрь',
    'Октябрь',
    'Ноябрь',
    'Декабрь',
  ]

  if (mode === 'day') {
    return `${anchor.getDate()} ${months[anchor.getMonth()]} ${anchor.getFullYear()} г.`
  }
  if (mode === 'month') {
    return `${fullMonths[anchor.getMonth()]} ${anchor.getFullYear()} г.`
  }

  const ws = startOfWeekMon(anchor)
  const we = addDays(ws, 6)
  const year = we.getFullYear()

  if (ws.getMonth() === we.getMonth()) {
    return `${ws.getDate()} – ${we.getDate()} ${months[we.getMonth()]} ${year} г.`
  }
  return `${ws.getDate()} ${months[ws.getMonth()]} – ${we.getDate()} ${months[we.getMonth()]} ${year} г.`
}

function formatSlotInterval(startsAt: string, durationMin: number): string {
  const start = new Date(startsAt)
  const end = new Date(start.getTime() + (durationMin || 60) * 60_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(start.getHours())}:${pad(start.getMinutes())} - ${pad(end.getHours())}:${pad(end.getMinutes())}`
}

export default function SchedulePage() {
  const { role, userId } = useAuth()
  const t = role === 'teacher'

  const { data, reload } = useAsync(
    async () => ({
      lessons: await q<LessonRow[]>(
        (supabase.from(t ? 'lessons' : 'my_lessons') as any)
          .select(t ? '*,students(full_name)' : '*')
          .order('starts_at')
      ),
      students: t ? await q<Student[]>(supabase.from('students').select('*').order('full_name')) : [],
    }),
    [role]
  )

  const [viewMode, setViewMode] = useState<ViewMode>('week')
  const [anchorDate, setAnchorDate] = useState<Date>(() => startOfDay(new Date()))
  const [hideCancelled, setHideCancelled] = useState(false)
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [rescheduleValue, setRescheduleValue] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [f, setF] = useState({
    student_id: '',
    starts_at: '',
    duration_min: '60',
    topic: '',
    price: '',
    repeatWeekly: false,
    weeksCount: '4',
  })
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [savingLesson, setSavingLesson] = useState(false)

  const visibleLessons = useMemo(() => {
    const list = data?.lessons ?? []
    return hideCancelled ? list.filter(l => l.status !== 'cancelled') : list
  }, [data?.lessons, hideCancelled])

  const selectedLesson = useMemo(
    () => visibleLessons.find(l => l.id === selectedLessonId) ?? null,
    [visibleLessons, selectedLessonId]
  )

  function selectLesson(lesson: LessonRow) {
    setSelectedLessonId(lesson.id)
    setRescheduleValue(toLocalInput(lesson.starts_at))
    setErr('')
  }

  function shiftPeriod(dir: -1 | 1) {
    if (viewMode === 'day') {
      setAnchorDate(prev => addDays(prev, dir))
    } else if (viewMode === 'week') {
      setAnchorDate(prev => addDays(prev, dir * 7))
    } else {
      setAnchorDate(prev => new Date(prev.getFullYear(), prev.getMonth() + dir, 1))
    }
  }

  function openCreateAtSlot(day: Date, hour: number) {
    if (!t) return
    const slotDate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, 0)
    setF(prev => ({ ...prev, starts_at: toDateTimeLocalString(slotDate) }))
    setShowCreateForm(true)
    setErr('')
    setNotice('')
  }

  async function add() {
    if (!f.student_id || !f.starts_at) return setErr('Выбери ученика и время')

    const baseDate = new Date(f.starts_at)
    if (Number.isNaN(baseDate.getTime())) return setErr('Некорректная дата и время')

    const parsedWeeks = Math.max(1, Math.min(52, Math.floor(+f.weeksCount || 1)))
    const count = f.repeatWeekly ? parsedWeeks : 1
    const durationMin = +f.duration_min || 60
    const price = +f.price || 0
    const topic = f.topic.trim()

    const rows = Array.from({ length: count }, (_, idx) => {
      const occurrence = new Date(baseDate.getTime() + idx * 7 * 24 * 60 * 60 * 1000)
      return {
        teacher_id: userId,
        student_id: f.student_id,
        starts_at: occurrence.toISOString(),
        duration_min: durationMin,
        topic,
        price,
      }
    })

    try {
      await q(supabase.from('lessons').insert(rows).select())
      setF(prev => ({ ...prev, starts_at: '', topic: '', repeatWeekly: false }))
      setShowCreateForm(false)
      setErr('')
      setNotice(count > 1 ? `Добавлено регулярных занятий: ${count}` : 'Занятие добавлено')
      reload()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    }
  }

  async function upd(id: string, patch: Record<string, unknown>, message?: string) {
    setSavingLesson(true)
    setErr('')
    try {
      await q(supabase.from('lessons').update(patch).eq('id', id).select())
      if (message) setNotice(message)
      reload()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setSavingLesson(false)
    }
  }

  async function handleReschedule(lesson: LessonRow) {
    if (!rescheduleValue) return setErr('Выбери новое время для переноса')
    const nextDate = new Date(rescheduleValue)
    if (Number.isNaN(nextDate.getTime())) return setErr('Некорректное время переноса')

    await upd(
      lesson.id,
      {
        starts_at: nextDate.toISOString(),
        rescheduled: true,
        status: lesson.status === 'cancelled' ? 'planned' : lesson.status,
      },
      'Занятие перенесено'
    )
    setSelectedLessonId(null)
    setRescheduleValue('')
  }

  const weekDays = useMemo(() => {
    const ws = startOfWeekMon(anchorDate)
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i))
  }, [anchorDate])

  const monthCells = useMemo(() => {
    const firstOfMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
    const gridStart = startOfWeekMon(firstOfMonth)
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
  }, [anchorDate])

  const hours = useMemo(
    () => Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i),
    []
  )

  const today = startOfDay(new Date())
  const dayNamesShort = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
  const weekDayLabels = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']

  function getLessonCardStyle(l: LessonRow) {
    if (l.status === 'cancelled') {
      return {
        background: 'rgba(148, 163, 184, 0.16)',
        borderColor: 'rgba(148, 163, 184, 0.35)',
        textDecoration: 'line-through',
        opacity: 0.78,
      }
    }
    if (l.status === 'done') {
      return {
        background: 'rgba(34, 197, 94, 0.14)',
        borderColor: 'rgba(34, 197, 94, 0.45)',
        textDecoration: 'none',
        opacity: 1,
      }
    }
    return {
      background: 'rgba(59, 130, 246, 0.14)',
      borderColor: 'rgba(59, 130, 246, 0.42)',
      textDecoration: 'none',
      opacity: 1,
    }
  }

  const activeColumns = viewMode === 'day' ? [startOfDay(anchorDate)] : weekDays

  return (
    <div className="stack">
      <div className="row between wrap" style={{ gap: 12 }}>
        <h1>Расписание</h1>
        {t && (
          <button
            className="btn sm"
            onClick={() => {
              setShowCreateForm(prev => !prev)
              setErr('')
              setNotice('')
            }}
          >
            {showCreateForm ? 'Скрыть форму' : '+ Новое занятие'}
          </button>
        )}
      </div>

      {notice && (
        <p className="muted" role="status">
          {notice}
        </p>
      )}

      {/* Панель управления календаря */}
      <div className="card stack" style={{ gap: 12 }}>
        <div className="row between wrap" style={{ gap: 8 }}>
          <div className="row wrap" style={{ gap: 6 }}>
            <button className="btn sm ghost" onClick={() => shiftPeriod(-1)} aria-label="Назад">
              &lt;
            </button>
            <button className="btn sm ghost" onClick={() => shiftPeriod(1)} aria-label="Вперёд">
              &gt;
            </button>
            <button className="btn sm ghost" onClick={() => setAnchorDate(startOfDay(new Date()))}>
              Сегодня
            </button>
            <button
              className={`btn sm ${hideCancelled ? '' : 'ghost'}`}
              onClick={() => setHideCancelled(prev => !prev)}
            >
              {hideCancelled ? 'Показать отменённые' : 'Скрыть отменённые'}
            </button>
          </div>

          <b style={{ fontSize: '1.05em' }}>{formatRangeTitle(anchorDate, viewMode)}</b>

          <div className="row" style={{ gap: 4 }}>
            {(
              [
                ['month', 'Месяц'],
                ['week', 'Неделя'],
                ['day', 'День'],
              ] as [ViewMode, string][]
            ).map(([mode, label]) => (
              <button
                key={mode}
                className={`btn sm ${viewMode === mode ? '' : 'ghost'}`}
                onClick={() => setViewMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Режим Неделя / День */}
        {(viewMode === 'week' || viewMode === 'day') && (
          <div style={{ overflowX: 'auto' }}>
            <div style={{ minWidth: viewMode === 'week' ? 760 : 340 }}>
              {/* Шапка дней */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: `64px repeat(${activeColumns.length}, minmax(0, 1fr))`,
                  borderBottom: '1px solid rgba(148, 163, 184, 0.25)',
                  paddingBottom: 8,
                }}
              >
                <div />
                {activeColumns.map(day => {
                  const isToday = isSameDay(day, today)
                  return (
                    <div
                      key={day.toISOString()}
                      style={{ textAlign: 'center', fontWeight: isToday ? 700 : 500 }}
                    >
                      <span className="muted" style={{ fontSize: '0.85em' }}>
                        {dayNamesShort[day.getDay()]},{' '}
                      </span>
                      <span
                        style={{
                          padding: isToday ? '2px 7px' : undefined,
                          borderRadius: 999,
                          background: isToday ? 'var(--accent, #2563eb)' : undefined,
                          color: isToday ? '#fff' : undefined,
                        }}
                      >
                        {day.getDate()}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Почасовая сетка */}
              <div
                style={{
                  position: 'relative',
                  display: 'grid',
                  gridTemplateColumns: `64px repeat(${activeColumns.length}, minmax(0, 1fr))`,
                  height: hours.length * HOUR_HEIGHT,
                }}
              >
                {/* Ось часов слева */}
                <div>
                  {hours.map(h => (
                    <div
                      key={h}
                      className="muted"
                      style={{
                        height: HOUR_HEIGHT,
                        fontSize: '0.8em',
                        paddingTop: 2,
                        paddingRight: 8,
                        textAlign: 'right',
                      }}
                    >
                      {String(h).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>

                {/* Колонки дней */}
                {activeColumns.map(day => {
                  const dayLessons = visibleLessons.filter(l => isSameDay(new Date(l.starts_at), day))

                  return (
                    <div
                      key={day.toISOString()}
                      style={{
                        position: 'relative',
                        borderLeft: '1px solid rgba(148, 163, 184, 0.2)',
                      }}
                    >
                      {/* Слоты часов для клика и добавления */}
                      {hours.map(h => (
                        <div
                          key={h}
                          onClick={() => openCreateAtSlot(day, h)}
                          title={
                            t
                              ? `Добавить занятие на ${day.getDate()}.${day.getMonth() + 1} в ${String(h).padStart(2, '0')}:00`
                              : undefined
                          }
                          style={{
                            height: HOUR_HEIGHT,
                            borderBottom: '1px dashed rgba(148, 163, 184, 0.16)',
                            cursor: t ? 'pointer' : 'default',
                          }}
                        />
                      ))}

                      {/* Карточки занятий */}
                      {dayLessons.map(l => {
                        const start = new Date(l.starts_at)
                        const startMinutesFromGrid =
                          (start.getHours() - START_HOUR) * 60 + start.getMinutes()
                        const topPx = Math.max(0, (startMinutesFromGrid / 60) * HOUR_HEIGHT)
                        const heightPx = Math.max(34, ((l.duration_min || 60) / 60) * HOUR_HEIGHT - 4)
                        const cardStyle = getLessonCardStyle(l)
                        const studentTitle = t && l.students?.full_name ? l.students.full_name : 'Занятие'

                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={e => {
                              e.stopPropagation()
                              selectLesson(l)
                            }}
                            style={{
                              position: 'absolute',
                              left: 4,
                              right: 4,
                              top: topPx + 2,
                              height: heightPx,
                              padding: '4px 8px',
                              borderRadius: 8,
                              border: `1px solid ${cardStyle.borderColor}`,
                              background: cardStyle.background,
                              textDecoration: cardStyle.textDecoration,
                              opacity: cardStyle.opacity,
                              textAlign: 'left',
                              overflow: 'hidden',
                              cursor: 'pointer',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'flex-start',
                              gap: 2,
                              color: 'inherit',
                            }}
                          >
                            <div className="row between" style={{ gap: 4, fontSize: '0.75em', fontWeight: 600 }}>
                              <span>{formatSlotInterval(l.starts_at, l.duration_min)}</span>
                              {t && l.paid && <span style={{ color: '#15803d' }}>✓ Оплачено</span>}
                            </div>
                            <div
                              style={{
                                fontSize: '0.85em',
                                fontWeight: 700,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {studentTitle}
                            </div>
                            {l.topic && heightPx >= 52 && (
                              <div
                                className="muted"
                                style={{
                                  fontSize: '0.75em',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}
                              >
                                {l.topic}
                              </div>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* Режим Месяц */}
        {viewMode === 'month' && (
          <div className="stack" style={{ gap: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
              {weekDayLabels.map(lbl => (
                <div
                  key={lbl}
                  className="muted"
                  style={{ textAlign: 'center', fontSize: '0.8em', fontWeight: 600 }}
                >
                  {lbl}
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6 }}>
              {monthCells.map(cell => {
                const inMonth = cell.getMonth() === anchorDate.getMonth()
                const isToday = isSameDay(cell, today)
                const cellLessons = visibleLessons.filter(l => isSameDay(new Date(l.starts_at), cell))

                return (
                  <div
                    key={cell.toISOString()}
                    onClick={() => openCreateAtSlot(cell, 16)}
                    style={{
                      minHeight: 88,
                      padding: 6,
                      borderRadius: 8,
                      border: '1px solid rgba(148, 163, 184, 0.22)',
                      opacity: inMonth ? 1 : 0.45,
                      background: isToday ? 'rgba(37, 99, 235, 0.08)' : undefined,
                      cursor: t ? 'pointer' : 'default',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ fontSize: '0.8em', fontWeight: isToday ? 700 : 500 }}>
                      {cell.getDate()}
                    </div>
                    {cellLessons.map(l => {
                      const st = getLessonCardStyle(l)
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={e => {
                            e.stopPropagation()
                            selectLesson(l)
                          }}
                          style={{
                            width: '100%',
                            padding: '2px 5px',
                            borderRadius: 5,
                            border: `1px solid ${st.borderColor}`,
                            background: st.background,
                            textDecoration: st.textDecoration,
                            fontSize: '0.72em',
                            textAlign: 'left',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            cursor: 'pointer',
                            color: 'inherit',
                          }}
                        >
                          {fmtTime(l.starts_at)}{' '}
                          {t && l.students?.full_name ? l.students.full_name : l.topic || 'Урок'}
                          {t && l.paid ? ' · ✓' : ''}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Панель управления выбранным занятием */}
      {selectedLesson && (
        <div className="card stack">
          <div className="row between">
            <b>
              {t && selectedLesson.students?.full_name ? `${selectedLesson.students.full_name} · ` : ''}
              {fmtDate(selectedLesson.starts_at)},{' '}
              {formatSlotInterval(selectedLesson.starts_at, selectedLesson.duration_min)}
            </b>
            <button className="btn sm ghost" onClick={() => setSelectedLessonId(null)}>
              Закрыть
            </button>
          </div>

          <div className="row wrap" style={{ gap: 6 }}>
            {selectedLesson.status === 'cancelled' && <span className="chip bad">Отменено</span>}
            {selectedLesson.rescheduled && selectedLesson.status !== 'cancelled' && (
              <span className="chip">Перенесено</span>
            )}
            {selectedLesson.status === 'done' && <span className="chip ok">Проведено</span>}
            {selectedLesson.status === 'planned' && <span className="chip">Запланировано</span>}
            {t && (
              <span className={`chip ${selectedLesson.paid ? 'ok' : ''}`}>
                {selectedLesson.paid ? 'Оплачено' : 'Не оплачено'}
              </span>
            )}
          </div>

          {(selectedLesson.topic || (t && selectedLesson.price)) && (
            <div className="muted">
              {selectedLesson.topic}
              {t && selectedLesson.price ? ` · Стоимость: ${selectedLesson.price}` : ''}
            </div>
          )}

          {t && (
            <div className="stack" style={{ gap: 10 }}>
              <div className="row wrap" style={{ gap: 8 }}>
                {selectedLesson.status !== 'done' ? (
                  <button
                    type="button"
                    className="btn sm"
                    disabled={savingLesson}
                    onClick={() => upd(selectedLesson.id, { status: 'done' }, 'Занятие отмечено как проведённое')}
                  >
                    Проведено
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn sm ghost"
                    disabled={savingLesson}
                    onClick={() => upd(selectedLesson.id, { status: 'planned' }, 'Статус возвращён на «Запланировано»')}
                  >
                    Вернуть в план
                  </button>
                )}

                <button
                  type="button"
                  className={`btn sm ${selectedLesson.paid ? 'ghost' : ''}`}
                  disabled={savingLesson}
                  onClick={() =>
                    upd(
                      selectedLesson.id,
                      {
                        paid: !selectedLesson.paid,
                        paid_at: !selectedLesson.paid ? new Date().toISOString() : null,
                      },
                      !selectedLesson.paid ? 'Занятие отмечено как оплаченное' : 'Отметка об оплате снята'
                    )
                  }
                >
                  {selectedLesson.paid ? 'Снять отметку оплаты' : 'Отметить оплаченным'}
                </button>

                {selectedLesson.status !== 'cancelled' ? (
                  <button
                    type="button"
                    className="btn sm danger"
                    disabled={savingLesson}
                    onClick={() => upd(selectedLesson.id, { status: 'cancelled' }, 'Занятие отменено')}
                  >
                    Отменить занятие
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn sm ghost"
                    disabled={savingLesson}
                    onClick={() => upd(selectedLesson.id, { status: 'planned' }, 'Занятие восстановлено')}
                  >
                    Восстановить занятие
                  </button>
                )}
              </div>

              <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
                <label className="stack" style={{ gap: 4, flex: 1, minWidth: 220 }}>
                  <span className="muted" style={{ fontSize: '0.85em' }}>
                    Перенести на другое время:
                  </span>
                  <input
                    className="input"
                    type="datetime-local"
                    value={rescheduleValue}
                    onChange={e => setRescheduleValue(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="btn sm ghost"
                  disabled={savingLesson}
                  onClick={() => handleReschedule(selectedLesson)}
                >
                  Сохранить перенос
                </button>
              </div>
            </div>
          )}

          {err && <p style={{ color: 'var(--bad)' }}>{err}</p>}
        </div>
      )}

      {!visibleLessons.length && <p className="muted">Занятий в выбранном представлении пока нет.</p>}

      {/* Форма записи нового занятия */}
      {t && showCreateForm && (
        <div className="card stack">
          <h2>Новое занятие</h2>
          <select
            className="input"
            value={f.student_id}
            onChange={e => setF({ ...f, student_id: e.target.value })}
          >
            <option value="">Ученик</option>
            {data?.students.map(s => (
              <option key={s.id} value={s.id}>
                {s.full_name}
              </option>
            ))}
          </select>
          <input
            className="input"
            type="datetime-local"
            value={f.starts_at}
            onChange={e => setF({ ...f, starts_at: e.target.value })}
          />
          <div className="row">
            <input
              className="input"
              placeholder="Минут"
              inputMode="numeric"
              value={f.duration_min}
              onChange={e => setF({ ...f, duration_min: e.target.value })}
            />
            <input
              className="input"
              placeholder="Стоимость"
              inputMode="decimal"
              value={f.price}
              onChange={e => setF({ ...f, price: e.target.value })}
            />
          </div>
          <input
            className="input"
            placeholder="Тема"
            value={f.topic}
            onChange={e => setF({ ...f, topic: e.target.value })}
          />

          <div className="stack" style={{ gap: 8 }}>
            <label className="row" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={f.repeatWeekly}
                onChange={e => setF({ ...f, repeatWeekly: e.target.checked })}
              />
              <span>Повторять каждую неделю</span>
            </label>

            {f.repeatWeekly && (
              <label className="stack" style={{ gap: 4 }}>
                <span className="muted" style={{ fontSize: '0.85em' }}>
                  Сколько недель подряд создать (от 1 до 52)
                </span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={52}
                  value={f.weeksCount}
                  onChange={e => setF({ ...f, weeksCount: e.target.value })}
                />
              </label>
            )}
          </div>

          {err && <p style={{ color: 'var(--bad)' }}>{err}</p>}
          <button className="btn" onClick={add}>
            {f.repeatWeekly ? 'Добавить серию занятий' : 'Добавить занятие'}
          </button>
        </div>
      )}
    </div>
  )
}