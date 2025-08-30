import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'KEXP Double Plays',
  description: 'Real-time detection and display of KEXP double plays',
  keywords: ['KEXP', 'radio', 'double play', 'music', 'playlist'],
  authors: [{ name: 'KEXP Double Plays' }],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <div className="min-h-screen transition-colors duration-200">
            {children}
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
