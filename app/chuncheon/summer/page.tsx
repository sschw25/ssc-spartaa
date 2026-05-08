import { Metadata } from 'next'
import { CampusSummerPage } from '@/components/ssc/campus-summer-page'
import { campusSummerContent } from '@/lib/summer-content'

export const metadata: Metadata = {
  title: '춘천 썸머스쿨 | SSC스파르타',
  description: campusSummerContent.chuncheon.hero.description,
}

export default function ChuncheonSummerSchool() {
  return <CampusSummerPage campusKey="chuncheon" />
}
