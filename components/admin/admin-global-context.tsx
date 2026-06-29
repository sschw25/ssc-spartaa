'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Student } from '@/lib/types/student';

const MENU_PIN_STORAGE_KEY = 'admin-menu-pinned';

interface SheetCallbacks {
  onUpdate?: (student: Student) => void;
  onDelete?: (studentId: string) => void;
  allStudents?: Student[];
  defaultTab?: string;
}

interface AdminGlobalCtx {
  selectedStudent: Student | null;
  isSheetOpen: boolean;
  openStudent: (student: Student, callbacks?: SheetCallbacks) => void;
  updateSheetStudent: (student: Student) => void;
  closeSheet: () => void;
  sheetCallbacks: SheetCallbacks;
  /** PC 모드 좌측 메뉴 고정 여부 (localStorage 영속) */
  isMenuPinned: boolean;
  toggleMenuPin: () => void;
}

const AdminGlobalContext = createContext<AdminGlobalCtx | null>(null);

export function useAdminGlobalSheet() {
  const ctx = useContext(AdminGlobalContext);
  if (!ctx) throw new Error('useAdminGlobalSheet must be used inside AdminGlobalProvider');
  return ctx;
}

export function AdminGlobalProvider({ children }: { children: React.ReactNode }) {
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetCallbacks, setSheetCallbacks] = useState<SheetCallbacks>({});
  const [isMenuPinned, setIsMenuPinned] = useState(false);

  // 저장된 메뉴 고정 상태 복원
  useEffect(() => {
    try {
      if (localStorage.getItem(MENU_PIN_STORAGE_KEY) === '1') {
        setIsMenuPinned(true);
      }
    } catch {
      /* localStorage 접근 불가 시 무시 */
    }
  }, []);

  const toggleMenuPin = useCallback(() => {
    setIsMenuPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MENU_PIN_STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* localStorage 접근 불가 시 무시 */
      }
      return next;
    });
  }, []);

  const openStudent = useCallback((student: Student, callbacks?: SheetCallbacks) => {
    setSelectedStudent(student);
    setIsSheetOpen(true);
    setSheetCallbacks(callbacks || {});
  }, []);

  const updateSheetStudent = useCallback((student: Student) => {
    setSelectedStudent(student);
  }, []);

  const closeSheet = useCallback(() => {
    setIsSheetOpen(false);
    setSelectedStudent(null);
    setSheetCallbacks({});
  }, []);

  return (
    <AdminGlobalContext.Provider value={{
      selectedStudent,
      isSheetOpen,
      openStudent,
      updateSheetStudent,
      closeSheet,
      sheetCallbacks,
      isMenuPinned,
      toggleMenuPin,
    }}>
      {children}
    </AdminGlobalContext.Provider>
  );
}
