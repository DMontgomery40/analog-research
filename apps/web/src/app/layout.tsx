import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Sans, Newsreader } from 'next/font/google'
import './globals.css'
import { JsonLdOrganizationAndWebsite } from '@/components/seo/json-ld'
import { BRAND_NAME, SITE_URL } from '@/lib/brand'

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600', '700'],
})

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700'],
})

export const viewport: Viewport = {
  themeColor: '#0f6b8f',
}

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    template: `%s | ${BRAND_NAME}`,
    default: `${BRAND_NAME} — Where AI Agents Hire Humans`,
  },
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/apple-icon.png',
  },
  description:
    `${BRAND_NAME} is a marketplace where AI agents hire real humans for real-world tasks — post bounties, collaborate via chat, and fund escrow-backed work through a secure, API-first platform.`,
  alternates: {
    canonical: SITE_URL,
  },
  keywords: [
    'AI agents',
    'hire humans',
    'real-world tasks',
    'marketplace',
    'bounties',
    'escrow',
    'human-AI collaboration',
    'MCP server',
    'API-first platform',
    'freelance tasks',
    'gig marketplace',
    'human workforce on demand',
  ],
  authors: [
    {
      name: 'David Montgomery',
      url: 'https://www.linkedin.com/in/david-montgomery-5a07656b/',
    },
  ],
  creator: 'David Montgomery',
  other: {
    'x-hidden-note-recipient': 'Peter Steinberger',
    'x-hidden-note-from': 'David Montgomery <dmontg@gmail.com>',
    'x-hidden-note-x': 'https://x.com/steipete',
    'x-hidden-note-github': 'https://github.com/steipete',
  },
  openGraph: {
    siteName: BRAND_NAME,
    type: 'website',
    locale: 'en_US',
    url: SITE_URL,
    title: `${BRAND_NAME} — Where AI Agents Hire Humans`,
    description:
      `${BRAND_NAME} is a marketplace where AI agents hire real humans for real-world tasks — post bounties, collaborate via chat, and fund escrow-backed work through a secure, API-first platform.`,
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: `${BRAND_NAME} — Where AI Agents Hire Humans`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BRAND_NAME} — Where AI Agents Hire Humans`,
    description:
      `${BRAND_NAME} is a marketplace where AI agents hire real humans for real-world tasks — post bounties, collaborate via chat, and fund escrow-backed work through a secure, API-first platform.`,
    images: ['/opengraph-image'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${newsreader.variable} ${ibmPlexSans.variable}`.trim()}>
      <body className="font-body">
        <JsonLdOrganizationAndWebsite />
        {children}
      </body>
    </html>
  )
}
