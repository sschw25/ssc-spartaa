'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { AdminGlobalProvider, useAdminGlobalSheet } from '@/components/admin/admin-global-context';
import { StudentDetailSheet } from '@/components/admin/student-detail-sheet';

function GlobalStudentSheet() {
  const { selectedStudent, isSheetOpen, closeSheet, updateSheetStudent, sheetCallbacks } = useAdminGlobalSheet();

  return (
    <StudentDetailSheet
      student={selectedStudent}
      isOpen={isSheetOpen}
      onClose={closeSheet}
      onUpdate={(updated) => {
        updateSheetStudent(updated);
        sheetCallbacks.onUpdate?.(updated);
      }}
      onDelete={(studentId) => {
        closeSheet();
        sheetCallbacks.onDelete?.(studentId);
      }}
      students={sheetCallbacks.allStudents || []}
      defaultTab={sheetCallbacks.defaultTab}
    />
  );
}

function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/admin';

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <>
      {children}
      <GlobalStudentSheet />
    </>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminGlobalProvider>
      <AdminLayoutContent>{children}</AdminLayoutContent>
    </AdminGlobalProvider>
  );
}
