import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ── Neural Noir Palette ──────────────────────────────────
        'neural-black':      '#000000', // Deepest background
        'neural-dark':       '#0a0a0f', // Body background
        'neural-void':       '#05050a', // Section alternates
        'neural-indigo':     '#1a0a3c', // Card backgrounds
        'neural-indigo-mid': '#2d1b69', // Borders, hover rings
        'neural-indigo-hi':  '#3d2b8a', // Highlighted borders
        'neural-cyan':       '#00f5ff', // Primary accent / CTAs
        'neural-cyan-dim':   '#00d4e8', // Hover / subdued cyan
        'neural-cyan-glow':  '#00f5ff33', // Cyan glow overlay (20% opacity)
        'neural-purple':     '#8b5cf6', // Secondary accent
        'neural-purple-dim': '#7c3aed', // Hover purple
        'neural-text':       '#e2e8f0', // Primary text
        'neural-muted':      '#94a3b8', // Muted / subtext
        'neural-glass':      'rgba(26, 10, 60, 0.4)', // Glassmorphism bg
        // ── Boardroom HUD ────────────────────────────────────
        'hud-bg':            'rgba(10, 14, 23, 0.75)',
        'agent-idle':        '#3B82F6',
        'agent-processing':  '#22C55E',
        'agent-speaking':    '#00F2FF',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', 'system-ui', 'sans-serif'],
        display: ['var(--font-montserrat)', 'Montserrat', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backgroundImage: {
        'neural-gradient': 'linear-gradient(135deg, #000000 0%, #0a0a0f 40%, #1a0a3c 100%)',
        'neural-radial':   'radial-gradient(ellipse at 50% 0%, #2d1b6933 0%, transparent 70%)',
        'cyan-glow':       'radial-gradient(ellipse at center, #00f5ff22 0%, transparent 60%)',
        'card-gradient':   'linear-gradient(135deg, rgba(26,10,60,0.6) 0%, rgba(10,10,15,0.8) 100%)',
        'hero-gradient':   'linear-gradient(180deg, #000000 0%, #0a0a0f 50%, #1a0a3c22 100%)',
      },
      boxShadow: {
        'cyan-sm':  '0 0 8px rgba(0, 245, 255, 0.25)',
        'cyan-md':  '0 0 20px rgba(0, 245, 255, 0.35)',
        'cyan-lg':  '0 0 40px rgba(0, 245, 255, 0.45)',
        'indigo-sm':'0 0 8px rgba(45, 27, 105, 0.5)',
        'indigo-md':'0 0 20px rgba(45, 27, 105, 0.6)',
        'glass':    '0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      borderColor: {
        'glass': 'rgba(45, 27, 105, 0.3)',
      },
      animation: {
        'neural-pulse': 'neuralPulse 3s ease-in-out infinite',
        'float':        'float 6s ease-in-out infinite',
        'glow-pulse':   'glowPulse 2s ease-in-out infinite',
        'scan-line':    'scanLine 4s linear infinite',
        'fade-in-up':   'fadeInUp 0.6s ease-out forwards',
      },
      keyframes: {
        neuralPulse: {
          '0%, 100%': { opacity: '0.3', transform: 'scale(1)' },
          '50%':      { opacity: '0.8', transform: 'scale(1.05)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':      { transform: 'translateY(-12px)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 10px rgba(0,245,255,0.2)' },
          '50%':      { boxShadow: '0 0 30px rgba(0,245,255,0.6)' },
        },
        scanLine: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        fadeInUp: {
          '0%':   { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}

export default config
