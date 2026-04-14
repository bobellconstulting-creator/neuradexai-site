'use client'

/**
 * useDeviceLabel — per-device identity label for Bo's Mission Control.
 *
 * Bo works across multiple devices (Surface tablet, Desktop, phone). The
 * HUD shows the device label in the TopBar so he can tell which machine
 * he's looking at when switching between them. Label is stored in
 * localStorage keyed on origin, so it survives reloads and PWA installs
 * but is unique per device.
 *
 * First-load default is auto-detected from the user-agent string, then
 * Bo can rename it any time via setLabel() (the TopBar exposes a tap
 * action that calls this).
 */

import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'neuradex.deviceLabel'
const MAX_LABEL_LENGTH = 24

export interface UseDeviceLabelReturn {
  label:    string
  setLabel: (next: string) => void
  /** True once the initial load-from-localStorage has finished. */
  ready:    boolean
}

/**
 * Best-effort guess at a human device name from the user-agent. Only runs
 * if the user has never set a label on this device.
 */
function detectDefaultLabel(): string {
  if (typeof navigator === 'undefined') return 'DEVICE'
  const ua = navigator.userAgent || ''

  if (/Surface/i.test(ua)) return 'SURFACE'
  if (/iPhone/i.test(ua)) return 'IPHONE'
  if (/iPad/i.test(ua)) return 'IPAD'
  if (/Android.*Mobile/i.test(ua)) return 'PHONE'
  if (/Android/i.test(ua)) return 'TABLET'
  if (/Macintosh/i.test(ua)) return 'MAC'
  if (/Windows/i.test(ua)) return 'DESKTOP'
  if (/Linux/i.test(ua)) return 'LINUX'
  return 'DEVICE'
}

function sanitizeLabel(raw: string): string {
  return raw
    .trim()
    .slice(0, MAX_LABEL_LENGTH)
    .toUpperCase()
    .replace(/[^A-Z0-9 _-]/g, '')
}

export function useDeviceLabel(): UseDeviceLabelReturn {
  const [label, setLabelState] = useState<string>('DEVICE')
  const [ready, setReady] = useState<boolean>(false)

  // Initial load — runs once on mount, client-only
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (stored && stored.length > 0) {
        setLabelState(sanitizeLabel(stored))
      } else {
        const detected = detectDefaultLabel()
        setLabelState(detected)
        window.localStorage.setItem(STORAGE_KEY, detected)
      }
    } catch {
      // localStorage blocked — fall back to detection only, no persistence
      setLabelState(detectDefaultLabel())
    }
    setReady(true)
  }, [])

  const setLabel = useCallback((next: string): void => {
    const cleaned = sanitizeLabel(next)
    if (!cleaned) return
    setLabelState(cleaned)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, cleaned)
      } catch {
        // Persistence best-effort
      }
    }
  }, [])

  return { label, setLabel, ready }
}
