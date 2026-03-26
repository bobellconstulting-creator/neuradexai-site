import { auth } from '@/auth'
import { NextResponse } from 'next/server'

export default auth((req) => {
  const isLoggedIn   = !!req.auth
  const isDashboard       = req.nextUrl.pathname.startsWith('/dashboard')

  if (isDashboard && !isLoggedIn) {
    const url = new URL('/signin', req.url)
    url.searchParams.set('callbackUrl', req.nextUrl.pathname)
    return NextResponse.redirect(url)
  }
})

export const config = {
  // Run on all routes except static assets and Next.js internals
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
