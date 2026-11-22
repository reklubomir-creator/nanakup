import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { onAuthStateChanged, signOut, type User } from 'firebase/auth'
import { onSnapshot, type DocumentData, type Query } from 'firebase/firestore'
import { auth, configured, login, listsQuery, itemsRef, historyRef, initDefault, patchList, patchItem, createList, saveItem, clearItems, removeItem, moveItem, rotateInvite, joinList, removeMember, rememberName, userName, type List, type Item, type History } from './db'
import { guessCategory, normalize } from './catalog'
import './style.css'

const version = '0.9.1'
const NoticeContext = createContext('')
const inviteFromUrl = () => new URLSearchParams(location.hash.slice(1)).get('pozvanka') || ''
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
  useEffect(() => onAuthStateChanged(auth,setUser,fail),[])
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

type WorkspaceProps = {user:User;online:boolean;code:string;setCode:(code:string)=>void;fail:(error:unknown)=>void;notify:(text:string)=>void;settings:boolean;setSettings:(open:boolean)=>void;theme:string;setTheme:(theme:string)=>void}
function Workspace({user,online,code,setCode,fail,notify,settings,setSettings,theme,setTheme}:WorkspaceProps) {
  const {rows,key} = useDocuments<List>(()=>listsQuery(user.uid),user.uid,fail)
  const lists = rows.filter(list=>!list.archived).sort((a,b)=>Number(b.id.startsWith('default-'))-Number(a.id.startsWith('default-')) || a.name.localeCompare(b.name,'cs'))
  const [selected,setSelected] = useState('')
  const [menu,setMenu] = useState<'lists'|'join'|null>(code?'join':null)
  const [busy,setBusy] = useState(false)
  const [newList,setNewList] = useState('')
  const [name,setName] = useState(userName(user))
  const list = lists.find(entry=>entry.id===selected) ?? lists[0]
  useEffect(() => {if(online) void initDefault(user).catch(fail)},[user.uid,online])
  async function join(event:FormEvent) {
    event.preventDefault()
    setBusy(true)
    try {
      setSelected(await joinList(code,user))
      setCode('')
      history.replaceState(null,'',location.pathname)
      setMenu(null)
    } catch(error) {fail(error)}
    finally {setBusy(false)}
  }
  return <main className="workspace">
    <nav className="list-nav" aria-label="Nákupní seznamy">
      <select aria-label="Vybrat seznam" value={list?.id || ''} onChange={event=>setSelected(event.target.value)}>
        {!list && <option value="">Nákupní seznamy</option>}{lists.map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}
      </select>
      <button className="secondary" onClick={()=>setMenu('lists')}>Seznamy</button>
    </nav>
    {list ? <ShoppingList key={list.id} list={list} user={user} online={online} fail={fail} notify={notify}/> : <section className="empty">{key ? 'Čekám na první seznam…' : 'Načítám seznamy…'}</section>}
    {menu==='lists' && <Dialog title="Tvoje seznamy" close={()=>setMenu(null)}>
      <div className="dialog-list">{lists.map(entry=><button key={entry.id} onClick={()=>{setSelected(entry.id);setMenu(null)}}>{entry.name}</button>)}</div>
      <form className="inline" onSubmit={event=>{event.preventDefault();if(newList.trim()) void createList(newList.trim(),user).then(id=>{setSelected(id);setNewList('');setMenu(null)}).catch(fail)}}>
        <input value={newList} onChange={event=>setNewList(event.target.value)} maxLength={120} aria-label="Název nového seznamu" placeholder="Nový seznam"/><button className="primary" disabled={!online || !newList.trim()}>Vytvořit</button>
      </form>
      <button className="secondary" onClick={()=>setMenu('join')}>Zadat kód pozvánky</button>
    </Dialog>}
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
      <button className="secondary" onClick={()=>{void signOut(auth).catch(fail);setSettings(false)}}>Odhlásit se</button>
      <small>NaNákup {version}</small>
    </Dialog>}
  </main>
}

type ShoppingProps = {list:List;user:User;online:boolean;fail:(error:unknown)=>void;notify:(text:string)=>void}
function ShoppingList({list,user,online,fail,notify}:ShoppingProps) {
  const items = useDocuments<Item>(()=>itemsRef(list.id),list.id,fail)
  const historyItems = useDocuments<History>(()=>historyRef(list.id),list.id,fail).rows
  const [draft,setDraft] = useState('')
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
    return <li className={item.done?'done item':'item'} key={item.id}>
      <button className="check-row" role="checkbox" aria-checked={item.done} aria-label={item.name} onClick={()=>{action(patchItem(list.id,item.id,{done:!item.done}));navigator.vibrate?.(12)}}>
        <span className="checkbox" aria-hidden="true">{item.done?'✓':''}</span><span className="item-name">{item.name}</span>{item.qty&&<span className="qty">{item.qty}</span>}
      </button>
      {index!==undefined && <button className="icon move" disabled={index===0} aria-label={`Posunout ${item.name} nahoru`} onClick={()=>action(moveItem(list.id,item,open[index-1]))}>↑</button>}
      <button className="icon item-options" aria-label={`Upravit ${item.name}`} onClick={()=>setEdit(item)}>···</button>
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
      <div className="heading-actions"><button className="secondary" onClick={()=>setPanel('share')}>Sdílet</button><button className="icon" aria-label="Možnosti seznamu" onClick={()=>{setListName(list.name);setPanel('options')}}>···</button></div>
    </section>
    <div className="entry">
      <form className="add" onSubmit={add}>
        <input ref={nameInput} value={draft} onChange={event=>{setDraft(event.target.value);setSuggest(true)}} onFocus={()=>setSuggest(true)} onKeyDown={event=>{if(event.key==='Enter'&&!event.nativeEvent.isComposing){event.preventDefault();qtyInput.current?.focus();setSuggest(false)} if(event.key==='Escape')setSuggest(false)}} placeholder="Co koupit?" aria-label="Název položky" enterKeyHint="next" maxLength={120} autoComplete="off"/>
        <input ref={qtyInput} value={qty} onFocus={()=>setSuggest(false)} onChange={event=>setQty(event.target.value)} placeholder="Množství" aria-label="Množství" enterKeyHint="done" maxLength={80} autoComplete="off"/>
        <button className="add-button" aria-label="Přidat položku" onPointerDown={event=>event.preventDefault()}>✓</button>
      </form>
      {suggestions.length>0 && <div className="suggestions" aria-label="Návrhy z historie">{suggestions.map(entry=><button key={entry.id} onPointerDown={event=>event.preventDefault()} onClick={()=>{setDraft(entry.name);setQty(entry.qty);setSuggest(false);qtyInput.current?.focus()}}>{entry.name}<span>{entry.qty}</span></button>)}</div>}
    </div>
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
        <button className="primary" onClick={()=>{const url=new URL(location.pathname,location.origin);url.hash=new URLSearchParams({pozvanka:list.invite}).toString();void navigator.clipboard.writeText(url.href).then(()=>notify('Odkaz zkopírován.')).catch(fail)}}>Kopírovat odkaz</button>
        <button className="quiet" disabled={!online} onClick={()=>action(rotateInvite(list,true))}>Zneplatnit pozvánku</button>
      </> : <button className="primary" disabled={!online} onClick={()=>action(rotateInvite(list))}>Vytvořit pozvánku</button>}</div>}
      <h3>Členové</h3><ul className="members">{list.memberIds.map(uid=><li key={uid}><span>{list.names[uid] || 'Člen'}{uid===list.owner?' · vlastník':''}</span>{owner && uid!==user.uid&&<button className="quiet" disabled={!online} onClick={()=>setConfirmation({title:`Odebrat člena ${list.names[uid] || 'Člen'}?`,run:()=>removeMember(list,uid,true)})}>Odebrat</button>}</li>)}</ul>
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
        {list.id!=='default-'+user.uid&&<button className="danger" onClick={()=>setConfirmation({title:'Smazat tento seznam?',run:()=>patchList(list.id,{archived:true})})}>Smazat seznam</button>}
      </>}
    </Dialog>}
    {confirmation && <Dialog title={confirmation.title} close={()=>setConfirmation(null)}><div className="inline"><button className="secondary" onClick={()=>setConfirmation(null)}>Zrušit</button><button className="danger" onClick={()=>{action(confirmation.run());setConfirmation(null)}}>Potvrdit</button></div></Dialog>}
  </>
}

createRoot(document.getElementById('root')!).render(<App/>)
