'use client';

import React, { useState, useEffect } from 'react';
import { Evento, Localidad, EventAvailabilitySummary, LocalidadAvailability } from '@/types';
import {
  ArrowLeft,
  Search,
  Globe,
  Clipboard,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Settings,
  DollarSign,
  Armchair,
  Database,
  HelpCircle,
  X,
  Sparkles,
  Zap,
  Palette,
  Ticket
} from 'lucide-react';
import TarifarioUploaderModal from './TarifarioUploaderModal';

interface LocalitiesViewProps {
  evento: Evento;
  eventoAvailability?: EventAvailabilitySummary;
  onBack: () => void;
  onSaveLocalities: (rowId: string, localidades: Localidad[]) => Promise<void>;
  onOpenArtworks?: () => void;
  onConfigureSettings?: () => void;
}

export default function LocalitiesView({
  evento,
  eventoAvailability,
  onBack,
  onSaveLocalities,
  onOpenArtworks,
  onConfigureSettings
}: LocalitiesViewProps) {
  const [htmlContent, setHtmlContent] = useState('');
  const [localidades, setLocalidades] = useState<Localidad[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showPastePanel, setShowPastePanel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showTarifarioModal, setShowTarifarioModal] = useState(false);
  const [isExtractingFromChrome, setIsExtractingFromChrome] = useState(false);
  const [availability, setAvailability] = useState<EventAvailabilitySummary | null>(eventoAvailability || null);
  const [isAvailabilityLoading, setIsAvailabilityLoading] = useState(false);

  // Obtener el dominio del evento
  let domain = 'https://dashboard.qrboletos.com';
  try {
    if (evento.urlBase) {
      const url = new URL(evento.urlBase);
      domain = url.origin;
    }
  } catch (e) {
    console.error('Error parseando el dominio:', e);
  }

  // URL del listado de localidades
  const localitiesUrl = `${evento.urlBase}/sections/list.aspx`;

  // Cargar localidades si ya existen en la base de datos
  useEffect(() => {
    if (evento.localidades && evento.localidades.length > 0) {
      setLocalidades(evento.localidades);
      setShowPastePanel(false);
      setSuccess(`Cargadas ${evento.localidades.length} localidades de la base de datos.`);
    } else {
      setLocalidades([]);
      setShowPastePanel(true);
      setSuccess(null);
    }
    setError(null);
  }, [evento]);

  // Sincronizar o cargar aforo de localidades desde la API de Catálogo
  useEffect(() => {
    if (eventoAvailability) {
      setAvailability(eventoAvailability);
      return;
    }

    const fetchAvailability = async () => {
      setIsAvailabilityLoading(true);
      try {
        const showId = evento.showId || evento.id;
        const res = await fetch(`/api/catalog?id=${encodeURIComponent(showId || '')}&name=${encodeURIComponent(evento.nombre || '')}`);
        const data = await res.json();
        if (data.success && data.data) {
          const d = data.data;
          const totalAforo = d.localidades?.reduce((acc: number, l: any) => acc + (l.aforo || 0), 0) || 0;
          const totalDisponibles = d.localidades?.reduce((acc: number, l: any) => acc + (l.disponibles || 0), 0) || 0;
          const totalVendidos = Math.max(0, totalAforo - totalDisponibles);
          const porcentaje = totalAforo > 0 ? Math.round((totalVendidos / totalAforo) * 100) : 0;
          setAvailability({
            showId: d.id_evento_espectaculo,
            idEvento: d.id_evento,
            evento: d.evento || evento.nombre,
            espectaculo: d.espectaculo || '',
            totalAforo,
            totalDisponibles,
            totalVendidos,
            porcentaje,
            localidades: (d.localidades || []).map((l: any) => {
              const aforo = l.aforo || 0;
              const disponibles = l.disponibles || 0;
              const vendidos = Math.max(0, aforo - disponibles);
              const pct = aforo > 0 ? Math.round((vendidos / aforo) * 100) : 0;
              return {
                nombre: l.localidad,
                aforo,
                disponibles,
                vendidos,
                porcentaje: pct,
              };
            }),
          });
        }
      } catch (e) {
        console.warn('Error cargando aforo de localidades:', e);
      } finally {
        setIsAvailabilityLoading(false);
      }
    };

    fetchAvailability();
  }, [evento, eventoAvailability]);

  // Normalizar y buscar aforo de una localidad específica
  const cleanStr = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

  const getLocalityAvailability = (locName: string): LocalidadAvailability | null => {
    if (!availability?.localidades || availability.localidades.length === 0) return null;
    const target = cleanStr(locName);
    if (!target) return null;

    // 1. Coincidencia exacta
    const exact = availability.localidades.find((l) => cleanStr(l.nombre) === target);
    if (exact) return exact;

    // 2. Coincidencia por inclusión
    return (
      availability.localidades.find((l) => {
        const candidate = cleanStr(l.nombre);
        return candidate && (candidate.includes(target) || target.includes(candidate));
      }) || null
    );
  };

  // Convertir URL relativa a absoluta
  const makeAbsoluteUrl = (url: string): string => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;
    return `${domain}${cleanUrl}`;
  };

  // Guardar localidades extraídas
  const saveExtractedLocalities = async (extracted: Localidad[]) => {
    if (!evento.id) return;
    setIsSaving(true);
    try {
      await onSaveLocalities(evento.id, extracted);
      setSuccess(`¡Se guardaron ${extracted.length} localidades en la base de datos!`);
      setShowPastePanel(false); // Ocultar panel de pegado tras guardar
    } catch (err: any) {
      setError(`Se procesaron las localidades pero falló el autoguardado: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Petición al endpoint backend de extracción por HTML pegado
  const handleManualExtract = async () => {
    if (!htmlContent.trim()) {
      setError('Por favor, pega el código HTML primero.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/extract-localidades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ htmlContent: htmlContent.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Ocurrió un error al extraer las localidades.');
      }

      setLocalidades(data.localidades);
      setHtmlContent(''); // Limpiar textarea

      // Guardar automáticamente en Sheets / Local Storage
      await saveExtractedLocalities(data.localidades);

    } catch (err: any) {
      setError(err.message || 'Error al procesar el código HTML.');
    } finally {
      setIsLoading(false);
    }
  };

  // Extraer localidades directamente desde Google Chrome usando el bot
  const handleExtractFromChrome = async () => {
    setIsExtractingFromChrome(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch('/api/chrome/extract-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUrl: evento.urlBase ? `${evento.urlBase}/sections.aspx` : undefined,
          eventId: evento.id,
          rowId: evento.rowId,
          eventName: evento.nombre,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudieron extraer las localidades desde Chrome.');
      }

      if (data.urlBase) {
        evento.urlBase = data.urlBase;
      }
      if (data.promoterId) evento.promoterId = data.promoterId;
      if (data.eventId) evento.eventId = data.eventId;
      if (data.showId) evento.showId = data.showId;

      setLocalidades(data.localidades);
      setShowPastePanel(false);
      setSuccess(`¡${data.total} localidades extraídas de sections.aspx e importadas exitosamente!`);

      // Guardar automáticamente en Sheets / Local Storage
      await saveExtractedLocalities(data.localidades);
    } catch (err: any) {
      setError(`Error importando localidades desde Chrome: ${err.message}`);
    } finally {
      setIsExtractingFromChrome(false);
    }
  };

  // Activa el panel de pegado y abre el enlace de secciones en otra pestaña
  const handleActivateUpdate = () => {
    window.open(localitiesUrl, '_blank');
    setShowPastePanel(true);
    setSuccess(null);
    setError(null);
  };

  // Determinar la prioridad de visualización de cada localidad según su nombre
  const getLocalityPriority = (name: string): number => {
    const n = name.toLowerCase();

    // 1. Experiencia Gold
    if (n.includes('gold') || n.includes('experiencia gold')) {
      return 1;
    }

    // 2. Platea
    if (n.includes('platea')) {
      return 2;
    }

    // 3. VIP's (Excluyendo visual restringida o VR)
    if (n.includes('vip')) {
      if (n.includes('restringida') || n.includes('vr')) {
        return 4; // 4. VIP's visual restringida (VR)
      }
      return 3;
    }

    // 5. Preferencial (Excluyendo visual restringida o VR)
    if (n.includes('preferencial')) {
      if (n.includes('restringida') || n.includes('vr')) {
        return 6; // 6. Preferencial visual restringida (VR)
      }
      return 5;
    }

    // 7. Cualquier otra localidad
    return 7;
  };

  // Filtrar y ordenar localidades por búsqueda y prioridad
  const filteredLocalidades = localidades
    .filter((loc) => loc.nombre.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      const priorityA = getLocalityPriority(a.nombre);
      const priorityB = getLocalityPriority(b.nombre);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Orden numérico/alfabético secundario para la misma categoría (ej. VIP 1, VIP 2...)
      return a.nombre.localeCompare(b.nombre, undefined, { numeric: true, sensitivity: 'base' });
    });

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
      {/* Cabecera del panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl transition-all hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2 flex-wrap">
              {evento.nombre}
              {localidades.length > 0 && !showPastePanel && (
                <span className="text-[10px] text-emerald-800 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20 px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1.5 shadow-sm">
                  <Database className="w-3 h-3" />
                  Persistido ({localidades.length})
                </span>
              )}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">

          {/* Botón para Importar Localidades directamente desde Chrome con el Bot */}
          <button
            onClick={handleExtractFromChrome}
            disabled={isExtractingFromChrome}
            className="bg-emerald-50 dark:bg-emerald-600/20 hover:bg-emerald-600 text-emerald-800 dark:text-emerald-400 hover:text-white border border-emerald-300 dark:border-emerald-500/30 hover:border-emerald-500 rounded-xl px-3.5 py-2 text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
            title="Importar todas las localidades directamente desde la pestaña activa de Chrome con el bot"
          >
            <Zap className={`w-3.5 h-3.5 fill-current ${isExtractingFromChrome ? 'animate-pulse' : ''}`} />
            <span>{isExtractingFromChrome ? 'Importando...' : 'Importar de Chrome'}</span>
          </button>

          {/* Botón para Cargar Tarifario con IA */}
          <button
            onClick={() => setShowTarifarioModal(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl px-3.5 py-2 text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95"
            title="Extraer precios de foto del comité y cargar en Chrome"
          >
            <Sparkles className="w-3.5 h-3.5 fill-current" />
            Cargar Tarifario con IA
          </button>

          {/* Botón para Reemplazar / Actualizar Artes */}
          {onOpenArtworks && (
            <button
              onClick={onOpenArtworks}
              className="bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold rounded-xl px-3.5 py-2 text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95"
              title="Actualizar o reemplazar el QRBoleto digital y el diseño físico (Boca y Godex) en las localidades"
            >
              <Palette className="w-3.5 h-3.5" />
              <span>🎨 Actualizar Artes</span>
            </button>
          )}

          {/* Botón para Configurar Evento (HTMLs, Restricciones, Switches, Imágenes) */}
          {onConfigureSettings && (
            <button
              onClick={onConfigureSettings}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl px-3.5 py-2 text-xs flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95"
              title="Configurar descripción, términos, edad mínima, switches e imágenes del evento"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>⚙️ Configurar Evento</span>
            </button>
          )}

          {/* Botón para actualizar localidades si ya existen en la base de datos */}
          {localidades.length > 0 && !showPastePanel && (
            <button
              onClick={handleActivateUpdate}
              className="bg-amber-50 dark:bg-amber-600/10 hover:bg-amber-600 text-amber-900 dark:text-amber-400 hover:text-white border border-amber-300 dark:border-amber-500/20 hover:border-amber-600 rounded-xl px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95"
              title="Actualizar manualmente pegando código HTML"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Pegar HTML
            </button>
          )}

          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-950 px-3 py-2 rounded-full border border-slate-300 dark:border-slate-800 flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500" />
            {domain.replace('https://', '')}
          </span>
        </div>
      </div>

      {/* Vista A: Panel de pegado manual (Si no hay localidades o se seleccionó Actualizar) */}
      {showPastePanel && (
        <div className="space-y-4">
          {/* Banner de acceso rápido para importar con el bot */}
          <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-inner">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 fill-current" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-950 dark:text-emerald-200">
                  ¿Tienes el show abierto en Google Chrome?
                </p>
                <p className="text-[11px] text-emerald-800 dark:text-emerald-400/80">
                  Puedes importar automáticamente todas las localidades en 2 segundos sin copiar y pegar HTML.
                </p>
              </div>
            </div>
            <button
              onClick={handleExtractFromChrome}
              disabled={isExtractingFromChrome}
              className="bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shrink-0 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>{isExtractingFromChrome ? 'Importando...' : 'Importar de Chrome ahora'}</span>
            </button>
          </div>

          <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <Clipboard className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-200">O Pega el Código HTML de la Página de Localidades</h3>
                <p className="text-xs text-slate-400">
                  Pega el código fuente HTML de la página de secciones de QRBoletos si prefieres extracción manual.
                </p>
              </div>
            </div>

            <textarea
              className="w-full h-44 bg-slate-900 border border-slate-800 text-slate-100 rounded-xl px-4 py-3 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all font-mono placeholder:text-slate-600"
              placeholder="Haz clic derecho -> Inspeccionar en el contenedor de localidades, o pulsa Ctrl+U, copia el código HTML completo de la página de secciones de QRBoletos y pégalo aquí..."
              value={htmlContent}
              onChange={(e) => setHtmlContent(e.target.value)}
            />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleManualExtract}
                  disabled={isLoading || isSaving || !htmlContent.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:opacity-50 text-white font-semibold py-2.5 px-6 rounded-xl transition-all shadow-md hover:shadow-emerald-500/10 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4.5 h-4.5 animate-spin" />
                      Procesando HTML...
                    </>
                  ) : isSaving ? (
                    <>
                      <RefreshCw className="w-4.5 h-4.5 animate-spin text-emerald-300" />
                      Guardando...
                    </>
                  ) : (
                    <>
                      <Clipboard className="w-4.5 h-4.5" />
                      Procesar Código HTML
                    </>
                  )}
                </button>

                {/* Permitir cancelar y volver al listado si ya existen localidades guardadas */}
                {localidades.length > 0 && (
                  <button
                    onClick={() => {
                      setShowPastePanel(false);
                      setError(null);
                    }}
                    className="border border-slate-800 hover:border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-white font-semibold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                    Cancelar
                  </button>
                )}
              </div>

              {/* Enlace alternativo para abrir la URL manualmente */}
              <a
                href={localitiesUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-400 hover:text-emerald-400 flex items-center gap-1 font-medium transition-colors"
              >
                Abrir configuración de secciones en QRBoletos
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Ayuda de copiado */}
            <p className="text-[11px] text-slate-500 mt-4 flex items-start gap-1.5 border-t border-slate-900 pt-3">
              <HelpCircle className="w-4 h-4 shrink-0 text-slate-600 mt-0.5" />
              <span>
                <strong>¿Cómo copiar el código?</strong> En la pestaña de QRBoletos que se abrió, haz clic derecho en cualquier parte y selecciona <strong>&quot;Ver código fuente de la página&quot;</strong> (o presiona <code>Ctrl + U</code>). Copia todo el contenido (<code>Ctrl + A</code> y luego <code>Ctrl + C</code>) y pégalo en el cuadro de arriba.
              </span>
            </p>
          </div>

          {/* Feedback visual de errores */}
          {error && (
            <div className="bg-red-500/5 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-semibold block">Error al Procesar HTML</span>
                <p className="text-xs text-red-300/90">{error}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vista B: Listado de Localidades (Si hay localidades guardadas y no se está actualizando) */}
      {!showPastePanel && localidades.length > 0 && (
        <div className="space-y-4 mt-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <h3 className="text-base font-bold text-slate-200 flex items-center gap-2">
              <Armchair className="text-emerald-500 w-5 h-5" />
              Localidades Encontradas ({filteredLocalidades.length})
            </h3>
            
            {/* Buscador de localidades */}
            <div className="relative w-full md:w-64">
              <Search className="w-4.5 h-4.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar localidad..."
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Resumen Global de Aforo del Evento si está disponible */}
          {availability && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Ticket className="w-4 h-4 shrink-0" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-200">
                    Aforo Total Vendido: <span className="font-mono text-emerald-400 font-extrabold">{availability.totalVendidos.toLocaleString()}</span> / <span className="font-mono text-slate-300">{availability.totalAforo.toLocaleString()}</span> ({availability.porcentaje}%)
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Disponibles en taquilla/online: <strong className="text-slate-300">{availability.totalDisponibles.toLocaleString()}</strong>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-48">
                <div className="w-full bg-slate-900 border border-slate-800 rounded-full h-2.5 overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      availability.porcentaje >= 90
                        ? 'bg-gradient-to-r from-rose-500 to-amber-500'
                        : availability.porcentaje >= 60
                        ? 'bg-gradient-to-r from-amber-500 to-emerald-400'
                        : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, availability.porcentaje))}%` }}
                  />
                </div>
                <span className="text-xs font-mono font-bold text-slate-300 shrink-0">
                  {availability.porcentaje}%
                </span>
              </div>
            </div>
          )}

          {/* Listado de tarjetas de localidad - Altamente optimizado en espacio */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredLocalidades.map((loc, idx) => {
              // Obtener los links específicos
              const configLink = loc.links?.find(l => l.label === 'Configuración')?.url || loc.url;
              const pricesLink = loc.links?.find(l => l.label === 'Precios')?.url;
              const seatsLink = loc.links?.find(l => l.label === 'Acomodación')?.url;
              const locAvail = getLocalityAvailability(loc.nombre);

              return (
                <div
                  key={idx}
                  className="bg-slate-950 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between gap-3 hover:border-slate-700/60 transition-all group shadow-sm"
                >
                  {/* Nombre de la Localidad */}
                  <div className="flex items-center gap-2 border-b border-slate-900 pb-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 group-hover:scale-110 transition-transform shrink-0"></div>
                    <span className="font-extrabold text-xs text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors uppercase tracking-wide truncate" title={loc.nombre}>
                      {loc.nombre}
                    </span>
                  </div>

                  {/* Aforo Vendido y Total + Barra de Progresión de la Localidad */}
                  {locAvail ? (
                    <div className="space-y-1.5 py-1 bg-slate-900/40 rounded-lg px-2.5 py-2 border border-slate-800/70">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-slate-400 flex items-center gap-1 font-sans">
                          <Ticket className="w-3 h-3 text-emerald-400 shrink-0" />
                          <span>Vendidos: <strong className="text-slate-200 font-mono">{locAvail.vendidos.toLocaleString()}</strong> / {locAvail.aforo.toLocaleString()}</span>
                        </span>
                        <span
                          className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                            locAvail.porcentaje >= 90
                              ? 'bg-rose-500/20 text-rose-400'
                              : locAvail.porcentaje >= 60
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-emerald-500/20 text-emerald-400'
                          }`}
                        >
                          {locAvail.porcentaje}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-900 border border-slate-800 rounded-full h-2 overflow-hidden p-0.5">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            locAvail.porcentaje >= 90
                              ? 'bg-gradient-to-r from-rose-500 to-amber-500'
                              : locAvail.porcentaje >= 60
                              ? 'bg-gradient-to-r from-amber-500 to-emerald-400'
                              : 'bg-gradient-to-r from-emerald-500 to-teal-400'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, locAvail.porcentaje))}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                        <span>Disponibles: <strong className="text-emerald-400">{locAvail.disponibles.toLocaleString()}</strong></span>
                        <span>Aforo: <strong className="text-slate-300">{locAvail.aforo.toLocaleString()}</strong></span>
                      </div>
                    </div>
                  ) : isAvailabilityLoading ? (
                    <div className="py-2 space-y-1.5 animate-pulse bg-slate-900/40 rounded-lg px-2.5 py-2">
                      <div className="h-2.5 bg-slate-800 rounded w-2/3"></div>
                      <div className="h-2 bg-slate-900 rounded w-full"></div>
                    </div>
                  ) : null}

                  {/* Botones de acción - Compactos y distribuidos */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {/* Botón de Configuración */}
                    <a
                      href={makeAbsoluteUrl(configLink)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-slate-900 border border-slate-800 hover:border-pink-500/40 text-slate-300 hover:text-pink-600 dark:hover:text-pink-400 rounded-lg py-2 px-1 text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                      title="Configuración"
                    >
                      <Settings className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate w-full text-center">Config</span>
                    </a>

                    {/* Botón de Precios */}
                    {pricesLink ? (
                      <a
                        href={makeAbsoluteUrl(pricesLink)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 rounded-lg py-2 px-1 text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                        title="Precios"
                      >
                        <DollarSign className="w-3.5 h-3.5 text-amber-600 dark:text-amber-500 shrink-0" />
                        <span className="truncate w-full text-center">Precios</span>
                      </a>
                    ) : (
                      <div className="bg-slate-950/40 border border-slate-900 text-slate-600 rounded-lg py-2 px-1 text-[10px] font-bold flex flex-col items-center justify-center gap-1 select-none opacity-40">
                        <DollarSign className="w-3.5 h-3.5 shrink-0" />
                        <span>Precios</span>
                      </div>
                    )}

                    {/* Botón de Acomodación */}
                    {seatsLink ? (
                      <a
                        href={makeAbsoluteUrl(seatsLink)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-slate-900 border border-slate-800 hover:border-blue-500/40 text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg py-2 px-1 text-[10px] font-bold transition-all flex flex-col items-center justify-center gap-1 cursor-pointer active:scale-95 shadow-sm"
                        title="Acomodación"
                      >
                        <Armchair className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="truncate w-full text-center">Asientos</span>
                      </a>
                    ) : (
                      <div className="bg-slate-950/40 border border-slate-900 text-slate-600 rounded-lg py-2 px-1 text-[10px] font-bold flex flex-col items-center justify-center gap-1 select-none opacity-40">
                        <Armchair className="w-3.5 h-3.5 shrink-0" />
                        <span>Asientos</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal para Cargar Tarifario con IA y Sincronizar en Chrome */}
      <TarifarioUploaderModal
        evento={{ ...evento, localidades }}
        isOpen={showTarifarioModal}
        onClose={() => setShowTarifarioModal(false)}
        onSyncComplete={() => {
          // Si el usuario actualiza localidades
        }}
      />
    </div>
  );
}

