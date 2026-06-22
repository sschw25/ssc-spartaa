'use client'

import React, { useState } from 'react'
import { HelpCircle, ChevronDown } from 'lucide-react'

interface FaqItem {
  question: string
  answer: string
}

interface FaqSectionProps {
  faqList: FaqItem[]
}

export function FAQSection({ faqList }: FaqSectionProps) {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index)
  }

  return (
    <div className="space-y-4">
      {faqList.map((faq, index) => {
        const isOpen = openFaqIndex === index
        return (
          <div
            key={index}
            className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden transition-all duration-200"
          >
            <button
              onClick={() => toggleFaq(index)}
              className="w-full px-6 py-4 flex items-center justify-between text-left font-bold text-sm md:text-base hover:bg-[#F8F9FA] transition-colors"
            >
              <span className="flex items-center gap-2">
                <HelpCircle size={18} className="text-[#0071E3] shrink-0" />
                {faq.question}
              </span>
              <ChevronDown
                size={16}
                className={`text-[#86868B] transition-transform duration-200 ${
                  isOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {isOpen && (
              <div className="px-6 pb-5 pt-1 text-sm text-[#515154] leading-relaxed border-t border-[#F5F5F7] bg-[#F8F9FA]/50">
                {faq.answer}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
