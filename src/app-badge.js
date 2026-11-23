export function badgeEntries(state, list, incoming, opening) {
  const previous = Object.hasOwn(state,list) ? state[list] : { unread: [], seen: [] }
  const seen = new Set(previous.seen)
  const unread = new Set(previous.unread)
  if (opening) for (const id of unread) seen.add(id)
  for (const id of incoming) {
    if (opening) seen.add(id)
    else if (!seen.has(id)) unread.add(id)
  }
  return {...state, [list]: {seen:[...seen], unread:opening ? [] : [...unread]}}
}

export function updateAppBadge(list, items, opening = false) {
  if (typeof navigator.setAppBadge !== 'function' || typeof indexedDB === 'undefined') return Promise.resolve()
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('nanakup-app-badge', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('badge')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction('badge', 'readwrite')
      const store = transaction.objectStore('badge')
      const read = store.get('lists')
      let count = 0
      read.onsuccess = () => {
        const state = list ? badgeEntries(read.result ?? {}, list, items, opening) : {}
        count = Object.values(state).reduce((sum, entry) => sum + entry.unread.length, 0)
        store.put(state, 'lists')
      }
      transaction.onabort = () => { db.close(); reject(transaction.error) }
      transaction.oncomplete = () => {
        db.close()
        const result = count ? navigator.setAppBadge(count) : navigator.clearAppBadge()
        Promise.resolve(result).then(resolve, reject)
      }
    }
  }).catch(() => {})
}
