'use client';

// 인앱 확인/입력 다이얼로그 — 브라우저 네이티브 window.confirm / window.prompt 를 대체한다.
// 네이티브 다이얼로그는 브라우저 크롬(=학생이 말하는 "웹탭")으로 떠서 iOS26 Liquid Glass 디자인과 어긋나고,
// 일부 모바일 브라우저(iOS PWA)에서 차단되기도 한다. 이 컴포넌트는 앱 안에서 동일한 톤으로 뜬다.
//
// 사용법(드롭인):
//   const confirm = useConfirm();
//   if (await confirm({ title: '이 신청을 취소할까요?' })) { ... }
//
//   const prompt = usePrompt();
//   const note = await prompt({ title: '재승인 요청 사유', multiline: true });
//   if (note !== null) { ... }   // 취소 시 null
//
// 루트 레이아웃에 <ConfirmProvider> 를 한 번만 마운트하면 앱 전역에서 훅을 쓸 수 있다.

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  /** 'danger' 면 확인 버튼을 빨강으로 — 취소/삭제 등 되돌리기 어려운 액션에 사용 */
  tone?: 'default' | 'danger';
}

export interface PromptOptions extends ConfirmOptions {
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  /** true 면 빈 값도 허용(기본은 공백만 있으면 확인 버튼 비활성) */
  allowEmpty?: boolean;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
type PromptFn = (options: PromptOptions) => Promise<string | null>;

const ConfirmContext = createContext<ConfirmFn | null>(null);
const PromptContext = createContext<PromptFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm 은 <ConfirmProvider> 안에서만 사용할 수 있습니다.');
  return ctx;
}

export function usePrompt(): PromptFn {
  const ctx = useContext(PromptContext);
  if (!ctx) throw new Error('usePrompt 은 <ConfirmProvider> 안에서만 사용할 수 있습니다.');
  return ctx;
}

type DialogState =
  | { kind: 'confirm'; options: ConfirmOptions }
  | { kind: 'prompt'; options: PromptOptions };

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DialogState | null>(null);
  const [inputValue, setInputValue] = useState('');
  // confirm→boolean, prompt→string|null 를 각각 resolve. 타입은 호출부에서 좁혀진다.
  const resolverRef = useRef<((value: unknown) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    setState({ kind: 'confirm', options });
    setInputValue('');
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve as (value: unknown) => void;
    });
  }, []);

  const prompt = useCallback<PromptFn>((options) => {
    setState({ kind: 'prompt', options });
    setInputValue(options.defaultValue ?? '');
    setOpen(true);
    return new Promise<string | null>((resolve) => {
      resolverRef.current = resolve as (value: unknown) => void;
    });
  }, []);

  // 미해결 프로미스를 정리하며 닫는다. confirm 취소=false, prompt 취소=null.
  const settle = useCallback(
    (value: boolean | string | null) => {
      resolverRef.current?.(value);
      resolverRef.current = null;
      setOpen(false);
    },
    [],
  );

  const cancelValue = state?.kind === 'prompt' ? null : false;
  const options = state?.options;
  const danger = options?.tone === 'danger';
  const isPrompt = state?.kind === 'prompt';
  const promptOptions = isPrompt ? (state.options as PromptOptions) : null;
  const trimmedEmpty = inputValue.trim().length === 0;
  const confirmDisabled = isPrompt && !promptOptions?.allowEmpty && trimmedEmpty;

  return (
    <ConfirmContext.Provider value={confirm}>
      <PromptContext.Provider value={prompt}>
        {children}
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            if (!next) settle(cancelValue);
          }}
        >
          <AlertDialogContent className="rounded-3xl border border-black/[0.06] bg-white p-6 shadow-[0_24px_60px_rgba(15,23,42,0.18)] sm:max-w-[380px]">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[17px] font-black tracking-tight text-[#1D1D1F]">
                {options?.title}
              </AlertDialogTitle>
              {options?.description && (
                <AlertDialogDescription className="text-[13px] font-medium leading-relaxed text-[#86868B]">
                  {options.description}
                </AlertDialogDescription>
              )}
            </AlertDialogHeader>

            {isPrompt &&
              (promptOptions?.multiline ? (
                <textarea
                  autoFocus
                  rows={3}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={promptOptions?.placeholder}
                  className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none"
                />
              ) : (
                <input
                  autoFocus
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={promptOptions?.placeholder}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !confirmDisabled) settle(inputValue);
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 placeholder:text-slate-300 focus:border-[#0071E3] focus:outline-none"
                />
              ))}

            <AlertDialogFooter className="gap-2 sm:gap-2">
              <AlertDialogCancel
                onClick={() => settle(cancelValue)}
                className="h-11 rounded-2xl border-slate-200 bg-white text-sm font-bold text-slate-600 hover:bg-slate-50"
              >
                {options?.cancelText || '취소'}
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={confirmDisabled}
                onClick={() => settle(isPrompt ? inputValue : true)}
                className={
                  danger
                    ? 'h-11 rounded-2xl bg-red-500 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-40'
                    : 'h-11 rounded-2xl bg-[#0071E3] text-sm font-bold text-white hover:bg-[#0077ED] disabled:opacity-40'
                }
              >
                {options?.confirmText || '확인'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PromptContext.Provider>
    </ConfirmContext.Provider>
  );
}
