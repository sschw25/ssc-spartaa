"use client";

import React, { MouseEvent, useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate } from "framer-motion";

export default function TiltCard({ children, className = "" }: { children: React.ReactNode, className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  // Very subtle tilt like Apple's TVOS cards
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["3deg", "-3deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-3deg", "3deg"]);

  const glowX = useTransform(mouseXSpring, [-0.5, 0.5], [0, 100]);
  const glowY = useTransform(mouseYSpring, [-0.5, 0.5], [0, 100]);

  // Very soft natural light reflection for Light mode
  const background = useMotionTemplate`radial-gradient(500px circle at ${glowX}% ${glowY}%, rgba(255,255,255,0.8), transparent 70%)`;

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
      }}
      className={`group relative w-full rounded-[24px] bg-white shadow-[0_15px_40px_-10px_rgba(0,0,0,0.08)] transition-all duration-500 ease-out hover:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] hover:border-black/5 ${className}`}
    >
      {/* Light Reflection Glow */}
      <div className="absolute inset-0 z-10 overflow-hidden rounded-[24px] pointer-events-none mix-blend-overlay">
        <motion.div 
          className="absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          style={{ background }}
        />
      </div>
      <div 
        style={{ transform: "translateZ(10px)" }}
        className="relative z-0 w-full h-full"
      >
        {children}
      </div>
    </motion.div>
  );
}
