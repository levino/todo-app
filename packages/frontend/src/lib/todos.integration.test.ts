import { describe, expect, it } from 'vitest'
import { adminPb } from '../../tests/pocketbase'

describe('Todos Collection', () => {
  it('should create a todo', async () => {
    const todo = await adminPb.collection('todos').create({
      title: 'Test todo',
      completed: false,
      user_id: 'test-user',
    })

    expect(todo.id).toBeDefined()
    expect(todo.title).toBe('Test todo')
    expect(todo.completed).toBe(false)
  })

  it('should toggle a todo', async () => {
    const todo = await adminPb.collection('todos').create({
      title: 'Toggle test',
      completed: false,
      user_id: 'test-user',
    })

    const updated = await adminPb.collection('todos').update(todo.id, {
      completed: true,
    })

    expect(updated.completed).toBe(true)
  })

  it('should delete a todo', async () => {
    const todo = await adminPb.collection('todos').create({
      title: 'Delete test',
      completed: false,
      user_id: 'test-user',
    })

    await adminPb.collection('todos').delete(todo.id)

    await expect(adminPb.collection('todos').getOne(todo.id)).rejects.toThrow()
  })
})
