import type { APIRoute } from 'astro'
import { createRequestPocketBase, createAuthCookie } from '@/lib/auth'

export const POST: APIRoute = async ({ request, redirect }) => {
  const formData = await request.formData()
  const email = formData.get('email')?.toString()
  const password = formData.get('password')?.toString()
  const passwordConfirm = formData.get('passwordConfirm')?.toString()

  if (!email || !password || !passwordConfirm) {
    return redirect('/signup?error=' + encodeURIComponent('Alle Felder sind erforderlich'))
  }

  if (password !== passwordConfirm) {
    return redirect('/signup?error=' + encodeURIComponent('Passwörter stimmen nicht überein'))
  }

  if (password.length < 8) {
    return redirect('/signup?error=' + encodeURIComponent('Passwort muss mindestens 8 Zeichen haben'))
  }

  try {
    const pb = createRequestPocketBase()

    // Create a new group for this user (each family gets their own group)
    const group = await pb.collection('groups').create({
      name: `Familie ${email.split('@')[0]}`,
    })

    // Create the user with the group
    await pb.collection('users').create({
      email,
      password,
      passwordConfirm,
      group: group.id,
    })

    // Authenticate to get the token
    await pb.collection('users').authWithPassword(email, password)

    // Create the auth cookie
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
    console.error('Signup error:', error)
    const message = error instanceof Error ? error.message : 'Registrierung fehlgeschlagen'
    return redirect('/signup?error=' + encodeURIComponent(message))
  }
}
