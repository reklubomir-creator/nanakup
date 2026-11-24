import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, updateProfile, type User } from 'firebase/auth'
import { collection, doc, getDocFromServer, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, setDoc, updateDoc, deleteDoc, query, where, writeBatch, increment, serverTimestamp, arrayUnion, arrayRemove, FieldPath, runTransaction } from 'firebase/firestore'
import { firebaseConfig } from './firebase-config'
import { pushConfigured } from './push-config'
import { storedDevice } from './push-device-storage'
import { categories, normalize, type Category } from './catalog'

export const configured = firebaseConfig.apiKey !== 'unconfigured'
export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = initializeFirestore(app, {localCache: persistentLocalCache({tabManager: persistentMultipleTabManager()})})
export const login = () => signInWithPopup(auth, new GoogleAuthProvider())
export type List = { id: string; name: string; owner: string; memberIds: string[]; names: Record<string,string>; categories: Category[]; manual: boolean; hideEmpty: boolean; archived: boolean; invite: string }
export type Item = { id: string; name: string; qty: string; category: string; done: boolean; rank: number; author: string }
export type History = { id: string; name: string; qty: string; category: string; count: number }
export const listRef = (id: string) => doc(db,'lists',id)
export const itemsRef = (id: string) => collection(listRef(id),'items')
export const historyRef = (id: string) => collection(listRef(id),'history')
export const listsQuery = (uid: string) => query(collection(db,'lists'),where('memberIds','array-contains',uid))
export const itemRef = (id: string, item: string) => doc(itemsRef(id),item)
export const userName = (user: User) => user.displayName || 'Člen'
export function listData(name: string, user: User) {
  return {name,owner:user.uid,memberIds:[user.uid],names:{[user.uid]:userName(user)},categories,manual:false,hideEmpty:true,archived:false,invite:''}
}
export async function initDefault(user: User) {
  const ref = listRef('default-' + user.uid)
  await runTransaction(db, async transaction => {
    if (!(await transaction.get(ref)).exists()) transaction.set(ref,listData('Běžný nákup',user))
  })
}
export function createList(name: string, user: User) {
  const ref = doc(collection(db,'lists'))
  return setDoc(ref,listData(name,user)).then(() => ref.id)
}
function commitListChange(id: string, batch: ReturnType<typeof writeBatch>, affected?: string[]) {
  const uid = auth.currentUser?.uid
  if (uid && pushConfigured) {
    const deviceId = storedDevice(uid)?.id ?? ''
    const actors = collection(listRef(id), 'pushActors')
    const actor = affected ? doc(actors) : doc(actors, uid + ':' + deviceId)
    batch.set(actor, {uid, deviceId, pendingAt: serverTimestamp(), ...(affected ? {affected} : {})})
  }
  return batch.commit()
}

export function archiveList(list: List) {
  return commitListChange(list.id, writeBatch(db).update(listRef(list.id), {archived:true}), list.memberIds)
}

export function patchList(id: string, data: Partial<List>) {
  return commitListChange(id, writeBatch(db).update(listRef(id), data))
}

export function patchItem(list: string, item: string, data: Partial<Item>) {
  return commitListChange(list, writeBatch(db).update(itemRef(list, item), data))
}

export function removeItem(list: string, item: string) {
  return commitListChange(list, writeBatch(db).delete(itemRef(list, item)))
}

export function rememberName(user: User, name: string, lists: List[]) {
  return Promise.all([updateProfile(user,{displayName:name}), ...lists.map(list => updateDoc(listRef(list.id),new FieldPath('names',user.uid),name))])
}
export function saveItem(list: string, item: Omit<Item,'id'>, existing?: string, merge?: string) {
  const batch = writeBatch(db)
  if (merge) batch.update(itemRef(list,merge),{qty:item.qty})
  else if (existing) batch.update(itemRef(list,existing),{name:item.name,qty:item.qty,category:item.category})
  const newItem = !merge && !existing ? doc(itemsRef(list)) : undefined
  if (newItem) batch.set(newItem,item)
  const historyId = encodeURIComponent(normalize(item.name))
  const history = {name:item.name,qty:item.qty,category:item.category}
  batch.set(doc(historyRef(list),historyId),existing ? history : {...history,count:increment(1)},{merge:true})
  return commitListChange(list, batch)
}
export async function clearItems(list: string, items: Item[]) {
  for (let i=0;i<items.length;i+=400) {
    const batch = writeBatch(db)
    items.slice(i,i+400).forEach(item => batch.delete(itemRef(list,item.id)))
    await commitListChange(list, batch)
  }
}
export function moveItem(list: string, first: Item, second: Item) {
  const batch = writeBatch(db)
  batch.update(itemRef(list,first.id),{rank:second.rank})
  batch.update(itemRef(list,second.id),{rank:first.rank})
  return batch.commit()
}
export async function rotateInvite(list: List, revoke = false) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  while (code.length < 4 && !revoke) {
    for (const byte of crypto.getRandomValues(new Uint8Array(8))) {
      if (byte < 252) code += alphabet[byte % 36]
      if (code.length === 4) break
    }
  }
  const batch = writeBatch(db)
  if (list.invite) batch.delete(doc(db,'invites',list.invite))
  if (!revoke) batch.set(doc(db,'invites',code),{listId:list.id,createdAt:serverTimestamp()})
  batch.update(listRef(list.id),{invite:revoke ? '' : code})
  await batch.commit()
}
export async function joinList(raw: string, user: User) {
  const code = raw.toUpperCase().replace(/[\s–—-]/g,'')
  if (!/^(?:[A-Z0-9]{4}|[23456789A-HJ-NP-Z]{12})$/.test(code)) throw new Error('Zkontroluj kód pozvánky.')
  const invite = await getDocFromServer(doc(db,'invites',code)).catch(error=>{
    if (error.code === 'permission-denied') throw new Error('Kód pozvánky je neplatný nebo vypršel.')
    throw error
  })
  if (!invite.exists()) throw new Error('Pozvánka už není platná.')
  const id = invite.data().listId as string
  const batch = writeBatch(db).update(listRef(id),'memberIds',arrayUnion(user.uid),new FieldPath('names',user.uid),userName(user),'joinCode',code)
  await commitListChange(id, batch, [user.uid])
  return id
}
export function removeMember(list: List, uid: string, revoke: boolean) {
  const batch = writeBatch(db)
  if (revoke && list.invite) {
    batch.delete(doc(db,'invites',list.invite))
    batch.update(listRef(list.id),{memberIds:arrayRemove(uid),invite:''})
  } else batch.update(listRef(list.id),{memberIds:arrayRemove(uid)})
  return commitListChange(list.id, batch, [uid])
}

export function addSharedMember(listId: string, sourceId: string, uid: string, name: string) {
  const batch = writeBatch(db).update(listRef(listId),'memberIds',arrayUnion(uid),new FieldPath('names',uid),name,
    'memberGrant',{sourceId,uid})
  return commitListChange(listId, batch, [uid])
}
