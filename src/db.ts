import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, updateProfile, type User } from 'firebase/auth'
import { collection, doc, getDocFromServer, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, setDoc, updateDoc, query, where, writeBatch, increment, serverTimestamp, arrayUnion, arrayRemove, FieldPath, runTransaction } from 'firebase/firestore'
import { firebaseConfig } from './firebase-config'
import { pushConfigured } from './push-config'
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
function commitListChange(id: string, batch: ReturnType<typeof writeBatch>) {
  const uid = auth.currentUser?.uid
  if (uid && pushConfigured) batch.set(doc(listRef(id),'pushActors',uid),{pendingAt:serverTimestamp()})
  return batch.commit()
}
export function patchList(id: string, data: Partial<List>) {
  const batch = writeBatch(db).update(listRef(id),data)
  return commitListChange(id,batch)
}
export function patchItem(list: string, item: string, data: Partial<Item>) {
  return commitListChange(list,writeBatch(db).update(itemRef(list,item),data))
}
export function removeItem(list: string, item: string) {
  return commitListChange(list,writeBatch(db).delete(itemRef(list,item)))
}
export function rememberName(user: User, name: string, lists: List[]) {
  return Promise.all([updateProfile(user,{displayName:name}), ...lists.map(list => updateDoc(listRef(list.id),new FieldPath('names',user.uid),name))])
}
export function saveItem(list: string, item: Omit<Item,'id'>, existing?: string, merge?: string) {
  const batch = writeBatch(db)
  if (merge) batch.update(itemRef(list,merge),{qty:item.qty})
  else if (existing) batch.update(itemRef(list,existing),{name:item.name,qty:item.qty,category:item.category})
  else batch.set(doc(itemsRef(list)),item)
  const historyId = encodeURIComponent(normalize(item.name))
  const history = {name:item.name,qty:item.qty,category:item.category}
  batch.set(doc(historyRef(list),historyId),existing ? history : {...history,count:increment(1)},{merge:true})
  return commitListChange(list,batch)
}
export async function clearItems(list: string, items: Item[]) {
  for (let i=0;i<items.length;i+=400) {
    const batch = writeBatch(db)
    items.slice(i,i+400).forEach(item => batch.delete(itemRef(list,item.id)))
    await commitListChange(list,batch)
  }
}
export function moveItem(list: string, first: Item, second: Item) {
  const batch = writeBatch(db)
  batch.update(itemRef(list,first.id),{rank:second.rank})
  batch.update(itemRef(list,second.id),{rank:first.rank})
  return commitListChange(list,batch)
}
export async function rotateInvite(list: List, revoke = false) {
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
  const code = Array.from(crypto.getRandomValues(new Uint8Array(12)),byte=>alphabet[byte & 31]).join('')
  const batch = writeBatch(db)
  if (list.invite) batch.delete(doc(db,'invites',list.invite))
  if (!revoke) batch.set(doc(db,'invites',code),{listId:list.id})
  batch.update(listRef(list.id),{invite:revoke ? '' : code})
  await batch.commit()
}
export async function joinList(raw: string, user: User) {
  const code = raw.toUpperCase().replace(/[\s–—-]/g,'')
  if (!/^[23456789A-HJ-NP-Z]{12}$/.test(code)) throw new Error('Zkontroluj dvanáctimístný kód.')
  const invite = await getDocFromServer(doc(db,'invites',code))
  if (!invite.exists()) throw new Error('Pozvánka už není platná.')
  const id = invite.data().listId as string
  await updateDoc(listRef(id),'memberIds',arrayUnion(user.uid),new FieldPath('names',user.uid),userName(user),'joinCode',code)
  return id
}
export function removeMember(list: List, uid: string, revoke: boolean) {
  const batch = writeBatch(db)
  if (revoke && list.invite) {
    batch.delete(doc(db,'invites',list.invite))
    batch.update(listRef(list.id),{memberIds:arrayRemove(uid),invite:''})
  } else batch.update(listRef(list.id),{memberIds:arrayRemove(uid)})
  return batch.commit()
}
