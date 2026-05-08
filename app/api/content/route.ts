import { NextResponse } from 'next/server'
import { getContent, saveContent, resetContent, type SiteContent } from '@/lib/content'

export async function GET() {
  try {
    const content = await getContent()
    return NextResponse.json(content)
  } catch (error) {
    console.error('Error fetching content:', error)
    return NextResponse.json({ error: 'Failed to fetch content' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const content: SiteContent = await request.json()
    await saveContent(content)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving content:', error)
    return NextResponse.json({ error: 'Failed to save content' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const content = await resetContent()
    return NextResponse.json(content)
  } catch (error) {
    console.error('Error resetting content:', error)
    return NextResponse.json({ error: 'Failed to reset content' }, { status: 500 })
  }
}
