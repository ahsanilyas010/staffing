import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Route handlers can write cookies (server components can't), so sign-out lives here.
export async function GET(request: NextRequest) {
  const supabase = createClient()
  await supabase.auth.signOut()

  const loginUrl = new URL('/login', request.url)
  const error = request.nextUrl.searchParams.get('error')
  if (error === 'not_authorized') loginUrl.searchParams.set('error', error)

  return NextResponse.redirect(loginUrl)
}
