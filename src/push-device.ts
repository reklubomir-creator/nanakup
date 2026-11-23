import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore'
import { app, db } from './db'
import { updateAppBadge } from './app-badge.js'

import { pushConfigured, vapidKey } from './push-config'

export type PushDevice = { id:string; muted:string[] }
const localKey = (uid:string) => 'nanakup-push:' + uid
export function storedDevice(uid:string):PushDevice | null {
  try {
    const value:unknown = JSON.parse(localStorage.getItem(localKey(uid)) ?? 'null')
    if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && 'muted' in value && Array.isArray(value.muted)) {
      return {id:value.id,muted:value.muted.filter((id):id is string=>typeof id==='string')}
    }
  } catch {
    return null
  }
  return null
}
function store(uid:string,device:PushDevice) {
  localStorage.setItem(localKey(uid),JSON.stringify(device))
}
const deviceRef = (id:string) => doc(db,'pushDevices',id)

export async function registerPush(uid:string,device:PushDevice,askPermission:boolean) {
  if (!pushConfigured || !('Notification' in window) || !('serviceWorker' in navigator)) {
    throw new Error('Na tomto zařízení nejsou oznámení dostupná. Na iPhonu otevři NaNákup z plochy.')
  }
  const permission = askPermission && Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
  if (permission !== 'granted') throw new Error('Oznámení povol v nastavení prohlížeče nebo telefonu.')
  const { getMessaging,getToken,isSupported } = await import('firebase/messaging')
  if (!(await isSupported())) throw new Error('Tento prohlížeč nepodporuje oznámení NaNákupu.')
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration?.active) throw new Error('Načti NaNákup znovu a zkus oznámení zapnout.')
  const token = await getToken(getMessaging(app),{vapidKey,serviceWorkerRegistration:registration})
  if (!token) throw new Error('Zařízení se nepodařilo přihlásit k odběru oznámení.')
  await setDoc(deviceRef(device.id),{uid,token,muted:device.muted})
  store(uid,device)
}

export async function unregisterPush(uid:string,device:PushDevice) {
  await deleteDoc(deviceRef(device.id))
  localStorage.removeItem(localKey(uid))
  const { getMessaging,deleteToken,isSupported } = await import('firebase/messaging')
  if (await isSupported()) await deleteToken(getMessaging(app)).catch(()=>{})
}

export async function changePushPreference(uid:string,device:PushDevice,listId:string,muted:boolean) {
  const next = {id:device.id,muted:muted?[...new Set([...device.muted,listId])]:device.muted.filter(id=>id!==listId)}
  await updateDoc(deviceRef(device.id),{muted:next.muted})
  store(uid,next)
  return next
}

export function listenForPushBadges() {
  let active = true
  let unsubscribe: (() => void) | undefined
  void import('firebase/messaging').then(async ({getMessaging,isSupported,onMessage}) => {
    if (!(await isSupported()) || !active) return
    unsubscribe = onMessage(getMessaging(app), ({data}) => {
      if (data?.badgeCount !== undefined) void updateAppBadge(Number(data.badgeCount))
    })
  }).catch(()=>{})
  return () => {active = false; unsubscribe?.()}
}
