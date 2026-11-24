import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { initData, initTelegram } from '../../lib/telegram'
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

  const loadProfile = async (uid: string) => {
    const { data, error: profErr } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', uid)
      .maybeSingle()

    if (profErr) throw profErr

    setUserId(uid)
    setRole((data?.role as Role) ?? null)
    setName(data?.full_name ?? '')
  }

  useEffect(() => {
    initTelegram()

    ;(async () => {
      try {
        setError(null)

        if (initData) {
          const { data, error: fnError } = await supabase.functions.invoke('telegram-auth', {
            body: { initData },
          })
          if (fnError) throw fnError
          if (!data?.session) throw new Error(data?.error ?? 'Сессия не получена')

          const { error: sessError } = await supabase.auth.setSession({
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          })
          if (sessError) throw sessError

          await loadProfile(data.session.user.id)
          return
        }

        const { data: existing } = await supabase.auth.getSession()
        if (existing.session?.user) {
          await loadProfile(existing.session.user.id)
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
      if (data.user) await loadProfile(data.user.id)
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