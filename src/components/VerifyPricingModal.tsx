'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Evento } from '@/types';
import {
  X,
  Play,
  ShieldCheck,
  Terminal,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  RefreshCw,
  Palette,
  Info
} from 'lucide-react';

interface VerifyPricingModalProps {
  evento: Evento;
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export default function VerifyPricingModal({
  evento,
  isOpen,
  onClose,
  onComplete,
}: VerifyPricingModalProps) {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [logs, setLogs] = useState<{ level: string; message: string }[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [dryRun, setDryRun] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isRunning) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isRunning]);

  if (!isOpen || !mounted) return null;

  const handleStartVerify = async () => {
    setIsRunning(true);
    setStatus('running');
    setLogs([]);

    try {
      const res = await fetch('/api/pricing/verify-chrome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promoterId: evento.promoterId,
          eventId: evento.eventId,
          showId: evento.showId,
          urlBase: evento.urlBase,
          dryRun,
        }),
      });

      if (!res.ok) {
        const errorJson = await res.json();
        throw new Error(errorJson.error || 'Error al iniciar la verificación.');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No se pudo establecer streaming de logs.');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const payload = JSON.parse(line.substring(6));
              if (payload.type === 'log') {
                setLogs((prev) => [...prev, { level: payload.level, message: payload.message }]);
              } else if (payload.type === 'finish') {
                setStatus(payload.success ? 'success' : 'error');
                setLogs((prev) => [
                  ...prev,
                  {
                    level: payload.success ? 'success' : 'error',
                    message: payload.message,
                  },
                ]);
                if (payload.success && onComplete) {
                  onComplete();
                }
              }
            } catch (e) {
              console.error('Error parseando SSE:', e);
            }
          }
        }
      }
    } catch (err: any) {
      setStatus('error');
      setLogs((prev) => [...prev, { level: 'error', message: err.message }]);
    } finally {
      setIsRunning(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 overflow-hidden animate-in fade-in duration-150">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Cabecera */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Barrido y Verificación de Localidades
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                  Fase 2 Chrome CDP
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Audita y auto-corrige colores en el mapa, switches de visibilidad y puntos de venta para cortesías.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isRunning}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar">
          {/* Tarjeta Informativa de Reglas Auditadas */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <CheckCircle className="w-4 h-4" />
                Reglas y Verificaciones que Ejecuta el Robot:
              </span>
              <span className="text-[11px] text-slate-500">
                Show: {evento.nombre}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-1.5 font-bold text-slate-200 mb-1">
                  <Palette className="w-3.5 h-3.5 text-emerald-400" />
                  <span>1. Color en el Mapa</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Verifica que cada localidad tenga asignado el color <code className="text-emerald-400">#86ff8d</code> en el editor SVG y lo re-aplica si está vacío o blanco.
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-1.5 font-bold text-slate-200 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>2. Switches de Canal</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Valida en la localidad que <strong>Mostrar en Web</strong> y <strong>Punto de Venta</strong> estén activos (Sí), y en cada precio que Venta en Línea esté activa (con Cortesías apagadas en línea).
                </p>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                <div className="flex items-center gap-1.5 font-bold text-slate-200 mb-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                  <span>3. Cortesías: ADMON Exclusivo</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  En <code className="text-purple-300">poslimit.aspx</code> de cada cortesía, verifica que únicamente <strong>ADMON</strong> esté activo y los demás puntos en No.
                </p>
              </div>
            </div>
          </div>

          {/* Consola de logs en vivo */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-72">
            <div className="px-3.5 py-2 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between text-xs text-slate-400 font-mono">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>Salida de Consola (Chrome CDP)</span>
              </div>
              {isRunning && (
                <span className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-sans">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Auditando localidades...
                </span>
              )}
            </div>

            <div className="p-3.5 font-mono text-xs overflow-y-auto flex-1 space-y-1.5 custom-scrollbar">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center">
                  <ShieldCheck className="w-7 h-7 mb-2 opacity-30 text-emerald-400" />
                  <p>Presiona &quot;Iniciar Barrido y Verificación&quot; para auditar el evento en Google Chrome.</p>
                </div>
              ) : (
                logs.map((log, idx) => {
                  let color = 'text-slate-300';
                  if (log.level === 'success' || log.message.includes('SUCCESS') || log.message.includes('✅')) color = 'text-emerald-400';
                  else if (log.level === 'warning' || log.message.includes('WARNING') || log.message.includes('⚠️')) color = 'text-amber-400';
                  else if (log.level === 'error' || log.message.includes('ERROR') || log.message.includes('❌')) color = 'text-rose-400';

                  return (
                    <div key={idx} className={`leading-relaxed whitespace-pre-wrap break-all ${color}`}>
                      {log.message}
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </div>

        {/* Pie de modal */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 select-none">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              disabled={isRunning}
              className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0 focus:ring-offset-0 w-4 h-4"
            />
            <span>Simulación (Dry-Run: sólo auditar sin modificar)</span>
          </label>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              onClick={onClose}
              disabled={isRunning}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition-all flex-1 sm:flex-none cursor-pointer"
            >
              Cerrar
            </button>

            <button
              onClick={handleStartVerify}
              disabled={isRunning}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-md flex items-center justify-center gap-2 flex-1 sm:flex-none cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span>Verificando y Corrigiendo...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Iniciar Barrido en Chrome</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
