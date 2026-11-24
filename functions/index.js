import { createHash } from 'node:crypto'
import { initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { error as logError, info } from 'firebase-functions/logger'
import { affectedUsers, messageKind } from './push-routing.js'

initializeApp()
const db = getFirestore()
const quietTime = 60_000
const appUrl = 'https://reklubomir-creator.github.io/nanakup/'

async function countUncheckedItems(uid) {
  const lists = await db.collection('lists').where('memberIds', 'array-contains', uid).get()
  const counts = await Promise.all(lists.docs.filter(list => !list.get('archived')).map(list =>
    list.ref.collection('items').where('done', '==', false).count().get()
  ))
  return counts.reduce((total, count) => total + count.data().count, 0)
}

async function sendListUpdate(list, actors) {
  if (actors.empty || actors.docs.some(actor => actor.updateTime.toMillis() > Date.now() - quietTime)) return
  const snapshot = await list.get()
  const listData = snapshot.data()
  const changes = actors.docs.map(actor => ({uid:actor.id, ...actor.data()}))
  const tag = createHash('sha256').update(list.id).digest('hex').slice(0,32)
  const counts = {accepted:0, stale:0, failed:0}

  for (const uid of affectedUsers(listData, changes)) {
    const devices = await db.collection('pushDevices').where('uid','==',uid).get()
    const targets = devices.docs.flatMap(device => {
      const { token, muted } = device.data()
      if (!token || muted?.includes(list.id)) return []
      const kind = messageKind(listData, changes, uid, device.id)
      return kind ? [{device,token,kind}] : []
    })
    if (!targets.length) continue

    const badgeCount = await countUncheckedItems(uid)
    for (const {device,token,kind} of targets) {
      const url = new URL(appUrl)
      if (kind === 'list') url.searchParams.set('seznam',list.id)
      try {
        await getMessaging().send({
          token,
          data:{badgeCount:String(badgeCount)},
          notification: kind === 'list'
            ? {title:typeof listData.name === 'string' ? listData.name : 'NaNákup',body:'Nákupní seznam byl upraven.'}
            : {title:'NaNákup',body:'Počet položek k nákupu byl aktualizován.'},
          webpush:{
            headers:{TTL:'600'},
            notification:{tag:kind === 'list' ? tag : 'nanakup-badge',icon:appUrl+'icon-192.png',renotify:false},
            fcmOptions:{link:url.href}
          }
        })
        counts.accepted++
      } catch(error) {
        if (error.code !== 'messaging/registration-token-not-registered' && error.code !== 'messaging/invalid-registration-token') {
          counts.failed++
          logError('FCM rejected notification', {code:error.code ?? 'unknown'})
          continue
        }
        counts.stale++
        await device.ref.delete({lastUpdateTime:device.updateTime}).catch(reason => {
          if (reason.code !== 9 && reason.code !== 5) throw reason
        })
      }
    }
  }

  info('NaNákup push batch', {changes:changes.length,...counts})
  if (counts.failed) return
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
      logError('Push delivery did not complete', {code:error.code ?? 'unknown'})
    }
  }
})
