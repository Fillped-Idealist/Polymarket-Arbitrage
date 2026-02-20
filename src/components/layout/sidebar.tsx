'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, TrendingUp, Target, Zap, Menu, X } from 'lucide-react';
import { useState } from 'react';

const sidebarItems = [
  { id: 'overview', label: 'Overview', icon: Activity, path: '/' },
  { id: 'live-trading', label: 'Live Trading', icon: Target, path: '/live-trading-v2' },
  { id: 'backtest', label: 'Backtest', icon: TrendingUp, path: '/backtest' },
  { id: 'dashboard', label: 'Dashboard', icon: Zap, path: '/dashboard' },
];

interface SidebarProps {
  activeId?: string;
}

export default function Sidebar({ activeId }: SidebarProps) {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // 根据 pathname 确定当前激活的菜单项
  const getActiveId = () => {
    if (activeId) return activeId;
    if (pathname === '/') return 'overview';
    if (pathname === '/live-trading-v2') return 'live-trading';
    if (pathname === '/backtest') return 'backtest';
    if (pathname === '/dashboard') return 'dashboard';
    return 'overview';
  };

  const currentActiveId = getActiveId();

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <>
      {/* 桌面端侧边栏 */}
      <motion.aside
        initial={{ x: -100, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed left-0 top-0 z-50 hidden h-screen w-[200px] border-r border-slate-800/50 bg-[#0F172A]/95 backdrop-blur-sm lg:block"
      >
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="border-b border-slate-800/50 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#8B5CF6] shadow-lg shadow-[#06B6D4]/20">
                <Activity className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-sm text-white">Polymarket</h1>
                <p className="text-[9px] text-slate-400">Arbitrage System</p>
              </div>
            </div>
          </div>

          {/* 导航菜单 */}
          <nav className="flex-1 overflow-y-auto px-3 py-2">
            <ul className="space-y-0.5">
              {sidebarItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentActiveId === item.id;

                return (
                  <li key={item.id}>
                    <Link
                      href={item.path}
                      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-300 ${
                        isActive
                          ? 'bg-[#1E293B] text-[#06B6D4] shadow-lg shadow-[#06B6D4]/10'
                          : 'text-slate-400 hover:bg-[#1E293B]/50 hover:text-slate-100'
                      }`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="activeIndicator"
                          className="absolute left-0 h-6 w-0.5 rounded-r-full bg-[#06B6D4]"
                          initial={false}
                          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        />
                      )}
                      <Icon className="h-4 w-4" />
                      <span className="font-medium">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* 底部状态 */}
          <div className="border-t border-slate-800/50 p-3">
            <div className="flex items-center gap-2 rounded-lg bg-[#1E293B]/30 px-3 py-2">
              <div className="flex h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
              <div className="flex-1">
                <p className="text-[9px] text-slate-400">Status</p>
                <p className="text-[10px] font-medium text-[#10B981]">Live</p>
              </div>
            </div>
          </div>
        </div>
      </motion.aside>

      {/* 移动端顶部栏 */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 border-b border-slate-800/50 bg-[#0F172A]/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMobileMenu}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-[#1E293B]/50 hover:text-slate-100"
            >
              {isMobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#06B6D4] to-[#8B5CF6]">
                <Activity className="h-3.5 w-3.5 text-white" />
              </div>
              <span className="font-bold text-sm text-white">Polymarket</span>
            </div>
          </div>
          <div className="flex h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
        </div>

        {/* 移动端菜单 */}
        <AnimatePresence>
          {isMobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border-t border-slate-800/50 bg-[#0F172A] px-4 py-2"
            >
              <ul className="space-y-0.5">
                {sidebarItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentActiveId === item.id;

                  return (
                    <li key={item.id}>
                      <Link
                        href={item.path}
                        onClick={() => {
                          setIsMobileMenuOpen(false);
                        }}
                        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all duration-300 ${
                          isActive
                            ? 'bg-[#1E293B] text-[#06B6D4]'
                            : 'text-slate-400 hover:bg-[#1E293B]/50 hover:text-slate-100'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="font-medium">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 移动端占位 */}
      <div className="lg:hidden h-12" />
    </>
  );
}
