import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { initTelegram } from '../../lib/telegram'
import type { Role } from '../../types'

interface Ctx {
  role: Role | null
  userId: string | null
  name: string
  loading: boolean
  error: string | null
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const C = createContext<Ctx>(null as unknown as Ctx)
export const useAuth = () => useContext(C)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProfileById = async (uid: string) => {
    const { data, error: profErr } = await supabase
      .from('profiles')
      .select('id, role, full_name')
      .eq('id', uid)
      .maybeSingle()

    if (profErr) throw profErr

    setUserId(data?.id ?? uid)
    setRole((data?.role as Role) ?? null)
    setName(data?.full_name ?? '')
  }

  const loadProfileByTgId = async (tgId: number) => {
    const { data, error: profErr } = await supabase
      .from('profiles')
      .select('id, role, full_name, tg_id')
      .eq('tg_id', tgId)
      .maybeSingle()

    if (profErr) throw profErr

    if (!data) {
      setUserId(null)
      setRole(null)
      setName('')
      setError('Пользователь с таким Telegram ID не найден в profiles')
      return
    }

    setUserId(data.id)
    setRole((data.role as Role) ?? null)
    setName(data.full_name ?? '')
  }

  useEffect(() => {
    initTelegram()

    ;(async () => {
      try {
        setError(null)

        const tg = (window as any).Telegram?.WebApp
        const rawTgId = tg?.initDataUnsafe?.user?.id

        if (rawTgId) {
          await loadProfileByTgId(Number(rawTgId))
          return
        }

        const { data: existing } = await supabase.auth.getSession()
        if (existing.session?.user) {
          await loadProfileById(existing.session.user.id)
        }
      } catch (e: any) {
        setError(e?.message ?? 'Ошибка авторизации')
        setRole(null)
        setUserId(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const signIn = async (email: string, password: string) => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      if (authErr) throw authErr
      if (data.user) await loadProfileById(data.user.id)
    } catch (e: any) {
      setError(e?.message ?? 'Ошибка входа')
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('app_user_id')
    setRole(null)
    setUserId(null)
    setName('')
  }

  return (
    <C.Provider value={{ role, userId, name, loading, error, signIn, signOut }}>
      {children}
    </C.Provider>
  )
}