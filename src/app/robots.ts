import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/dashboard/', '/fan/'] },
    sitemap: 'https://www.vuka.co.za/sitemap.xml',
    host: 'https://www.vuka.co.za',
  };
}
