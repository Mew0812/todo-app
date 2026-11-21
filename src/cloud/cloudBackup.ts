import { backup as schema, type Data } from '../data/model.ts'
const parseBackup = (data: unknown) => schema.parse(data)

export const DAY = 24 * 60 * 60 * 1000
export type BackupInfo = {id: string; created_at: string; schema_version: number}
export type CloudRow = BackupInfo & {backup_data: unknown}
export type Pending = {id: string; data: Data; expected: string | null; automatic: boolean}
export type CloudMeta = {
  known?: boolean; head?: string | null; lastSuccess?: string; lastAutoSuccess?: number
  lastError?: string
  retryManual?: boolean
  pending?: Pending
}
export type CloudState = {
  busy: boolean; message: string; lastSuccess?: string; lastAutoSuccess?: number
  error?: string
  conflict?: BackupInfo; history: BackupInfo[]
}
export type CloudAPI = {
  latest: () => Promise<CloudRow | null>
  list: () => Promise<BackupInfo[]>
  get: (id: string) => Promise<CloudRow | null>
  insert: (pending: Pending) => Promise<{status: 'saved'; backup: CloudRow} | {status: 'conflict'; latest: CloudRow | null}>
}
export type CloudDeps = {
  api: CloudAPI
  readMeta: () => Promise<CloudMeta | undefined>
  writeMeta: (meta: CloudMeta) => Promise<void>
  readData: () => Promise<Data>
  restoreData: (data: Data, meta: CloudMeta, allowed: () => boolean) => Promise<void>
  online: () => boolean
  now: () => number
  lock: <T>(task: () => Promise<T>) => Promise<T>
}
// PostgreSQL jsonb reorders object keys. Compare values, preserving array/record order.
const content = (data: Data) => JSON.stringify(parseBackup(data), (_key, value) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])) : value)
const backupId = () => crypto.randomUUID()
export function validCloudData(row: CloudRow): Data {
  if (row.schema_version !== (row.backup_data as {version?: unknown} | null)?.version) throw new Error('クラウドのデータ形式が一致しません。')
  return parseBackup(row.backup_data)
}

// Independent from local record saves. No automatic restore or per-edit sends.
export class CloudBackup {
  state: CloudState = {busy: false, message: 'クラウドを確認します。', history: []}
  private stopped = false
  private running = false
  private emit: (state: CloudState) => void
  private deps: CloudDeps
  constructor(deps: CloudDeps, emit: (state: CloudState) => void) { this.deps = deps; this.emit = emit }
  start() { this.stopped = false }
  stop() { this.stopped = true }
  private publish(patch: Partial<CloudState>) {
    this.state = {...this.state, ...patch}
    if (!this.stopped) this.emit(this.state)
  }
  async backup(automatic: boolean, approvedHead?: string) {
    if (this.running || this.stopped) return
    if (!this.deps.online()) {
      this.publish({message: 'オフラインです。端末の記録は保持しています。オンライン復帰後に再試行します。'})
      if (!automatic) {
        try { await this.deps.lock(async()=>{
          const meta=await this.deps.readMeta()??{}
          if (!this.stopped) await this.deps.writeMeta({...meta,retryManual:true})
        }) } catch { this.publish({error:'再試行の予約を保存できませんでした。オンライン復帰後に手動で再実行してください。'}) }
      }
      return
    }
    this.running = true
    this.publish({busy: true})
    try {
      await this.deps.lock(async () => {
        if (this.stopped) return
        const meta = await this.deps.readMeta() ?? {}
        if (automatic && this.state.conflict && !meta.pending) return
        this.publish({lastSuccess: meta.lastSuccess, lastAutoSuccess: meta.lastAutoSuccess, error:meta.lastError})
        if (!meta.pending && !meta.retryManual && automatic && meta.lastSuccess && this.deps.now() - Date.parse(meta.lastSuccess) < DAY) {
          this.publish({message: '自動バックアップは前回の成功から24時間後に確認します。'})
          return
        }
        let pending = meta.pending
        if (pending) {
          if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(pending.id) || typeof pending.automatic !== 'boolean') {
            throw new Error('送信待ち情報が不正です。既存データを保持して処理を停止しました。')
          }
          parseBackup(pending.data)
        }
        if (!pending) {
          const local = parseBackup(await this.deps.readData())
          const latest = await this.deps.api.latest()
          if (this.stopped) return
          // Reject unreadable cloud data; never silently replace an invalid backup.
          const remote = latest && validCloudData(latest)
          const changed = latest && (!meta.known || meta.head !== latest.id)
          if (changed && content(local) !== content(remote!) && approvedHead !== latest.id) {
            this.publish({conflict: latest, message: 'クラウドに端末と異なるバックアップがあります。自動送信を停止しました。内容を確認し、追加保存または復元を選んでください。'})
            return
          }
          // Default exercises/stores are not evidence of user records. Never upload an empty replacement.
          if (!local.tasks.length && !local.groups.length) {
            this.publish({message: '端末にタスクとグループがないため、クラウドへの追加保存を停止しています。必要ならバックアップ履歴から復元してください。', conflict: undefined})
            return
          }
          pending = {id: backupId(), data: local, expected: latest?.id ?? null, automatic:automatic && !meta.retryManual}
          // Persist id + exact snapshot BEFORE sending, so an uncertain response can be retried safely.
          await this.deps.writeMeta({...meta, pending})
        }
        if (this.stopped) return
        const result = await this.deps.api.insert(pending)
        if (this.stopped) return
        if (result.status === 'conflict') {
          // The server definitively did not insert this request; keep all local tasks.
          await this.deps.writeMeta({...meta, pending: undefined})
          this.publish({conflict: result.latest ?? undefined, message: '別端末からクラウドが更新されました。自動送信を停止しました。再確認してください。'})
          return
        }
        const saved = validCloudData(result.backup)
        if (result.backup.id !== pending.id || content(saved) !== content(pending.data) || !Number.isFinite(Date.parse(result.backup.created_at))) {
          throw new Error('サーバーの保存結果を確認できません。次回同じバックアップIDで確認します。')
        }
        const next: CloudMeta = {...meta, known: true, head: result.backup.id, pending: undefined, lastError:undefined, retryManual:undefined,
          lastSuccess: result.backup.created_at,
          lastAutoSuccess: pending.automatic ? this.deps.now() : meta.lastAutoSuccess}
        await this.deps.writeMeta(next)
        this.publish({conflict: undefined, error:undefined, lastSuccess: next.lastSuccess, lastAutoSuccess: next.lastAutoSuccess, message: 'クラウドバックアップを保存しました（サーバー確認済み）。'})
        try { this.publish({history: await this.deps.api.list()}) }
        catch { this.publish({message: this.state.message + ' バックアップ履歴の再取得に失敗しました。履歴を更新して再確認してください。'}) }
      })
    } catch (error) {
      const message = `バックアップを完了できませんでした。端末の記録は保持されています。${error instanceof Error ? error.message : '通信・容量・権限を確認してください。'}`
      this.publish({message, error:message})
      try {
        // Reacquire the lock and read fresh metadata; do not overwrite a different tab's success.
        await this.deps.lock(async()=>{
          const current = await this.deps.readMeta() ?? {}
          if (!this.stopped) await this.deps.writeMeta({...current,lastError:message,retryManual:!automatic || current.retryManual})
        })
      } catch { /* Do not turn a metadata failure into any write to workout data. */ }
    } finally { this.running = false; this.publish({busy: false}) }
  }
  async refresh() {
    if (this.running || this.stopped) return
    try {
      const meta = await this.deps.readMeta() ?? {}
      this.publish({lastSuccess: meta.lastSuccess, lastAutoSuccess: meta.lastAutoSuccess,error:meta.lastError})
      if (this.deps.online()) this.publish({history: await this.deps.api.list()})
    } catch { this.publish({message: 'クラウドの履歴を取得できません。端末の記録は保持されています。'}) }
  }
  async restore(data: Data, observedHead: string | null) {
    if (this.running || this.stopped) throw new Error('別のクラウド処理が実行中です。')
    this.running = true
    try {
      await this.deps.lock(async () => {
        const meta = await this.deps.readMeta() ?? {}
        if (this.stopped) throw new Error('ログイン状態が変わりました。')
        // Save the pre-restore snapshot, restored data and cloud baseline together.
        await this.deps.restoreData(data, { ...meta, known: true, head: observedHead,
          pending: undefined, lastError: undefined, retryManual: undefined }, () => !this.stopped)
        this.publish({ conflict: undefined, error: undefined, message: 'クラウドのデータを端末に復元しました。' })
      })
    } finally { this.running = false }
  }
}

export function watchCloud(check: () => void): () => void {
  const visible = () => { if (document.visibilityState !== 'hidden') check() }
  window.addEventListener('online', visible)
  window.addEventListener('pageshow', visible)
  document.addEventListener('visibilitychange', visible)
  // Handles open sessions and clock/sleep changes without sending on record edits.
  const timer = window.setInterval(visible, 60_000)
  visible()
  return () => {
    clearInterval(timer)
    window.removeEventListener('online', visible)
    window.removeEventListener('pageshow', visible)
    document.removeEventListener('visibilitychange', visible)
  }
}
