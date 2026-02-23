import { auth } from '@/auth'
import { SignJWT } from 'jose'
import { NextResponse } from 'next/server'

// Issues a short-lived JWT for authenticating the WebSocket connection
// to the Bridge Server. The Bridge validates it using the same NEXTAUTH_SECRET.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET!)

  const token = await new SignJWT({
    sub:   session.user.id,
    email: session.user.email,
    name:  session.user.name,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('4h')
    .sign(secret)

  return NextResponse.json({ token })
}
