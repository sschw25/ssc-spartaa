'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { Student } from '@/lib/types/student';

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
    }}>
      {children}
    </AdminGlobalContext.Provider>
  );
}
