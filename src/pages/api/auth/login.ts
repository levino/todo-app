import type { APIRoute } from 'astro'
import { createRequestPocketBase, createAuthCookie } from '@/lib/auth'

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData()
  const email = formData.get('email')?.toString()
  const password = formData.get('password')?.toString()

  if (!email || !password) {
    return redirect('/login?error=' + encodeURIComponent('E-Mail und Passwort erforderlich'))
  }

  try {
    // Create a fresh PocketBase instance for this request
    const pb = createRequestPocketBase()

    // Authenticate with PocketBase
    await pb.collection('users').authWithPassword(email, password)

    // Create the auth cookie from the authenticated PocketBase instance
    const cookieValue = createAuthCookie(pb)

    // Redirect to home page with the auth cookie set
    return new Response(null, {
      status: 302,
      headers: {
        Location: '/',
        'Set-Cookie': cookieValue,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return redirect('/login?error=' + encodeURIComponent('Ungültige Anmeldedaten'))
  }
}
