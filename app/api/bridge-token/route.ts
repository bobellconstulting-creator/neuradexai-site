import { auth } from '@/auth'
import { SignJWT } from 'jose'
import { NextResponse } from 'next/server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // If OpenClaw gateway is configured, return direct connection config.
  // BridgeProvider connects straight to the gateway, bypassing the bridge server.
  const gatewayUrl   = process.env.OPENCLAW_GATEWAY_URL
  const gatewayToken = process.env.OPENCLAW_GATEWAY_TOKEN
  if (gatewayUrl && gatewayToken) {
    return NextResponse.json({
      mode:    'direct',
      url:     gatewayUrl,
      token:   gatewayToken,
    })
  }

  // Fallback: issue a short-lived JWT for the local bridge server
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

  return NextResponse.json({ mode: 'bridge', token })
}
