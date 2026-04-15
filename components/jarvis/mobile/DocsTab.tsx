'use client'

import { useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Upload } from 'lucide-react'
import type { IngestedDoc } from '@/lib/jarvis/doc-ingester'

// ─── Props ────────────────────────────────────────────────────────────────────

interface DocsTabProps {
  recentDocs: IngestedDoc[]
  onUpload: (file: File) => Promise<void>
  uploading: boolean
  lastConfirmation: string
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function UploadZone({
  uploading,
  onFileSelect,
}: {
  uploading: boolean
  onFileSelect: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      onFileSelect(file)
      // Reset input so the same file can be re-uploaded
      e.target.value = ''
    }
  }

  return (
    <div
      className="relative flex flex-col items-center justify-center gap-3 rounded-lg cursor-pointer select-none"
      style={{
        border: '1.5px dashed rgba(0,212,255,0.35)',
        background: 'rgba(0,212,255,0.03)',
        minHeight: 140,
        padding: '24px 16px',
      }}
      onClick={() => !uploading && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx,.txt,.md,.csv,.json,.yaml,.yml,.jpg,.jpeg,.png,.gif,.webp"
        className="hidden"
        onChange={handleChange}
        disabled={uploading}
      />

      {uploading ? (
        <>
          {/* Spinner */}
          <div
            className="w-8 h-8 rounded-full border-2 border-[#00D4FF]/20 border-t-[#00D4FF] animate-spin"
          />
          <span className="font-mono text-xs tracking-widest text-[#00D4FF]/60 uppercase">
            Ingesting, sir&hellip;
          </span>
        </>
      ) : (
        <>
          <Upload size={28} className="text-[#00D4FF]/40" />
          <div className="text-center">
            <p className="font-mono text-xs tracking-widest text-white/40 uppercase">
              Drop or tap to upload
            </p>
            <p className="font-mono text-[10px] tracking-wider text-white/20 mt-1">
              PDF · DOCX · TXT · MD · CSV · JSON · Images
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function DocCard({ doc }: { doc: IngestedDoc }) {
  const date = new Date(doc.ingestedAt)
  const dateLabel = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const wordLabel = doc.wordCount.toLocaleString()

  return (
    <div
      className="flex items-center gap-3 rounded-md px-3 py-2.5"
      style={{
        background: 'rgba(0,212,255,0.04)',
        border: '1px solid rgba(0,212,255,0.1)',
      }}
    >
      <FileText size={16} className="flex-none text-[#00D4FF]/40" />
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[11px] text-white/70 truncate">{doc.title}</p>
        <p className="font-mono text-[10px] text-white/25 mt-0.5">
          {wordLabel} words &middot; {dateLabel}
        </p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DocsTab({
  recentDocs,
  onUpload,
  uploading,
  lastConfirmation,
}: DocsTabProps) {
  async function handleFileSelect(file: File) {
    await onUpload(file)
  }

  return (
    <div className="flex flex-col gap-5 p-4 pb-6">
      {/* Upload zone */}
      <UploadZone uploading={uploading} onFileSelect={handleFileSelect} />

      {/* Jarvis confirmation message */}
      <AnimatePresence>
        {lastConfirmation && (
          <motion.p
            key={lastConfirmation}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="font-mono text-xs italic text-center"
            style={{ color: '#00D4FF', lineHeight: 1.5 }}
          >
            &ldquo;{lastConfirmation}&rdquo;
          </motion.p>
        )}
      </AnimatePresence>

      {/* Recent docs list */}
      {recentDocs.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="font-mono text-[10px] tracking-widest text-white/20 uppercase mb-1">
            Recent
          </p>
          {recentDocs.slice(0, 5).map((doc) => (
            <DocCard key={doc.slug} doc={doc} />
          ))}
        </div>
      )}
    </div>
  )
}
