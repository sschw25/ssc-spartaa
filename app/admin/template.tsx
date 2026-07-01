'use client';

export default function AdminTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className="route-transition">
      {children}
    </div>
  );
}
