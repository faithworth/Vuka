import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'https://vuka-distro.vercel.app';
  return [
    { url: base, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    { url: `${base}/store`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.9 },
    { url: `${base}/store/beats`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/store/releases`, lastModified: new Date(), changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/industry`, lastModified: new Date(), changeFrequency: 'weekly', priority: 0.8 },
    { url: `${base}/auth/register`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/auth/login`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
  ];
}
