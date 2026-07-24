'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/haptics';
import { navigateWithTransition } from '@/lib/view-transition';
import { useAdminGlobalSheet } from '@/components/admin/admin-global-context';
import {
  getQuickTabGroups,
  type AdminMenuAction,
  type AdminMenuItem,
  type AdminQuickTabGroup,
} from '@/components/admin/admin-menu-data';

/**
 * iOS 26 Liquid Glass 하단 그룹 슈퍼탭.
 * 홈·채팅은 바로 실행하고, 나머지 그룹은 탭하면 유리 팝오버로 하위 화면을 펼친다.
 * 항목 구성은 사이드바(AdminMenuList)와 admin-menu-data 단일소스를 공유 —
 * 모든 관리자 화면(+학생 검색·추가·키오스크 액션)을 하단바에서 도달한다.
 */
export function AdminGlassTabBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { openChatDock, chatBadgeCount } = useAdminGlobalSheet();
  const [openKey, setOpenKey] = React.useState<string | null>(null);

  const groups = React.useMemo(() => getQuickTabGroups(), []);

  // 라우트가 바뀌면 열린 팝오버를 닫는다.
  React.useEffect(() => {
    setOpenKey(null);
  }, [pathname]);

  const runAction = (action: AdminMenuAction) => {
    if (action === 'chatDock') {
      openChatDock();
      return;
    }
    if (action === 'kiosk') {
      window.open('/attend/kiosk', '_blank');
      return;
    }
    if (action === 'search') {
      navigateWithTransition(() => router.push('/admin/consultation?focus=search'));
      return;
    }
    navigateWithTransition(() => router.push('/admin/consultation?action=add'));
  };

  const isGroupActive = (g: AdminQuickTabGroup) =>
    g.href ? pathname === g.href : !!g.items?.some((i) => i.href && pathname === i.href);

  const handleTab = (g: AdminQuickTabGroup) => {
    haptic('select');
    if (g.href) {
      navigateWithTransition(() => router.push(g.href!));
      setOpenKey(null);
      return;
    }
    if (g.action) {
      runAction(g.action);
      setOpenKey(null);
      return;
    }
    setOpenKey((k) => (k === g.key ? null : g.key));
  };

  const handleItem = (item: AdminMenuItem) => {
    haptic('select');
    setOpenKey(null);
    if (item.href) {
      navigateWithTransition(() => router.push(item.href!));
      return;
    }
    if (item.action) runAction(item.action);
  };

  const openGroup = groups.find((g) => g.key === openKey);

  return (
    <nav
      aria-label="빠른 이동"
      className="fixed inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 px-4 pointer-events-none"
    >
      {/* 팝오버 바깥 클릭 시 닫기 */}
      <AnimatePresence>
        {openKey && (
          <motion.button
            type="button"
            aria-label="메뉴 닫기"
            className="fixed inset-0 -z-10 cursor-default bg-transparent pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpenKey(null)}
          />
        )}
      </AnimatePresence>

      {/* 그룹 팝오버 */}
      <AnimatePresence mode="wait">
        {openGroup?.items && (
          <motion.div
            key={openGroup.key}
            className="glass-strong pointer-events-auto w-[min(88vw,340px)] rounded-3xl p-2"
            style={{ transformOrigin: 'bottom center' }}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="px-2 pb-1.5 pt-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              {openGroup.label}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {openGroup.items.map((item) => {
                const Icon = item.icon;
                const active = !!item.href && pathname === item.href;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleItem(item)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'press-spring flex items-center gap-2 rounded-2xl px-3 py-2.5 text-left transition-colors',
                      active
                        ? 'bg-[#0071E3]/12 text-[#0071E3]'
                        : 'text-slate-600 hover:bg-black/[0.04] dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-slate-100'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-[#0071E3]" />
                    <span className="min-w-0 truncate text-[12px] font-bold">{item.shortLabel || item.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 슈퍼탭 바 */}
      <div className="glass-strong pointer-events-auto flex items-center gap-0.5 rounded-full p-1.5">
        {groups.map((group) => {
          const active = isGroupActive(group);
          const open = openKey === group.key;
          const Icon = group.icon;
          const showBadge = group.key === 'chat' && chatBadgeCount > 0;
          return (
            <button
              key={group.key}
              type="button"
              onClick={() => handleTab(group)}
              aria-current={active ? 'page' : undefined}
              aria-expanded={group.items ? open : undefined}
              aria-label={showBadge ? `${group.label} — 확인 필요 ${chatBadgeCount}건` : undefined}
              className={cn(
                'press-spring relative flex min-w-[50px] flex-col items-center justify-center gap-0.5 rounded-full px-2.5 py-2 transition-colors duration-300 sm:min-w-[58px] sm:px-3',
                active || open
                  ? 'bg-[#0071E3]/12 text-[#0071E3]'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-black/[0.04]'
              )}
            >
              <Icon className="h-5 w-5" />
              <span className={cn('text-[10px] tracking-tight whitespace-nowrap', active || open ? 'font-semibold' : 'font-bold')}>
                {/* 좁은 화면(360px대)에서 6탭이 넘치지 않게 모바일은 축약 라벨 */}
                <span className="sm:hidden">{group.shortLabel || group.label}</span>
                <span className="hidden sm:inline">{group.label}</span>
              </span>
              {showBadge && (
                <span className="absolute right-1 top-0.5 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-black leading-none text-white">
                  {chatBadgeCount > 99 ? '99+' : chatBadgeCount}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
