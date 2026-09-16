'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  AlertCircle,
  Ticket,
  AlertTriangle
} from 'lucide-react';
import { CatalogShowDetail } from '@/lib/qrboletosApi';

export interface AvailabilityModalProps {
  showId: number | string;
  eventName: string;
  onClose: () => void;
}

export default function AvailabilityModal({ showId, eventName, onClose }: AvailabilityModalProps) {
  const [detail, setDetail] = useState<CatalogShowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAvailability = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/catalog?id=' + encodeURIComponent(showId));
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'No se pudo obtener el aforo en vivo.');
      }
      setDetail(json.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailability();
  }, [showId]);

  const totalAforo = detail?.localidades?.reduce((acc, loc) => acc + (loc.aforo || 0), 0) || 0;
  const totalDisponibles = detail?.localidades?.reduce((acc, loc) => acc + (loc.disponibles || 0), 0) || 0;
  const totalOcupados = totalAforo - totalDisponibles;
  const porcentajeOcupacion = totalAforo > 0 ? Math.round((totalOcupados / totalAforo) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                Aforo y Disponibilidad en Vivo
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold">
                  Catalog API v1
                </span>
              </h3>
              <p className="text-xs text-slate-400 font-medium line-clamp-1">{eventName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchAvailability}
              disabled={loading}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer disabled:opacity-50"
              title="Recargar aforo"
            >
              <RefreshCw className={'w-4 h-4 ' + (loading ? 'animate-spin text-emerald-400' : '')} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-xs font-semibold">Consultando aforo en tiempo real con QRBoletos...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold">Estado de consulta</p>
                <p className="text-slate-400">{error}</p>
                <p className="text-[11px] text-slate-500 pt-1">
                  Para vincular con la API, asegúrate de configurar QRBOLETOS_CLIENT_ID y QRBOLETOS_CLIENT_SECRET.
                </p>
              </div>
            </div>
          ) : detail ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5">
                  <span className="text-[10px] text-slate-400 uppercase font-mono font-semibold block">Aforo Total</span>
                  <span className="text-lg font-black text-white font-mono">{totalAforo.toLocaleString()}</span>
                </div>
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5">
                  <span className="text-[10px] text-emerald-400 uppercase font-mono font-semibold block">Disponibles</span>
                  <span className="text-lg font-black text-emerald-400 font-mono">{totalDisponibles.toLocaleString()}</span>
                </div>
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5">
                  <span className="text-[10px] text-amber-400 uppercase font-mono font-semibold block">Ocupados</span>
                  <span className="text-lg font-black text-amber-400 font-mono">{totalOcupados.toLocaleString()}</span>
                </div>
                <div className="bg-slate-950/80 border border-slate-800/80 rounded-2xl p-3.5">
                  <span className="text-[10px] text-slate-400 uppercase font-mono font-semibold block">Ocupación</span>
                  <span className="text-lg font-black text-white font-mono">{porcentajeOcupacion}%</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-slate-400">
                  <span>Progreso de Ocupación General</span>
                  <span className="font-mono text-emerald-400">{porcentajeOcupacion}% Ocupado</span>
                </div>
                <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                    style={{ width: Math.min(porcentajeOcupacion, 100) + '%' }}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Localidades ({detail.localidades?.length || 0})
                </h4>

                <div className="space-y-3">
                  {detail.localidades?.map((loc) => {
                    const pctDisp = loc.aforo > 0 ? (loc.disponibles / loc.aforo) * 100 : 0;
                    const isSoldOut = loc.disponibles === 0;
                    const isLowStock = loc.disponibles > 0 && pctDisp < 15;

                    return (
                      <div
                        key={loc.id_evento_localidad}
                        className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white uppercase">{loc.localidad}</span>
                              {isSoldOut ? (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                                  AGOTADO
                                </span>
                              ) : isLowStock ? (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  ÚLTIMOS CUPOS
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                  EN VENTA
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-500 font-mono">ID Localidad: #{loc.id_evento_localidad}</span>
                          </div>

                          <div className="flex items-center gap-4 text-xs font-mono">
                            <div className="text-right">
                              <span className="text-slate-500 block text-[10px] uppercase">Disponibles</span>
                              <span className="font-bold text-emerald-400 text-sm">{loc.disponibles}</span>
                            </div>
                            <div className="text-right">
                              <span className="text-slate-500 block text-[10px] uppercase">Aforo</span>
                              <span className="font-bold text-slate-300 text-sm">{loc.aforo}</span>
                            </div>
                          </div>
                        </div>

                        <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                          <div
                            className={'h-full rounded-full ' + (isSoldOut ? 'bg-rose-500' : isLowStock ? 'bg-amber-500' : 'bg-emerald-500')}
                            style={{ width: Math.max(0, 100 - pctDisp) + '%' }}
                          />
                        </div>

                        {loc.precios && loc.precios.length > 0 && (
                          <div className="pt-2 border-t border-slate-900 flex flex-wrap gap-2">
                            {loc.precios.map((pr, pIdx) => (
                              <div
                                key={pIdx}
                                className={'px-2.5 py-1 rounded-xl text-[11px] font-medium border flex items-center gap-1.5 ' + (pr.etapa?.vigente
                                    ? 'bg-slate-900 text-slate-200 border-slate-700'
                                    : 'bg-slate-950 text-slate-500 border-slate-900 opacity-60')}
                              >
                                <span>{pr.titulo}:</span>
                                <span className="font-bold text-emerald-400 font-mono">
                                  ${Number(pr.valor).toLocaleString()} {pr.moneda}
                                </span>
                                {pr.etapa?.vigente ? (
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Etapa Vigente" />
                                ) : (
                                  <span className="text-[9px] text-slate-500">(Cerrada)</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : null}
        </div>

        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-all cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
