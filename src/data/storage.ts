import { backup, fresh, maintain, type Data } from './model.ts'

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
