'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Evento } from '@/types';
import {
  DEFAULT_EVENT_DESCRIPTION,
  DEFAULT_EVENT_TERMS,
  DEFAULT_MIN_AGE,
  DEFAULT_EVENT_SWITCHES,
  AVAILABLE_AGE_OPTIONS,
  ALL_AGE_OPTIONS,
  formatAgePhrase,
  replaceAgeInHtml,
  getEventDescription,
  getEventTerms,
} from '@/data/eventSettingsDefaults';
import {
  X,
  Settings,
  RefreshCw,
  ShieldAlert,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  Play,
  Terminal,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Utensils,
  Wine,
  Baby,
  Accessibility,
  Eye,
  Code,
  Upload,
  Check,
  ChevronRight,
  Info,
} from 'lucide-react';

interface EventSettingsModalProps {
  evento: Evento;
  onClose: () => void;
}

interface LogMessage {
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
}

export default function EventSettingsModal({ evento, onClose }: EventSettingsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'descripcion' | 'tos' | 'imagenes' | 'sync'>('general');

  // Promoter y Event ID
  const promoterId = evento.promoterId || (evento.urlBase?.match(/promoters\/([^/]+)/)?.[1] ?? '');
  const eventId = evento.eventId || (evento.urlBase?.match(/events\/([^/]+)/)?.[1] ?? '');
  const settingsUrl = promoterId && eventId
    ? `https://dashboard.qrboletos.com/promoters/${promoterId}/events/${eventId}/settings.aspx`
    : evento.urlBase || '';

  // Configuración de Estados
  const storageKey = `qrboletos_event_settings_${evento.id || eventId}`;
  
  const [minAge, setMinAge] = useState<string>(DEFAULT_MIN_AGE);
  const [switches, setSwitches] = useState({
    comida: DEFAULT_EVENT_SWITCHES.comida,
    alcohol: DEFAULT_EVENT_SWITCHES.alcohol,
    embarazadas: DEFAULT_EVENT_SWITCHES.embarazadas,
    discapacitados: DEFAULT_EVENT_SWITCHES.discapacitados,
  });

  const [descripcionHtml, setDescripcionHtml] = useState<string>(DEFAULT_EVENT_DESCRIPTION);
  const [tosHtml, setTosHtml] = useState<string>(DEFAULT_EVENT_TERMS);

  // Vistas previas de editores HTML
  const [descPreviewMode, setDescPreviewMode] = useState<'code' | 'preview'>('preview');
  const [tosPreviewMode, setTosPreviewMode] = useState<'code' | 'preview'>('preview');

  // Imágenes (DataURLs base64)
  const [imageHome, setImageHome] = useState<string | null>(null);
  const [imageHomeName, setImageHomeName] = useState<string | null>(null);
  const [imageAfiche, setImageAfiche] = useState<string | null>(null);
  const [imageAficheName, setImageAficheName] = useState<string | null>(null);
  const [imageBanner, setImageBanner] = useState<string | null>(null);
  const [imageBannerName, setImageBannerName] = useState<string | null>(null);

  // Sincronización y Logs SSE
  const [isExecuting, setIsExecuting] = useState(false);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Estados para validación remota en vivo desde QRBoletos
  const [isValidatingRemote, setIsValidatingRemote] = useState<boolean>(false);
  const [remoteValidated, setRemoteValidated] = useState<boolean>(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const [existingImages, setExistingImages] = useState<{
    home: string | null;
    afiche: string | null;
    banner: string | null;
  }>({ home: null, afiche: null, banner: null });

  // Función para consultar configuración montada en dashboard.qrboletos.com
  const fetchRemoteSettings = async () => {
    if (!promoterId || !eventId) return;
    setIsValidatingRemote(true);
    setRemoteError(null);
    try {
      const res = await fetch('/api/events/fetch-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promoterId, eventId }),
      });
      const data = await res.json();
      if (data.success && data.settings) {
        const s = data.settings;
        let activeAge = minAge;
        if (s.minAge) {
          setMinAge(s.minAge);
          activeAge = s.minAge;
        }
        if (s.switches) {
          setSwitches({
            comida: s.switches.comida ?? DEFAULT_EVENT_SWITCHES.comida,
            alcohol: s.switches.alcohol ?? DEFAULT_EVENT_SWITCHES.alcohol,
            embarazadas: s.switches.embarazadas ?? DEFAULT_EVENT_SWITCHES.embarazadas,
            discapacitados: s.switches.discapacitados ?? DEFAULT_EVENT_SWITCHES.discapacitados,
          });
        }
        // Validar descripción: si tiene contenido real en QRBoletos, ponerla; si no, poner la default con la edad activa
        const descHasContent = s.descripcion && s.descripcion.replace(/<[^>]*>|&nbsp;|\s/g, '').length > 20;
        if (descHasContent) {
          setDescripcionHtml(s.descripcion);
        } else {
          setDescripcionHtml(getEventDescription(activeAge));
        }
        // Validar TYC: si tiene contenido real en QRBoletos, ponerla; si no, poner la default con la edad activa
        const tosHasContent = s.tos && s.tos.replace(/<[^>]*>|&nbsp;|\s/g, '').length > 20;
        if (tosHasContent) {
          setTosHtml(s.tos);
        } else {
          setTosHtml(getEventTerms(activeAge));
        }
        // Guardar imágenes existentes montadas en QRBoletos
        if (s.images) {
          setExistingImages({
            home: s.images.home || null,
            afiche: s.images.afiche || null,
            banner: s.images.banner || null,
          });
        }
        setRemoteValidated(true);
      } else {
        if (data.error) setRemoteError(data.error);
      }
    } catch (e: any) {
      console.warn('No se pudo validar configuración remota:', e);
      setRemoteError(e.message || 'Error consultando Chrome');
    } finally {
      setIsValidatingRemote(false);
    }
  };

  // Variable de edad sincronizada: actualiza minAge y adapta en tiempo real la descripción y TYC
  const handleAgeChange = (newAge: string) => {
    setMinAge(newAge);
    setDescripcionHtml((prev) => replaceAgeInHtml(prev, newAge));
    setTosHtml((prev) => replaceAgeInHtml(prev, newAge));
  };

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = 'hidden';

    // Cargar borrador previo si existe
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.minAge) setMinAge(parsed.minAge);
        if (parsed.switches) setSwitches(parsed.switches);
        if (parsed.descripcionHtml) setDescripcionHtml(parsed.descripcionHtml);
        if (parsed.tosHtml) setTosHtml(parsed.tosHtml);
      }
    } catch (e) {
      console.error('Error cargando borrador local:', e);
    }

    // Validar y cargar automáticamente la información montada en dashboard.qrboletos.com
    fetchRemoteSettings();

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [storageKey]);

  // Guardar en localStorage ante cambios
  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          minAge,
          switches,
          descripcionHtml,
          tosHtml,
        })
      );
    } catch {}
  }, [minAge, switches, descripcionHtml, tosHtml, mounted, storageKey]);

  // Autoscroll del visor de logs
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Escuchar escape para cerrar si no se está ejecutando
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isExecuting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExecuting, onClose]);

  const handleImageUpload = (file: File, type: 'home' | 'afiche' | 'banner') => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (type === 'home') {
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

  const handleResetDefaults = () => {
    if (confirm('¿Deseas restablecer la descripción, términos y switches a las plantillas oficiales predeterminadas?')) {
      setMinAge(DEFAULT_MIN_AGE);
      setSwitches({
        comida: DEFAULT_EVENT_SWITCHES.comida,
        alcohol: DEFAULT_EVENT_SWITCHES.alcohol,
        embarazadas: DEFAULT_EVENT_SWITCHES.embarazadas,
        discapacitados: DEFAULT_EVENT_SWITCHES.discapacitados,
      });
      setDescripcionHtml(getEventDescription(DEFAULT_MIN_AGE));
      setTosHtml(getEventTerms(DEFAULT_MIN_AGE));
    }
  };

  const startSyncToChrome = async () => {
    if (!promoterId || !eventId) {
      alert('No se pudo determinar el promoterId o eventId del evento. Verifica que la URL base esté configurada.');
      return;
    }

    setIsExecuting(true);
    setSyncStatus('running');
    setActiveTab('sync');
    setLogs([]);

    try {
      const response = await fetch('/api/events/sync-settings', {
        method: 'POST' as const,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promoterId,
          eventId,
          settings: {
            minAge,
            comida: switches.comida,
            alcohol: switches.alcohol,
            embarazadas: switches.embarazadas,
            discapacitados: switches.discapacitados,
            descripcion: descripcionHtml,
            tos: tosHtml,
            imageHome,
            imageAfiche,
            imageBanner,
          },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Error ${response.status} al iniciar sincronización.`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No se pudo establecer el stream de eventos SSE.');

      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const now = new Date().toLocaleTimeString();

              if (data.type === 'log') {
                setLogs((prev) => [
                  ...prev,
                  {
                    type: data.level || 'info',
                    message: data.message,
                    timestamp: now,
                  },
                ]);
              } else if (data.type === 'finish') {
                if (data.success) {
                  setSyncStatus('success');
                  setLogs((prev) => [
                    ...prev,
                    {
                      type: 'success',
                      message: data.message || 'Sincronización completada con éxito.',
                      timestamp: now,
                    },
                  ]);
                } else {
                  setSyncStatus('error');
                  setLogs((prev) => [
                    ...prev,
                    {
                      type: 'error',
                      message: data.message || 'Error en la sincronización.',
                      timestamp: now,
                    },
                  ]);
                }
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setSyncStatus('error');
      setLogs((prev) => [
        ...prev,
        {
          type: 'error',
          message: err.message || 'Fallo general de conexión con el agente de Chrome.',
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setIsExecuting(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-3 md:p-6 overflow-hidden animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Cabecera del Modal */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/90 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-600/10 border border-blue-300 dark:border-blue-500/20 flex items-center justify-center text-blue-700 dark:text-blue-400 shrink-0">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base md:text-lg font-bold text-slate-900 dark:text-slate-100 line-clamp-1">
                  Configuración del Evento: {evento.nombre}
                </h2>
                {evento.id && (
                  <span className="text-[10px] font-mono font-bold bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-400 px-2 py-0.5 rounded-md border border-slate-300 dark:border-slate-700">
                    ID #{evento.id}
                  </span>
                )}
              </div>
              {settingsUrl && (
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <a
                    href={settingsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1 transition-colors group font-medium"
                  >
                    <span className="truncate max-w-[240px] md:max-w-xs">{settingsUrl}</span>
                    <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                  </a>

                  {/* Estado de validación en vivo con QRBoletos */}
                  {isValidatingRemote ? (
                    <span className="text-[10px] text-amber-900 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold animate-pulse">
                      <RefreshCw className="w-2.5 h-2.5 animate-spin text-amber-700 dark:text-amber-400" />
                      Validando en QRBoletos...
                    </span>
                  ) : remoteValidated ? (
                    <span className="text-[10px] text-emerald-900 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold">
                      <Check className="w-2.5 h-2.5 text-emerald-700 dark:text-emerald-400" />
                      Sincronizado con QRBoletos
                    </span>
                  ) : (
                    <button
                      onClick={fetchRemoteSettings}
                      className="text-[10px] text-slate-700 dark:text-slate-400 hover:text-blue-700 dark:hover:text-blue-300 bg-slate-100 dark:bg-slate-800/80 hover:bg-slate-200 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 px-2 py-0.5 rounded-full flex items-center gap-1 cursor-pointer transition-all font-medium"
                      title="Consultar la configuración actual montada en dashboard.qrboletos.com"
                    >
                      <RefreshCw className="w-2.5 h-2.5" />
                      Validar con QRBoletos
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isExecuting}
            className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/60 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            title="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de Pestañas */}
        <div className="flex items-center gap-1 px-6 border-b border-slate-800 bg-slate-950/40 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('general')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'general'
                ? 'border-blue-600 text-blue-700 dark:border-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/5 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/40'
            }`}
          >
            <ShieldAlert className="w-4 h-4" />
            <span>General y Restricciones</span>
          </button>

          <button
            onClick={() => setActiveTab('descripcion')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'descripcion'
                ? 'border-blue-600 text-blue-700 dark:border-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/5 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/40'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Descripción del Evento</span>
          </button>

          <button
            onClick={() => setActiveTab('tos')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'tos'
                ? 'border-blue-600 text-blue-700 dark:border-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/5 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/40'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Términos y Condiciones</span>
          </button>

          <button
            onClick={() => setActiveTab('imagenes')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'imagenes'
                ? 'border-blue-600 text-blue-700 dark:border-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/5 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/40'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Imágenes</span>
            {(imageHome || imageAfiche || imageBanner) && (
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </button>

          <button
            onClick={() => setActiveTab('sync')}
            className={`px-4 py-3 text-xs font-semibold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'sync'
                ? 'border-blue-600 text-blue-700 dark:border-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/5 font-bold'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/40'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Consola de Sincronización</span>
            {syncStatus === 'running' && <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />}
            {syncStatus === 'success' && <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
            {syncStatus === 'error' && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
          </button>
        </div>

        {/* Contenedor Principal con Scroll */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 min-w-0">
          {/* TAB 1: GENERAL Y RESTRICCIONES */}
          {activeTab === 'general' && (
            <div className="space-y-6 max-w-3xl mx-auto">
              {/* Sección Edad Mínima */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                      <span>🔞 Edad Mínima de Ingreso</span>
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                      Restricción de edad que se configurará y validará en QRBoletos.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 self-start sm:self-auto bg-blue-100 dark:bg-blue-500/10 border border-blue-300 dark:border-blue-500/30 px-3 py-1 rounded-full text-xs font-bold text-blue-900 dark:text-blue-300">
                    <span className="text-slate-600 dark:text-slate-400 font-normal">Activa:</span>
                    <span className="text-slate-900 dark:text-white font-mono font-bold">{minAge}</span>
                  </div>
                </div>

                {/* Botones de selección rápida frecuentes */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                  {AVAILABLE_AGE_OPTIONS.map((opt) => {
                    const isSelected = minAge === opt;
                    return (
                      <button
                        key={opt}
                        onClick={() => handleAgeChange(opt)}
                        className={`py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all cursor-pointer text-center ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-500/20 font-bold'
                            : 'bg-slate-100 dark:bg-slate-900/80 border-slate-300 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}

                  {/* Si la edad seleccionada no está en los 8 presets, mostrarla como píldora seleccionada */}
                  {!AVAILABLE_AGE_OPTIONS.includes(minAge) && (
                    <button
                      className="py-2.5 px-3 rounded-xl border border-blue-500 bg-blue-600 text-white shadow-md shadow-blue-500/20 text-xs font-bold text-center flex items-center justify-center gap-1 col-span-2 sm:col-span-4"
                    >
                      <span>✨ Seleccionada personalizada: {minAge}</span>
                    </button>
                  )}
                </div>

                {/* Selector Desplegable Completo y Entrada Numérica Libre */}
                <div className="mt-4 pt-4 border-t border-slate-300 dark:border-slate-800/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  <span className="text-xs text-slate-600 dark:text-slate-400 font-medium shrink-0">
                    O selecciona cualquier otra edad:
                  </span>

                  <div className="flex items-center gap-2 flex-1 md:justify-end">
                    {/* Lista desplegable completa (1 a 100+ años) */}
                    <div className="relative flex-1 md:flex-initial md:w-56">
                      <select
                        value={minAge}
                        onChange={(e) => handleAgeChange(e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 text-slate-900 dark:text-slate-200 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500 transition-all cursor-pointer"
                      >
                        <option value="" disabled>Seleccionar de la lista completa...</option>
                        {ALL_AGE_OPTIONS.map((age) => (
                          <option key={age} value={age} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-200">
                            {age}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Entrada numérica directa */}
                    <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-2.5 py-1.5 shrink-0">
                      <span className="text-xs text-slate-600 dark:text-slate-400">N°:</span>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        placeholder="Ej: 7"
                        className="w-12 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 text-center text-xs font-bold text-slate-900 dark:text-white rounded-lg py-1 focus:outline-none focus:border-blue-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseInt((e.target as HTMLInputElement).value);
                            if (!isNaN(val) && val >= 1) {
                              handleAgeChange(val === 1 ? '1 año' : val >= 100 ? '100 años+' : `${val} años`);
                            }
                          }
                        }}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val >= 1) {
                            handleAgeChange(val === 1 ? '1 año' : val >= 100 ? '100 años+' : `${val} años`);
                          }
                        }}
                      />
                      <span className="text-[11px] text-slate-600 dark:text-slate-400 font-mono">años</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sección Switches de Características */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 flex items-center gap-2">
                  <span>⚙️ Características y Servicios del Evento</span>
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Activa o desactiva las condiciones que se configurarán en los switches de la plataforma.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  {/* Comida */}
                  <div
                    onClick={() => setSwitches({ ...switches, comida: !switches.comida })}
                    className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      switches.comida
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-900/60 border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${switches.comida ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
                        <Utensils className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-200">¿Se venderá comida?</div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">Alimentos dentro del recinto</div>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${switches.comida ? 'bg-emerald-200 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-500'}`}>
                      {switches.comida ? 'SÍ' : 'NO'}
                    </span>
                  </div>

                  {/* Bebidas alcohólicas */}
                  <div
                    onClick={() => setSwitches({ ...switches, alcohol: !switches.alcohol })}
                    className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      switches.alcohol
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-900/60 border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${switches.alcohol ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
                        <Wine className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-200">¿Se venderá alcohol?</div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">Bebidas alcohólicas</div>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${switches.alcohol ? 'bg-emerald-200 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-500'}`}>
                      {switches.alcohol ? 'SÍ' : 'NO'}
                    </span>
                  </div>

                  {/* Mujeres embarazadas */}
                  <div
                    onClick={() => setSwitches({ ...switches, embarazadas: !switches.embarazadas })}
                    className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      switches.embarazadas
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-900/60 border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${switches.embarazadas ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
                        <Baby className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-200">¿Apto para embarazadas?</div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">Ingreso bajo responsabilidad</div>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${switches.embarazadas ? 'bg-emerald-200 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-500'}`}>
                      {switches.embarazadas ? 'SÍ' : 'NO'}
                    </span>
                  </div>

                  {/* Movilidad reducida */}
                  <div
                    onClick={() => setSwitches({ ...switches, discapacitados: !switches.discapacitados })}
                    className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      switches.discapacitados
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-300'
                        : 'bg-slate-100 dark:bg-slate-900/60 border-slate-300 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${switches.discapacitados ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
                        <Accessibility className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-slate-200">¿Movilidad reducida?</div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-400">Zona adaptada para PCD</div>
                      </div>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${switches.discapacitados ? 'bg-emerald-200 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-500'}`}>
                      {switches.discapacitados ? 'SÍ' : 'NO'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: DESCRIPCIÓN DEL EVENTO */}
          {activeTab === 'descripcion' && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950/60 border border-slate-800 p-4 rounded-2xl">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span>Descripción del Evento (HTML)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Plantilla oficial con layout, botón Matterport 3D y especificaciones de zonas PCD.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDescPreviewMode(descPreviewMode === 'preview' ? 'code' : 'preview')}
                    className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    {descPreviewMode === 'preview' ? (
                      <>
                        <Code className="w-3.5 h-3.5 text-blue-400" />
                        <span>Ver Código HTML</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Ver Vista Previa</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      if (confirm('¿Restablecer la descripción a la plantilla oficial?')) {
                        setDescripcionHtml(DEFAULT_EVENT_DESCRIPTION);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-medium text-amber-300 flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Restablecer a plantilla oficial"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurar Oficial</span>
                  </button>
                </div>
              </div>

              {descPreviewMode === 'preview' ? (
                <div className="bg-white rounded-2xl p-6 min-h-[450px] max-h-[60vh] overflow-y-auto text-slate-900 shadow-inner border border-slate-300">
                  <div dangerouslySetInnerHTML={{ __html: descripcionHtml }} />
                </div>
              ) : (
                <div className="relative">
                  <textarea
                    value={descripcionHtml}
                    onChange={(e) => setDescripcionHtml(e.target.value)}
                    rows={18}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-slate-300 focus:outline-none focus:border-blue-500/50 resize-y leading-relaxed"
                    placeholder="Pega o escribe el HTML de la descripción del evento..."
                  />
                  <div className="text-[10px] text-slate-500 text-right mt-1 font-mono">
                    {descripcionHtml.length} caracteres
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: TÉRMINOS Y CONDICIONES */}
          {activeTab === 'tos' && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-950/60 border border-slate-800 p-4 rounded-2xl">
                <div>
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span>Términos y Condiciones (HTML)</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Políticas de reembolso, acceso al evento y condiciones generales de compra.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setTosPreviewMode(tosPreviewMode === 'preview' ? 'code' : 'preview')}
                    className="px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    {tosPreviewMode === 'preview' ? (
                      <>
                        <Code className="w-3.5 h-3.5 text-blue-400" />
                        <span>Ver Código HTML</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Ver Vista Previa</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => {
                      if (confirm('¿Restablecer los términos y condiciones a la plantilla oficial?')) {
                        setTosHtml(DEFAULT_EVENT_TERMS);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-medium text-amber-300 flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Restablecer a plantilla oficial"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restaurar Oficial</span>
                  </button>
                </div>
              </div>

              {tosPreviewMode === 'preview' ? (
                <div className="bg-white rounded-2xl p-6 min-h-[450px] max-h-[60vh] overflow-y-auto text-slate-900 shadow-inner border border-slate-300">
                  <div dangerouslySetInnerHTML={{ __html: tosHtml }} />
                </div>
              ) : (
                <div className="relative">
                  <textarea
                    value={tosHtml}
                    onChange={(e) => setTosHtml(e.target.value)}
                    rows={18}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs font-mono text-slate-300 focus:outline-none focus:border-blue-500/50 resize-y leading-relaxed"
                    placeholder="Pega o escribe el HTML de los términos y condiciones..."
                  />
                  <div className="text-[10px] text-slate-500 text-right mt-1 font-mono">
                    {tosHtml.length} caracteres
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: IMÁGENES */}
          {activeTab === 'imagenes' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-xs text-blue-300 flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Subida Automatizada de Imágenes</div>
                  <div>
                    Si seleccionas imágenes aquí, el robot las subirá a través del modal de recorte de QRBoletos ajustando automáticamente el zoom al mínimo para conservar la imagen completa. Si no deseas cambiar alguna imagen, simplemente déjala vacía.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* Miniatura: 720 x 639 */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-200">Imagen Miniatura</div>
                    <div className="text-[11px] text-emerald-400 font-mono mt-0.5">720px x 639px</div>
                    <div className="mt-3 aspect-[720/639] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center relative group">
                      {imageHome ? (
                        <>
                          <img src={imageHome} alt="Miniatura" className="w-full h-full object-cover" />
                          <button
                            onClick={() => { setImageHome(null); setImageHomeName(null); }}
                            className="absolute top-2 right-2 p-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-xs"
                            title="Quitar imagen"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <div className="text-center p-3 text-slate-600 text-xs flex flex-col items-center gap-1.5">
                          <ImageIcon className="w-8 h-8 opacity-40" />
                          <span>Sin imagen seleccionada</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-all cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-blue-400" />
                      <span>{imageHome ? 'Cambiar Miniatura' : 'Subir Miniatura'}</span>
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
                    {imageHomeName && (
                      <div className="text-[10px] text-slate-400 truncate mt-1 text-center font-mono">
                        {imageHomeName}
                      </div>
                    )}
                  </div>
                </div>

                {/* Afiche / Portada Vertical: 800 x 800 */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-200">Portada Vertical (Afiche)</div>
                    <div className="text-[11px] text-emerald-400 font-mono mt-0.5">800px x 800px</div>
                    <div className="mt-3 aspect-square bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center relative group">
                      {imageAfiche ? (
                        <>
                          <img src={imageAfiche} alt="Afiche" className="w-full h-full object-cover" />
                          <button
                            onClick={() => { setImageAfiche(null); setImageAficheName(null); }}
                            className="absolute top-2 right-2 p-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-xs"
                            title="Quitar imagen"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <div className="text-center p-3 text-slate-600 text-xs flex flex-col items-center gap-1.5">
                          <ImageIcon className="w-8 h-8 opacity-40" />
                          <span>Sin imagen seleccionada</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-all cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-blue-400" />
                      <span>{imageAfiche ? 'Cambiar Portada Vertical' : 'Subir Portada Vertical'}</span>
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
                    {imageAficheName && (
                      <div className="text-[10px] text-slate-400 truncate mt-1 text-center font-mono">
                        {imageAficheName}
                      </div>
                    )}
                  </div>
                </div>

                {/* Banner / Portada Horizontal: 1950 x 700 */}
                <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-200">Portada Horizontal (Banner)</div>
                    <div className="text-[11px] text-emerald-400 font-mono mt-0.5">1950px x 700px</div>
                    <div className="mt-3 aspect-[1950/700] bg-slate-900 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center relative group">
                      {imageBanner ? (
                        <>
                          <img src={imageBanner} alt="Banner" className="w-full h-full object-cover" />
                          <button
                            onClick={() => { setImageBanner(null); setImageBannerName(null); }}
                            className="absolute top-2 right-2 p-1.5 bg-red-600/80 hover:bg-red-600 text-white rounded-lg text-xs"
                            title="Quitar imagen"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      ) : (
                        <div className="text-center p-3 text-slate-600 text-xs flex flex-col items-center gap-1.5">
                          <ImageIcon className="w-8 h-8 opacity-40" />
                          <span>Sin imagen seleccionada</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="w-full py-2.5 px-3 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl text-xs font-semibold text-slate-200 flex items-center justify-center gap-2 transition-all cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-blue-400" />
                      <span>{imageBanner ? 'Cambiar Banner' : 'Subir Banner'}</span>
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
                    {imageBannerName && (
                      <div className="text-[10px] text-slate-400 truncate mt-1 text-center font-mono">
                        {imageBannerName}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: CONSOLA DE SINCRONIZACIÓN */}
          {activeTab === 'sync' && (
            <div className="space-y-4 min-w-0 max-w-full">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-950/80 border border-slate-800 p-4 rounded-2xl min-w-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`p-2.5 rounded-xl shrink-0 ${
                    syncStatus === 'running'
                      ? 'bg-blue-600/20 text-blue-400 animate-pulse'
                      : syncStatus === 'success'
                      ? 'bg-emerald-600/20 text-emerald-400'
                      : syncStatus === 'error'
                      ? 'bg-red-600/20 text-red-400'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    <Terminal className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-100 truncate">
                      {syncStatus === 'idle' && 'Listo para sincronizar con Google Chrome'}
                      {syncStatus === 'running' && 'Sincronizando configuración en vivo con QRBoletos...'}
                      {syncStatus === 'success' && '¡Configuración guardada y verificada exitosamente!'}
                      {syncStatus === 'error' && 'Ocurrió un inconveniente durante la sincronización'}
                    </div>
                    <div className="text-xs text-slate-400 truncate max-w-full" title={settingsUrl}>
                      Destino: <span className="font-mono text-[11px] text-blue-400/90 break-all">{settingsUrl}</span>
                    </div>
                  </div>
                </div>

                {syncStatus !== 'running' && (
                  <button
                    onClick={startSyncToChrome}
                    className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Iniciar Sincronización</span>
                  </button>
                )}
              </div>

              {/* Visor de Terminal */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs h-[400px] overflow-y-auto overflow-x-hidden space-y-1.5 shadow-inner">
                {logs.length === 0 ? (
                  <div className="text-slate-600 italic h-full flex flex-col items-center justify-center">
                    <Terminal className="w-10 h-10 opacity-30 mb-2" />
                    <span>Presiona 'Iniciar Sincronización' para ejecutar los cambios en Chrome.</span>
                  </div>
                ) : (
                  logs.map((l, idx) => (
                    <div key={idx} className="flex items-start gap-2 leading-relaxed min-w-0">
                      <span className="text-slate-600 text-[10px] shrink-0 select-none">[{l.timestamp}]</span>
                      <span
                        className={`break-words min-w-0 flex-1 ${
                          l.type === 'success'
                            ? 'text-emerald-400 font-semibold'
                            : l.type === 'warning'
                            ? 'text-amber-300'
                            : l.type === 'error'
                            ? 'text-red-400 font-bold'
                            : 'text-slate-300'
                        }`}
                      >
                        {l.message}
                      </span>
                    </div>
                  ))
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* Pie del Modal / Barra de Acciones */}
        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between shrink-0 bg-slate-900/90 backdrop-blur-md">
          <button
            onClick={handleResetDefaults}
            disabled={isExecuting}
            className="text-xs text-slate-400 hover:text-amber-400 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            title="Restablecer todos los campos a los valores por defecto del sistema"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restablecer todo a oficial</span>
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={isExecuting}
              className="px-4 py-2.5 rounded-xl border border-slate-700 hover:bg-slate-800 text-xs font-semibold text-slate-300 transition-all cursor-pointer disabled:opacity-50"
            >
              Cerrar
            </button>

            <button
              onClick={startSyncToChrome}
              disabled={isExecuting}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-xs font-bold text-white shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExecuting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Sincronizando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>🚀 Sincronizar en Chrome</span>
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
