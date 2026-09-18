'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CustomersView from '@/components/CustomersView';
import packageJson from '../../../package.json';
import {
  BarChart3,
  Users,
  BookOpen,
  Calendar,
  Sun,
  Moon
} from 'lucide-react';

export default function ClientesPage() {
  const router = useRouter();
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const savedTheme = localStorage.getItem('qrboletos_theme') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('qrboletos_theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Barra de Navegación Superior */}
      <nav className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo y Enlaces Principales */}
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all text-left"
              title="Volver al Catálogo de Eventos"
            >
              <div className="bg-emerald-500/10 p-1.5 rounded-xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-7 h-7">
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
                <span className="font-extrabold text-sm tracking-wide text-slate-100 uppercase block">
                  QRBoletos
                </span>
                <span className="text-[10px] text-slate-400 font-medium tracking-wider -mt-1 block">
                  Dashboard Helper
                </span>
              </div>
            </Link>

            <Link
              href="/docs"
              className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 font-mono font-bold transition-all border border-slate-700/60 hover:border-emerald-500/40 shadow-sm"
              title="Ver documentación y versiones"
            >
              <BookOpen className="w-2.5 h-2.5 text-emerald-400" />
              <span>v{packageJson.version}</span>
            </Link>
          </div>

          {/* Menú de Navegación entre Módulos */}
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-all flex items-center gap-1.5"
              title="Ir al Catálogo de Eventos"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Eventos</span>
            </Link>

            <Link
              href="/informes"
              className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-900 border border-transparent hover:border-slate-800 transition-all flex items-center gap-1.5"
              title="Ir al Módulo de Informes"
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Informes</span>
            </Link>

            <div className="px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-400 bg-indigo-500/10 border border-indigo-500/30 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <span>Audiencia & CRM</span>
            </div>

            <Link
              href="/docs"
              className="p-2 bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-slate-300 hover:text-emerald-400 rounded-xl transition-all cursor-pointer shadow-sm active:scale-95 flex items-center gap-1.5 text-xs font-semibold px-2.5"
              title="Documentación y Registro de Versiones"
            >
              <BookOpen className="w-4 h-4 text-emerald-400" />
              <span className="hidden md:inline text-xs text-slate-300">Docs</span>
            </Link>

            {/* Selector de Tema */}
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl transition-all hover:text-white cursor-pointer shadow-sm active:scale-95 ml-1"
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Contenido Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <CustomersView onBack={() => router.push('/')} />
      </main>
    </div>
  );
}
