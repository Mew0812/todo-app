import { backup, fresh, maintain, preserveTomorrowMoves, type Data } from './model.ts'

let connection: Promise<IDBDatabase> | undefined
function open() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('mytodo', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('data')
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => { database.close(); connection = undefined }
      resolve(database)
    }
    request.onerror = () => { connection = undefined; reject(request.error) }
  })
  return connection
}

export type Change = (data: Data) => Data

// Read, modify and write under the same transaction, including across tabs.
export async function update(change: Change = data => data): Promise<Data> {
  const database = await open()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('data', 'readwrite')
    const store = transaction.objectStore('data')
    const request = store.get('current')
    let next: Data
    let error: unknown
    request.onsuccess = () => {
      try {
        const previous = request.result as Data | undefined
        next = maintain(change(maintain(previous ?? fresh())))
        if (next !== previous) store.put(next, 'current')
      } catch (caught) {
        error = caught
        transaction.abort()
      }
    }
    transaction.oncomplete = () => resolve(next)
    transaction.onabort = () => reject(error ?? transaction.error)
  })
}

export function readBackup(contents: string) {
  return backup.parse(JSON.parse(contents))
}

export async function readLocalValue<T>(key: string): Promise<T | undefined> {
  const database = await open()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('data')
    const request = tx.objectStore('data').get(key)
    tx.oncomplete = () => resolve(request.result)
    tx.onabort = () => reject(tx.error)
  })
}

export async function writeLocalValue(key: string, value: unknown): Promise<void> {
  const database = await open()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('data', 'readwrite')
    tx.objectStore('data').put(value, key)
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error)
  })
}

export async function restoreCloud(value: Data, key: string, meta: unknown, allowed: () => boolean): Promise<Data> {
  let next = backup.parse(value)
  const database = await open()
  return new Promise((resolve, reject) => {
    const tx = database.transaction('data', 'readwrite')
    const store = tx.objectStore('data')
    const request = store.get('current')
    let failure: unknown
    request.onsuccess = () => {
      try {
        if (!allowed()) throw new Error('ログイン状態が変わりました。')
        if (request.result === undefined) throw new Error('端末の現在のデータを確認できません。')
        next = preserveTomorrowMoves(request.result, next)
        store.put(request.result, key + ':before-restore')
        store.put(next, 'current')
        store.put(meta, key)
      } catch (error) {
        failure = error
        tx.abort()
      }
    }
    tx.oncomplete = () => resolve(next)
    tx.onabort = () => reject(failure ?? tx.error)
  })
}
