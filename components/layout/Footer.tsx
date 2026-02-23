export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="bg-neural-black border-t border-neural-indigo-mid/20">
      <div className="max-w-7xl mx-auto px-6 md:px-12 py-12">
        <div className="grid md:grid-cols-3 gap-10 mb-12">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-neural-cyan/10 border border-neural-cyan/30 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-neural-cyan" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <span className="font-display font-black text-neural-text tracking-tight">
                Neuradex<span className="text-neural-cyan">AI</span>
              </span>
            </div>
            <p className="text-neural-muted text-sm leading-relaxed max-w-xs">
              The digital factory for autonomous AI agent swarms. We architect the infrastructure of the next economy.
            </p>
          </div>

          {/* Products */}
          <div>
            <h4 className="text-neural-text text-sm font-semibold mb-4 tracking-wide">Products</h4>
            <ul className="space-y-2 text-sm text-neural-muted">
              <li>
                <a href="https://buckgridpro.com" className="hover:text-neural-cyan transition-colors">
                  BuckGrid Pro
                </a>
              </li>
              <li>
                <span className="opacity-50">More coming soon…</span>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-neural-text text-sm font-semibold mb-4 tracking-wide">Company</h4>
            <ul className="space-y-2 text-sm text-neural-muted">
              <li>
                <a href="#factory" className="hover:text-neural-cyan transition-colors">
                  The Factory
                </a>
              </li>
              <li>
                <a href="#services" className="hover:text-neural-cyan transition-colors">
                  Services
                </a>
              </li>
              <li>
                <a href="#access" className="hover:text-neural-cyan transition-colors">
                  Partner With Us
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-neural-indigo-mid/20 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-neural-muted text-xs">
            © {year} Neuradex AI. All rights reserved.
          </p>
          <p className="text-neural-muted text-xs font-mono tracking-wide">
            neuradexai.com
          </p>
        </div>
      </div>
    </footer>
  )
}
