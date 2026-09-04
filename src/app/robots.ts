import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: [
        '/',
        '/store',
        '/store/beats',
        '/store/releases',
        '/store/videos',
        '/store/samples',
        '/discover',
        '/marketplace',
        '/industry',
        '/events',
        '/campaigns',
        '/artist/',
        '/beats/',
        '/release/',
        '/api/mcp',
        '/api/mcp-business/',
        '/api/mcp-github/',
        '/api/mcp-ops/',
        '/api/mcp-safety/',
      ],
      disallow: ['/admin', '/dashboard/', '/fan/', '/api/', '/auth/', '/download/', '/checkout/'],
    },
    sitemap: 'https://www.vukamusic.com/sitemap.xml',
    host: 'https://www.vukamusic.com',
  };
}
