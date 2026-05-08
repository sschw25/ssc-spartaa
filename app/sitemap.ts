import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.sscsparta.com'
  const campuses = ['wonju', 'chuncheon', 'chungju']
  const streams = ['gongmuwon', 'suneung', 'imyong', 'professional', 'job', 'managed']
  
  const routes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    ...campuses.map((campus) => ({
      url: `${baseUrl}/${campus}`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    })),
    ...campuses.flatMap((campus) => [
      {
        url: `${baseUrl}/${campus}/programs`,
        lastModified: new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      },
      {
        url: `${baseUrl}/${campus}/interior`,
        lastModified: new Date(),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      }
    ])
  ]

  campuses.forEach((campus) => {
    streams.forEach((stream) => {
      routes.push({
        url: `${baseUrl}/${campus}/${stream}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      })
    })
  })

  return routes
}
