import assert from 'node:assert/strict'
import test from 'node:test'
import { affectedUsers, messageKind } from './push-routing.js'

const personal = {memberIds:['one']}
const shared = {memberIds:['one','two']}

test('another device on the same account gets the badge update', () => {
  const changes = [{uid:'one',deviceId:'phone'}]
  assert.deepEqual([...affectedUsers(personal, changes)], ['one'])
  assert.equal(messageKind(personal, changes,'one','phone'), null)
  assert.equal(messageKind(personal, changes,'one','tablet'), 'badge')
})

test('edits without push enabled can update other registered installations', () => {
  const changes = [{uid:'one',deviceId:''}]
  assert.equal(messageKind(personal, changes,'one','tablet'), 'badge')
})

test('legacy actors still notify other members of a shared list', () => {
  const changes = [{uid:'one'}]
  assert.deepEqual([...affectedUsers(shared, changes)], ['two'])
  assert.equal(messageKind(shared, changes,'two','phone'), 'list')
  assert.equal(messageKind(shared, changes,'one','phone'), null)
})

test('edits by several members still notify each member about the other member', () => {
  const changes = [{uid:'one',deviceId:'phone'},{uid:'two',deviceId:'tablet'}]
  assert.equal(messageKind(shared, changes,'one','phone'), 'list')
  assert.equal(messageKind(shared, changes,'two','tablet'), 'list')
})

test('archive and removal still update affected devices with a generic message', () => {
  const removal = [{uid:'one',deviceId:'phone',affected:['two']}]
  assert.deepEqual([...affectedUsers(personal, removal)], ['two'])
  assert.equal(messageKind(personal, removal,'two','tablet'), 'badge')
  assert.equal(messageKind(personal, removal,'one','tablet'), null)
  const archive = [{uid:'one',deviceId:'phone',affected:['one','two']}]
  assert.deepEqual([...affectedUsers({...shared,archived:true}, archive)], ['one','two'])
  assert.equal(messageKind({...shared,archived:true}, archive,'one','phone'), null)
  assert.equal(messageKind({...shared,archived:true}, archive,'one','tablet'), 'badge')
})

test('a user outside the list receives no list content', () => {
  const changes = [{uid:'one',deviceId:'phone'}]
  assert.equal(messageKind(personal, changes,'two','tablet'), null)
})
