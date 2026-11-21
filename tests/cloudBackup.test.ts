import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import 'fake-indexeddb/auto'
import { CloudBackup, DAY, validCloudData, type CloudMeta, type CloudRow } from '../src/cloud/cloudBackup.ts'
import { fresh, iso, type Data } from '../src/data/model.ts'
import { readLocalValue, restoreCloud, update } from '../src/data/storage.ts'

function sample(title: string): Data {
  const data = fresh()
  const now = iso()
  data.groups.push({ id: 'g', name: '仕事', color: '#a18bfa', collapsed: true })
  data.tasks.push({
    id: 't', title, groupId: 'g', date: '2099-01-01', important: true, note: 'メモ',
    checklist: [{ id: 'c', title: '確認', checked: true }], order: 9,
    completed: true, createdAt: now, updatedAt: now, completedAt: now, deletedAt: now,
  })
  return data
}

test('automatic backup skips empty data and retries the exact snapshot, then waits 24 hours', async () => {
  let local = fresh()
  let meta: CloudMeta | undefined
  let now = Date.now()
  const ids: string[] = []
  let remote: CloudRow | null = null
  let fail = true
  const controller = new CloudBackup({
    api: {
      latest: async () => remote, get: async () => remote, list: async () => remote ? [remote] : [],
      insert: async pending => {
        ids.push(pending.id)
        remote = { id: pending.id, created_at: new Date(now).toISOString(), schema_version: 1, backup_data: pending.data }
        if (fail) { fail = false; throw new Error('lost response') }
        return { status: 'saved', backup: remote }
      },
    },
    readData: async () => local, readMeta: async () => meta, writeMeta: async value => { meta = value },
    restoreData: async () => assert.fail('must never auto restore'), online: () => true, now: () => now, lock: task => task(),
  }, () => {})
  await controller.backup(true)
  assert.deepEqual(ids, [])
  local = sample('元')
  await controller.backup(true)
  assert.ok(controller.state.error)
  local = sample('端末の新しい編集')
  fail = false
  await controller.backup(true)
  assert.equal(ids[0], ids[1])
  assert.equal(validCloudData(remote!).tasks[0].title, '元')
  now += DAY - 1
  await controller.backup(true)
  assert.equal(ids.length, 2)
  now++
  await controller.backup(true)
  assert.equal(ids.length, 3)
  assert.equal(validCloudData(remote!).tasks[0].title, '端末の新しい編集')
})

test('remote divergence stops automatic upload; a server-side race also reports conflict', async () => {
  const latest = { id: 'remote', created_at: iso(), schema_version: 1, backup_data: sample('別端末') }
  let meta: CloudMeta = {}
  let inserts = 0
  const controller = new CloudBackup({
    api: {
      latest: async () => latest, get: async () => latest, list: async () => [latest],
      insert: async () => { inserts++; return { status: 'conflict', latest: { ...latest, id: 'raced' } } },
    },
    readData: async () => sample('端末'), readMeta: async () => meta, writeMeta: async value => { meta = value },
    restoreData: async () => assert.fail('must never auto restore'), online: () => true, now: Date.now, lock: task => task(),
  }, () => {})
  await controller.backup(true)
  assert.equal(inserts, 0)
  assert.equal(controller.state.conflict?.id, 'remote')
  await controller.backup(false, 'remote')
  assert.equal(inserts, 1)
  assert.equal(controller.state.conflict?.id, 'raced')
  assert.equal(meta.pending, undefined)
})

test('cloud restore saves a complete local snapshot and rolls back all writes if metadata fails', async () => {
  const original = await update(() => sample('端末'))
  const target = sample('クラウド')
  const key = 'cloud:todo:test'
  await assert.rejects(restoreCloud(target, key, () => {}, () => true))
  assert.deepEqual(await readLocalValue('current'), original)
  assert.equal(await readLocalValue(key + ':before-restore'), undefined)
  await assert.rejects(restoreCloud(target, key, {}, () => false))
  assert.deepEqual(await readLocalValue('current'), original)
  const restored = await restoreCloud(target, key, { head: 'new' }, () => true)
  assert.deepEqual(restored, target)
  assert.deepEqual(await readLocalValue('current'), target)
  assert.deepEqual(await readLocalValue(key + ':before-restore'), original)
  assert.deepEqual(await readLocalValue(key), { head: 'new' })
})

test('reading an existing IndexedDB record preserves tasks, completion history, trash, groups and settings', async () => {
  const existing = sample('ゴミ箱')
  existing.tasks.push(
    { ...existing.tasks[0], id: 'completed', title: '完了履歴', order: 3, deletedAt: null },
    { ...existing.tasks[0], id: 'active', title: '未完了', order: 7, deletedAt: null,
      completed: false, completedAt: null, todayTop: 2 },
  )
  existing.settings.lastBackup = iso()
  await update(() => existing)
  assert.deepEqual(await update(), existing)
  assert.deepEqual(await readLocalValue('current'), existing)
})

test('an approved request that loses its response retries even while the conflict notice is visible', async () => {
  const latest = { id: 'remote', created_at: iso(), schema_version: 1, backup_data: sample('別端末') }
  let meta: CloudMeta = {}
  const attempts: string[] = []
  const controller = new CloudBackup({
    api: {
      latest: async () => latest, get: async () => latest, list: async () => [latest],
      insert: async pending => {
        attempts.push(pending.id)
        if (attempts.length === 1) throw new Error('lost response')
        return { status: 'saved', backup: { ...latest, id: pending.id, backup_data: pending.data } }
      },
    },
    readData: async () => sample('端末'), readMeta: async () => meta, writeMeta: async value => { meta = value },
    restoreData: async () => assert.fail('must never auto restore'), online: () => true, now: Date.now, lock: task => task(),
  }, () => {})
  await controller.backup(true)
  assert.equal(controller.state.conflict?.id, 'remote')
  await controller.backup(false, latest.id)
  assert.equal(controller.state.conflict?.id, 'remote')
  assert.equal(meta.pending?.id, attempts[0])
  await controller.backup(true)
  assert.deepEqual(attempts, [attempts[0], attempts[0]])
  assert.equal(controller.state.conflict, undefined)
  assert.equal(meta.pending, undefined)
})

test('SQL scopes every table operation to todo and the caller; pruning caps history at 30', () => {
  const sql = readFileSync(new URL('../supabase/todo-backup-functions.sql', import.meta.url), 'utf8')
  assert.doesNotMatch(sql, /\b(fitness|diet|habit|security definer|alter table|create policy)\b/i)
  const readsAndDeletes = [...sql.matchAll(/from public\.app_backups\s+where ([^\r\n]+)/gi)]
  assert.equal(readsAndDeletes.length, 6)
  for (const [, predicate] of readsAndDeletes) {
    assert.match(predicate, /user_id = v_user and app_id = 'todo'/)
  }
  assert.match(sql, /values\(p_id, v_user, 'todo'/)
  assert.match(sql, /order by created_at desc, id desc offset 30/)
  assert.match(sql, /select count\(\*\) <= 30 from public\.app_backups/)
  assert.match(sql, /if not public\.todo_prune_backups\(v_saved\.id, v_user\)/)
  assert.match(sql, /v_latest\.id is distinct from p_expected_id/)
  assert.match(sql, /auth\.uid\(\)/)
})
