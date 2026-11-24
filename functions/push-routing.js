export function affectedUsers(list, changes) {
  const members = list && !list.archived ? list.memberIds ?? [] : []
  return new Set([
    ...members.filter(uid => changes.some(change => !change.affected &&
      members.includes(change.uid) && (change.uid !== uid || change.deviceId !== undefined))),
    ...changes.flatMap(change => change.affected ?? [])
  ])
}

export function messageKind(list, changes, uid, deviceId) {
  const members = list && !list.archived ? list.memberIds ?? [] : []
  if (members.includes(uid) && changes.some(change => !change.affected &&
      change.uid !== uid && members.includes(change.uid))) return 'list'

  const badgeChanged = changes.some(change => change.affected
    ? change.affected.includes(uid)
    : members.includes(uid) && change.uid === uid)
  if (!badgeChanged) return null

  // The editing installation already has an up-to-date foreground count.
  const ownDeviceEdited = changes.some(change => change.uid === uid && change.deviceId === deviceId)
  const identifiable = changes.some(change => change.deviceId !== undefined)
  return !ownDeviceEdited && identifiable ? 'badge' : null
}
