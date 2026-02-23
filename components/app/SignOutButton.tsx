'use client'

import { signOut } from 'next-auth/react'

export default function SignOutButton() {
  return (
    <button
      onClick={() => signOut({ callbackUrl: '/' })}
      className="font-mono text-[10px] tracking-[0.2em] text-neural-muted/60 hover:text-red-400 transition-colors duration-200 uppercase"
    >
      SIGN OUT
    </button>
  )
}
