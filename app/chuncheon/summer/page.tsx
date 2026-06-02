import { Metadata } from 'next'
import { CampusSummerPage } from '@/components/ssc/campus-summer-page'
import { getSummerMetadata } from '@/lib/seo-utils'

export const metadata: Metadata = getSummerMetadata('chuncheon')

export default function ChuncheonSummerSchool() {
  return <CampusSummerPage campusKey="chuncheon" />
}
