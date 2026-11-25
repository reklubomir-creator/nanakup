export type PushDevice = { id:string; muted:string[]; badgeExcluded:string[] }
export const localKey = (uid:string) => 'nanakup-push:' + uid
export function storedDevice(uid:string):PushDevice | null {
  try {
    const value:unknown = JSON.parse(localStorage.getItem(localKey(uid)) ?? 'null')
    if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && 'muted' in value && Array.isArray(value.muted)) {
      const badgeExcluded = 'badgeExcluded' in value && Array.isArray(value.badgeExcluded) ? value.badgeExcluded : []
      return {
        id:value.id,
        muted:value.muted.filter((id):id is string=>typeof id==='string'),
        badgeExcluded:badgeExcluded.filter((id):id is string=>typeof id==='string')
      }
    }
  } catch {
    return null
  }
  return null
}
