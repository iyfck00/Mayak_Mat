import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { tgUserId } from '../../lib/telegram'
import type { Role } from '../../types'

interface Ctx {
role: Role | null
userId: string | null
name: string
loading: boolean
error: string | null
signIn: (e: string, p: string) => Promise<void>
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

useEffect(() => {
(async () => {
try {
if (!tgUserId) {
setLoading(false)
return
}

    const { data, error: dbError } = await supabase
      .from('allowed_users')
      .select('id, telegram_id, name, role, profile_id')
      .eq('telegram_id', tgUserId)
      .maybeSingle()

    if (dbError) throw dbError

    if (data) {
      localStorage.setItem('app_user_id', data.profile_id)
      setRole(data.role as Role)
      setName(data.name || '')
      setUserId(data.profile_id)
    } else {
      localStorage.removeItem('app_user_id')
      setRole(null)
      setUserId(null)
    }
  } catch (e: any) {
    setError(e.message)
  } finally {
    setLoading(false)
  }
})()
}, [])

const signIn = async () => {}
const signOut = async () => {
localStorage.removeItem('app_user_id')
setRole(null)
setUserId(null)
}

return (
<C.Provider value={{ role, userId, name, loading, error, signIn, signOut }}>
{children}
</C.Provider>
)
}