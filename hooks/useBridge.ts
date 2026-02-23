import { useContext } from 'react'
import { BridgeContext, type BridgeContextValue } from '@/components/providers/BridgeProvider'

export function useBridge(): BridgeContextValue {
  const ctx = useContext(BridgeContext)
  if (!ctx) throw new Error('useBridge must be used within <BridgeProvider>')
  return ctx
}
