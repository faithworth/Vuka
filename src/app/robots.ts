import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard/', '/fan/'] },
    sitemap: 'https://vuka-distro.vercel.app/sitemap.xml',
    host: 'https://vuka-distro.vercel.app',
  };
}
