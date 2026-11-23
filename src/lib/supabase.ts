import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
export const envOk = Boolean(url && key)

export const supabase = createClient(url ? url :  'https://supabase.co', key ? key :  'placeholder', {
  global: {
    fetch: (input, init = {}) => {
      const headers = new Headers(init.headers)
      const uid = localStorage.getItem('app_user_id')
      if (uid) headers.set('x-user-id', uid)
      return fetch(input, { ...init, headers })
    },
  },
})

export async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(error.message)
  return data as T
}