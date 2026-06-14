/**
 * Dev/preview database seed.
 *
 * Creates a fixed login user plus realistic mock data (a family group, a few
 * children, and tasks across all time-of-day phases including some already
 * completed today and a points balance) so the app can be tried out — including
 * the task-completion animation — without going through the MCP server.
 *
 * Idempotent: re-running wipes and recreates the seed group's children/tasks.
 *
 * Usage:
 *   POCKETBASE_URL=https://your.pocketbase \
 *   PB_ADMIN_EMAIL=admin@example.com PB_ADMIN_PASSWORD=secret \
 *   npm run seed
 *
 * Defaults target the local docker test PocketBase.
 */
import PocketBase from 'pocketbase'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase:8090'
const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL || 'admin@test.local'
const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD || 'testtest123'

const USER_EMAIL = process.env.SEED_USER_EMAIL || 'post@levinkeller.de'
const USER_PASSWORD = process.env.SEED_USER_PASSWORD || 'todoapp123'
const GROUP_NAME = 'Familie Keller'

const todayISO = () => new Date().toISOString()

const pb = new PocketBase(POCKETBASE_URL)

const findFirst = async (collection, filter) => {
  try {
    return await pb.collection(collection).getFirstListItem(filter)
  } catch {
    return null
  }
}

async function main() {
  await pb.collection('_superusers').authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD)
  console.log(`Connected to ${POCKETBASE_URL}`)

  // 1. User (find or create)
  let user = await findFirst('users', `email = "${USER_EMAIL}"`)
  if (!user) {
    user = await pb.collection('users').create({
      email: USER_EMAIL,
      password: USER_PASSWORD,
      passwordConfirm: USER_PASSWORD,
      emailVisibility: true,
      verified: true,
    })
    console.log(`Created user ${USER_EMAIL}`)
  } else {
    console.log(`Reusing user ${USER_EMAIL}`)
  }

  // 2. Group (find or create) + membership
  let group = await findFirst('groups', `name = "${GROUP_NAME}"`)
  if (!group) {
    group = await pb.collection('groups').create({
      name: GROUP_NAME,
      morningEnd: '09:00',
      eveningStart: '18:00',
      timezone: 'Europe/Berlin',
    })
    console.log(`Created group ${GROUP_NAME}`)
  }
  const membership = await findFirst('user_groups', `user = "${user.id}" && group = "${group.id}"`)
  if (!membership) {
    await pb.collection('user_groups').create({ user: user.id, group: group.id })
    console.log('Linked user to group')
  }

  // 3. Clean existing children (+ their tasks & point transactions) for re-runs
  const existingChildren = await pb.collection('children').getFullList({
    filter: `group = "${group.id}"`,
  })
  for (const child of existingChildren) {
    const tasks = await pb.collection('tasks').getFullList({ filter: `child = "${child.id}"` })
    for (const t of tasks) await pb.collection('tasks').delete(t.id)
    const txns = await pb
      .collection('point_transactions')
      .getFullList({ filter: `child = "${child.id}"` })
    for (const tx of txns) await pb.collection('point_transactions').delete(tx.id)
    await pb.collection('children').delete(child.id)
  }
  if (existingChildren.length) console.log(`Cleared ${existingChildren.length} existing children`)

  // 4. Seed children + tasks + points
  const children = [
    { name: 'Mia', color: '#F87171' },
    { name: 'Leo', color: '#60A5FA' },
    { name: 'Emma', color: '#FBBF24' },
  ]

  const tasksByChild = {
    Mia: {
      morning: ['Zähne putzen', 'Bett machen', 'Anziehen'],
      afternoon: ['Hausaufgaben', 'Zimmer aufräumen', 'Klavier üben', 'Tisch decken'],
      evening: ['Schlafanzug anziehen', 'Zähne putzen'],
      doneToday: ['Frühstück gegessen'],
      points: 35,
    },
    Leo: {
      morning: ['Zähne putzen', 'Schulranzen packen'],
      afternoon: ['Hausaufgaben', 'Müll rausbringen', 'Spielzeug aufräumen'],
      evening: ['Baden'],
      doneToday: ['Bett gemacht'],
      points: 20,
    },
    Emma: {
      morning: ['Anziehen'],
      afternoon: ['Malen üben', 'Blumen gießen'],
      evening: ['Zähne putzen', 'Buch vorlesen lassen'],
      doneToday: [],
      points: 10,
    },
  }

  for (const c of children) {
    const child = await pb.collection('children').create({
      name: c.name,
      color: c.color,
      group: group.id,
    })
    const plan = tasksByChild[c.name]
    let priority = 1
    for (const phase of ['morning', 'afternoon', 'evening']) {
      for (const title of plan[phase]) {
        await pb.collection('tasks').create({
          title,
          child: child.id,
          completed: false,
          timeOfDay: phase,
          dueDate: todayISO(),
          priority: priority++,
          points: 5,
        })
      }
    }
    for (const title of plan.doneToday) {
      await pb.collection('tasks').create({
        title,
        child: child.id,
        completed: true,
        completedAt: todayISO(),
        completedBy: child.id,
        lastCompletedAt: todayISO(),
        timeOfDay: 'morning',
        dueDate: todayISO(),
        priority: priority++,
        points: 5,
      })
    }
    if (plan.points > 0) {
      await pb.collection('point_transactions').create({
        child: child.id,
        points: plan.points,
        type: 'earned',
        description: 'Startguthaben (Seed)',
      })
    }
    console.log(`Seeded child ${c.name}`)
  }

  console.log('\nSeed complete!')
  console.log(`Login:    ${USER_EMAIL}`)
  console.log(`Password: ${USER_PASSWORD}`)
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
