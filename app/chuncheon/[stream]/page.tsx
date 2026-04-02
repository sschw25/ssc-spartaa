import StreamPage from '@/components/ssc/stream-page'
import { StreamId } from '@/lib/stream-content'

export function generateStaticParams() {
  return [
    { stream: 'gongmuwon' },
    { stream: 'suneung' },
    { stream: 'imyong' },
    { stream: 'professional' },
    { stream: 'job' },
  ]
}

export default async function Page({ params }: { params: Promise<{ stream: string }> }) {
  const resolvedParams = await params;
  return <StreamPage campus="chuncheon" stream={resolvedParams.stream as StreamId} />
}
