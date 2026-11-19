'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import packageJson from '../../package.json';
import {
  Home,
  Users,
  BarChart3,
  Send,
  BookOpen,
  RefreshCw,
  ChevronDown,
  Menu,
  X,
  TrendingUp,
  Sun,
  Moon
} from 'lucide-react';

export interface AppSidebarShellProps {
  children: React.ReactNode;
  activeNav?: 'eventos' | 'informes' | 'clientes' | 'masivos' | 'analitica' | 'docs';
  onSelectMasivosTab?: (tab: 'sender' | 'analytics') => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  lastUpdatedLabel?: string;
}

export default function AppSidebarShell({
  children,
  activeNav,
  onSelectMasivosTab,
  onRefresh,
  refreshing = false,
  lastUpdatedLabel = 'hace un momento',
}: AppSidebarShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const savedTheme = localStorage.getItem('qrboletos_theme') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
      document.documentElement.classList.toggle('light', savedTheme === 'light');
    } else {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('qrboletos_theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
    document.documentElement.classList.toggle('light', newTheme === 'light');
  };

  const resolvedActive =
    activeNav ||
    (pathname?.startsWith('/informes')
      ? 'informes'
      : pathname?.startsWith('/clientes')
      ? 'clientes'
      : pathname?.startsWith('/masivos')
      ? 'masivos'
      : pathname?.startsWith('/docs')
      ? 'docs'
      : 'eventos');

  const navItems: Array<{
    id: string;
    label: string;
    href: string;
    icon: React.ElementType;
    onClick?: (e: React.MouseEvent) => void;
  }> = [
    {
      id: 'eventos',
      label: 'Resumen de Eventos',
      href: '/',
      icon: Home,
    },
    {
      id: 'clientes',
      label: 'Audiencia & CRM',
      href: '/clientes',
      icon: Users,
    },
    {
      id: 'analitica',
      label: 'Analítica & Cohortes',
      href: '/masivos?tab=analytics',
      icon: TrendingUp,
      onClick: onSelectMasivosTab
        ? (e: React.MouseEvent) => {
            e.preventDefault();
            onSelectMasivosTab('analytics');
            setMobileOpen(false);
          }
        : undefined,
    },
    {
      id: 'masivos',
      label: 'Envíos Masivos WA',
      href: '/masivos?tab=sender',
      icon: Send,
      onClick: onSelectMasivosTab
        ? (e: React.MouseEvent) => {
            e.preventDefault();
            onSelectMasivosTab('sender');
            setMobileOpen(false);
          }
        : undefined,
    },
    {
      id: 'informes',
      label: 'Informes & Ventas',
      href: '/informes',
      icon: BarChart3,
    },
    {
      id: 'docs',
      label: 'Documentación',
      href: '/docs',
      icon: BookOpen,
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col justify-between h-full py-5 px-3.5 select-none">
      {/* Parte Superior: Logo QRBoletos + Navegación Vertical */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-1.5">
          <Link
            href="/"
            className="flex items-center gap-2.5 group"
            title="Ir al Catálogo de Eventos"
          >
            <div className="bg-emerald-500/10 p-1.5 rounded-xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5 flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-6 h-6">
                <rect x="10" y="10" width="80" height="80" rx="18" fill="none" stroke="#047857" strokeWidth="6" />
                <rect x="21" y="55" width="11" height="25" rx="3" fill="#10B981" />
                <rect x="37" y="45" width="11" height="35" rx="3" fill="#10B981" />
                <rect x="53" y="35" width="11" height="45" rx="3" fill="#10B981" />
                <rect x="69" y="25" width="11" height="55" rx="3" fill="#10B981" />
                <path d="M 18 45 Q 45 40 64 22" fill="none" stroke="#047857" strokeWidth="6" strokeLinecap="round" />
                <polygon points="56,18 73,13 68,30" fill="#047857" stroke="#047857" strokeWidth="2" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <span className="text-xs font-extrabold tracking-wide text-slate-100 uppercase block">
                QRBoletos
              </span>
              <span className="text-[10px] text-emerald-400 font-mono font-bold block -mt-0.5">
                v{packageJson.version} • Helper
              </span>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lista de Navegación Vertical con Colores Originales (Esmeralda / Slate) */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = resolvedActive === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={item.onClick}
                className={
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ' +
                  (isActive
                    ? 'bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent text-emerald-400 border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)] font-bold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/70 border border-transparent')
                }
              >
                <Icon
                  className={
                    'w-4 h-4 shrink-0 transition-colors ' +
                    (isActive ? 'text-emerald-400' : 'text-slate-500')
                  }
                />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Parte Inferior: Datos Actualizados, Actualizar, Tema y Perfil */}
      <div className="space-y-3 pt-4 border-t border-slate-800/80">
        <div className="px-2 space-y-1">
          <span className="text-[11px] text-slate-500 block">Datos actualizados</span>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-300 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]" />
            <span className="truncate">{lastUpdatedLabel}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (onRefresh) onRefresh();
              else window.location.reload();
            }}
            className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-100 hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-all cursor-pointer"
          >
            <RefreshCw
              className={
                'w-3.5 h-3.5 text-slate-500 ' +
                (refreshing ? 'animate-spin text-emerald-400' : '')
              }
            />
            <span>{refreshing ? 'Actualizando...' : 'Actualizar'}</span>
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white transition-all cursor-pointer"
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
            )}
          </button>
        </div>

        {/* Tarjeta de Usuario Inferior */}
        <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl bg-slate-900/90 border border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-emerald-700 to-emerald-400 flex items-center justify-center text-[11px] font-bold text-slate-950 shrink-0 shadow">
              QR
            </div>
            <div className="min-w-0">
              <span className="text-xs font-semibold text-slate-200 block truncate">
                Admin QRBoletos
              </span>
              <span className="text-[10px] text-slate-400 block truncate">
                Analista de Operaciones
              </span>
            </div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Barra Superior Móvil */}
      <div className="lg:hidden flex items-center justify-between px-4 h-14 border-b border-slate-800 bg-slate-950 sticky top-0 z-40">
        <Link href="/" className="flex items-center gap-2">
          <div className="bg-emerald-500/10 p-1 rounded-lg border border-emerald-500/20 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-5 h-5">
              <rect x="10" y="10" width="80" height="80" rx="18" fill="none" stroke="#047857" strokeWidth="6" />
              <rect x="21" y="55" width="11" height="25" rx="3" fill="#10B981" />
              <rect x="37" y="45" width="11" height="35" rx="3" fill="#10B981" />
              <rect x="53" y="35" width="11" height="45" rx="3" fill="#10B981" />
              <rect x="69" y="25" width="11" height="55" rx="3" fill="#10B981" />
            </svg>
          </div>
          <span className="text-xs font-bold text-slate-100 uppercase tracking-wider">
            QRBoletos
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300"
        >
          <Menu className="w-4 h-4" />
        </button>
      </div>

      {/* Drawer Móvil */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-60 max-w-[80vw] bg-slate-950 border-r border-slate-800 h-full z-10">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Sidebar Fijo Izquierdo en Desktop */}
      <aside className="hidden lg:block w-[224px] shrink-0 bg-slate-950/90 border-r border-slate-800/80 sticky top-0 h-screen overflow-y-auto">
        {sidebarContent}
      </aside>

      {/* Contenedor Principal del Dashboard */}
      <div className="flex-1 min-w-0 bg-slate-950">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </div>
      </div>
    </div>
  );
}
