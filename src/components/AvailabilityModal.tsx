'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  RefreshCw,
  AlertCircle,
  Ticket,
  AlertTriangle,
  Code2,
  Copy,
  Check
} from 'lucide-react';
import { CatalogShowDetail } from '@/lib/qrboletosApi';

export interface AvailabilityModalProps {
  showId: number | string;
  eventName: string;
  onClose: () => void;
}

export default function AvailabilityModal({ showId, eventName, onClose }: AvailabilityModalProps) {
  const [currentShowId, setCurrentShowId] = useState<number | string>(showId);
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [detail, setDetail] = useState<CatalogShowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showJsonRaw, setShowJsonRaw] = useState(false);
  const [rawJson, setRawJson] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyJson = () => {
    if (!rawJson) return;
    navigator.clipboard.writeText(JSON.stringify(rawJson, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchAvailability = async (overrideId?: number | string) => {
    const idToFetch = overrideId !== undefined ? overrideId : currentShowId;
    setLoading(true);
    setError(null);
    try {
      const savedId = typeof window !== 'undefined' ? localStorage.getItem('qrboletos_catalog_client_id') || localStorage.getItem('qrboletos_client_id') || '' : '';
      const savedSecret = typeof window !== 'undefined' ? localStorage.getItem('qrboletos_catalog_client_secret') || localStorage.getItem('qrboletos_client_secret') || '' : '';
      let url = `/api/catalog?id=${encodeURIComponent(idToFetch)}&name=${encodeURIComponent(eventName)}`;
      if (savedId && savedSecret) {
        url += '&clientId=' + encodeURIComponent(savedId) + '&clientSecret=' + encodeURIComponent(savedSecret);
      }
      const res = await fetch(url);
      const json = await res.json();
      setRawJson(json);
      if (json.catalogItems) {
        setCatalogItems(json.catalogItems);
      }
      if (json.resolvedShowId && json.resolvedShowId !== idToFetch) {
        setCurrentShowId(json.resolvedShowId);
      }
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
    fetchAvailability(showId);
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
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-slate-300 font-medium line-clamp-1">{eventName}</p>
                {detail?.espectaculo && detail.espectaculo !== detail.evento && (
                  <span className="text-[11px] text-teal-300 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-lg font-medium">
                    {detail.espectaculo}
                  </span>
                )}
                {detail?.venue?.nombre && (
                  <span className="text-[11px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-lg">
                    📍 {detail.venue.nombre}{detail.venue.ciudad ? `, ${detail.venue.ciudad}` : ''}
                  </span>
                )}
                {currentShowId ? (
                  <span className="text-[10px] text-slate-400 font-mono bg-slate-800 px-1.5 py-0.5 rounded">
                    ID API: {currentShowId}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {rawJson && (
              <button
                onClick={() => setShowJsonRaw(!showJsonRaw)}
                className={`p-2 rounded-xl text-xs font-mono flex items-center gap-1.5 transition-all cursor-pointer ${
                  showJsonRaw
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="Ver / Ocultar respuesta JSON de la API"
              >
                <Code2 className="w-4 h-4" />
                <span className="hidden sm:inline text-[11px] font-bold">JSON</span>
              </button>
            )}
            <button
              onClick={() => fetchAvailability()}
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
          {showJsonRaw && rawJson && (
            <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-emerald-400 font-bold uppercase">Respuesta JSON de QRBoletos API</span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    ({rawJson.data?.localidades?.length || 0} localidades recibidas)
                  </span>
                </div>
                <button
                  onClick={handleCopyJson}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400 font-bold">Copiado</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar JSON</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="text-[11px] font-mono text-slate-300 bg-slate-900/90 p-4 rounded-xl overflow-x-auto max-h-72 border border-slate-800/80 leading-relaxed select-all">
                {JSON.stringify(rawJson, null, 2)}
              </pre>
            </div>
          )}

          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-xs font-semibold">Consultando aforo en tiempo real con QRBoletos...</p>
            </div>
          ) : error ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Estado de consulta</p>
                  <p className="text-slate-400">{error}</p>
                  <p className="text-[11px] text-slate-500 pt-1">
                    Para vincular con la API, configura QRBOLETOS_CATALOG_CLIENT_ID y QRBOLETOS_CATALOG_CLIENT_SECRET (o ingrésalas desde Audiencia & CRM ➔ Credenciales).
                  </p>
                </div>
              </div>

              {catalogItems.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2">
                  <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                    <span>Vincular manualmente con un evento del Catálogo activo:</span>
                    <span className="text-[11px] text-emerald-400 font-mono font-normal">({catalogItems.length} shows en venta)</span>
                  </label>
                  <select
                    value={currentShowId}
                    onChange={(e) => {
                      const newId = e.target.value;
                      if (newId) {
                        setCurrentShowId(newId);
                        fetchAvailability(newId);
                      }
                    }}
                    className="w-full bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-xl px-3.5 py-2.5 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="">-- Selecciona el show correspondiente en QRBoletos --</option>
                    {catalogItems.map((item) => (
                      <option key={item.id_evento_espectaculo} value={item.id_evento_espectaculo}>
                        {item.evento}{item.espectaculo ? ' - ' + item.espectaculo : ''} (ID API: {item.id_evento_espectaculo})
                      </option>
                    ))}
                  </select>
                </div>
              )}
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

              {detail.incluye && detail.incluye.length > 0 && (
                <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs space-y-2">
                  <div className="font-bold flex items-center gap-2 text-indigo-200">
                    <span>🎟️ Contenido del Abono / Combo</span>
                    <span className="text-[10px] bg-indigo-500/20 px-2 py-0.5 rounded font-mono">
                      {detail.incluye.length} elementos incluidos
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {detail.incluye.map((inc: any, idx: number) => (
                      <div key={idx} className="bg-slate-950/60 p-2.5 rounded-xl border border-indigo-500/20 text-[11px] space-y-0.5">
                        <p className="font-semibold text-white">{inc.evento || inc.espectaculo || `Item #${idx + 1}`}</p>
                        {inc.localidad && <p className="text-slate-400">Localidad: {inc.localidad}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {totalAforo === 0 && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold text-amber-200">Nota técnica sobre aforos</p>
                    <p className="text-slate-400 leading-relaxed text-[11px]">
                      Según la documentación oficial de Catalog API v1, para eventos con silletería numerada o palcos (<code className="text-amber-300 font-mono">placement=selectable</code>), el aforo fijo de la localidad queda vacío en base de datos. La API calcula las sillas en vivo desde el mapa de silletería. Puedes presionar el botón <strong className="text-amber-300 font-mono">{'{ } JSON'}</strong> para ver la respuesta cruda de la API.
                    </p>
                  </div>
                </div>
              )}

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
