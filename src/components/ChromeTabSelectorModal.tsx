'use client';

import React from 'react';
import { X, ExternalLink, Globe, Layers, ArrowRight } from 'lucide-react';

export interface DetectedTab {
  id: string;
  title: string;
  url: string;
  promoterId?: string;
  eventId?: string;
  showId?: string;
}

interface ChromeTabSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  tabs: DetectedTab[];
  onSelectTab: (tabId: string) => void;
  isLoading?: boolean;
}

export default function ChromeTabSelectorModal({
  isOpen,
  onClose,
  tabs,
  onSelectTab,
  isLoading = false,
}: ChromeTabSelectorModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-fade-in">
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 flex items-center justify-center text-amber-800 dark:text-amber-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Pestañas de QRBoletos Detectadas ({tabs.length})
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Tienes varios shows abiertos en Chrome. Elige con cuál deseas trabajar:
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Lista de Pestañas */}
        <div className="p-5 max-h-96 overflow-y-auto space-y-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              disabled={isLoading}
              className="w-full text-left bg-slate-950 hover:bg-slate-800/80 border border-slate-800 hover:border-amber-500/50 p-4 rounded-xl transition-all group flex items-center justify-between gap-3 cursor-pointer disabled:opacity-50"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors truncate">
                    {tab.title}
                  </span>
                  {tab.showId && (
                    <span className="text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20 text-emerald-900 dark:text-emerald-400 px-2 py-0.5 rounded-full">
                      Show ID: {tab.showId}
                    </span>
                  )}
                  {tab.eventId && (
                    <span className="text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-400 px-2 py-0.5 rounded-full">
                      Evento: {tab.eventId}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-mono truncate">{tab.url}</p>
              </div>

              <div className="w-8 h-8 rounded-lg bg-slate-900 group-hover:bg-amber-500 flex items-center justify-center shrink-0 transition-all">
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-black transition-colors" />
              </div>
            </button>
          ))}
        </div>

        {/* Pie */}
        <div className="px-6 py-3 border-t border-slate-800/80 bg-slate-950/40 flex justify-end">
          <button
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
