import '../styles/globals.css';
import '@livekit/components-styles';
import '@livekit/components-styles/prefabs';
import type { Metadata, Viewport } from 'next';
import ClientOnlyToaster from '@/components/ClientOnlyToaster';

export const metadata: Metadata = {
  title: {
    default: 'Eburon | Video Conferencing for Education',
    template: '%s',
  },
  description:
    'Eburon is a video conferencing platform designed for education, powered by Orbit Conference.',
  twitter: {
    creator: '@eburon_ai',
    site: '@eburon_ai',
    card: 'summary_large_image',
  },
  openGraph: {
    url: 'https://orbit.eburon.ai',
    images: [
      {
        url: 'https://orbit.eburon.ai/images/eburon-open-graph.png',
        width: 2000,
        height: 1000,
        type: 'image/png',
      },
    ],
    siteName: 'Eburon',
  },
  icons: {
    icon: {
      rel: 'icon',
      url: '/images/eburon-favicon.png',
    },
    apple: [
      {
        rel: 'apple-touch-icon',
        url: '/images/eburon-apple-touch.png',
        sizes: '180x180',
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: '#070707',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body data-lk-theme="default">
        <ClientOnlyToaster />
        {children}
      </body>
    </html>
  );
}
