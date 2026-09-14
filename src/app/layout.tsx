import type { Metadata } from 'next'
import './globals.css'
import { AccessibilityProvider } from '@/components/accessibility/AccessibilityProvider'
import { ACCESSIBILITY_INIT_SCRIPT } from '@/lib/accessibility'

export const metadata: Metadata = {
  title: 'Pimenta Ousada — Sistema de Estoque',
  description: 'Sistema de gestão de estoque para a loja Pimenta Ousada',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ACCESSIBILITY_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-background text-foreground">
        <AccessibilityProvider>{children}</AccessibilityProvider>
      </body>
    </html>
  )
}
