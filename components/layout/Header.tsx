'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import Button from '@/components/ui/Button'

const navLinks = [
  { href: '#factory', label: 'The Factory' },
  { href: '#services', label: 'Services' },
  { href: 'https://buckgridpro.com', label: 'BuckGrid Pro' },
]

export default function Header() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? 'bg-neural-black/80 backdrop-blur-xl border-b border-neural-indigo-mid/20'
          : 'bg-transparent'
      }`}
    >
      <nav className="max-w-7xl mx-auto px-6 md:px-12 flex items-center justify-between h-16">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2 group">
          <div className="w-8 h-8 rounded-lg bg-neural-cyan/10 border border-neural-cyan/30 flex items-center justify-center group-hover:shadow-cyan-sm transition-all duration-300">
            <svg className="w-4 h-4 text-neural-cyan" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className="font-display font-black text-neural-text text-lg tracking-tight">
            Neuradex<span className="text-neural-cyan">AI</span>
          </span>
        </a>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-neural-muted hover:text-neural-cyan transition-colors duration-200 tracking-wide"
            >
              {link.label}
            </a>
          ))}
          <Link
            href="/signin"
            className="text-sm text-neural-muted hover:text-neural-cyan transition-colors duration-200 tracking-wide"
          >
            Sign In
          </Link>
          <Button variant="ghost" size="sm" href="#access">
            Request Access
          </Button>
        </div>

        {/* Mobile menu button */}
        <button
          className="md:hidden p-2 text-neural-muted hover:text-neural-cyan transition-colors"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {menuOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="md:hidden bg-neural-black/95 backdrop-blur-xl border-b border-neural-indigo-mid/20 px-6 py-4 space-y-3"
          >
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="block text-neural-muted hover:text-neural-cyan transition-colors duration-200 py-1"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/signin"
              onClick={() => setMenuOpen(false)}
              className="block py-1 text-neural-muted hover:text-neural-cyan transition-colors duration-200"
            >
              Sign In
            </Link>
            <Button variant="primary" size="sm" href="#access" className="w-full mt-2">
              Request Access
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
