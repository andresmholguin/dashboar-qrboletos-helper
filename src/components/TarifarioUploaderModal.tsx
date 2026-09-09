'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Evento, TarifarioExtracted, LocalidadPreciosConfig, PrecioItemConfig } from '@/types';
import {
  X,
  UploadCloud,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Play,
  RotateCcw,
  Terminal,
  Layers,
  Key,
  DollarSign,
  Info,
  Check,
  Plus,
  Trash2,
  Gift,
  FileText,
  Image as ImageIcon,
  Printer,
  Palette
} from 'lucide-react';

interface TarifarioUploaderModalProps {
  evento: Evento;
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

export default function TarifarioUploaderModal({
  evento,
  isOpen,
  onClose,
  onSyncComplete,
}: TarifarioUploaderModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<TarifarioExtracted | null>(null);

  // Estados de sincronización con Chrome
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncLogs, setSyncLogs] = useState<{ level: string; message: string }[]>([]);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [dryRun, setDryRun] = useState<boolean>(false);

  // Estados de imágenes / diseños de boletería
  const [digitalImage, setDigitalImage] = useState<string | null>(null);
  const [digitalFileName, setDigitalFileName] = useState<string>('');
  const [printImage, setPrintImage] = useState<string | null>(null);
  const [printFileName, setPrintFileName] = useState<string>('');
  const [replaceImages, setReplaceImages] = useState<boolean>(false);
  const [archiveOldPrices, setArchiveOldPrices] = useState<boolean>(true);
  const [mounted, setMounted] = useState<boolean>(false);

  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const savedKey = localStorage.getItem('gemini_api_key');
    if (savedKey) setApiKey(savedKey);
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [syncLogs]);

  // Permitir cerrar modal con tecla Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSyncing && !isExtracting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, isSyncing, isExtracting]);

  // Prevenir scroll en el fondo cuando el modal esté abierto
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(selected);
    }
  };

  const handleDigitalImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setDigitalFileName(selected.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setDigitalImage(reader.result as string);
      };
      reader.readAsDataURL(selected);
    }
  };

  const handlePrintImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setPrintFileName(selected.name);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPrintImage(reader.result as string);
      };
      reader.readAsDataURL(selected);
    }
  };

  const handleExtract = async () => {
    if (!imagePreview) return;

    setIsExtracting(true);
    setExtractionError(null);
    setExtractedData(null);

    if (apiKey) {
      localStorage.setItem('gemini_api_key', apiKey);
    }

    try {
      const res = await fetch('/api/pricing/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imagePreview,
          mimeType: file?.type || (file?.name?.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/png'),
          apiKey: apiKey || undefined,
          eventLocalities: evento.localidades || [],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.needsApiKey) {
          setShowApiKeyInput(true);
        }
        throw new Error(data.error || 'Error al procesar la imagen con Gemini.');
      }

      setExtractedData(data.data);
    } catch (err: any) {
      setExtractionError(err.message || 'Error inesperado durante la extracción.');
    } finally {
      setIsExtracting(false);
    }
  };

  // Modificar valores extraídos en la tabla
  const handlePriceChange = (
    locIndex: number,
    priceIndex: number,
    field: keyof PrecioItemConfig,
    value: any
  ) => {
    if (!extractedData) return;
    const nextLocalidades = [...extractedData.localidades];
    const targetLoc = { ...nextLocalidades[locIndex] };
    const nextPrecios = [...targetLoc.precios];

    nextPrecios[priceIndex] = {
      ...nextPrecios[priceIndex],
      [field]: field === 'valor' || field === 'servicio' || field === 'aforo' ? Number(value) : value,
    };

    targetLoc.precios = nextPrecios;
    nextLocalidades[locIndex] = targetLoc;

    setExtractedData({
      ...extractedData,
      localidades: nextLocalidades,
    });
  };

  const handleDeletePrice = (locIndex: number, priceIndex: number) => {
    if (!extractedData) return;
    const nextLocalidades = [...extractedData.localidades];
    const targetLoc = { ...nextLocalidades[locIndex] };
    targetLoc.precios = targetLoc.precios.filter((_, i) => i !== priceIndex);
    nextLocalidades[locIndex] = targetLoc;

    setExtractedData({
      ...extractedData,
      localidades: nextLocalidades,
    });
  };

  const handleStartSync = async (isDryRun: boolean = false) => {
    if (!extractedData) return;

    setIsSyncing(true);
    setDryRun(isDryRun);
    setSyncStatus('running');
    setSyncLogs([
      {
        level: 'info',
        message: `Iniciando proceso (${isDryRun ? 'MODO SIMULACIÓN DRY-RUN' : 'MODO REAL'})...`,
      },
    ]);

    try {
      const res = await fetch('/api/pricing/sync-chrome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promoterId: evento.promoterId,
          eventId: evento.eventId,
          showId: evento.showId,
          urlBase: evento.urlBase,
          pricingData: extractedData,
          dryRun: isDryRun,
          digitalImage: digitalImage || undefined,
          printImage: printImage || undefined,
          replaceImages: replaceImages,
          archiveOldPrices: archiveOldPrices,
        }),
      });

      if (!res.ok) {
        const errorJson = await res.json();
        throw new Error(errorJson.error || 'Error al iniciar la sincronización.');
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
                setSyncLogs((prev) => [...prev, { level: payload.level, message: payload.message }]);
              } else if (payload.type === 'finish') {
                setSyncStatus(payload.success ? 'success' : 'error');
                setSyncLogs((prev) => [
                  ...prev,
                  {
                    level: payload.success ? 'success' : 'error',
                    message: payload.message,
                  },
                ]);
                if (payload.success && onSyncComplete) {
                  onSyncComplete();
                }
              }
            } catch (e) {
              console.error('Error parseando evento SSE:', e);
            }
          }
        }
      }
    } catch (err: any) {
      setSyncStatus('error');
      setSyncLogs((prev) => [...prev, { level: 'error', message: err.message }]);
    } finally {
      setIsSyncing(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col w-full h-full overflow-hidden animate-in fade-in duration-150">
      {/* Cabecera del Modal a Pantalla Completa */}
      <div className="px-6 sm:px-10 lg:px-12 py-3.5 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 flex items-center justify-center text-amber-800 dark:text-amber-400 shadow-inner">
            <Sparkles className="w-4.5 h-4.5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Cargar Tarifario con IA en Google Chrome
              <span className="text-[10px] bg-emerald-100 dark:bg-emerald-500/10 text-emerald-900 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                Silletería Numerada
              </span>
              <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700/60 px-2 py-0.5 rounded-full font-medium truncate max-w-xs">
                {evento.nombre}
              </span>
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Extrae el acta con Gemini Vision, divide aforos entre localidades independientes y genera precios + cortesías.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700/80 border border-slate-300 dark:border-slate-700/70 transition-all cursor-pointer shadow-sm active:scale-95"
            title="Cerrar modal (Esc)"
          >
            <X className="w-4 h-4" />
            <span>Cerrar</span>
          </button>
        </div>
      </div>

      {/* Cuerpo a Pantalla Completa con Scroll Nativo y Amplio Padding X */}
      <div className="px-6 sm:px-10 lg:px-16 py-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
        {/* PASO 1: Subida de Imagen */}
        {!extractedData && (
          <div className="max-w-3xl mx-auto space-y-6 py-6">
            <div className="border border-slate-800 hover:border-amber-500/40 bg-slate-900/40 hover:bg-slate-900/70 rounded-2xl p-10 text-center transition-all shadow-md">
                <input
                  type="file"
                  id="tarifario-upload"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
                <label
                  htmlFor="tarifario-upload"
                  className="flex flex-col items-center justify-center cursor-pointer space-y-3"
                >
                  <div className="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-500/20 flex items-center justify-center shadow-lg">
                    <UploadCloud className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                      {file ? file.name : 'Haz clic para seleccionar o arrastra el tarifario (PDF o Imagen)'}
                    </span>
                    <p className="text-xs text-slate-500">Soporta documentos PDF y fotos PNG, JPG, WebP del Comité de Precios</p>
                  </div>
                </label>
              </div>

              {imagePreview && (
                <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-center gap-3">
                    {file?.type === 'application/pdf' || file?.name?.toLowerCase().endsWith('.pdf') ? (
                      <div className="w-16 h-16 rounded-lg bg-rose-500/10 border border-rose-500/30 flex flex-col items-center justify-center text-rose-400">
                        <FileText className="w-7 h-7" />
                        <span className="text-[10px] font-black tracking-wider uppercase mt-0.5">PDF</span>
                      </div>
                    ) : (
                      <img
                        src={imagePreview}
                        alt="Vista previa"
                        className="w-16 h-16 object-cover rounded-lg border border-slate-700"
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-semibold text-slate-200">{file?.name}</p>
                        {(file?.type === 'application/pdf' || file?.name?.toLowerCase().endsWith('.pdf')) && (
                          <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.2 rounded font-mono">
                            Documento PDF
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400">
                        {((file?.size || 0) / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setFile(null);
                      setImagePreview(null);
                    }}
                    className="text-xs text-rose-400 hover:text-rose-300 px-3 py-1.5 rounded-lg hover:bg-rose-500/10 transition-colors"
                  >
                    Quitar
                  </button>
                </div>
              )}

              {/* API Key Toggle si no está en env */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                  className="text-xs text-slate-400 hover:text-amber-400 flex items-center gap-1.5 transition-colors"
                >
                  <Key className="w-3.5 h-3.5" />
                  {showApiKeyInput ? 'Ocultar clave de Gemini API' : 'Ingresar clave de Gemini API (Opcional si no está en .env)'}
                </button>
                {showApiKeyInput && (
                  <div className="mt-2 space-y-1.5">
                    <input
                      type="password"
                      placeholder="Pega aquí tu clave de Gemini (AIzaSy...)"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 font-mono"
                    />
                    <div className="flex justify-between items-center px-1">
                      <span className="text-[10px] text-slate-500">Se guardará automáticamente en este navegador.</span>
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-amber-400 hover:underline flex items-center gap-0.5 font-medium"
                      >
                        ¿No tienes clave? Obtén una gratis aquí &rarr;
                      </a>
                    </div>
                  </div>
                )}

              </div>

              {extractionError && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs p-3.5 rounded-xl flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <div>
                    <span className="font-bold">Error al extraer datos:</span> {extractionError}
                  </div>
                </div>
              )}

              <button
                onClick={handleExtract}
                disabled={!imagePreview || isExtracting}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold py-3 px-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {isExtracting ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    Analizando documento con Gemini Vision...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Extraer Precios con IA
                  </>
                )}
              </button>
            </div>
          )}

          {/* PASO 2: Revisión de la Tabla Extraída y Ajustes */}
          {extractedData && (
            <div className="space-y-6">
              {/* Avisos de Reglas de Negocio */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-emerald-900 dark:text-emerald-300">
                  <CheckCircle className="w-4 h-4 shrink-0 text-emerald-700 dark:text-emerald-400 mt-0.5" />
                  <div>
                    <p className="font-bold text-emerald-950 dark:text-emerald-200">Silletería Numerada</p>
                    <p className="text-[11px] text-emerald-800 dark:text-emerald-400/90">
                      Etapa <strong>FULL</strong> con Aforo en <strong>0</strong> (cupo restante automático).
                    </p>
                  </div>
                </div>
                <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-blue-900 dark:text-blue-300">
                  <Info className="w-4 h-4 shrink-0 text-blue-700 dark:text-blue-400 mt-0.5" />
                  <div>
                    <p className="font-bold text-blue-950 dark:text-blue-200">Localidades Indep.</p>
                    <p className="text-[11px] text-blue-800 dark:text-blue-400/90">
                      Aforos divididos entre las secciones (ej. VIP 1-5, PREFERENCIAL 1-5).
                    </p>
                  </div>
                </div>
                <div className="bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-purple-900 dark:text-purple-300">
                  <Gift className="w-4 h-4 shrink-0 text-purple-700 dark:text-purple-400 mt-0.5" />
                  <div>
                    <p className="font-bold text-purple-950 dark:text-purple-200">Precio CORTESIAS</p>
                    <p className="text-[11px] text-purple-800 dark:text-purple-400/90">
                      Boleto $0 + Serv. $0 en cada sección (<strong>Solo Taquillas Físicas</strong>).
                    </p>
                  </div>
                </div>
                <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-300">
                  <Palette className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-400 mt-0.5" />
                  <div>
                    <p className="font-bold text-amber-950 dark:text-amber-200">Configuración Localidad</p>
                    <p className="text-[11px] text-amber-800 dark:text-amber-400/90">
                      Color: <strong className="font-mono text-emerald-700 dark:text-emerald-400">#86ff8d</strong>. Web y POS activos (Solo POS si es solo cortesía).
                    </p>
                  </div>
                </div>
              </div>

              {/* Lista de Localidades y sus Precios */}
              <div className="space-y-5">
                {extractedData.localidades.map((loc, locIndex) => (
                  <div key={locIndex} className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div className="bg-slate-900/80 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-bold text-slate-100 uppercase tracking-wide">
                          {loc.nombre}
                        </span>
                        {loc.aforoTotal && (
                          <span className="text-[10px] text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                            Aforo: {loc.aforoTotal}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">
                        {loc.precios.length} niveles de precio configurados
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs text-slate-300">
                        <thead className="bg-slate-950 text-slate-400 border-b border-slate-800/80 uppercase font-mono text-[10px]">
                          <tr>
                            <th className="px-4 py-2">Referencia (*)</th>
                            <th className="px-3 py-2">Etapa</th>
                            <th className="px-3 py-2">Aforo</th>
                            <th className="px-3 py-2">Valor Base</th>
                            <th className="px-3 py-2">Servicio</th>
                            <th className="px-3 py-2">Total Unit.</th>
                            <th className="px-3 py-2 text-center">Canales</th>
                            <th className="px-2 py-2 text-center">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                          {loc.precios.map((precio, priceIndex) => {
                            const isFull = precio.etapa.toLowerCase().includes('full') || precio.referencia.includes('FULL');
                            const isCortesia = precio.referencia.toUpperCase() === 'CORTESIAS';

                            return (
                              <tr
                                key={priceIndex}
                                className={`transition-colors ${
                                  isCortesia
                                    ? 'bg-purple-950/20 hover:bg-purple-950/30'
                                    : 'hover:bg-slate-900/50'
                                }`}
                              >
                                <td className="px-4 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      value={precio.referencia}
                                      onChange={(e) =>
                                        handlePriceChange(locIndex, priceIndex, 'referencia', e.target.value)
                                      }
                                      className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-slate-200 font-bold font-mono w-36 focus:border-amber-500 focus:outline-none"
                                    />
                                    {isCortesia && (
                                      <span className="text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded font-semibold uppercase">
                                        Cortesía
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <input
                                    type="text"
                                    value={precio.etapa}
                                    onChange={(e) =>
                                      handlePriceChange(locIndex, priceIndex, 'etapa', e.target.value)
                                    }
                                    className="bg-slate-900 border border-slate-700/80 rounded px-2.5 py-1 text-xs text-slate-200 w-28 focus:border-amber-500 focus:outline-none"
                                  />
                                </td>
                                <td className="px-3 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      value={precio.aforo}
                                      onChange={(e) =>
                                        handlePriceChange(locIndex, priceIndex, 'aforo', e.target.value)
                                      }
                                      className="bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200 w-20 font-mono focus:border-amber-500 focus:outline-none"
                                    />
                                    {isFull && (
                                      <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                        (Restante)
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 font-mono">
                                  <div className="flex items-center gap-1">
                                    <span className="text-slate-500">$</span>
                                    <input
                                      type="number"
                                      value={precio.valor}
                                      onChange={(e) =>
                                        handlePriceChange(locIndex, priceIndex, 'valor', e.target.value)
                                      }
                                      className="bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200 w-24 font-mono focus:border-amber-500 focus:outline-none"
                                    />
                                  </div>
                                </td>
                                <td className="px-3 py-2 font-mono">
                                  <div className="flex items-center gap-1">
                                    <span className="text-slate-500">$</span>
                                    <input
                                      type="number"
                                      value={precio.servicio}
                                      onChange={(e) =>
                                        handlePriceChange(locIndex, priceIndex, 'servicio', e.target.value)
                                      }
                                      className="bg-slate-900 border border-slate-700/80 rounded px-2 py-1 text-xs text-slate-200 w-20 font-mono focus:border-amber-500 focus:outline-none"
                                    />
                                  </div>
                                </td>
                                <td className="px-3 py-2 font-mono font-bold text-amber-400">
                                  ${(precio.valor + precio.servicio).toLocaleString()}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <div className="flex items-center justify-center gap-2">
                                    <label
                                      className="flex items-center gap-1 cursor-pointer text-[10px]"
                                      title="Venta en línea"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={precio.habilitadoOnline !== false}
                                        onChange={(e) =>
                                          handlePriceChange(locIndex, priceIndex, 'habilitadoOnline', e.target.checked)
                                        }
                                        className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                                      />
                                      <span
                                        className={
                                          precio.habilitadoOnline !== false
                                            ? 'text-emerald-400 font-semibold'
                                            : 'text-slate-600 line-through'
                                        }
                                      >
                                        Web
                                      </span>
                                    </label>
                                    <label
                                      className="flex items-center gap-1 cursor-pointer text-[10px]"
                                      title="Punto de venta físico / Taquilla"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={precio.habilitadoTaquilla !== false}
                                        onChange={(e) =>
                                          handlePriceChange(locIndex, priceIndex, 'habilitadoTaquilla', e.target.checked)
                                        }
                                        className="rounded border-slate-700 text-amber-500 focus:ring-0"
                                      />
                                      <span
                                        className={
                                          precio.habilitadoTaquilla !== false
                                            ? 'text-amber-400 font-semibold'
                                            : 'text-slate-600 line-through'
                                        }
                                      >
                                        Físico
                                      </span>
                                    </label>
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-center">
                                  <button
                                    onClick={() => handleDeletePrice(locIndex, priceIndex)}
                                    className="text-slate-500 hover:text-rose-400 p-1 rounded hover:bg-rose-500/10 transition-colors"
                                    title="Eliminar este precio"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>

              {/* Sección de Subida de Artes / Imágenes */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                      <ImageIcon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wide flex items-center gap-2">
                        Diseños y Artes de Boletería
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-normal">
                          Opcional
                        </span>
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        El bot cargará los artes en cada precio, ajustará el zoom de Croppie al mínimo para encajar la imagen completa y activará los switches automáticamente.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Card 1: QRBoleto Digital (1465x550) */}
                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                        <UploadCloud className="w-4 h-4 text-amber-400" />
                        QRBoleto Digital
                      </span>
                      <span className="text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full">
                        1465 × 550 px
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Se cargará en la pestaña <em>&quot;Configuración del precio&quot;</em> de cada nivel.
                    </p>

                    {digitalImage ? (
                      <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                        <div className="flex items-center gap-3">
                          <img
                            src={digitalImage}
                            alt="Digital Preview"
                            className="w-20 h-10 object-cover rounded border border-slate-700"
                          />
                          <div className="overflow-hidden">
                            <p className="text-xs font-medium text-slate-200 truncate max-w-[180px]">{digitalFileName}</p>
                            <span className="text-[10px] text-emerald-400 font-mono">Listo para cargar</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setDigitalImage(null);
                            setDigitalFileName('');
                          }}
                          className="text-xs text-rose-400 hover:text-rose-300 px-2.5 py-1 rounded hover:bg-rose-500/10 transition-colors"
                        >
                          Quitar
                        </button>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          id="digital-art-upload"
                          accept="image/*"
                          className="hidden"
                          onChange={handleDigitalImageChange}
                        />
                        <label
                          htmlFor="digital-art-upload"
                          className="border border-dashed border-slate-700 hover:border-amber-500/50 bg-slate-950/50 rounded-lg p-4 text-center cursor-pointer flex flex-col items-center justify-center gap-1.5 transition-colors"
                        >
                          <UploadCloud className="w-5 h-5 text-slate-400" />
                          <span className="text-xs text-slate-300 font-medium">Seleccionar Arte Digital</span>
                          <span className="text-[10px] text-slate-500">PNG, JPG recomendado (1465x550)</span>
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Card 2: Diseño Impresión Físico (63X177) */}
                  <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200 flex items-center gap-2">
                        <Printer className="w-4 h-4 text-blue-400" />
                        Diseño Impresión Físico
                      </span>
                      <span className="text-[10px] font-mono bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full">
                        63X177 (1134 × 236 px)
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Se cargará en <strong>Boca</strong> y <strong>Godex</strong> (ranura 63X177; se omite 63X177PP).
                    </p>

                    {printImage ? (
                      <div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-lg p-2.5">
                        <div className="flex items-center gap-3">
                          <img
                            src={printImage}
                            alt="Print Preview"
                            className="w-20 h-10 object-cover rounded border border-slate-700"
                          />
                          <div className="overflow-hidden">
                            <p className="text-xs font-medium text-slate-200 truncate max-w-[180px]">{printFileName}</p>
                            <span className="text-[10px] text-blue-400 font-mono">Listo para Boca y Godex</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setPrintImage(null);
                            setPrintFileName('');
                          }}
                          className="text-xs text-rose-400 hover:text-rose-300 px-2.5 py-1 rounded hover:bg-rose-500/10 transition-colors"
                        >
                          Quitar
                        </button>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="file"
                          id="print-art-upload"
                          accept="image/*"
                          className="hidden"
                          onChange={handlePrintImageChange}
                        />
                        <label
                          htmlFor="print-art-upload"
                          className="border border-dashed border-slate-700 hover:border-blue-500/50 bg-slate-950/50 rounded-lg p-4 text-center cursor-pointer flex flex-col items-center justify-center gap-1.5 transition-colors"
                        >
                          <Printer className="w-5 h-5 text-slate-400" />
                          <span className="text-xs text-slate-300 font-medium">Seleccionar Arte Físico</span>
                          <span className="text-[10px] text-slate-500">Formato 63X177 (1134x236)</span>
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {/* Opción de Reemplazo de Imágenes */}
                {(digitalImage || printImage) && (
                  <div className="pt-1">
                    <label className="flex items-start sm:items-center gap-3 cursor-pointer select-none bg-slate-900/80 hover:bg-slate-900 border border-slate-800 rounded-xl p-3.5 transition-all">
                      <input
                        type="checkbox"
                        checked={replaceImages}
                        onChange={(e) => setReplaceImages(e.target.checked)}
                        className="mt-0.5 sm:mt-0 w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                      />
                      <div className="flex flex-col">
                        <span className="text-xs font-semibold text-slate-200">
                          Reemplazar imágenes si el precio ya tiene una cargada (Eliminar previa y subir nueva)
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {replaceImages
                            ? '⚠️ Modo Sobreescritura: El bot pulsará "Eliminar" en los precios que ya tengan arte y montará la nueva imagen.'
                            : '⚡ Modo Conservar: Si el precio ya tiene una imagen cargada, la respetará y la omitirá para ahorrar tiempo.'}
                        </span>
                      </div>
                    </label>
                  </div>
                )}

                {/* Opción de Archivado / Actualización Inteligente si los Valores Monetarios Cambian */}
                <div className="pt-1">
                  <label className="flex items-start sm:items-center gap-3 cursor-pointer select-none bg-slate-900/80 hover:bg-slate-900 border border-slate-800 rounded-xl p-3.5 transition-all">
                    <input
                      type="checkbox"
                      checked={archiveOldPrices}
                      onChange={(e) => setArchiveOldPrices(e.target.checked)}
                      className="mt-0.5 sm:mt-0 w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-200">
                        Gestión inteligente de cambios de valor (In-situ si 0 ventas, o archivar como OLD restando aforo si ya vendió)
                      </span>
                      <span className="text-[11px] text-slate-400">
                        {archiveOldPrices
                          ? '✨ Automático: Si el precio no tiene ventas, actualiza el valor directamente. Si ya tuvo ventas, lo renombra a OLD, lo desactiva, descuenta las ventas del aforo y crea el nuevo precio.'
                          : '⚡ Desactivado: Si el precio ya existe en la tabla con valor diferente, conservará los datos monetarios actuales de QRBoletos sin modificarlos.'}
                      </span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Barra de Acciones y Sincronización */}
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Terminal className="w-4 h-4 text-emerald-400" />
                      Google Chrome Automation (CDP :9222)
                    </p>
                    <p className="text-[11px] text-slate-400">
                      Inicia Chrome antes de continuar:{' '}
                      <code className="text-amber-400 bg-slate-900 px-1.5 py-0.5 rounded font-mono">
                        chrome.exe --remote-debugging-port=9222 --user-data-dir=&quot;C:\chrome-dev-profile&quot;
                      </code>
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartSync(true)}
                      disabled={isSyncing}
                      className="border border-slate-700 hover:border-slate-600 hover:bg-slate-800 text-slate-300 font-semibold px-4 py-2.5 rounded-xl text-xs transition-all disabled:opacity-50 cursor-pointer"
                    >
                      Probar Simulación (Dry-Run)
                    </button>
                    <button
                      onClick={() => handleStartSync(false)}
                      disabled={isSyncing}
                      className="bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-slate-950 font-bold px-5 py-2.5 rounded-xl text-xs transition-all shadow-lg flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                    >
                      {isSyncing ? (
                        <>
                          <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                          Cargando en Chrome...
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 fill-current" />
                          Sincronizar en Chrome
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Consola de logs en vivo */}
                {syncLogs.length > 0 && (
                  <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-3 font-mono text-xs max-h-48 overflow-y-auto space-y-1">
                    {syncLogs.map((log, i) => {
                      let colorClass = 'text-slate-300';
                      if (log.level === 'success') colorClass = 'text-emerald-400 font-semibold';
                      if (log.level === 'warning') colorClass = 'text-amber-400';
                      if (log.level === 'error') colorClass = 'text-rose-400 font-semibold';

                      return (
                        <div key={i} className={`flex items-start gap-2 ${colorClass}`}>
                          <span className="text-slate-600 select-none">&gt;</span>
                          <span>{log.message}</span>
                        </div>
                      );
                    })}
                    <div ref={logsEndRef} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>,
      document.body
  );
}
