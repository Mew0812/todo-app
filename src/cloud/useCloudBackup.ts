import {useEffect, useMemo, useState} from 'react'
import type {User} from '@supabase/supabase-js'
import {supabase, cloudAPI} from './supabase'
import {CloudBackup, watchCloud} from './cloudBackup'
import type {CloudMeta, CloudState} from './cloudBackup'
import { update as readData, readLocalValue, writeLocalValue, restoreCloud } from '../data/storage'
import type { Data } from '../data/model'

const initial: CloudState = {busy:false, message:'ログインするとクラウドバックアップを利用できます。', history:[]}
export function useCloudBackup(ready: boolean, onRestored: (data: Data) => void) {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [update, setUpdate] = useState<{controller:CloudBackup; state:CloudState} | null>(null)
  useEffect(() => {
    if (!supabase) return
    let active = true
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) { setUser(session?.user ?? null); setAuthReady(true) }
    })
    void supabase.auth.getSession().then(({data, error}) => {
      if (!active) return
      if (error) setAuthMessage('ログイン状態を確認できません。オンラインで再度ログインしてください。')
      setUser(data.session?.user ?? null); setAuthReady(true)
    }).catch(() => { if (active) setAuthMessage('ログイン状態を確認できません。') })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  const userId = user?.id
  const controller = useMemo(() => {
    if (!supabase || !ready || !authReady || !userId) {
      return null
    }
    const client = supabase
    const metaKey = `cloud:todo:${import.meta.env.VITE_SUPABASE_URL}:${userId}`
    const backup = new CloudBackup({api:cloudAPI(client,userId), readData: () => readData(), restoreData: async (data, meta, allowed) => onRestored(await restoreCloud(data, metaKey, meta, allowed)),
      readMeta:()=>readLocalValue<CloudMeta>(metaKey), writeMeta:meta=>writeLocalValue(metaKey, meta),
      now:Date.now, online:()=>navigator.onLine,
      lock:async task=> navigator.locks ? await navigator.locks.request(metaKey, task) : await task(),
    },state=>setUpdate({controller:backup,state}))
    return backup
  }, [ready, authReady, userId])
  useEffect(() => {
    if (!controller) return
    const backup = controller
    backup.start()
    void backup.refresh()
    const unwatch = watchCloud(()=>void backup.backup(true))
    return () => { unwatch(); backup.stop() }
  }, [controller])
  const state = controller ? (update?.controller === controller ? update.state : controller.state) : initial
  const recoveryKey = userId ? 'cloud:todo:' + import.meta.env.VITE_SUPABASE_URL + ':' + userId + ':before-restore' : undefined
  return {client:supabase, user, state, controller, authMessage, setAuthMessage, recoveryKey,
    api:userId && supabase ? cloudAPI(supabase,userId) : null}
}
export type CloudAccess = ReturnType<typeof useCloudBackup>
