'use client'

import { motion } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useState } from 'react'
import Button from '@/components/ui/Button'
import GlassCard from '@/components/ui/GlassCard'

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Enter a valid email address'),
  company: z.string().min(2, 'Company name is required'),
  useCase: z.enum(['ai-agents', 'saas', 'content', 'buckgrid', 'other'], {
    errorMap: () => ({ message: 'Select your primary interest' }),
  }),
  message: z.string().max(500).optional(),
})

type FormData = z.infer<typeof schema>

const useCaseOptions = [
  { value: 'ai-agents', label: 'Custom AI Agent Development' },
  { value: 'saas', label: 'SaaS Orchestration' },
  { value: 'content', label: 'Automated Content Ecosystem' },
  { value: 'buckgrid', label: 'BuckGrid Pro Access' },
  { value: 'other', label: 'Partnership / Other' },
]

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-neural-text">{label}</label>
      {children}
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

const inputClass =
  'w-full bg-neural-indigo/40 border border-neural-indigo-mid/50 rounded-xl px-4 py-3 text-neural-text placeholder:text-neural-muted text-sm focus:outline-none focus:border-neural-cyan/60 focus:ring-1 focus:ring-neural-cyan/30 transition-colors duration-200'

export default function AccessPortal() {
  const [submitted, setSubmitted] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    // Replace with your API endpoint / form service
    await new Promise((r) => setTimeout(r, 1200))
    console.log('Form submission:', data)
    setSubmitted(true)
  }

  return (
    <section id="access" className="section-pad bg-neural-void relative overflow-hidden">
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(0,245,255,0.04) 0%, transparent 70%)',
        }}
      />

      <div className="max-w-3xl mx-auto relative z-10">
        {/* Label */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3 mb-6"
        >
          <div className="h-px w-12 bg-neural-cyan" />
          <span className="text-neural-cyan text-sm font-mono tracking-widest uppercase">
            Access Portal
          </span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-display text-4xl md:text-5xl font-black text-neural-text mb-4"
        >
          Partner With{' '}
          <span className="heading-gradient">Neuradex AI.</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-neural-muted text-base mb-10"
        >
          Select your domain. We'll match you with the right agent architecture.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.3 }}
        >
          <GlassCard className="p-8 md:p-10" hover={false}>
            {submitted ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-neural-cyan/10 border border-neural-cyan/30 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8 text-neural-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="font-display text-2xl font-bold text-neural-text mb-3">
                  Request Received.
                </h3>
                <p className="text-neural-muted">
                  Our team will reach out within 24 hours to discuss your AI infrastructure needs.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-5">
                  <Field label="Full Name" error={errors.name?.message}>
                    <input
                      {...register('name')}
                      placeholder="Jane Smith"
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Work Email" error={errors.email?.message}>
                    <input
                      {...register('email')}
                      type="email"
                      placeholder="jane@company.com"
                      className={inputClass}
                    />
                  </Field>
                </div>

                <Field label="Company / Organization" error={errors.company?.message}>
                  <input
                    {...register('company')}
                    placeholder="Acme Corp"
                    className={inputClass}
                  />
                </Field>

                <Field label="Primary Interest" error={errors.useCase?.message}>
                  <select {...register('useCase')} defaultValue="" className={inputClass}>
                    <option value="" disabled>
                      Select your use case…
                    </option>
                    {useCaseOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Tell us more (optional)">
                  <textarea
                    {...register('message')}
                    rows={3}
                    placeholder="Describe your project or goals…"
                    className={inputClass}
                  />
                </Field>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Transmitting…
                    </>
                  ) : (
                    <>
                      Request Access
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                    </>
                  )}
                </Button>

                <p className="text-center text-xs text-neural-muted">
                  No spam. No noise. Serious partners only.
                </p>
              </form>
            )}
          </GlassCard>
        </motion.div>
      </div>
    </section>
  )
}
