import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Surelane', short_name: 'Surelane', description: 'Your clear, safe lane to real jobs.',
    start_url: '/', display: 'standalone', background_color: '#f3f6f7', theme_color: '#0f3f56',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
