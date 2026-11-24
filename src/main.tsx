import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { onSnapshot, query, where, type DocumentData, type Query } from 'firebase/firestore'
import { auth, configured, login, listsQuery, itemsRef, historyRef, initDefault, archiveList, patchList, patchItem, createList, saveItem, clearItems, removeItem, moveItem, rotateInvite, joinList, addSharedMember, removeMember, rememberName, userName, type List, type Item, type History } from './db'
import { guessCategory, normalize } from './catalog'
import { newItemsMessage, useNewItems } from './new-items'
import { updateAppBadge } from './app-badge.js'
import { registerPush, unregisterPush, storedDevice, changePushPreference, type PushDevice } from './push-device'
import { pushConfigured } from './push-config'
import { version } from '../package.json'
import './style.css'
import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true })

const NoticeContext = createContext('')
const inviteFromUrl = () => new URLSearchParams(location.hash.slice(1)).get('pozvanka') || ''
const selectedFromUrl = () => new URLSearchParams(location.search).get('seznam') || ''
const message = (error: unknown) => {
  const code = (error as {code?: string})?.code
  if (code === 'permission-denied') return 'K této změně nemáš oprávnění.'
  if (code === 'auth/unauthorized-domain') return 'Tato adresa zatím není povolená pro přihlášení.'
  if (code === 'auth/popup-blocked') return 'Povol v prohlížeči přihlašovací okno a zkus to znovu.'
  if (code === 'unavailable') return 'Připojení k databázi není dostupné.'
  return error instanceof Error && !code ? error.message : 'Akce se nezdařila. Zkus to znovu.'
}

function useDocuments<T>(source: () => Query<DocumentData> | undefined, key: string, fail: (error: unknown) => void) {
  const [state, setState] = useState({key:'',rows:[] as T[],pending:false,cached:false})
  useEffect(() => {
    const query = source()
    if (!query) return
    return onSnapshot(query, {includeMetadataChanges:true}, snapshot => {
      setState({key,rows:snapshot.docs.map(row => ({...row.data(),id:row.id}) as T),pending:snapshot.metadata.hasPendingWrites,cached:snapshot.metadata.fromCache})
    }, error => {
      setState({key:'',rows:[],pending:false,cached:false})
      fail(error)
    })
  }, [key])
  return state.key === key ? state : {key:'',rows:[] as T[],pending:false,cached:false}
}

function Brand() {
  return <span className="brand"><span className="symbol" aria-hidden="true">✓</span>Na<span>Nákup</span></span>
}

function Dialog({title,close,children}:{title:string;close:()=>void;children:ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null)
  const notice = useContext(NoticeContext)
  useEffect(() => { ref.current?.showModal() },[])
  return <dialog ref={ref} onCancel={event=>{event.preventDefault();close()}}>
    <div className="dialog-head"><h2>{title}</h2><button className="icon" aria-label="Zavřít" onClick={close}>×</button></div>
    {notice && <p className="dialog-notice" role="status">{notice}</p>}
    {children}
  </dialog>
}

function App() {
  const [user,setUser] = useState<User|null>()
  const [notice,setNotice] = useState('')
  const [theme,setTheme] = useState(localStorage.getItem('nanakup-theme') || 'system')
  const [online,setOnline] = useState(navigator.onLine)
  const [settings,setSettings] = useState(false)
  const [code,setCode] = useState(inviteFromUrl)
  const fail = (error:unknown) => setNotice(message(error))
  useEffect(() => onAuthStateChanged(auth, next => {
    if (!next) void updateAppBadge(0)
    setUser(next)
  }, fail),[])
  useEffect(() => {
    const update = () => {setOnline(navigator.onLine); if (navigator.onLine) void navigator.serviceWorker?.getRegistration().then(registration=>registration?.update()).catch(()=>{})}
    window.addEventListener('online',update)
    window.addEventListener('offline',update)
    window.addEventListener('focus',update)
    return () => {window.removeEventListener('online',update);window.removeEventListener('offline',update);window.removeEventListener('focus',update)}
  },[])
  useEffect(() => {document.documentElement.dataset.theme=theme;localStorage.setItem('nanakup-theme',theme)},[theme])
  return <NoticeContext.Provider value={notice}>
    <header><div className="top"><Brand/><button className="icon settings" onClick={()=>setSettings(true)} aria-label="Nastavení">⚙︎</button></div></header>
    {configured && user ? <Workspace key={user.uid} user={user} online={online} code={code} setCode={setCode} fail={fail} notify={setNotice} settings={settings} setSettings={setSettings} theme={theme} setTheme={setTheme}/> :
      <main className="welcome"><div className="welcome-mark" aria-hidden="true">✓</div>
        <h1>Co dnes nakoupíme?</h1><p>Jeden seznam pro celou domácnost. Přidej, co chybí, a v obchodě jen odškrtávej.</p>
        {configured ? <button className="primary" disabled={user===undefined} onClick={()=>void login().catch(fail)}>Přihlásit se přes Google</button> : <p>Přihlášení čeká na připojení Firebase.</p>}
        {code && <p>Pozvánka se otevře po přihlášení.</p>}
      </main>}
    {!user && settings && <Dialog title="Nastavení" close={()=>setSettings(false)}><Theme theme={theme} change={setTheme}/><small>NaNákup {version}</small></Dialog>}
    {notice && <aside className="notice" role="status">{notice}<button className="icon" aria-label="Skrýt zprávu" onClick={()=>setNotice('')}>×</button></aside>}
  </NoticeContext.Provider>
}

function Theme({theme,change}:{theme:string;change:(theme:string)=>void}) {
  return <label>Vzhled<select value={theme} onChange={event=>change(event.target.value)}><option value="system">Podle zařízení</option><option value="light">Světlý</option><option value="dark">Tmavý</option></select></label>
}

function OverviewRow({list,remaining,open,revealed,reveal,remove}:{list:List;remaining:number|undefined;open:()=>void;revealed:boolean;reveal:(value:boolean)=>void;remove?:()=>void}) {
  const start = useRef<{x:number;y:number;id:number} | null>(null)
  const swiped = useRef(false)
  const actionButton = useRef<HTMLButtonElement>(null)
  return <li className="overview-swipe" data-revealed={revealed}>
    {remove && <button ref={actionButton} className="overview-delete" tabIndex={revealed ? 0 : -1} aria-hidden={!revealed} aria-label={`Smazat seznam ${list.name}`} onClick={remove}>Smazat</button>}
    <button className="overview-row" aria-keyshortcuts={remove ? 'ArrowLeft ArrowRight' : undefined}
      onPointerDown={event=>{
        swiped.current = false
        start.current = remove && event.isPrimary && event.pointerType !== 'mouse' ? {x:event.clientX,y:event.clientY,id:event.pointerId} : null
      }}
      onPointerCancel={()=>{start.current = null}}
      onPointerUp={event=>{
        const origin = start.current
        start.current = null
        if (!origin || origin.id !== event.pointerId) return
        const x = event.clientX-origin.x
        const y = event.clientY-origin.y
        if (Math.abs(x) < 42 || Math.abs(x) < Math.abs(y)*1.35) return
        swiped.current = true
        reveal(x < 0)
      }}
      onKeyDown={event=>{
        if (!remove) return
        if (event.key === 'ArrowLeft') {
          event.preventDefault()
          reveal(true)
          requestAnimationFrame(()=>actionButton.current?.focus())
        } else if (event.key === 'ArrowRight' || event.key === 'Escape') reveal(false)
      }}
      onClick={event=>{
        if (event.detail && swiped.current) {swiped.current=false;return}
        if (revealed) reveal(false)
        else open()
      }}>
      <span className="overview-name">{list.name}</span>
      <span className="overview-count" aria-label={remaining===undefined?'Počet položek není dostupný':`${remaining} neodškrtnutých položek`}>{remaining ?? '–'}</span>
    </button>
  </li>
}

type WorkspaceProps = {user:User;online:boolean;code:string;setCode:(code:string)=>void;fail:(error:unknown)=>void;notify:(text:string)=>void;settings:boolean;setSettings:(open:boolean)=>void;theme:string;setTheme:(theme:string)=>void}
function Workspace({user,online,code,setCode,fail,notify,settings,setSettings,theme,setTheme}:WorkspaceProps) {
  const {rows,key,cached:listsCached} = useDocuments<List>(()=>listsQuery(user.uid),user.uid,fail)
  // Count all unchecked items across active lists, independently of the current view.
  const activeIds = rows.filter(list => !list.archived).map(list => list.id).sort()
  const activeIdsKey = JSON.stringify(activeIds)

  const [remainingByList,setRemainingByList] = useState<ReadonlyMap<string,number>>(() => new Map())

  useEffect(() => {
    if (!key) return
    const ids = JSON.parse(activeIdsKey) as string[]
    const counts = new Map<string, number>()
    const loaded = new Set<string>()

    if (!ids.length) {
      setRemainingByList(new Map())
      if (!listsCached) void updateAppBadge(0)
      return
    }

    const subscriptions = ids.map(id =>
      onSnapshot(
        query(itemsRef(id), where('done', '==', false)),
        {includeMetadataChanges:true},
        snapshot => {
          if (snapshot.metadata.fromCache && snapshot.empty && !loaded.has(id)) return
          counts.set(id, snapshot.size)
          loaded.add(id)
          setRemainingByList(new Map(counts))
          if (!listsCached && loaded.size === ids.length) {
            void updateAppBadge([...counts.values()].reduce((sum, count) => sum + count, 0))
          }
        },
        error => console.warn('Badge count unavailable', id, error)
      )
    )

    return () => subscriptions.forEach(unsubscribe => unsubscribe())
  }, [activeIdsKey,key,listsCached])

  const orderKey = 'nanakup:list-order:' + user.uid
  const [order,setOrder] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(orderKey) ?? '[]')
      return Array.isArray(saved) ? saved.filter((id):id is string=>typeof id==='string') : []
    } catch { return [] }
  })
  const [ordering,setOrdering] = useState(false)
  const positions = new Map(order.map((id,index)=>[id,index]))
  const lists = rows.filter(list=>!list.archived).sort((a,b)=>
    (positions.get(a.id) ?? order.length) - (positions.get(b.id) ?? order.length)
    || Number(b.id.startsWith('default-')) - Number(a.id.startsWith('default-'))
    || a.name.localeCompare(b.name,'cs'))
  function moveList(index:number,direction:-1|1) {
    const next = lists.map(list=>list.id)
    const destination = index+direction
    if (destination<0 || destination>=next.length) return
    ;[next[index],next[destination]] = [next[destination],next[index]]
    setOrder(next)
    try { localStorage.setItem(orderKey,JSON.stringify(next)) }
    catch { notify('Pořadí se nepodařilo uložit do zařízení.') }
  }
  const [selected,setSelected] = useState(selectedFromUrl)
  const [menu,setMenu] = useState<'join'|null>(code?'join':null)
  const [busy,setBusy] = useState(false)
  const [newList,setNewList] = useState('')
  const [revealedList,setRevealedList] = useState('')
  const [creating,setCreating] = useState(false)
  const [name,setName] = useState(userName(user))

  const [pushDevice,setPushDevice] = useState<PushDevice|null>(()=>storedDevice(user.uid))
  const [pushBusy,setPushBusy] = useState(false)

  // Attach the foreground FCM handler for messages routed to an open tab.
  // The Firestore listeners above own the foreground count.
  useEffect(() => {
    if (!pushDevice) return
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    void import('firebase/messaging').then(async ({getMessaging,isSupported,onMessage}) => {
      if (await isSupported() && !cancelled) unsubscribe = onMessage(getMessaging(auth.app), () => {})
    }).catch(() => {})
    return () => {cancelled = true; unsubscribe?.()}
  }, [pushDevice])

  async function togglePush() {
    if (pushBusy) return
    setPushBusy(true)
    try {
      if (pushDevice) {
        await unregisterPush(user.uid,pushDevice)
        setPushDevice(null)
        notify('Oznámení vypnuta.')
      } else {
        const device:PushDevice = {id:crypto.randomUUID(),muted:[]}
        await registerPush(user.uid,device,true)
        setPushDevice(device)
        notify('Oznámení zapnuta.')
      }
    } catch(error) {
      fail(error)
    } finally {
      setPushBusy(false)
    }
  }

  const list = lists.find(entry=>entry.id===selected)
  useEffect(() => {
    const restore = () => setSelected(selectedFromUrl())
    window.addEventListener('popstate',restore)
    return () => window.removeEventListener('popstate',restore)
  },[])
  function openList(id:string,replace=false) {
    const url = new URL(location.href)
    if (id) url.searchParams.set('seznam',id)
    else url.searchParams.delete('seznam')
    url.hash = ''
    if (replace) history.replaceState(null,'',url)
    else history.pushState(null,'',url)
    setSelected(id)
    setOrdering(false)
    setRevealedList('')
    window.scrollTo(0,0)
  }
  useEffect(() => {if(online) void initDefault(user).catch(fail)},[user.uid,online])
  async function addList(event:FormEvent) {
    event.preventDefault()
    const title = newList.trim()
    if (!title || !online || creating) return
    setCreating(true)
    try {
      openList(await createList(title,user))
      setNewList('')
    } catch(error) {fail(error)}
    finally {setCreating(false)}
  }
  async function join(event:FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      openList(await joinList(code,user),true)
      setCode('')
      setMenu(null)
    } catch(error) {fail(error)}
    finally {setBusy(false)}
  }
  return <main className="workspace">
    {list ? <>
      <nav className="list-nav" aria-label="Nákupní seznamy">
        <button className="secondary" onClick={()=>openList('')}>← Přehled</button>
        <select aria-label="Vybrat seznam" value={list.id} onChange={event=>openList(event.target.value,true)}>
          {lists.map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}
        </select>
      </nav>
      <ShoppingList key={list.id} list={list} sharedLists={lists} user={user} online={online} fail={fail} notify={notify} pushDevice={pushDevice} setPushDevice={setPushDevice}/>
    </> : <section className="overview">
      <div className="overview-heading">
        <h1>Nákupní seznamy</h1>
        {(lists.length>1 || ordering) && <button className="secondary" aria-pressed={ordering}
          onClick={()=>{setOrdering(!ordering);setRevealedList('')}}>{ordering?'Hotovo':'Seřadit'}</button>}
      </div>
      {lists.length ? <ul className="overview-lists">
        {lists.map((entry,index)=>ordering ? <li className="overview-order-row" key={entry.id}>
          <span className="overview-name">{entry.name}</span>
          <span className="overview-order-buttons">
            <button className="icon" aria-label={`Posunout seznam ${entry.name} nahoru`} disabled={index===0} onClick={()=>moveList(index,-1)}>↑</button>
            <button className="icon" aria-label={`Posunout seznam ${entry.name} dolů`} disabled={index===lists.length-1} onClick={()=>moveList(index,1)}>↓</button>
          </span>
        </li> : <OverviewRow key={entry.id} list={entry} remaining={remainingByList.get(entry.id)} open={()=>openList(entry.id)}
          revealed={revealedList===entry.id} reveal={value=>setRevealedList(value ? entry.id : '')}
          remove={entry.owner===user.uid && entry.id!=='default-'+user.uid ? ()=>{
            void archiveList(entry).catch(fail)
            setRevealedList('')
          } : undefined}/>)}
      </ul> : <p className="empty">{key ? 'Zatím tu nejsou žádné seznamy.' : 'Načítám seznamy…'}</p>}
      <div className="overview-actions">
        <form className="add overview-add" onSubmit={addList}>
          <input value={newList} onChange={event=>setNewList(event.target.value)} maxLength={120}
            aria-label="Název nového seznamu" placeholder="Název nového seznamu" enterKeyHint="done" disabled={creating}/>
          <button className="add-button" aria-label="Vytvořit seznam" disabled={!online || !newList.trim() || creating}>✓</button>
        </form>
        <button className="secondary" disabled={!online} onClick={()=>setMenu('join')}>Zadat kód pozvánky</button>
      </div>
    </section>}
    {menu==='join' && <Dialog title="Připojit se k seznamu" close={()=>setMenu(null)}>
      <form onSubmit={join}><label>Kód pozvánky<input value={code} onChange={event=>setCode(event.target.value.toUpperCase())} autoCapitalize="characters" autoComplete="off" maxLength={24} required/></label>
        <button className="primary" disabled={busy || !online}>Připojit se</button>
      </form>
    </Dialog>}
    {settings && <Dialog title="Nastavení" close={()=>setSettings(false)}>
      <Theme theme={theme} change={setTheme}/>
      <form onSubmit={event=>{event.preventDefault();void rememberName(user,name.trim(),lists).then(()=>notify('Jméno uloženo.')).catch(fail)}}>
        <label>Zobrazované jméno<input value={name} onChange={event=>setName(event.target.value)} maxLength={120} required/></label>
        <button className="secondary" disabled={!name.trim() || !online}>Uložit jméno</button>
      </form>
      <section>
        <strong>Oznámení</strong>
        <p><small>Upozornění na změny sdílených nákupních seznamů na tomto zařízení.</small></p>
        <button className="secondary" type="button"
          disabled={!online || pushBusy || !pushConfigured}
          onClick={()=>void togglePush()}>
          {pushBusy ? 'Ukládám…' : pushDevice ? 'Vypnout oznámení' : 'Zapnout oznámení'}
        </button>
        {!pushConfigured && <small>Oznámení zatím nejsou nakonfigurována.</small>}
      </section>
      <button className="secondary" onClick={()=>{void (pushDevice ? unregisterPush(user.uid,pushDevice).then(()=>setPushDevice(null)) : Promise.resolve()).then(()=>signOut(auth)).catch(fail);setSettings(false)}}>Odhlásit se</button>
      <small>NaNákup {version}</small>
    </Dialog>}
  </main>
}

type ShoppingProps = {list:List;sharedLists:List[];user:User;online:boolean;fail:(error:unknown)=>void;notify:(text:string)=>void;pushDevice:PushDevice|null;setPushDevice:(device:PushDevice|null)=>void}
function ShoppingList({list,sharedLists,user,online,fail,notify,pushDevice,setPushDevice}:ShoppingProps) {
  const items = useDocuments<Item>(()=>itemsRef(list.id),list.id,fail)
  const activity = useNewItems(list.id, user.uid, items.rows, items.key === list.id && !items.cached && !items.pending)
  const historyItems = useDocuments<History>(()=>historyRef(list.id),list.id,fail).rows
  const [draft,setDraft] = useState('')
  const [addingMember,setAddingMember] = useState('')

  const [pushSaving,setPushSaving] = useState(false)

  async function toggleListPush() {
    if (!pushDevice || pushSaving) return
    setPushSaving(true)
    try {
      const muted = !pushDevice.muted.includes(list.id)
      const updated = await changePushPreference(user.uid,pushDevice,list.id,muted)
      setPushDevice(updated)
      notify(muted ? 'Oznámení seznamu ztlumena.' : 'Oznámení seznamu zapnuta.')
    } catch(error) {
      fail(error)
    } finally {
      setPushSaving(false)
    }
  }

  const candidates = new Map<string,{sourceId:string;name:string}>()
  if (list.owner===user.uid) {
    for (const source of sharedLists) {
      for (const uid of source.memberIds) {
        if (!list.memberIds.includes(uid) && !candidates.has(uid) && source.names[uid]) {
          candidates.set(uid,{sourceId:source.id,name:source.names[uid]})
        }
      }
    }
  }
  async function addMember(uid:string,sourceId:string,name:string) {
    setAddingMember(uid)
    try { await addSharedMember(list.id,sourceId,uid,name) }
    catch(error) { fail(error) }
    finally { setAddingMember('') }
  }
  const [qty,setQty] = useState('')
  const [suggest,setSuggest] = useState(false)
  const [edit,setEdit] = useState<Item|null>(null)
  const [duplicate,setDuplicate] = useState<{item:Omit<Item,'id'>;match:Item}|null>(null)
  const [panel,setPanel] = useState<'share'|'options'|null>(null)
  const [confirmation,setConfirmation] = useState<{title:string;run:()=>Promise<unknown>}|null>(null)
  const [listName,setListName] = useState(list.name)
  const [categoryName,setCategoryName] = useState('')
  const nameInput = useRef<HTMLInputElement>(null)
  const qtyInput = useRef<HTMLInputElement>(null)
  const owner = list.owner === user.uid
  const open = items.rows.filter(item=>!item.done).sort((a,b)=>a.rank-b.rank || a.id.localeCompare(b.id))
  const done = items.rows.filter(item=>item.done).sort((a,b)=>a.name.localeCompare(b.name,'cs'))
  const suggestions = suggest && draft.trim() ? historyItems.filter(entry=>normalize(entry.name).includes(normalize(draft)) && normalize(entry.name)!==normalize(draft)).sort((a,b)=>(b.count||0)-(a.count||0)).slice(0,5) : []
  const action = (promise:Promise<unknown>) => void promise.catch(fail)
  function add(event:FormEvent) {
    event.preventDefault()
    const name = draft.trim()
    if (!name) {nameInput.current?.focus();return}
    const known = historyItems.find(entry=>normalize(entry.name)===normalize(name))
    const item = {name,qty:qty.trim(),category:known?.category || guessCategory(name),done:false,rank:Math.max(Date.now(),(open.at(-1)?.rank ?? 0)+1),author:user.uid}
    const match = open.find(entry=>normalize(entry.name)===normalize(name))
    if (match) {setDuplicate({item,match});return}
    finishAdd(item)
  }
  function finishAdd(item:Omit<Item,'id'>,merge?:Item) {
    const merged = merge && merge.qty && item.qty ? merge.qty+' + '+item.qty : merge?.qty || item.qty
    if (merge && merged.length>80) {notify('Sloučené množství je příliš dlouhé. Uprav množství položky.');return}
    action(saveItem(list.id,merge ? {...item,qty:merged,category:merge.category}:item,undefined,merge?.id))
    setDuplicate(null);setDraft('');setQty('');setSuggest(false)
    if (duplicate) requestAnimationFrame(()=>nameInput.current?.focus())
    else nameInput.current?.focus()
    navigator.vibrate?.(12)
  }
  function row(item:Item,index?:number) {
    const isNew = !item.done && activity.badges.has(item.id)
    return <li className={item.done?'done item':'item'} key={item.id}>
      <button className="check-row" role="checkbox" aria-checked={item.done} aria-label={[item.name,item.qty,isNew ? 'Nové' : ''].filter(Boolean).join(' · ')} onClick={()=>{action(patchItem(list.id,item.id,{done:!item.done}));navigator.vibrate?.(12)}}>
        <span className="checkbox" aria-hidden="true">{item.done?'✓':''}</span><span className="item-label"><span className="item-name">{item.name}</span>{item.qty && <span className="qty">{item.qty}</span>}{isNew && <span className="new-badge">Nové</span>}</span>
      </button>
      {index!==undefined && <button className="icon move" disabled={index===0} aria-label={`Posunout ${item.name} nahoru`} onClick={()=>action(moveItem(list.id,item,open[index-1]))}>↑</button>}
      <button className="icon item-options" aria-label={`Upravit ${item.name}`} onClick={()=>setEdit(item)}>⋮</button>
    </li>
  }
  function exportList() {
    const text = [list.name,...open.map(item=>`☐ ${item.name} ${item.qty}`.trim()),...done.map(item=>`✓ ${item.name} ${item.qty}`.trim())].join('\n')
    const url = URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}))
    const link = document.createElement('a');link.href=url;link.download=list.name+'.txt';link.click()
    window.setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  return <>
    <section className="list-heading">
      <div><div className="sync" data-status={!online ? "offline" : items.pending || items.cached ? "pending" : "ready"} aria-live="polite"><span/>{!online?'Offline':items.pending?'Synchronizuji…':items.cached?'Načítám změny…':'Synchronizováno'}</div><h1>{list.name}</h1><p>{open.length===0?'Vše odškrtnuto':`${open.length} ${open.length===1?'položka':open.length<5?'položky':'položek'} k nákupu`}</p></div>
      <div className="heading-actions"><button className="secondary" onClick={()=>setPanel('share')}>Sdílet</button><button className="icon" aria-label="Možnosti seznamu" onClick={()=>{setListName(list.name);setPanel('options')}}>⋮</button></div>
    </section>
    <div className="entry">
      <form className="add" onSubmit={add}>
        <input ref={nameInput} value={draft} onChange={event=>{setDraft(event.target.value);setSuggest(true)}} onFocus={()=>setSuggest(true)} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();qtyInput.current?.focus();setSuggest(false)} if(event.key==='Escape')setSuggest(false)}} placeholder="Co koupit?" aria-label="Název položky" enterKeyHint="next" maxLength={120} autoComplete="off"/>
        <input ref={qtyInput} value={qty} onFocus={()=>setSuggest(false)} onChange={event=>setQty(event.target.value)} placeholder="Množství" aria-label="Množství" enterKeyHint="done" maxLength={80} autoComplete="off"/>
        <button className="add-button" aria-label="Přidat položku" onPointerDown={event=>event.preventDefault()}>✓</button>
      </form>
      {suggestions.length>0 && <div className="suggestions" aria-label="Návrhy z historie">{suggestions.map(entry=><button key={entry.id} onPointerDown={event=>event.preventDefault()} onClick={()=>{setDraft(entry.name);setQty(entry.qty);setSuggest(false);qtyInput.current?.focus()}}>{entry.name}<span>{entry.qty}</span></button>)}</div>}
    </div>
    <div className="activity-status" role="status" aria-atomic="true">{activity.count > 0 && newItemsMessage(activity.count)}</div>
    {activity.count > 0 && <div className="activity-banner">
      <span aria-hidden="true">{newItemsMessage(activity.count)}</span>
      <button className="icon" aria-label="Skrýt upozornění na nové položky" onClick={activity.dismiss}>×</button>
    </div>}
    {open.length===0 && <div className="empty"><span aria-hidden="true">✓</span><p>{done.length ? 'Nákup je odškrtnutý.' : 'Přidej první položku.'}</p></div>}
    {list.manual ? <ul>{open.map(row)}</ul> : list.categories.map(category=>{
      const entries = open.filter(item=>item.category===category.id || (category.id==='other'&&!list.categories.some(entry=>entry.id===item.category)))
      return entries.length || !list.hideEmpty ? <section key={category.id} className="category"><h2><span aria-hidden="true">{category.mark}</span>{category.label}<small>{entries.length}</small></h2><ul>{entries.map(item=>row(item))}</ul></section> : null
    })}
    {done.length>0 && <section className="category bought"><div className="bought-title"><h2><span aria-hidden="true">✓</span>Nakoupeno <small>{done.length}</small></h2><button className="quiet" onClick={()=>setConfirmation({title:'Smazat všechny nakoupené položky?',run:()=>clearItems(list.id,done)})}>Vymazat</button></div><ul>{done.map(item=>row(item))}</ul></section>}
    {edit && <Dialog title="Upravit položku" close={()=>setEdit(null)}>
      <form onSubmit={event=>{event.preventDefault();if(edit.name.trim()){action(saveItem(list.id,{...edit,name:edit.name.trim(),qty:edit.qty.trim()},edit.id));setEdit(null)}}}>
        <label>Název<input value={edit.name} onChange={event=>setEdit({...edit,name:event.target.value})} maxLength={120} required/></label>
        <label>Množství<input value={edit.qty} onChange={event=>setEdit({...edit,qty:event.target.value})} maxLength={80}/></label>
        <label>Kategorie<select value={edit.category} onChange={event=>setEdit({...edit,category:event.target.value})}>{list.categories.map(category=><option key={category.id} value={category.id}>{category.label}</option>)}</select></label>
        <div className="inline"><button className="primary">Uložit</button><button type="button" className="danger" onClick={()=>{action(removeItem(list.id,edit.id));setEdit(null)}}>Odstranit</button></div>
      </form>
    </Dialog>}
    {duplicate && <Dialog title="Položka už je v seznamu" close={()=>setDuplicate(null)}><p>{duplicate.match.name} {duplicate.match.qty}</p><div className="inline"><button className="primary" onClick={()=>finishAdd(duplicate.item,duplicate.match)}>Sloučit množství</button><button className="secondary" onClick={()=>finishAdd(duplicate.item)}>Přidat zvlášť</button></div></Dialog>}
    {panel==='share' && <Dialog title="Sdílení seznamu" close={()=>setPanel(null)}>
      {owner && <div className="share-block">{list.invite ? <>
        <div className="share-code">{list.invite.match(/.{1,4}/g)?.join('–')}</div>
        {list.invite.length === 4 && <p>Kód a odkaz platí 10 minut od vytvoření.</p>}
        <button className="quiet" disabled={!online} onClick={()=>action(rotateInvite(list))}>Vygenerovat nový kód</button>
        <button className="primary" onClick={()=>{const url=new URL(location.pathname,location.origin);url.hash=new URLSearchParams({pozvanka:list.invite}).toString();void navigator.clipboard.writeText(url.href).then(()=>notify('Odkaz zkopírován.')).catch(fail)}}>Kopírovat odkaz</button>
        <button className="quiet" disabled={!online} onClick={()=>action(rotateInvite(list,true))}>Zneplatnit pozvánku</button>
      </> : <button className="primary" disabled={!online} onClick={()=>action(rotateInvite(list))}>Vytvořit pozvánku</button>}</div>}
      {owner && candidates.size>0 && <div className="share-block">
        <h3>Lidé z dalších seznamů</h3>
        <ul className="members">{[...candidates].map(([uid,person])=><li key={uid}>
          <span>{person.name}</span>
          <button className="secondary" disabled={!online || Boolean(addingMember)}
            aria-label={`Přidat ${person.name}`} onClick={()=>void addMember(uid,person.sourceId,person.name)}>
            {addingMember===uid?'Přidávám…':'✓ Přidat'}
          </button>
        </li>)}</ul>
      </div>}
      <h3>Členové</h3><ul className="members">{list.memberIds.map(uid=><li key={uid}><span>{list.names[uid] || 'Člen'}{uid===list.owner?' · vlastník':''}</span>{owner && uid!==user.uid&&<button className="quiet" disabled={!online} onClick={()=>setConfirmation({title:`Odebrat člena ${list.names[uid] || 'Člen'}?`,run:()=>removeMember(list,uid,true)})}>Odebrat</button>}</li>)}</ul>
      {pushDevice && <label className="switch">
        <input type="checkbox"
          checked={pushDevice.muted.includes(list.id)}
          disabled={!online || pushSaving}
          onChange={()=>void toggleListPush()}/>
        Ztlumit oznámení tohoto seznamu
      </label>}
      {!owner && <button className="danger" disabled={!online} onClick={()=>setConfirmation({title:'Opustit sdílený seznam?',run:()=>removeMember(list,user.uid,false)})}>Opustit seznam</button>}
    </Dialog>}
    {panel==='options' && <Dialog title="Možnosti seznamu" close={()=>setPanel(null)}>
      <button className="secondary" onClick={exportList}>Exportovat jako text</button>
      {owner && <>
        <form className="inline" onSubmit={event=>{event.preventDefault();if(listName.trim())action(patchList(list.id,{name:listName.trim()}))}}><input value={listName} onChange={event=>setListName(event.target.value)} aria-label="Název seznamu" maxLength={120}/><button className="secondary">Přejmenovat</button></form>
        <label className="switch"><input type="checkbox" checked={list.hideEmpty} onChange={event=>action(patchList(list.id,{hideEmpty:event.target.checked}))}/>Skrýt prázdné kategorie</label>
        <label className="switch"><input type="checkbox" checked={list.manual} onChange={event=>action(patchList(list.id,{manual:event.target.checked}))}/>Ruční pořadí položek</label>
        <h3>Pořadí kategorií</h3>
        <ul className="members">{list.categories.map((category,index)=><li key={category.id}>
          {category.id.startsWith('custom-') ? <input aria-label={`Přejmenovat ${category.label}`} key={category.label} defaultValue={category.label} maxLength={50} onBlur={event=>{const label=event.target.value.trim();if(label&&label!==category.label)action(patchList(list.id,{categories:list.categories.map(entry=>entry.id===category.id?{...entry,label}:entry)}))}}/> : <span>{category.label}</span>}
          <button className="icon" disabled={!index} aria-label={`Posunout ${category.label} nahoru`} onClick={()=>{const next=list.categories.slice();[next[index-1],next[index]]=[next[index],next[index-1]];action(patchList(list.id,{categories:next}))}}>↑</button>
        </li>)}</ul>
        <form className="inline" onSubmit={event=>{event.preventDefault();if(!categoryName.trim())return;action(patchList(list.id,{categories:[...list.categories,{id:'custom-'+crypto.randomUUID(),label:categoryName.trim(),mark:'◇'}]}));setCategoryName('')}}><input value={categoryName} onChange={event=>setCategoryName(event.target.value)} maxLength={50} aria-label="Nová kategorie" placeholder="Nová kategorie"/><button className="secondary" disabled={list.categories.length>=50}>Přidat</button></form>
        {list.id!=='default-'+user.uid&&<button className="danger" onClick={()=>setConfirmation({title:'Smazat tento seznam?',run:()=>archiveList(list)})}>Smazat seznam</button>}
      </>}
    </Dialog>}
    {confirmation && <Dialog title={confirmation.title} close={()=>setConfirmation(null)}><div className="inline"><button className="secondary" onClick={()=>setConfirmation(null)}>Zrušit</button><button className="danger" onClick={()=>{action(confirmation.run());setConfirmation(null)}}>Potvrdit</button></div></Dialog>}
  </>
}

createRoot(document.getElementById('root')!).render(<App/>)
