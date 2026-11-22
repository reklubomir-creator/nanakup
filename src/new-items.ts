import { useEffect, useRef, useState } from 'react'
import type { Item } from './db'

function readSeen(key: string): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function useNewItems(listId: string, userId: string, rows: Item[], current: boolean) {
  const key = `nanakup-seen:${userId}:${listId}`
  const seen = useRef(new Set<string>())
  const [visible, setVisible] = useState(() => !document.hidden)
  const [badges, setBadges] = useState<ReadonlySet<string>>(() => new Set())
  const [count, setCount] = useState(0)

  useEffect(() => {
    const onVisibility = () => {
      setVisible(!document.hidden)
      if (document.hidden) {
        setBadges(new Set())
        setCount(0)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  useEffect(() => {
    if (!visible || document.hidden) return
    const known = new Set([...seen.current, ...readSeen(key)])
    const otherItems = rows.filter(item => item.author && item.author !== userId)
    const added = otherItems.filter(item => !item.done && !known.has(item.id)).map(item => item.id)
    const displayed = otherItems.map(item => item.id)
    const next = new Set(current ? displayed : [...known, ...displayed])
    seen.current = next
    try {
      if (next.size !== known.size || [...next].some(id => !known.has(id))) {
        localStorage.setItem(key, JSON.stringify([...next]))
      }
    } catch {
      // Keep markers working for this view when storage is unavailable.
    }
    if (added.length) {
      setBadges(previous => new Set([...previous, ...added]))
      setCount(previous => previous + added.length)
    }
  }, [key, userId, rows, visible, current])

  return { badges, count, dismiss: () => setCount(0) }
}

export function newItemsMessage(count: number) {
  if (count === 1) return 'Přibyla 1 nová položka.'
  if (count < 5) return `Přibyly ${count} nové položky.`
  return `Přibylo ${count} nových položek.`
}
