'use client'

import { motion } from 'framer-motion'
import GlassCard from '@/components/ui/GlassCard'

const services = [
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5"
        />
      </svg>
    ),
    label: 'AI Agent Development',
    color: 'cyan',
    headline: 'Custom Agent Swarms',
    description:
      'We architect and deploy bespoke autonomous AI agent systems tailored to your industry. From data ingestion to decision-making pipelines, your swarm operates at machine speed.',
    features: ['Multi-agent orchestration', 'Domain-specific fine-tuning', 'Automated decision loops'],
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z"
        />
      </svg>
    ),
    label: 'SaaS Orchestration',
    color: 'purple',
    headline: 'Intelligent SaaS Products',
    description:
      'We design and launch AI-native SaaS platforms that leverage agent swarms to deliver differentiated value. Scalable, subscription-ready, and enterprise-hardened.',
    features: ['Product architecture', 'Agent-as-a-Service models', 'Enterprise integrations'],
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z"
        />
      </svg>
    ),
    label: 'Automated Content Ecosystems',
    color: 'cyan',
    headline: 'Autonomous Content at Scale',
    description:
      'Deploy AI content engines that generate, curate, and distribute brand-aligned content across every channel — running 24/7 without manual intervention.',
    features: ['Multi-channel publishing', 'Brand voice training', 'SEO & performance loops'],
  },
]

const colorMap: Record<string, string> = {
  cyan: 'text-neural-cyan border-neural-cyan/20 bg-neural-cyan/10',
  purple: 'text-neural-purple border-neural-purple/20 bg-neural-purple/10',
}

export default function Services() {
  return (
    <section id="services" className="section-pad bg-neural-dark relative overflow-hidden">
      {/* Background accent */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 100%, rgba(45,27,105,0.15) 0%, transparent 70%)',
        }}
      />

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Label */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex items-center gap-3 mb-6"
        >
          <div className="h-px w-12 bg-neural-purple" />
          <span className="text-neural-purple text-sm font-mono tracking-widest uppercase">
            Service Modules
          </span>
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-display text-4xl md:text-5xl lg:text-6xl font-black text-neural-text mb-4 max-w-3xl"
        >
          What We{' '}
          <span className="heading-gradient">Deploy.</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-neural-muted text-lg max-w-xl mb-14"
        >
          Three core capability modules that power every Neuradex AI product.
        </motion.p>

        {/* Cards grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {services.map((svc, i) => (
            <motion.div
              key={svc.label}
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 * i }}
            >
              <GlassCard
                glow={svc.color as 'cyan' | 'purple'}
                className="p-7 h-full flex flex-col"
              >
                {/* Icon */}
                <div className={`inline-flex p-3 rounded-xl border mb-5 w-fit ${colorMap[svc.color]}`}>
                  {svc.icon}
                </div>

                {/* Tag */}
                <span className="text-xs font-mono tracking-widest uppercase text-neural-muted mb-2">
                  {svc.label}
                </span>

                {/* Headline */}
                <h3 className="font-display text-xl font-bold text-neural-text mb-3">
                  {svc.headline}
                </h3>

                {/* Description */}
                <p className="text-neural-muted text-sm leading-relaxed mb-5 flex-1">
                  {svc.description}
                </p>

                {/* Feature list */}
                <ul className="space-y-1.5 border-t border-neural-indigo-mid/30 pt-4">
                  {svc.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-xs text-neural-muted">
                      <span className={`text-${svc.color === 'cyan' ? 'neural-cyan' : 'neural-purple'}`}>—</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </GlassCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
