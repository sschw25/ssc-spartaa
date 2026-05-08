import React from 'react'

interface RhythmicTextProps {
  text: string
  className?: string
  pcMaxWidth?: string | number
}

/**
 * 텍스트 내의 줄바꿈(\n)을 렌더링하고 단어 단위 줄바꿈을 지원하는 컴포넌트입니다.
 * 
 * @param text 렌더링할 텍스트
 * @param className 추가 스타일
 * @param pcMaxWidth PC에서 중앙 정렬을 위한 최대 가로 폭
 */
export function RhythmicText({ text, className = '', pcMaxWidth }: RhythmicTextProps) {
  if (!text) return null

  // \n 문자를 기준으로 문단/줄 구분
  const lines = text.split('\n')

  return (
    <span 
      className={`inline-block whitespace-pre-line break-keep overflow-wrap-anywhere ${className}`}
      style={pcMaxWidth ? { maxWidth: pcMaxWidth, marginLeft: 'auto', marginRight: 'auto', display: 'block' } : {}}
    >
      {lines.map((line, idx) => (
        <span key={idx} className="block mb-[0.2em] last:mb-0">
          {line}
        </span>
      ))}
    </span>
  )
}
