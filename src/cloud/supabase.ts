import {createClient} from '@supabase/supabase-js'
import type {SupabaseClient} from '@supabase/supabase-js'
import type {CloudAPI, CloudRow} from './cloudBackup'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
// Avoid leaving a backup permanently in-flight after a network transition.
async function timedFetch(input: RequestInfo | URL, init?: RequestInit) {
  const controller = new AbortController()
  const source = init?.signal ?? (input instanceof Request ? input.signal : undefined)
  const abort = () => controller.abort()
  if (source?.aborted) controller.abort()
  else source?.addEventListener('abort', abort, {once:true})
  const timer = setTimeout(abort, 30_000)
  try { return await fetch(input, {...init,signal:controller.signal}) }
  finally { clearTimeout(timer); source?.removeEventListener('abort',abort) }
}
// Missing configuration must never break the offline/local app.
export function configuredClient(): SupabaseClient | null {
  if (!url || !key) return null
  if (key.startsWith('sb_secret_')) return null
  // Legacy JWT service_role keys must never enter the browser client.
  if (!key.startsWith('sb_publishable_')) return null
  try {
    if (new URL(url).protocol !== 'https:') return null
    return createClient(url, key, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'mytodo-supabase-auth'}, global:{fetch:timedFetch}})
  } catch { return null }
}
export const supabase = configuredClient()
function failure(error: {message: string; code?: string}): Error {
  if (error.code === 'PGRST202') return new Error('Supabaseにバックアップ用SQL関数を登録してください。')
  if (error.code === '42501') return new Error('権限またはRLSの設定を確認してください。')
  return new Error(`通信・容量・認証・設定を確認してください（${error.code ?? 'network'}）。`)
}
export function cloudAPI(client: SupabaseClient, userId: string): CloudAPI {
  const query = () => client.from('app_backups').select('id,created_at,schema_version,backup_data')
    .eq('user_id', userId).eq('app_id', 'todo')
  return {
    latest: async () => {
      const {data, error} = await query().order('created_at', {ascending:false}).order('id', {ascending:false}).limit(1)
      if (error) throw failure(error)
      return (data?.[0] as CloudRow) ?? null
    },
    list: async () => {
      const {data, error} = await client.from('app_backups').select('id,created_at,schema_version')
        .eq('user_id', userId).eq('app_id', 'todo').order('created_at', {ascending:false}).order('id', {ascending:false}).limit(30)
      if (error) throw failure(error)
      return data ?? []
    },
    get: async id => {
      const {data, error} = await query().eq('id', id).maybeSingle()
      if (error) throw failure(error)
      return data as CloudRow | null
    },
    insert: async pending => {
      const {data, error} = await client.rpc('todo_append_backup', {
        p_id: pending.id, p_expected_id: pending.expected, p_schema_version: pending.data.version, p_backup_data: pending.data, p_user_id:userId,
      })
      if (error) throw failure(error)
      if (data?.status !== 'saved' && data?.status !== 'conflict') throw new Error('サーバーの保存応答が不正です。')
      return data
    },
  }
}
