const tg = (window as any).Telegram?.WebApp
export const initData: string = tg?.initData ?? ''
export const tgUserId: number | null = tg?.initDataUnsafe?.user?.id ?? null
export const tgScheme = (): 'light' | 'dark' | undefined => tg?.colorScheme
export function initTelegram() { tg?.ready(); tg?.expand() }
