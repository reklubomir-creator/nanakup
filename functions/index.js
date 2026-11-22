import { createHash } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { error as logError } from 'firebase-functions/logger'

initializeApp()
const db = getFirestore()
const quietTime = 45_000
const appUrl = 'https://reklubomir-creator.github.io/nanakup/'

export function recipients(members, editors) {
  return members.filter(uid => [...editors].some(editor => editor !== uid))
}

async function sendListUpdate(list, actors) {
  if (actors.empty || actors.docs.some(actor => actor.updateTime.toMillis() > Date.now() - quietTime)) return
  const listSnapshot = await list.get()
  const members = listSnapshot.get('memberIds')
  if (listSnapshot.exists && !listSnapshot.get('archived') && Array.isArray(members)) {
    const membersSet = new Set(members)
    const editors = new Set(actors.docs.map(actor => actor.id).filter(uid => membersSet.has(uid)))
    const targetUsers = recipients([...membersSet], editors)
    const tag = createHash('sha256').update(list.id).digest('hex').slice(0,32)
    const name = listSnapshot.get('name')
    const url = new URL(appUrl)
    url.searchParams.set('seznam',list.id)

    for (const uid of targetUsers) {
      const devices = await db.collection('pushDevices').where('uid','==',uid).get()
      for (const device of devices.docs) {
        const { token, muted } = device.data()
        if (!token || muted?.includes(list.id)) continue
        try {
          await getMessaging().send({
            token,
            notification:{title:typeof name === 'string' ? name : 'NaNákup',body:'Nákupní seznam byl upraven.'},
            webpush:{
              headers:{TTL:'600',Topic:tag},
              notification:{tag,icon:appUrl+'icon-192.png',renotify:false},
              fcmOptions:{link:url.href}
            }
          })
        } catch(error) {
          if (error.code !== 'messaging/registration-token-not-registered' && error.code !== 'messaging/invalid-registration-token') throw error
          await device.ref.delete({lastUpdateTime:device.updateTime}).catch(reason => {
            if (reason.code !== 9 && reason.code !== 5) throw reason
          })
        }
      }
    }
  }
  await db.runTransaction(async transaction => {
    const latest = await transaction.getAll(...actors.docs.map(actor=>actor.ref))
    latest.forEach((doc,index)=>{
      if (doc.exists && doc.updateTime.isEqual(actors.docs[index].updateTime)) transaction.delete(doc.ref)
    })
  })
}

export const sendListUpdates = onSchedule({
  schedule:'every 1 minutes',region:'europe-west3',maxInstances:1,concurrency:1,timeoutSeconds:120
},async () => {
  const due = await db.collectionGroup('pushActors').where('pendingAt','<=',Timestamp.fromMillis(Date.now()-quietTime)).limit(100).get()
  const lists = new Map(due.docs.map(document => [document.ref.parent.parent.path,document.ref.parent.parent]))
  for (const list of lists.values()) {
    try {
      await sendListUpdate(list,await list.collection('pushActors').get())
    } catch(error) {
      logError('Push delivery did not complete', {list:list.id,code:error.code ?? 'unknown'})
    }
  }
})
