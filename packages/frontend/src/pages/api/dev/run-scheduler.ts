import type { APIRoute } from 'astro'
import { processSchedules } from '@/lib/scheduleProcessor'

export const POST: APIRoute = async ({ locals }) => {
  if (!import.meta.env.DEV) {
    return new Response('Not available in production', { status: 404 })
  }

  const { pb } = locals

  try {
    await processSchedules(pb)
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Scheduler error:', error)
    return new Response(JSON.stringify({ error: String(error), stack: (error as Error).stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
