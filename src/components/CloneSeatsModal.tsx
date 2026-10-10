'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Evento } from '@/types';
import {
  X,
  Play,
  Armchair,
  Terminal,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Layers,
  Copy,
  Info
} from 'lucide-react';

interface CloneSeatsModalProps {
  evento: Evento;
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export default function CloneSeatsModal({
  evento,
  isOpen,
  onClose,
  onComplete,
}: CloneSeatsModalProps) {
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [logs, setLogs] = useState<{ level: string; message: string }[]>([]);
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [dryRun, setDryRun] = useState<boolean>(false);
  const [sourcePromoter, setSourcePromoter] = useState<string>('ARECOL');
  const [sourceEvent, setSourceEvent] = useState<string>('PLANOS');
  const [sourceShow, setSourceShow] = useState<string>('PRUEBA');
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
  }, [onClose, runningStatus()]);

  function runningStatus() {
    return isRunning;
  }

  if (!isOpen || !mounted) return null;

  const handleStartClone = async () => {
    setIsRunning(true);
    setStatus('running');
    setLogs([]);

    try {
      const res = await fetch('/api/chrome/clone-seats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promoterId: evento.promoterId,
          eventId: evento.eventId,
          showId: evento.showId,
          urlBase: evento.urlBase,
          dryRun,
          sourcePromoter,
          sourceEvent,
          sourceShow,
        }),
      });

      if (!res.ok) {
        const errorJson = await res.json();
        throw new Error(errorJson.error || 'Error al iniciar la clonación.');
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
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Armchair className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Clonar Planos de Acomodación (Silletería)
                <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold">
                  Chrome CDP
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Copia las distribuciones de silletería desde el plano de referencia para cada localidad del show.
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
          {/* Tarjeta Informativa de Referencia */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5 text-blue-400">
                <Copy className="w-4 h-4" />
                Parámetros de Clonación Origen:
              </span>
              <span className="text-[11px] text-slate-500">
                Evento destino: {evento.nombre}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  1. Promotor Origen
                </span>
                <input
                  type="text"
                  value={sourcePromoter}
                  onChange={(e) => setSourcePromoter(e.target.value)}
                  disabled={isRunning}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  2. Evento Origen
                </span>
                <input
                  type="text"
                  value={sourceEvent}
                  onChange={(e) => setSourceEvent(e.target.value)}
                  disabled={isRunning}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  3. Espectáculo Origen
                </span>
                <input
                  type="text"
                  value={sourceShow}
                  onChange={(e) => setSourceShow(e.target.value)}
                  disabled={isRunning}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded px-2.5 py-1 text-xs font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-400 flex items-start gap-1.5 pt-1">
              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <span>
                Para cada localidad sin acomodación, el robot buscará la opción coincidente en el modal de QRBoletos (ej. <strong>PREFERENCIAL 1</strong>, <strong>VIP 3</strong>, <strong>PLATEA</strong>) y guardará la distribución. Las que ya cuenten con plano serán conservadas sin sobreescribir.
              </span>
            </p>
          </div>

          {/* Consola de logs en vivo */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-72">
            <div className="px-3.5 py-2 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between text-xs text-slate-400 font-mono">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-blue-400" />
                <span>Salida de Consola (Chrome CDP)</span>
              </div>
              {isRunning && (
                <span className="flex items-center gap-1.5 text-blue-400 text-[11px] font-sans">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                  Ejecutando clonación...
                </span>
              )}
            </div>

            <div className="p-3.5 font-mono text-xs overflow-y-auto flex-1 space-y-1.5 custom-scrollbar">
              {logs.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center">
                  <Armchair className="w-7 h-7 mb-2 opacity-30 text-blue-400" />
                  <p>Presiona &quot;Iniciar Clonación&quot; para comenzar el proceso en Google Chrome.</p>
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
              className="rounded bg-slate-950 border-slate-700 text-blue-500 focus:ring-0 focus:ring-offset-0 w-4 h-4"
            />
            <span>Simulación (Dry-Run: sólo verificar sin guardar)</span>
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
              onClick={handleStartClone}
              disabled={isRunning}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-md flex items-center justify-center gap-2 flex-1 sm:flex-none cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <>
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  <span>Clonando Planos...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Iniciar Clonación en Chrome</span>
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
