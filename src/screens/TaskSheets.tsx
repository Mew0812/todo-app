import { useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { formatDate, iso, offsetDate, type Data, type Tab, type Task } from '../data/model'
import { DatePicker } from '../components/Calendar'
import { Sheet } from '../components/Sheet'
import { SortableRows } from '../components/SortableRows'

export function AddTask({ tab, today, initialDate, groups, onClose, onAdd }:
  { tab: Tab; today: string; initialDate?: string; groups: Data['groups']; onClose: () => void; onAdd: (task: Task) => Promise<boolean> }) {
  const future = tab === '明日以降'
  const [busy, setBusy] = useState(false)
  const minimum = future ? offsetDate(today, 1) : today
  return <Sheet title="タスクを追加" compact onClose={onClose}>
    <form className="form-stack" onSubmit={async event => {
      event.preventDefault()
      if (busy) return
      const form = new FormData(event.currentTarget)
      const title = String(form.get('title')).trim()
      const date = String(form.get('date') ?? '')
      if (!title || !date || date < minimum) return
      setBusy(true)
      const now = iso()
      const success = await onAdd({
        id: crypto.randomUUID(), title, date, groupId: String(form.get('group') ?? '') || null,
        important: form.has('important'), note: String(form.get('note') ?? ''), checklist: [],
        createdAt: now, updatedAt: now, completedAt: null, deletedAt: null, completed: false, order: 0,
      })
      if (success) onClose()
      else setBusy(false)
    }}>
      <label>タスク名<input name="title" placeholder="やることを入力" required autoFocus={!future || Boolean(initialDate)} enterKeyHint="done" /></label>
      {future && <label>予定日<input type="date" name="date" min={minimum} defaultValue={initialDate} required /></label>}
      <details>
        <summary>詳細設定</summary>
        <div className="form-stack disclosure-body">
          {!future && <label>予定日<input type="date" name="date" min={minimum} defaultValue={today} required
            onInvalid={event => { const details = event.currentTarget.closest('details'); if (details) details.open = true }} /></label>}
          <label>グループ<select name="group"><option value="">未分類</option>
            {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
          <label className="check-label"><input name="important" type="checkbox" />重要</label>
          <label>メモ<textarea name="note" rows={3} /></label>
        </div>
      </details>
      <button className="primary" disabled={busy}>追加</button>
    </form>
  </Sheet>
}

export function TaskDetail({ task, today, groupName, onClose, onSave }:
  { task: Task; today: string; groupName: string; onClose: () => void; onSave: (patch: Partial<Task>) => void }) {
  const [draft, setDraft] = useState(task)
  const [name, setName] = useState(task.title)
  const [newItem, setNewItem] = useState('')
  const [picker, setPicker] = useState(false)
  const [checklistOpen, setChecklistOpen] = useState(Boolean(task.checklist.length))
  const listInput = useRef<HTMLInputElement>(null)
  const readOnly = draft.completed
  function edit(patch: Partial<Task>) {
    setDraft(current => ({ ...current, ...patch }))
    onSave(patch)
  }
  return <Sheet title="タスクの詳細" onClose={picker ? () => setPicker(false) : onClose}>
    <div className="form-stack">
      <label>タスク名<input value={name} readOnly={readOnly} enterKeyHint="done" onBlur={() => setName(draft.title)}
        onChange={event => {
          setName(event.target.value)
          const title = event.target.value.trim()
          if (title) edit({ title })
        }} /></label>
      <div className="detail-meta">
        <button type="button" className="soft" disabled={readOnly} onClick={() => setPicker(true)}>{formatDate(draft.date)}</button>
        <button type="button" className="soft" disabled={readOnly} aria-pressed={draft.important}
          onClick={() => edit({ important: !draft.important })}>{draft.important ? '★' : '☆'} 重要</button>
        <span>{groupName}</span>
      </div>
      <details><summary>メモ {draft.note.trim() && <span className="muted">入力済み</span>}</summary>
        <textarea className="disclosure-body" aria-label="メモ" value={draft.note} readOnly={readOnly} rows={5}
          onChange={event => edit({ note: event.target.value })} /></details>
      <details open={checklistOpen} onToggle={event => setChecklistOpen(event.currentTarget.open)}>
        <summary>チェックリスト {draft.checklist.length > 0 &&
          <span className="muted">{draft.checklist.filter(item => item.checked).length}/{draft.checklist.length}</span>}</summary>
        <div className="disclosure-body">
          {readOnly ? draft.checklist.map(item => <div key={item.id} className="checklist-row">
            <input type="checkbox" checked={item.checked} disabled /><span>{item.title}</span>
          </div>) : <SortableRows items={draft.checklist} onMove={checklist => edit({ checklist })}
            render={item => <div className="checklist-row">
              <input type="checkbox" aria-label={item.title || '項目をチェック'} checked={item.checked}
                onChange={event => edit({ checklist: draft.checklist.map(row => row.id === item.id
                  ? { ...row, checked: event.target.checked } : row) })} />
              <input value={item.title} aria-label="チェック項目名" enterKeyHint="done"
                onChange={event => edit({ checklist: draft.checklist.map(row => row.id === item.id
                  ? { ...row, title: event.target.value } : row) })} />
              <button type="button" className="icon-button" aria-label="項目を削除"
                onClick={() => edit({ checklist: draft.checklist.filter(row => row.id !== item.id) })}><Trash2 size={17} /></button>
            </div>} />}
          {!readOnly && <form className="inline-form" onSubmit={event => {
            event.preventDefault()
            if (!newItem.trim()) return
            edit({ checklist: [...draft.checklist, { id: crypto.randomUUID(), title: newItem.trim(), checked: false }] })
            setNewItem('')
            listInput.current?.focus()
          }}><input ref={listInput} value={newItem} aria-label="新しい項目" placeholder="項目を追加" enterKeyHint="done"
            onKeyDown={event => { if (event.key === 'Enter') event.stopPropagation() }}
            onChange={event => setNewItem(event.target.value)} />
            <button className="icon-button" aria-label="チェック項目を追加"><Plus /></button></form>}
        </div>
      </details>
    </div>
    {picker && <DatePicker today={today} value={draft.date} onChange={date => edit({ date })} onClose={() => setPicker(false)} />}
  </Sheet>
}
