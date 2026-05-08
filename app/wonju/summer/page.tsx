import { Metadata } from 'next'
import { CampusSummerPage } from '@/components/ssc/campus-summer-page'
import { campusSummerContent } from '@/lib/summer-content'

export const metadata: Metadata = {
  title: '원주 썸머스쿨 | SSC스파르타',
  description: campusSummerContent.wonju.hero.description,
}

export default function WonjuSummerSchool() {
  return <CampusSummerPage campusKey="wonju" />
}
