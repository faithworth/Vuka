import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: [
        '/',
        '/api/mcp',
        '/api/mcp-business/',
        '/api/mcp-github/',
        '/api/mcp-ops/',
        '/api/mcp-safety/',
      ],
      disallow: ['/api/', '/dashboard/', '/fan/'],
    },
    sitemap: 'https://www.vukamusic.com/sitemap.xml',
    host: 'https://www.vukamusic.com',
  };
}
