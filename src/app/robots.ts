import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard/', '/fan/'] },
    sitemap: 'https://www.vukamusic.com/sitemap.xml',
    host: 'https://www.vukamusic.com',
  };
}
