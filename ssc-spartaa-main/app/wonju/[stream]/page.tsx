import { Metadata } from 'next'
import StreamPage from '@/components/ssc/stream-page'
import { StreamId } from '@/lib/stream-content'
import { getStreamMetadata } from '@/lib/seo-utils'

export async function generateMetadata({ params }: { params: Promise<{ stream: string }> }): Promise<Metadata> {
  const resolvedParams = await params
  return getStreamMetadata('wonju', resolvedParams.stream as StreamId)
}

export function generateStaticParams() {
  return [
    { stream: 'gongmuwon' },
    { stream: 'suneung' },
    { stream: 'imyong' },
    { stream: 'professional' },
    { stream: 'job' },
    { stream: 'managed' },
  ]
}

export default async function Page({ params }: { params: Promise<{ stream: string }> }) {
  const resolvedParams = await params;
  return <StreamPage campus="wonju" stream={resolvedParams.stream as StreamId} />
}
