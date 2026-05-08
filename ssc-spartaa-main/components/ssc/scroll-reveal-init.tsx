'use client'

import { useEffect } from 'react'

export function ScrollRevealInit() {
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
          }
        })
      },
      { threshold: 0.1 }
    )

    // Observe all fade-in-up elements on the page
    const observe = () => {
      document.querySelectorAll('.fade-in-up').forEach((el) => {
        observer.observe(el)
      })
    }

    observe()

    // Re-observe after a short delay to catch dynamically rendered elements
    const timer = setTimeout(observe, 300)

    return () => {
      observer.disconnect()
      clearTimeout(timer)
    }
  }, [])

  return null
}
