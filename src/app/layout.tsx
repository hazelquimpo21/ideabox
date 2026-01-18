/**
 * 🏠 Root Layout for IdeaBox
 *
 * The root layout wraps all pages in the application.
 * Provides global providers, fonts, and base HTML structure.
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * STRUCTURE
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * html
 * └── body
 *     └── AuthProvider          (Authentication context)
 *         ├── {children}        (Page content)
 *         └── Toaster           (Toast notifications)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * FONTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Uses Geist font family (from Vercel):
 * - Geist Sans: Primary UI font
 * - Geist Mono: Code and monospace elements
 *
 * @module app/layout
 */

import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';

import { Toaster } from '@/components/ui';
import { AuthProvider } from '@/lib/auth';
import './globals.css';

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTE SEGMENT CONFIG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Force dynamic rendering for all pages.
 * Required because auth context needs to check session state at runtime.
 */
export const dynamic = 'force-dynamic';

// ═══════════════════════════════════════════════════════════════════════════════
// FONTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Geist Sans - Primary UI font.
 * Variable font supporting weights 100-900.
 */
const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
  display: 'swap',
});

/**
 * Geist Mono - Monospace font for code.
 * Variable font supporting weights 100-900.
 */
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
});

// ═══════════════════════════════════════════════════════════════════════════════
// METADATA
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Application metadata for SEO and browser display.
 */
export const metadata: Metadata = {
  title: {
    default: 'IdeaBox - Intelligent Email Triage',
    template: '%s | IdeaBox',
  },
  description:
    'Transform email overwhelm into organized intelligence. AI-powered email categorization, action extraction, and client management.',
  keywords: [
    'email',
    'ai',
    'productivity',
    'gmail',
    'inbox',
    'email management',
    'action items',
    'client management',
  ],
  authors: [{ name: 'IdeaBox Team' }],
  creator: 'IdeaBox',
  // Open Graph
  openGraph: {
    type: 'website',
    locale: 'en_US',
    title: 'IdeaBox - Intelligent Email Triage',
    description:
      'Transform email overwhelm into organized intelligence with AI-powered email management.',
    siteName: 'IdeaBox',
  },
  // Twitter
  twitter: {
    card: 'summary_large_image',
    title: 'IdeaBox - Intelligent Email Triage',
    description:
      'Transform email overwhelm into organized intelligence with AI-powered email management.',
  },
  // App-specific
  applicationName: 'IdeaBox',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'IdeaBox',
  },
  // Manifest for PWA
  manifest: '/manifest.json',
};

/**
 * Viewport configuration for responsive design.
 */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// LAYOUT COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Root layout component.
 *
 * Wraps all pages with:
 * - Font configuration (Geist Sans & Mono)
 * - Authentication provider
 * - Toast notification system
 *
 * @param props.children - Page content to render
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <AuthProvider>
          {/* Main content */}
          {children}

          {/* Toast notifications (global) */}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
