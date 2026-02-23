'use client'

import { motion } from 'framer-motion'
import NeuralBackground from '@/components/ui/NeuralBackground'
import Button from '@/components/ui/Button'

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 32 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] },
})

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-neural-black">
      {/* Neural network canvas */}
      <NeuralBackground />

      {/* Radial spotlight */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 40%, rgba(45,27,105,0.25) 0%, transparent 70%)',
        }}
      />

      {/* Scan line effect */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-[0.03]">
        <div
          className="absolute w-full h-px bg-neural-cyan"
          style={{ animation: 'scanLine 8s linear infinite' }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
        {/* Badge */}
        <motion.div {...fadeUp(0.1)} className="mb-8 inline-flex">
          <span className="glass px-4 py-2 text-xs font-mono tracking-[0.2em] text-neural-cyan uppercase border-neural-cyan/20">
            ◈ Autonomous AI Infrastructure
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          {...fadeUp(0.25)}
          className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black leading-[1.05] mb-6"
        >
          <span className="heading-gradient text-glow-cyan">
            Architect Your
          </span>
          <br />
          <span className="text-neural-text">Digital Empire.</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          {...fadeUp(0.4)}
          className="text-neural-muted text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Deploying autonomous AI agent swarms to revolutionize complex
          industries. We build the infrastructure. You own the future.
        </motion.p>

        {/* CTAs */}
        <motion.div
          {...fadeUp(0.55)}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Button variant="primary" size="lg" href="#access">
            Request Access
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Button>
          <Button variant="ghost" size="lg" href="#factory">
            Explore the Factory
          </Button>
        </motion.div>

        {/* Metrics strip */}
        <motion.div
          {...fadeUp(0.7)}
          className="mt-20 grid grid-cols-3 gap-6 max-w-lg mx-auto"
        >
          {[
            { value: '∞', label: 'Scale' },
            { value: '24/7', label: 'Autonomous' },
            { value: '0→1', label: 'Velocity' },
          ].map((m) => (
            <div key={m.label} className="text-center">
              <div className="text-2xl font-display font-black text-neural-cyan text-glow-cyan">
                {m.value}
              </div>
              <div className="text-xs text-neural-muted tracking-widest uppercase mt-1">
                {m.label}
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-neural-dark to-transparent pointer-events-none" />
    </section>
  )
}
