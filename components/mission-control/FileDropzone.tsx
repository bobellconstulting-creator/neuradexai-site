'use client'

import dynamic from 'next/dynamic'
import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useMissionUploads } from '@/lib/useMissionUploads'
import { OrbErrorBoundary } from './OrbErrorBoundary'

// ── Types ────────────────────────────────────────────────────────────────────

export interface UploadRecord {
  id: string
  name: string
  size: number
  kind: 'image' | 'video' | 'doc' | 'other'
  url: string
  uploadedAt: number
}

interface FileDropzoneProps {
  onInjectFile?: (upload: UploadRecord) => void
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_FILES = 10
const MAX_BYTES = 50 * 1024 * 1024 // 50 MB

const AGENT_COLORS: [string, string, string, string] = [
  '#00d4ff', // Doc   — cyan
  '#22c55e', // Linda — green
  '#efb356', // Marcus — gold
  '#ff6fe0', // Vault — magenta
]

const KIND_ICON: Record<UploadRecord['kind'], string> = {
  image: '⬚',
  video: '⟐',
  doc:   '⬡',
  other: '◇',
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// ── Lazy-loaded R3F orb (SSR-safe) ───────────────────────────────────────────

const AgentOrbScene = dynamic(() => import('./AgentOrbScene'), { ssr: false })

// ── Upload item row ───────────────────────────────────────────────────────────

function UploadRow({
  upload,
  onInject,
}: {
  upload: UploadRecord
  onInject?: (u: UploadRecord) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onInject?.(upload)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '6px 10px',
        background: 'rgba(0,212,255,0.04)',
        border: '1px solid rgba(0,212,255,0.10)',
        borderRadius: 8,
        cursor: onInject ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
        textAlign: 'left',
      }}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLButtonElement).style.borderColor =
          'rgba(0,212,255,0.28)'
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLButtonElement).style.borderColor =
          'rgba(0,212,255,0.10)'
      }}
    >
      {upload.kind === 'image' && upload.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={upload.url}
          alt={upload.name}
          style={{
            width: 36,
            height: 36,
            objectFit: 'cover',
            borderRadius: 4,
            border: '1px solid rgba(0,212,255,0.20)',
            flexShrink: 0,
          }}
        />
      ) : (
        <span
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            color: 'var(--mc-cyan)',
            flexShrink: 0,
          }}
        >
          {KIND_ICON[upload.kind]}
        </span>
      )}

      <span style={{ flex: 1, minWidth: 0 }}>
        <span
          className="mc-mono"
          style={{
            display: 'block',
            fontSize: 11,
            color: 'var(--mc-text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {upload.name}
        </span>
        <span
          className="mc-label"
          style={{
            fontSize: 10,
            color: 'var(--mc-text-mute)',
          }}
        >
          {formatBytes(upload.size)}
        </span>
      </span>

      {onInject && (
        <span
          className="mc-label-brass"
          style={{ fontSize: 9, flexShrink: 0 }}
        >
          INJECT
        </span>
      )}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function FileDropzone({ onInjectFile }: FileDropzoneProps) {
  const { uploads, upload } = useMissionUploads()
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const handleDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setError(null)

      // Client-side guards
      const oversized = acceptedFiles.filter(f => f.size > MAX_BYTES)
      if (oversized.length > 0) {
        setError(
          `${oversized.length} file(s) exceed 50 MB limit and were skipped.`
        )
      }

      const valid = acceptedFiles
        .filter(f => f.size <= MAX_BYTES)
        .slice(0, MAX_FILES)

      if (valid.length === 0) return

      setIsUploading(true)
      setProgress(10)

      try {
        // Fake progress ticks while awaiting the actual upload
        const tick = setInterval(() => {
          setProgress(p => (p < 85 ? p + 5 : p))
        }, 200)

        await upload(valid)

        clearInterval(tick)
        setProgress(100)

        setTimeout(() => {
          setIsUploading(false)
          setProgress(0)
        }, 600)
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : 'Upload failed. Try again.'
        )
        setIsUploading(false)
        setProgress(0)
      }
    },
    [upload]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleDrop,
    multiple: true,
    maxFiles: MAX_FILES,
    // Accept broad set — server validates
    accept: {
      'image/*': [],
      'video/*': [],
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        ['.docx'],
      'text/*': ['.txt', '.md', '.csv'],
    },
  })

  return (
    <div
      className="mc-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 14px 8px',
          borderBottom: '1px solid var(--mc-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--mc-cyan)',
            boxShadow: '0 0 6px var(--mc-cyan)',
            flexShrink: 0,
          }}
        />
        <span
          className="mc-label"
          style={{ fontSize: 10, color: 'var(--mc-cyan)', letterSpacing: '0.12em' }}
        >
          FILE VAULT
        </span>
        <span
          className="mc-label"
          style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--mc-text-mute)' }}
        >
          MAX {MAX_FILES} × 50 MB
        </span>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        style={{
          position: 'relative',
          flexShrink: 0,
          margin: '10px 10px 0',
          height: isDragActive ? 180 : 100,
          borderRadius: 10,
          border: isDragActive
            ? '1.5px solid var(--mc-cyan)'
            : '1px dashed rgba(0,212,255,0.22)',
          background: isDragActive
            ? 'rgba(0,212,255,0.06)'
            : 'rgba(0,212,255,0.02)',
          cursor: 'pointer',
          overflow: 'hidden',
          transition: 'height 0.25s ease, border-color 0.15s ease, background 0.15s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <input {...getInputProps()} />

        {/* 3D orb — only mounted when dragging */}
        {isDragActive && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
            }}
          >
            <OrbErrorBoundary label="dropzone orb">
              <AgentOrbScene colors={AGENT_COLORS} />
            </OrbErrorBoundary>
          </div>
        )}

        {/* Overlay text */}
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            textAlign: 'center',
            pointerEvents: 'none',
          }}
        >
          {isUploading ? (
            <>
              <div
                className="mc-mono"
                style={{ fontSize: 11, color: 'var(--mc-cyan)', marginBottom: 8 }}
              >
                UPLOADING...
              </div>
              <div
                style={{
                  width: 160,
                  height: 3,
                  background: 'rgba(0,212,255,0.15)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: 'var(--mc-cyan)',
                    boxShadow: '0 0 8px var(--mc-cyan)',
                    transition: 'width 0.2s ease',
                    borderRadius: 2,
                  }}
                />
              </div>
            </>
          ) : isDragActive ? (
            <span
              className="mc-mono"
              style={{
                fontSize: 13,
                color: 'var(--mc-cyan)',
                textShadow: '0 0 12px var(--mc-cyan)',
                letterSpacing: '0.1em',
              }}
            >
              RELEASE TO UPLOAD
            </span>
          ) : (
            <>
              <span
                style={{
                  display: 'block',
                  fontSize: 22,
                  color: 'rgba(0,212,255,0.30)',
                  marginBottom: 6,
                }}
              >
                ⬚
              </span>
              <span
                className="mc-label mc-dropzone-label"
                style={{
                  fontSize: 12,
                  color: 'var(--mc-cyan)',
                  letterSpacing: '0.14em',
                  fontWeight: 700,
                }}
              >
                <span className="mc-dropzone-label-touch">▸ TAP TO UPLOAD A FILE</span>
                <span className="mc-dropzone-label-mouse">DROP FILES OR CLICK TO UPLOAD</span>
              </span>
              <style jsx>{`
                .mc-dropzone-label-touch { display: inline; }
                .mc-dropzone-label-mouse { display: none; }
                @media (hover: hover) and (pointer: fine) {
                  .mc-dropzone-label-touch { display: none; }
                  .mc-dropzone-label-mouse { display: inline; }
                }
              `}</style>
            </>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            margin: '6px 10px 0',
            padding: '5px 10px',
            borderRadius: 6,
            background: 'rgba(255,60,60,0.08)',
            border: '1px solid rgba(255,60,60,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#ff3c3c',
              boxShadow: '0 0 6px #ff3c3c',
              flexShrink: 0,
            }}
          />
          <span
            className="mc-mono"
            style={{ fontSize: 10, color: '#ff8080' }}
          >
            {error}
          </span>
          <button
            type="button"
            onClick={() => setError(null)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: 'rgba(255,128,128,0.6)',
              cursor: 'pointer',
              fontSize: 12,
              lineHeight: 1,
              padding: 0,
              minHeight: 44,
              minWidth: 44,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Recent uploads list */}
      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          margin: '10px 10px 10px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            marginBottom: 6,
            flexShrink: 0,
          }}
        >
          <span
            className="mc-label"
            style={{ fontSize: 9, color: 'var(--mc-text-mute)', letterSpacing: '0.12em' }}
          >
            RECENT UPLOADS
          </span>
          {uploads.length > 0 && (
            <span
              className="mc-label-brass"
              style={{ marginLeft: 'auto', fontSize: 9 }}
            >
              {uploads.length}
            </span>
          )}
        </div>

        {uploads.length === 0 ? (
          <div
            className="mc-label"
            style={{
              fontSize: 10,
              color: 'var(--mc-text-mute)',
              textAlign: 'center',
              paddingTop: 16,
            }}
          >
            NO FILES YET
          </div>
        ) : (
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              paddingRight: 2,
            }}
          >
            {uploads
              .slice()
              .sort((a, b) => b.uploadedAt - a.uploadedAt)
              .map(u => (
                <UploadRow key={u.id} upload={u} onInject={onInjectFile} />
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
