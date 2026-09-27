import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Lonely — Take picture, write code and design product.',
    short_name: 'Lonely',
    description: 'Lonely の Profile！',
    start_url: '/',
    display: 'standalone',
    background_color: '#101010',
    theme_color: '#101010',
    icons: [
      {
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
