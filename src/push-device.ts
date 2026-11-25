import { doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore'
import { app, db } from './db'

import { pushConfigured, vapidKey } from './push-config'

import { localKey, type PushDevice } from './push-device-storage'
export { storedDevice, type PushDevice } from './push-device-storage'

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
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(
        'Service worker se nespustil do 10 sekund. Otevři aplikaci znovu.'
      )), 10000)
    )
  ])

  if (!registration.active) {
    throw new Error('Služba oznámení není aktivní.')
  }

  const token = await getToken(getMessaging(app),{vapidKey,serviceWorkerRegistration:registration})
  if (!token) throw new Error('Zařízení se nepodařilo přihlásit k odběru oznámení.')
  await setDoc(deviceRef(device.id),{uid,token,muted:device.muted,badgeExcluded:device.badgeExcluded})
  store(uid,device)
}

export async function unregisterPush(uid:string,device:PushDevice) {
  await deleteDoc(deviceRef(device.id))
  localStorage.removeItem(localKey(uid))
  const { getMessaging,deleteToken,isSupported } = await import('firebase/messaging')
  if (await isSupported()) await deleteToken(getMessaging(app)).catch(()=>{})
}

export async function changePushPreference(uid:string,device:PushDevice,listId:string,field:'muted'|'badgeExcluded',excluded:boolean) {
  const values = excluded ? [...new Set([...device[field],listId])] : device[field].filter(id=>id!==listId)
  const next = {...device,[field]:values}
  await updateDoc(deviceRef(device.id),{[field]:values})
  store(uid,next)
  return next
}
