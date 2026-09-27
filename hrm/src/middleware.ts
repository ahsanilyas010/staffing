import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options: CookieOptions }[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()

  const { pathname } = request.nextUrl

  const isPublicRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/apply') ||
    pathname.startsWith('/schedule') ||
    pathname.startsWith('/checkin') ||
    pathname.startsWith('/offer') ||
    pathname.startsWith('/onboard') ||
    pathname.startsWith('/timesheet') ||
    pathname.startsWith('/client') ||
    pathname.startsWith('/api/apply') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/api/schedule') ||
    pathname.startsWith('/api/checkin') ||
    pathname.startsWith('/api/offer') ||
    pathname.startsWith('/api/onboard') ||
    pathname.startsWith('/api/timesheet') ||
    pathname.startsWith('/api/jobs/run')

  if (!session && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && pathname === '/login') {
    return NextResponse.redirect(new URL('/pipeline', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
