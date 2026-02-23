export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neural-black flex items-center justify-center px-4"
         style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(45,27,105,0.3) 0%, #000000 70%)' }}>
      {children}
    </div>
  )
}
