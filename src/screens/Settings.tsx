import { useRef, useState } from 'react'
import { Download, Ellipsis, Plus, Upload } from 'lucide-react'
import { Sheet } from '../components/Sheet'
import { SortableRows } from '../components/SortableRows'
import { colors, formatDate, localDate, type Data, type Task } from '../data/model'
import { Card, HistoryRows, type Actions } from './Todo'

type Group = Data['groups'][number]
type Props = {
  data: Data; onClose: () => void; onGroups: (ids: string[]) => void
  onGroup: (id: string | null, patch: Partial<Group>) => Promise<string | undefined>
  deleteGroup: (id: string) => void; completed: Task[]; trash: Task[]
  undated: Task[]; taskActions: Actions
  openTask: (task: Task) => void; restore: (task: Task, trash?: boolean) => void; purge: (task: Task) => void
  onExport: () => void; onImport: (file: File) => void
}

function GroupRow({ group, groups, save, remove }: {
  group: Group; groups: Group[]; save: (patch: Partial<Group>) => Promise<string | undefined>; remove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group.name)
  const [error, setError] = useState('')
  const [menu, setMenu] = useState<'color' | 'actions' | null>(null)
  return <>
    <div className="settings-row">
      <button className="icon-button" aria-label={group.name + 'の色'} onClick={() => setMenu(menu === 'color' ? null : 'color')}>
        <i className="color-dot" style={{ background: group.color }} /></button>
      {editing ? <input autoFocus value={name} aria-label="グループ名" enterKeyHint="done"
        onChange={event => setName(event.target.value)} onBlur={async () => {
          setEditing(false)
          setError(name.trim() ? await save({ name }) ?? '' : '')
        }} /> : <button className="text-button" onClick={() => {
          setName(group.name); setEditing(true); setError('')
        }}>{group.name}</button>}
      <button className="icon-button" aria-label={group.name + 'のメニュー'}
        onClick={() => setMenu(menu === 'actions' ? null : 'actions')}><Ellipsis size={20} /></button>
    </div>
    {error && <p className="error" role="alert">{error}</p>}
    {menu === 'color' && <div className="palette">
      {colors.filter(color => !groups.some(g => g.id !== group.id && g.color === color)).map(color =>
        <button key={color} className="icon-button" aria-label={'色 ' + color} aria-pressed={color === group.color}
          onClick={async () => { setMenu(null); setError(await save({ color }) ?? '') }}>
          <i className="color-dot" style={{ background: color }} />
        </button>)}
    </div>}
    {menu === 'actions' && <button className="danger group-delete" onClick={remove}>グループを削除</button>}
  </>
}

export function Settings(props: Props) {
  const { data } = props
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)
  return <Sheet title="設定" onClose={props.onClose}>
    <div className="settings-sections">
      <section>
        <div className="section-heading"><h3>グループ</h3>
          <button className="icon-button" aria-label="グループを追加" disabled={data.groups.length >= 12}
            onClick={() => { setAdding(true); setError('') }}><Plus size={20} /></button>
        </div>
        <SortableRows items={data.groups} onMove={items => props.onGroups(items.map(group => group.id))}
          render={group => <GroupRow group={group} groups={data.groups}
            save={patch => props.onGroup(group.id, patch)} remove={() => props.deleteGroup(group.id)} />} />
        {adding && <form className="inline-form" onSubmit={async event => {
          event.preventDefault()
          const problem = await props.onGroup(null, { name: String(new FormData(event.currentTarget).get('name')) })
          setError(problem ?? '')
          if (!problem) setAdding(false)
        }}>
          <input name="name" aria-label="新しいグループ名" autoFocus required placeholder="グループ名（10文字まで）"
            onKeyDown={event => { if (event.key === 'Enter') event.stopPropagation() }} />
          <button className="soft">追加</button>
        </form>}
        {error && <p className="error" role="alert">{error}</p>}
      </section>
      {props.undated.length > 0 && <details>
        <summary>日付未設定（{props.undated.length}件）</summary>
        <div className="task-list disclosure-body">
          {props.undated.map(task => <Card key={task.id} task={task} actions={props.taskActions} />)}
        </div>
      </details>}
      <details><summary>完了履歴（{props.completed.length}件）</summary>
        {props.completed.length ? <HistoryRows tasks={props.completed} onOpen={props.openTask} onRestore={props.restore} />
          : <p className="muted">完了したタスクはありません</p>}
      </details>
      <details><summary>ゴミ箱（{props.trash.length}件）</summary>
        {props.trash.length ? props.trash.map(task => <div key={task.id} className="history-row">
          <span className="trash-name">{task.title}</span>
          <button className="soft" onClick={() => props.restore(task, true)}>戻す</button>
          <button className="danger" onClick={() => {
            if (confirm('このタスクを完全に削除しますか？')) props.purge(task)
          }}>完全削除</button>
        </div>) : <p className="muted">ゴミ箱は空です</p>}
      </details>
      <section>
        <h3>バックアップ</h3>
        <p className="muted">Safariのウェブサイトデータを消去すると、タスクが失われる場合があります。JSONを定期的に保存してください。</p>
        {data.settings.lastBackup && <p className="muted">前回 {formatDate(localDate(new Date(data.settings.lastBackup)))}</p>}
        <div className="backup-buttons">
          <button className="soft" onClick={props.onExport}><Download size={17} />エクスポート</button>
          <button className="soft" onClick={() => input.current?.click()}><Upload size={17} />インポート</button>
          <input ref={input} hidden type="file" accept=".json,application/json" onChange={event => {
            const file = event.target.files?.[0]
            if (file) props.onImport(file)
            event.target.value = ''
          }} />
        </div>
      </section>
    </div>
  </Sheet>
}
