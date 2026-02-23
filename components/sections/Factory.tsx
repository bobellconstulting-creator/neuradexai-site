'use client'

import { motion } from 'framer-motion'
import GlassCard from '@/components/ui/GlassCard'
import Button from '@/components/ui/Button'

const stagger = {
  initial: {},
  animate: { transition: { staggerChildren: 0.15 } },
}

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
}

export default function Factory() {
  return (
    <section id="factory" className="section-pad bg-neural-void relative overflow-hidden">
      {/* Background accent */}
      <div
        className="absolute top-0 right-0 w-1/2 h-full pointer-events-none opacity-30"
        style={{
          background:
            'radial-gradient(ellipse at 100% 50%, rgba(0,245,255,0.06) 0%, transparent 60%)',
        }}
      />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Section Label */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3 mb-6"
        >
          <div className="h-px w-12 bg-neural-cyan" />
          <span className="text-neural-cyan text-sm font-mono tracking-widest uppercase">
            The Factory
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-display text-4xl md:text-5xl lg:text-6xl font-black text-neural-text mb-4 max-w-3xl"
        >
          One Engine.{' '}
          <span className="heading-gradient">Infinite Products.</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-neural-muted text-lg max-w-2xl mb-16"
        >
          Neuradex AI is the digital factory that designs, builds, and deploys
          specialized AI agent systems. Each product is a precision instrument
          engineered for a specific industry vertical.
        </motion.p>

        {/* BuckGrid Pro Feature Card — Flagship */}
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.3 }}
        >
          <GlassCard
            glow="cyan"
            className="p-8 md:p-12 grid md:grid-cols-2 gap-10 items-center"
          >
            {/* Left: Copy */}
            <div>
              {/* Product badge */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-neural-cyan/10 border border-neural-cyan/25 mb-6">
                <span className="w-2 h-2 rounded-full bg-neural-cyan animate-pulse" />
                <span className="text-neural-cyan text-xs font-mono tracking-widest uppercase">
                  Flagship Product
                </span>
              </div>

              <h3 className="font-display text-3xl md:text-4xl font-black text-neural-text mb-4">
                BuckGrid Pro
              </h3>

              <p className="text-neural-muted text-base leading-relaxed mb-4">
                <span className="text-neural-text font-medium">
                  AI-Powered Habitat Management at Scale.
                </span>{' '}
                BuckGrid Pro deploys an autonomous agent swarm to manage,
                analyze, and optimize wildlife habitat data — transforming raw
                field intelligence into actionable land-management strategies.
              </p>

              <ul className="space-y-2 mb-8">
                {[
                  'Autonomous habitat scoring & mapping',
                  'Predictive herd movement modeling',
                  'Real-time environmental data ingestion',
                  'AI-generated land improvement reports',
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm text-neural-muted">
                    <span className="mt-0.5 text-neural-cyan flex-shrink-0">◈</span>
                    {feature}
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-3">
                <Button variant="primary" size="md" href="https://buckgridpro.com">
                  Explore BuckGrid Pro
                </Button>
                <Button variant="ghost" size="md" href="#access">
                  Request Demo
                </Button>
              </div>
            </div>

            {/* Right: Visual */}
            <div className="relative flex items-center justify-center min-h-[280px]">
              {/* Decorative grid visualization */}
              <div className="relative w-64 h-64">
                {/* Outer ring */}
                <div className="absolute inset-0 rounded-full border border-neural-cyan/20 animate-[neural-pulse_4s_ease-in-out_infinite]" />
                <div className="absolute inset-6 rounded-full border border-neural-cyan/15 animate-[neural-pulse_4s_ease-in-out_infinite_0.5s]" />
                <div className="absolute inset-12 rounded-full border border-neural-cyan/10 animate-[neural-pulse_4s_ease-in-out_infinite_1s]" />

                {/* Center node */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-neural-cyan/10 border border-neural-cyan/40 flex items-center justify-center shadow-cyan-md">
                      <svg className="w-8 h-8 text-neural-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
                        />
                      </svg>
                    </div>
                    {/* Pulse ring */}
                    <div className="absolute inset-0 rounded-full bg-neural-cyan/5 animate-ping" />
                  </div>
                </div>

                {/* Satellite nodes */}
                {[0, 60, 120, 180, 240, 300].map((deg, i) => {
                  const rad = (deg * Math.PI) / 180
                  const r = 96
                  const x = 128 + r * Math.cos(rad) - 4
                  const y = 128 + r * Math.sin(rad) - 4
                  return (
                    <div
                      key={deg}
                      className="absolute w-2.5 h-2.5 rounded-full bg-neural-cyan/60 shadow-cyan-sm"
                      style={{
                        left: x,
                        top: y,
                        animationDelay: `${i * 0.2}s`,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* More products teaser */}
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="mt-8 text-center text-neural-muted text-sm"
        >
          More products in development —{' '}
          <a href="#access" className="text-neural-cyan hover:underline">
            join the waitlist
          </a>{' '}
          for early access.
        </motion.p>
      </div>
    </section>
  )
}
