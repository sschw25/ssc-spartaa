'use client';

import { useEffect, useRef } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

interface AnimatedNumberProps {
  value: number;
  suffix?: string;
  className?: string;
}

export function AnimatedNumber({ value, suffix = '', className }: AnimatedNumberProps) {
  const ref = useRef(false);
  const spring = useSpring(0, { stiffness: 100, damping: 30, restDelta: 0.001 });
  const display = useTransform(spring, (c) => Math.round(c).toLocaleString() + suffix);

  useEffect(() => {
    spring.set(value);
  }, [value, spring]);

  return <motion.span className={className}>{display}</motion.span>;
}
