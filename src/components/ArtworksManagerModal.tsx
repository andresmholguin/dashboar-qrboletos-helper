'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Evento, Localidad } from '@/types';
import {
  X,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Play,
  Terminal,
  Layers,
  Sparkles,
  RefreshCw,
  Printer,
  Smartphone,
  Trash2,
  Sliders,
  Globe,
  ArrowDownUp
} from 'lucide-react';

interface ArtworksManagerModalProps {
  evento: Evento;
  onClose: () => void;
}

interface LogMessage {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
}

export default function ArtworksManagerModal({ evento, onClose }: ArtworksManagerModalProps) {
  const [mounted, setMounted] = useState(false);
  const [digitalImage, setDigitalImage] = useState<string | null>(null);
  const [digitalImageName, setDigitalImageName] = useState<string | null>(null);
  const [printImage, setPrintImage] = useState<string | null>(null);
  const [printImageName, setPrintImageName] = useState<string | null>(null);

  // Imágenes Promocionales del Evento (Cartelera & Web)
  const [imageHome, setImageHome] = useState<string | null>(null);
  const [imageHomeName, setImageHomeName] = useState<string | null>(null);
  const [imageAfiche, setImageAfiche] = useState<string | null>(null);
  const [imageAficheName, setImageAficheName] = useState<string | null>(null);
  const [imageBanner, setImageBanner] = useState<string | null>(null);
  const [imageBannerName, setImageBannerName] = useState<string | null>(null);

  // Imágenes actualmente activas en QRBoletos
  const [existingImages, setExistingImages] = useState<{
    home: string | null;
    afiche: string | null;
    banner: string | null;
  }>({ home: null, afiche: null, banner: null });
  const [isLoadingExisting, setIsLoadingExisting] = useState<boolean>(false);

  // Pestañas / Filtro de visualización
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'tickets' | 'promo'>('all');

  const [replaceImages, setReplaceImages] = useState<boolean>(true);
  const [scopeMode, setScopeMode] = useState<'all' | 'custom'>('all');
  const [selectedSections, setSelectedSections] = useState<string[]>([]);

  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [isDryRun, setIsDryRun] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isFinished, setIsFinished] = useState<boolean>(false);

  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = 'hidden';

    // Consultar imágenes ya existentes montadas en dashboard.qrboletos.com
    const fetchExisting = async () => {
      const pId = evento.promoterId || evento.urlBase?.match(/promoters\/([^/]+)/)?.[1];
      const eId = evento.eventId || evento.urlBase?.match(/events\/([^/]+)/)?.[1];
      if (!pId || !eId) return;

      setIsLoadingExisting(true);
      try {
        const res = await fetch('/api/events/fetch-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ promoterId: pId, eventId: eId }),
        });
        const data = await res.json();
        if (data.success && data.settings?.images) {
          setExistingImages({
            home: data.settings.images.home || null,
            afiche: data.settings.images.afiche || null,
            banner: data.settings.images.banner || null,
          });
        }
      } catch (e) {
        console.warn('No se pudieron consultar imágenes existentes:', e);
      } finally {
        setIsLoadingExisting(false);
      }
    };

    fetchExisting();

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [evento]);

  // Escuchar tecla Escape para cerrar modal si no está ejecutando
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExecuting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExecuting, onClose]);

  // Autoscroll del visor de logs
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Manejo de carga de archivos de imagen
  const handleImageUpload = (file: File, type: 'digital' | 'print' | 'home' | 'afiche' | 'banner') => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (type === 'digital') {
        setDigitalImage(dataUrl);
        setDigitalImageName(file.name);
      } else if (type === 'print') {
        setPrintImage(dataUrl);
        setPrintImageName(file.name);
      } else if (type === 'home') {
        setImageHome(dataUrl);
        setImageHomeName(file.name);
      } else if (type === 'afiche') {
        setImageAfiche(dataUrl);
        setImageAficheName(file.name);
      } else if (type === 'banner') {
        setImageBanner(dataUrl);
        setImageBannerName(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleToggleSection = (secName: string) => {
    if (selectedSections.includes(secName)) {
      setSelectedSections(selectedSections.filter((s) => s !== secName));
    } else {
      setSelectedSections([...selectedSections, secName]);
    }
  };

  const startSync = async (dryRunMode: boolean) => {
    const hasAnyArt = digitalImage || printImage || imageHome || imageAfiche || imageBanner;
    if (!hasAnyArt) {
      alert('Debes seleccionar al menos un diseño de boletería o imagen del evento para actualizar.');
      return;
    }

    setIsExecuting(true);
    setIsDryRun(dryRunMode);
    setIsFinished(false);
    setLogs([]);
    setStatusMessage(dryRunMode ? 'Iniciando simulación (Dry-Run)...' : 'Iniciando reemplazo de artes en vivo...');

    try {
      const pId = evento.promoterId || evento.urlBase?.match(/promoters\/([^/]+)/)?.[1];
      const eId = evento.eventId || evento.urlBase?.match(/events\/([^/]+)/)?.[1];
      const sId = evento.showId || evento.urlBase?.match(/shows\/([^/]+)/)?.[1];

      const response = await fetch('/api/artworks/sync-chrome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promoterId: pId,
          eventId: eId,
          eventNumericId: evento.id,
          eventName: evento.nombre,
          eventDate: evento.fecha,
          eventUrl: evento.enlace,
          enVenta: evento.enVenta !== false,
          showId: sId,
          urlBase: evento.urlBase,
          digitalImage,
          printImage,
          imageHome,
          imageAfiche,
          imageBanner,
          replaceImages,
          sections: scopeMode === 'custom' ? selectedSections : null,
          dryRun: dryRunMode,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${response.status} al iniciar el proceso.`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No se pudo establecer el stream de logs SSE.');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';

        for (const ev of events) {
          if (!ev.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(ev.slice(6));
            if (parsed.type === 'log') {
              setLogs((prev) => [
                ...prev,
                {
                  type: parsed.level || 'info',
                  message: parsed.message,
                  timestamp: parsed.timestamp || new Date().toLocaleTimeString(),
                },
              ]);
            } else if (parsed.type === 'finish') {
              setIsFinished(true);
              setStatusMessage(parsed.message || 'Proceso finalizado.');
            }
          } catch (e) {
            console.error('Error parseando evento SSE:', e);
          }
        }
      }
    } catch (err: any) {
      setLogs((prev) => [
        ...prev,
        {
          type: 'error',
          message: `Error: ${err.message}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  const localitiesList = evento.localidades || [];

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-md flex flex-col w-full h-full overflow-hidden animate-fade-in font-sans">
      {/* Cabecera Superior Fija */}
      <header className="shrink-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2.5 rounded-2xl bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 px-2.5 py-0.5 rounded-full">
                🎨 Gestor y Reemplazo de Artes
              </span>
              {evento.id && (
                <span className="text-[10px] font-mono text-slate-700 dark:text-slate-400 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded-md font-bold">
                  ID: #{evento.id}
                </span>
              )}
            </div>
            <h1 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5" title={evento.nombre}>
              {evento.nombre}
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
              {evento.espectaculo ? `Función: ${evento.espectaculo}` : `Fecha: ${evento.fecha}`}
              {evento.sitio && ` • Recinto: ${evento.sitio}`}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          disabled={isExecuting}
          className={`p-2 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer ${
            isExecuting ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          title="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>
      </header>

      {/* Cuerpo Desplazable del Modal */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-8 lg:px-12 py-6 space-y-6">
        {/* Banner Explicativo y Filtro de Categorías */}
        <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3 text-xs text-slate-300">
            <Sparkles className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-900 dark:text-slate-200 block mb-0.5">
                Gestión Integral de Artes del Evento
              </span>
              <span className="text-slate-600 dark:text-slate-300">
                Actualiza los artes de boletería (QRBoleto y taquilla física) y las imágenes promocionales de cartelera (Miniatura, Portada y Banner horizontal). El bot ajustará el zoom de Croppie.js al mínimo sin recortes.
              </span>
            </div>
          </div>

          {/* Selector de Categoría */}
          <div className="flex items-center gap-1.5 bg-slate-950/80 p-1.5 rounded-xl border border-slate-800 shrink-0 self-stretch md:self-auto justify-center">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                categoryFilter === 'all'
                  ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 shadow-sm font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Todos los Artes
            </button>
            <button
              onClick={() => setCategoryFilter('tickets')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                categoryFilter === 'tickets'
                  ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 shadow-sm font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Smartphone className="w-3 h-3" />
              <span>Boletería (2)</span>
            </button>
            <button
              onClick={() => setCategoryFilter('promo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                categoryFilter === 'promo'
                  ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-900 dark:text-blue-300 border border-blue-300 dark:border-blue-500/40 shadow-sm font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <ImageIcon className="w-3 h-3" />
              <span>Cartelera / Web (3)</span>
              {(imageHome || imageAfiche || imageBanner) && (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
              )}
            </button>
          </div>
        </div>

        {/* SECCIÓN 1: ARTES DE BOLETERÍA (DIGITAL Y FÍSICO) */}
        {(categoryFilter === 'all' || categoryFilter === 'tickets') && (
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-200">
                  Artes de Boletería (Tickets Digital & Taquilla Física)
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">
                Se sincronizan en cada precio de las localidades seleccionadas
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Card 1: QRBoleto Digital (1465x550) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-slate-100">QRBoleto Digital</h3>
                </div>
                <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  1465 × 550 px
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Imagen que se muestra en el boleto electrónico móvil y PDF digital descargable.
              </p>

              {digitalImage ? (
                <div className="relative rounded-xl overflow-hidden border border-emerald-500/30 bg-slate-950 group">
                  <img
                    src={digitalImage}
                    alt="Arte Digital"
                    className="w-full h-36 object-cover object-center"
                  />
                  <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-white text-xs px-3 py-1.5 rounded-lg border border-slate-700 font-semibold shadow-md">
                      Cambiar
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f, 'digital');
                        }}
                      />
                    </label>
                    <button
                      onClick={() => {
                        setDigitalImage(null);
                        setDigitalImageName(null);
                      }}
                      className="cursor-pointer bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-red-500/40 font-semibold transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="p-2 bg-slate-950 text-[10px] font-mono text-slate-400 truncate border-t border-slate-800">
                    {digitalImageName}
                  </div>
                </div>
              ) : (
                <label className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-950/40 hover:bg-slate-950/80 transition-all text-center group">
                  <Upload className="w-6 h-6 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                  <span className="text-xs font-semibold text-slate-300 group-hover:text-white">
                    Arrastra o selecciona el QRBoleto Digital
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">PNG, JPG, WEBP (1465×550)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f, 'digital');
                    }}
                  />
                </label>
              )}
            </div>
            <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
              <CheckCircle2 className={`w-3.5 h-3.5 ${digitalImage ? 'text-emerald-400' : 'text-slate-600'}`} />
              <span>{digitalImage ? 'Diseño digital preparado' : 'Opcional (dejar vacío si no deseas cambiarlo)'}</span>
            </div>
          </div>

          {/* Card 2: Diseño Impresión Físico 63X177 (Boca / Godex) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Printer className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-sm font-bold text-slate-100">Diseño Impresión Físico (63X177)</h3>
                </div>
                <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                  1134 × 236 px
                </span>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Diseño para taquilla física en impresoras Boca y Godex (omite automáticamente 63X177PP).
              </p>

              {printImage ? (
                <div className="relative rounded-xl overflow-hidden border border-cyan-500/30 bg-slate-950 group">
                  <img
                    src={printImage}
                    alt="Arte Físico"
                    className="w-full h-36 object-contain object-center bg-slate-900"
                  />
                  <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-white text-xs px-3 py-1.5 rounded-lg border border-slate-700 font-semibold shadow-md">
                      Cambiar
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f, 'print');
                        }}
                      />
                    </label>
                    <button
                      onClick={() => {
                        setPrintImage(null);
                        setPrintImageName(null);
                      }}
                      className="cursor-pointer bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-red-500/40 font-semibold transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="p-2 bg-slate-950 text-[10px] font-mono text-slate-400 truncate border-t border-slate-800">
                    {printImageName}
                  </div>
                </div>
              ) : (
                <label className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-950/40 hover:bg-slate-950/80 transition-all text-center group">
                  <Upload className="w-6 h-6 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                  <span className="text-xs font-semibold text-slate-300 group-hover:text-white">
                    Arrastra o selecciona el Diseño Físico 63X177
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">PNG, JPG, WEBP (1134×236)</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f, 'print');
                    }}
                  />
                </label>
              )}
            </div>
            <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
              <CheckCircle2 className={`w-3.5 h-3.5 ${printImage ? 'text-cyan-400' : 'text-slate-600'}`} />
              <span>{printImage ? 'Diseño físico preparado' : 'Opcional (dejar vacío si no deseas cambiarlo)'}</span>
            </div>
          </div>
        </div>
      </div>
    )}

        {/* SECCIÓN 2: IMÁGENES PROMOCIONALES DE CARTELERA (720x639, 800x800, 1950x700) */}
        {(categoryFilter === 'all' || categoryFilter === 'promo') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-bold text-slate-200">
                  Imágenes Promocionales del Evento (Web & Cartelera)
                </h3>
              </div>
              <span className="text-[11px] text-slate-400">
                Se sincronizan en la configuración general del evento (settings.aspx)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 3: Miniatura (720x639) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-slate-200">Imagen Miniatura</h4>
                    <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                      720 × 639 px
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    Miniatura en listado de eventos y vistas previas móviles.
                  </p>

                  {imageHome ? (
                    <div className="relative rounded-xl overflow-hidden border border-blue-500/30 bg-slate-950 group aspect-[720/639]">
                      <img src={imageHome} alt="Miniatura" className="w-full h-full object-cover object-center" />
                      <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-white text-xs px-3 py-1.5 rounded-lg border border-slate-700 font-semibold shadow-md">
                          Cambiar
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleImageUpload(f, 'home');
                            }}
                          />
                        </label>
                        <button
                          onClick={() => { setImageHome(null); setImageHomeName(null); }}
                          className="cursor-pointer bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-red-500/40 font-semibold transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="absolute bottom-0 inset-x-0 p-1.5 bg-slate-950/90 text-[10px] font-mono text-slate-400 truncate border-t border-slate-800">
                        {imageHomeName || 'Nueva miniatura'}
                      </div>
                    </div>
                  ) : existingImages.home ? (
                    <div className="relative rounded-xl overflow-hidden border border-emerald-500/30 bg-slate-950 group aspect-[720/639]">
                      <img src={existingImages.home} alt="Miniatura Actual" className="w-full h-full object-cover object-center" />
                      <div className="absolute top-2 left-2 bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-[10px] px-2 py-0.5 rounded-md font-semibold shadow-md">
                        🟢 Activa en QRBoletos
                      </div>
                      <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 text-white text-xs px-3 py-1.5 rounded-lg font-semibold shadow-md">
                          Reemplazar
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleImageUpload(f, 'home');
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="border-2 border-dashed border-slate-700 hover:border-blue-500/60 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-950/40 hover:bg-slate-950/80 transition-all text-center group aspect-[720/639]">
                      <Upload className="w-6 h-6 text-slate-500 group-hover:text-blue-400 transition-colors" />
                      <span className="text-xs font-semibold text-slate-300 group-hover:text-white">
                        Subir Imagen Miniatura
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">720 × 639 px</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f, 'home');
                        }}
                      />
                    </label>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${imageHome ? 'text-blue-400' : existingImages.home ? 'text-emerald-400' : 'text-slate-600'}`} />
                  <span>{imageHome ? 'Nueva miniatura lista para subir' : existingImages.home ? 'Activa en QRBoletos' : 'Opcional'}</span>
                </div>
              </div>

              {/* Card 4: Portada Vertical / Afiche (800x800) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-slate-200">Portada Vertical / Afiche</h4>
                    <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                      800 × 800 px
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-3">
                    Afiche vertical principal del evento para web y cartelera.
                  </p>

                  {imageAfiche ? (
                    <div className="relative rounded-xl overflow-hidden border border-purple-500/30 bg-slate-950 group aspect-square">
                      <img src={imageAfiche} alt="Afiche" className="w-full h-full object-cover object-center" />
                      <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-white text-xs px-3 py-1.5 rounded-lg border border-slate-700 font-semibold shadow-md">
                          Cambiar
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleImageUpload(f, 'afiche');
                            }}
                          />
                        </label>
                        <button
                          onClick={() => { setImageAfiche(null); setImageAficheName(null); }}
                          className="cursor-pointer bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-red-500/40 font-semibold transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="absolute bottom-0 inset-x-0 p-1.5 bg-slate-950/90 text-[10px] font-mono text-slate-400 truncate border-t border-slate-800">
                        {imageAficheName || 'Nuevo afiche'}
                      </div>
                    </div>
                  ) : existingImages.afiche ? (
                    <div className="relative rounded-xl overflow-hidden border border-emerald-500/30 bg-slate-950 group aspect-square">
                      <img src={existingImages.afiche} alt="Afiche Actual" className="w-full h-full object-cover object-center" />
                      <div className="absolute top-2 left-2 bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-[10px] px-2 py-0.5 rounded-md font-semibold shadow-md">
                        🟢 Activo en QRBoletos
                      </div>
                      <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <label className="cursor-pointer bg-purple-600 hover:bg-purple-500 text-white text-xs px-3 py-1.5 rounded-lg font-semibold shadow-md">
                          Reemplazar
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleImageUpload(f, 'afiche');
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="border-2 border-dashed border-slate-700 hover:border-purple-500/60 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-950/40 hover:bg-slate-950/80 transition-all text-center group aspect-square">
                      <Upload className="w-6 h-6 text-slate-500 group-hover:text-purple-400 transition-colors" />
                      <span className="text-xs font-semibold text-slate-300 group-hover:text-white">
                        Subir Portada / Afiche
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">800 × 800 px</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f, 'afiche');
                        }}
                      />
                    </label>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${imageAfiche ? 'text-purple-400' : existingImages.afiche ? 'text-emerald-400' : 'text-slate-600'}`} />
                  <span>{imageAfiche ? 'Nuevo afiche listo para subir' : existingImages.afiche ? 'Activo en QRBoletos' : 'Opcional'}</span>
                </div>
              </div>

              {/* Card 5: Portada Horizontal / Banner (1950x700) */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-lg flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-slate-200">Portada Horizontal / Banner</h4>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Globe className="w-3 h-3" /> Auto-Sync Web
                      </span>
                      <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                        1950 × 700 px
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                    Banner panorámico superior. Crea o actualiza automáticamente el item en el carrusel de <strong>Banners Web de QRBoletos</strong>, configurando su estado, enlace y orden cronológico.
                  </p>

                  {imageBanner ? (
                    <div className="relative rounded-xl overflow-hidden border border-cyan-500/30 bg-slate-950 group aspect-[1950/700]">
                      <img src={imageBanner} alt="Banner" className="w-full h-full object-cover object-center" />
                      <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <label className="cursor-pointer bg-slate-800 hover:bg-slate-700 text-white text-xs px-3 py-1.5 rounded-lg border border-slate-700 font-semibold shadow-md">
                          Cambiar
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleImageUpload(f, 'banner');
                            }}
                          />
                        </label>
                        <button
                          onClick={() => { setImageBanner(null); setImageBannerName(null); }}
                          className="cursor-pointer bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white text-xs px-3 py-1.5 rounded-lg border border-red-500/40 font-semibold transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="absolute bottom-0 inset-x-0 p-1.5 bg-slate-950/90 text-[10px] font-mono text-slate-400 truncate border-t border-slate-800">
                        {imageBannerName || 'Nuevo banner'}
                      </div>
                    </div>
                  ) : existingImages.banner ? (
                    <div className="relative rounded-xl overflow-hidden border border-emerald-500/30 bg-slate-950 group aspect-[1950/700]">
                      <img src={existingImages.banner} alt="Banner Actual" className="w-full h-full object-cover object-center" />
                      <div className="absolute top-2 left-2 bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-[10px] px-2 py-0.5 rounded-md font-semibold shadow-md">
                        🟢 Activo en QRBoletos
                      </div>
                      <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <label className="cursor-pointer bg-cyan-600 hover:bg-cyan-500 text-white text-xs px-3 py-1.5 rounded-lg font-semibold shadow-md">
                          Reemplazar
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleImageUpload(f, 'banner');
                            }}
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 rounded-xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-950/40 hover:bg-slate-950/80 transition-all text-center group aspect-[1950/700]">
                      <Upload className="w-6 h-6 text-slate-500 group-hover:text-cyan-400 transition-colors" />
                      <span className="text-xs font-semibold text-slate-300 group-hover:text-white">
                        Subir Banner Panorámico
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">1950 × 700 px</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleImageUpload(f, 'banner');
                        }}
                      />
                    </label>
                  )}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                  <CheckCircle2 className={`w-3.5 h-3.5 ${imageBanner ? 'text-cyan-400' : existingImages.banner ? 'text-emerald-400' : 'text-slate-600'}`} />
                  <span>{imageBanner ? 'Nuevo banner listo para sincronizar en Banners Web' : existingImages.banner ? 'Activo en QRBoletos' : 'Opcional (Auto-sincroniza en Banners Web)'}</span>
                </div>
              </div>
            </div>
          </div>
        )}

                {/* Opciones de Configuración y Alcance */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-emerald-400" />
            Parámetros de Ejecución
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Opción Reemplazo Forzado */}
            <label className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/40 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={replaceImages}
                onChange={(e) => setReplaceImages(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500/20"
              />
              <div className="text-xs">
                <span className="font-bold text-slate-200 block">
                  Forzar Reemplazo de Imágenes Existentes (Recomendado)
                </span>
                <span className="text-slate-400 text-[11px] block mt-0.5">
                  Si un precio ya tiene un arte anterior cargado, el bot pulsará &quot;Eliminar&quot;, confirmará &quot;Sí&quot; y subirá el nuevo diseño.
                </span>
              </div>
            </label>

            {/* Opción Alcance */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <span className="text-xs font-bold text-slate-200 block">Alcance de Localidades</span>
              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="scopeMode"
                    value="all"
                    checked={scopeMode === 'all'}
                    onChange={() => setScopeMode('all')}
                    className="text-emerald-500 focus:ring-emerald-500/20"
                  />
                  <span>Todas las localidades ({localitiesList.length || 'del show'})</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-slate-300">
                  <input
                    type="radio"
                    name="scopeMode"
                    value="custom"
                    checked={scopeMode === 'custom'}
                    onChange={() => setScopeMode('custom')}
                    className="text-emerald-500 focus:ring-emerald-500/20"
                  />
                  <span>Seleccionar específicas</span>
                </label>
              </div>

              {scopeMode === 'custom' && localitiesList.length > 0 && (
                <div className="pt-2 flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                  {localitiesList.map((loc) => (
                    <button
                      key={loc.nombre}
                      type="button"
                      onClick={() => handleToggleSection(loc.nombre)}
                      className={`text-[11px] px-2.5 py-1 rounded-lg border font-semibold transition-all cursor-pointer ${
                        selectedSections.includes(loc.nombre)
                          ? 'bg-emerald-100 dark:bg-emerald-600/20 text-emerald-900 dark:text-emerald-300 border-emerald-300 dark:border-emerald-500/40 shadow-sm'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-400 border-slate-300 dark:border-slate-800 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      {loc.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Consola Terminal de Ejecución SSE */}
        {(logs.length > 0 || isExecuting) && (
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 font-mono text-xs shadow-inner">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-emerald-400" />
                <span className="font-bold text-slate-300">Consola de Ejecución en Vivo (Chrome CDP)</span>
              </div>
              {isExecuting && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-400 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{isDryRun ? 'Simulando...' : 'Actualizando en Chrome...'}</span>
                </div>
              )}
              {isFinished && (
                <span className="text-[11px] text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Completado
                </span>
              )}
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1 text-[11px] leading-relaxed">
              {logs.map((logItem, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-2 ${
                    logItem.type === 'error'
                      ? 'text-red-400 font-semibold'
                      : logItem.type === 'warning'
                      ? 'text-amber-400'
                      : logItem.type === 'success'
                      ? 'text-emerald-400 font-semibold'
                      : 'text-slate-300'
                  }`}
                >
                  <span className="text-slate-600 shrink-0 select-none">[{logItem.timestamp}]</span>
                  <span>{logItem.message}</span>
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>
          </div>
        )}

        {/* Botones de Acción */}
        <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isExecuting}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
          >
            {isFinished ? 'Cerrar' : 'Cancelar'}
          </button>

          <button
            type="button"
            onClick={() => startSync(true)}
            disabled={isExecuting || (!digitalImage && !printImage && !imageHome && !imageAfiche && !imageBanner)}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl border text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
              isExecuting || (!digitalImage && !printImage && !imageHome && !imageAfiche && !imageBanner)
                ? 'opacity-50 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500'
                : 'bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-500/30 hover:border-amber-400'
            }`}
            title="Probar navegación y verificación sin modificar imágenes"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Simular (Dry-Run)</span>
          </button>

          <button
            type="button"
            onClick={() => startSync(false)}
            disabled={isExecuting || (!digitalImage && !printImage && !imageHome && !imageAfiche && !imageBanner)}
            className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer active:scale-95 ${
              isExecuting || (!digitalImage && !printImage && !imageHome && !imageAfiche && !imageBanner)
                ? 'opacity-50 cursor-not-allowed bg-slate-800'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20 hover:shadow-emerald-500/30'
            }`}
          >
            {isExecuting ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Procesando en Chrome...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>⚡ Actualizar / Reemplazar Artes (En Vivo)</span>
              </>
            )}
          </button>
        </div>
      </main>
    </div>,
    document.body
  );
}
