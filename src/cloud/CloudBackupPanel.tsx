import { useRef, useState, type FormEvent } from 'react'
import { readLocalValue } from '../data/storage'
import type { Data } from '../data/model'
import { validCloudData } from './cloudBackup'
import type { CloudAccess } from './useCloudBackup'

const dateLabel = (date: string) => new Date(date).toLocaleString('ja-JP')

export function CloudBackupPanel({ cloud }: { cloud: CloudAccess }) {
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const running = useRef(false)
  const { client, user, state, controller, api } = cloud

  async function perform(action: () => Promise<void>) {
    if (running.current || state.busy) return
    running.current = true
    setBusy(true)
    setMessage('')
    try { await action() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'クラウド処理に失敗しました。') }
    finally { running.current = false; setBusy(false) }
  }

  function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const values = new FormData(form)
    void perform(async () => {
      const result = await client!.auth.signInWithPassword({
        email: String(values.get('email')).trim(), password: String(values.get('password')),
      })
      if (result.error) throw new Error('ログインに失敗しました。入力内容と通信状態を確認してください。')
      form.reset()
    })
  }

  async function restore() {
    if (!api || !controller || !user || !selected) return
    const row = await api.get(selected)
    if (!row) throw new Error('バックアップが見つかりません。履歴を更新してください。')
    const next = validCloudData(row)
    const head = await api.latest()
    const result = await client!.auth.getUser()
    if (result.error || result.data.user?.id !== user.id) throw new Error('ログイン状態を確認できません。')
    if (!confirm(dateLabel(row.created_at) + ' のバックアップで端末データを置き換えますか？現在のデータは端末内に退避します。')) return
    await controller.restore(next, head?.id ?? null)
  }

  async function downloadRecovery() {
    if (!cloud.recoveryKey) return
    const snapshot = await readLocalValue<Data>(cloud.recoveryKey)
    if (!snapshot) throw new Error('復元前の退避データはありません。')
    const url = URL.createObjectURL(new Blob([JSON.stringify(snapshot)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'mytodo-before-cloud-restore.json'
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return <details>
    <summary>クラウドバックアップ</summary>
    <div className="disclosure-body form-stack">
      {!client ? <p className="muted">クラウド接続が未設定です。端末保存とJSONバックアップを利用できます。</p>
        : !user ? <form className="form-stack" onSubmit={signIn}>
          <label>メールアドレス<input name="email" type="email" autoComplete="email" required /></label>
          <label>パスワード<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="primary" disabled={busy}>ログイン</button>
        </form> : <>
          <p className="muted">{user.email}</p>
          <button className="soft" disabled={busy || state.busy} onClick={() => void perform(async () => {
            const { error } = await client.auth.signOut({ scope: 'local' })
            if (error) throw new Error('ログアウトできませんでした。')
            setSelected('')
          })}>ログアウト</button>
          <p>最終保存成功 {state.lastSuccess ? dateLabel(state.lastSuccess) : '未実行'}</p>
          <p className="muted" role="status">{state.message}</p>
          {state.error && <p role="alert">{state.error}</p>}
          <button className="primary" disabled={busy || state.busy || !controller}
            onClick={() => void controller?.backup(false)}>今すぐバックアップ</button>
          {state.conflict && <div className="form-stack">
            <p role="alert">別端末の更新を検出しました。クラウドの最新は {dateLabel(state.conflict.created_at)} です。</p>
            <button className="soft" disabled={busy || state.busy} onClick={() => {
              if (confirm('端末データをクラウドの新しい世代として追加しますか？')) {
                void controller?.backup(false, state.conflict!.id)
              }
            }}>確認して新しい世代として保存</button>
          </div>}
          <button className="soft" disabled={busy || state.busy} onClick={() => void controller?.refresh()}>履歴を更新</button>
          <label>復元する日時<select value={selected} disabled={busy || state.busy} onChange={event => setSelected(event.target.value)}>
            <option value="">日時を選択</option>
            {state.history.map(row => <option key={row.id} value={row.id}>{dateLabel(row.created_at)} · {row.id.slice(0, 8)}</option>)}
          </select></label>
          <button className="soft" disabled={!selected || busy || state.busy}
            onClick={() => void perform(restore)}>選択したバックアップを復元</button>
          <button className="soft" disabled={busy || state.busy}
            onClick={() => void perform(downloadRecovery)}>復元前の退避データをダウンロード</button>
        </>}
      {cloud.authMessage && <p role="status">{cloud.authMessage}</p>}
      {message && <p role="status">{message}</p>}
    </div>
  </details>
}
