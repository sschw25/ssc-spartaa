import { MetadataRoute } from 'next'
 
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.sscsparta.com'
  const campuses = ['wonju', 'chuncheon', 'chungju']
  const streams = ['gongmuwon', 'suneung', 'imyong', 'professional', 'job', 'managed']
 
  const campusUrls = campuses.map((campus) => ({
    url: `${baseUrl}/${campus}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))
 
  const streamUrls = campuses.flatMap((campus) =>
    streams.map((stream) => ({
      url: `${baseUrl}/${campus}/${stream}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))
  )
 
  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },
    ...campusUrls,
    ...streamUrls,
  ]
}
