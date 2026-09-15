'use client';

import React, { useState, useEffect, useRef } from 'react';
import AddEventForm from '@/components/AddEventForm';
import EventCard from '@/components/EventCard';
import LocalitiesView from '@/components/LocalitiesView';
import ReportsView from '@/components/ReportsView';
import ArtworksManagerModal from '@/components/ArtworksManagerModal';
import EventSettingsModal from '@/components/EventSettingsModal';
import ChromeTabSelectorModal, { DetectedTab } from '@/components/ChromeTabSelectorModal';
import { Evento, Localidad } from '@/types';

import { getEventTimestamp } from '@/utils/dateFormatter';
import {
  LayoutDashboard,
  Database,
  Search,
  Star,
  LayoutGrid,
  Info,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Plus,
  X,
  Menu,
  Sun,
  Moon,
  Archive,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Check,
  Sparkles,
  BarChart3,
  ArrowDownUp
} from 'lucide-react';

export default function Home() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [isSheetsMode, setIsSheetsMode] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvento, setSelectedEvento] = useState<Evento | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDetectingChrome, setIsDetectingChrome] = useState(false);
  const [detectedTabs, setDetectedTabs] = useState<DetectedTab[]>([]);
  const [isTabModalOpen, setIsTabModalOpen] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isArchiveExpanded, setIsArchiveExpanded] = useState(false);
  const [isReportsViewOpen, setIsReportsViewOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'todos' | 'a_la_venta' | 'en_configuracion' | 'archivados'>('a_la_venta');
  const [artworksEvento, setArtworksEvento] = useState<Evento | null>(null);
  const [settingsEvento, setSettingsEvento] = useState<Evento | null>(null);

  // Cerrar menú de acciones al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setIsActionsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Cargar tema inicial al cargar la página
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'dark' | 'light' || 'dark';
    setTheme(savedTheme);
    if (savedTheme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    if (nextTheme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  };

  // Cargar eventos iniciales al cargar la página
  useEffect(() => {
    fetchEventos();
  }, []);

  const fetchEventos = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/events');
      const data = await res.json();

      if (data.success) {
        setIsSheetsMode(data.isSheets);

        if (data.isSheets) {
          // Aceptar todos los eventos con nombre válido
          const validEvents = data.events.filter((e: Evento) => e.nombre && e.nombre.trim() !== '');
          setEventos(validEvents);
        } else {
          // Fallback a Local Storage
          const localData = localStorage.getItem('qrboletos_local_events');
          if (localData) {
            setEventos(JSON.parse(localData));
          } else {
            // Datos demo si está vacío en LocalStorage para no dejar el panel en blanco al primer inicio
            const demoEvents: Evento[] = [
              {
                id: 'local-demo-1',
                nombre: 'Evento Demo - Rock Fest',
                fecha: '12 Dic 2026',
                promoterId: 'rockprom',
                eventId: 'rockfest2026',
                showId: 'principal',
                urlBase: 'https://dashboard.qrboletos.com/promoters/rockprom/events/rockfest2026/shows/principal',
                fechaCreacion: new Date().toISOString().split('T')[0],
                favorito: true
              }
            ];
            localStorage.setItem('qrboletos_local_events', JSON.stringify(demoEvents));
            setEventos(demoEvents);
          }
        }
      } else {
        throw new Error(data.error || 'Error al obtener eventos.');
      }
    } catch (err: any) {
      console.error(err);
      const detail = err?.message ? `: ${err.message}` : '';
      setErrorMsg(`No se pudo establecer conexión con Google Sheets${detail}. Se usará Local Storage temporalmente.`);
      setIsSheetsMode(false);
      // Cargar local storage
      const localData = localStorage.getItem('qrboletos_local_events');
      if (localData) {
        setEventos(JSON.parse(localData));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Sincronizar eventos desde la API de Firestore
  const handleSyncFromApi = async () => {
    setIsSyncing(true);
    setSyncToast('Consultando y sincronizando con la API de QRBoletos...');
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSyncToast(`¡Sincronización exitosa! ${data.result.totalSynced} eventos cargados desde la API.`);
        await fetchEventos();
      } else {
        setSyncToast(`Error: ${data.error || 'No se pudo sincronizar'}`);
      }
    } catch (e: any) {
      setSyncToast(`Error de conexión: ${e.message}`);
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncToast(null), 4000);
    }
  };

  // Reordenar banners en QRBoletos cronológicamente
  const [isReorderingBanners, setIsReorderingBanners] = useState(false);
  const handleReorderBanners = async () => {
    setIsReorderingBanners(true);
    setSyncToast('Reordenando banners en QRBoletos según fecha de cada evento...');
    try {
      const res = await fetch('/api/banners/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reorderOnly: true }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Error al conectar con Chrome o el módulo de banners.');
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No se pudo establecer el stream de respuesta.');

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
            const data = JSON.parse(ev.replace('data: ', ''));
            if (data.message) {
              setSyncToast(data.message);
            }
          } catch { }
        }
      }
      setSyncToast('¡Banners reordenados cronológicamente con éxito en QRBoletos!');
    } catch (e: any) {
      setSyncToast(`Error en banners: ${e.message}`);
    } finally {
      setIsReorderingBanners(false);
      setTimeout(() => setSyncToast(null), 5000);
    }
  };

  // Autodetectar el evento/show que el usuario tiene abierto en Google Chrome
  const handleDetectChromeShow = async (targetTabId?: string) => {
    setIsDetectingChrome(true);
    setSyncToast('Consultando pestañas de QRBoletos en Google Chrome...');
    try {
      const endpoint = targetTabId ? `/api/chrome/detect-show?tabId=${encodeURIComponent(targetTabId)}` : '/api/chrome/detect-show';
      const res = await fetch(endpoint);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo detectar un show activo en Chrome.');
      }

      // Si hay múltiples pestañas y no se especificó una todavía, abrir modal de selección
      if (data.multiple && data.tabs && data.tabs.length > 1) {
        setDetectedTabs(data.tabs);
        setIsTabModalOpen(true);
        setSyncToast(null);
        return;
      }

      const detected = data.evento as Evento;
      setIsTabModalOpen(false);

      // Buscar si el evento ya existe en nuestra base de datos por showId, eventId, id o urlBase
      const existing = eventos.find(
        (e) => (e.showId && detected.showId && e.showId === detected.showId) ||
          (e.id && detected.id && e.id === detected.id) ||
          (e.urlBase && detected.urlBase && e.urlBase.toLowerCase() === detected.urlBase.toLowerCase()) ||
          (e.nombre && detected.nombre && e.nombre.toLowerCase().trim() === detected.nombre.toLowerCase().trim())
      );

      if (existing) {
        // Combinar datos: si el detectado tiene localidades frescas, usarlas manteniendo rowId real
        const merged: Evento = {
          ...existing,
          localidades: (detected.localidades && detected.localidades.length > 0)
            ? detected.localidades
            : existing.localidades,
        };
        setIsReportsViewOpen(false);
        setSelectedEvento(merged);
        setSyncToast(`¡Show detectado existente! ${merged.nombre} (ID: ${merged.rowId || merged.id})`);
      } else {
        // Si no existe, PERSISTIRLO INMEDIATAMENTE en Google Sheets para que nunca se pierda
        try {
          if (isSheetsMode) {
            const saveRes = await fetch('/api/events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: detected.id,
                nombre: detected.nombre,
                fecha: detected.fecha,
                promoterId: detected.promoterId,
                eventId: detected.eventId,
                showId: detected.showId,
                urlBase: detected.urlBase,
                favorito: true,
                localidades: detected.localidades || [],
                enVenta: false,
                espectaculo: detected.espectaculo || '',
                sitio: detected.sitio || '',
                pulep: detected.pulep || '',
              }),
            });
            const saveData = await saveRes.json();
            if (saveData.success && saveData.event) {
              const persistedEvent = saveData.event as Evento;
              setEventos((prev) => [persistedEvent, ...prev]);
              setIsReportsViewOpen(false);
              setSelectedEvento(persistedEvent);
              setSyncToast(`¡Nuevo show detectado y guardado en Sheets! ${persistedEvent.nombre}`);
              return;
            }
          }
        } catch (saveErr) {
          console.error('Error auto-persistiendo evento detectado:', saveErr);
        }

        // Fallback local si Sheets no respondió o está offline
        const localDetected: Evento = {
          ...detected,
          id: detected.id || `local-${Date.now()}`,
          fechaCreacion: new Date().toISOString().split('T')[0],
        };
        setEventos((prev) => [localDetected, ...prev]);
        setIsReportsViewOpen(false);
        setSelectedEvento(localDetected);
        setSyncToast(`¡Show detectado! ${localDetected.nombre}`);
      }
    } catch (err: any) {
      alert(`Error al detectar show en Chrome: ${err.message}`);
      setSyncToast(null);
    } finally {
      setIsDetectingChrome(false);
      setTimeout(() => setSyncToast(null), 5000);
    }
  };


  // Agregar evento
  const handleAddEvent = async (nuevo: Omit<Evento, 'id' | 'fechaCreacion'>) => {
    if (isSheetsMode) {
      // Guardar en Google Sheets vía API
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nuevo),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al guardar en Google Sheets.');
      }
      // Volver a consultar la hoja de cálculo
      await fetchEventos();
    } else {
      // Guardar localmente
      const nuevoEvento: Evento = {
        ...nuevo,
        id: `local-${Date.now()}`,
        fechaCreacion: new Date().toISOString().split('T')[0],
      };
      const actualizados = [nuevoEvento, ...eventos];
      setEventos(actualizados);
      localStorage.setItem('qrboletos_local_events', JSON.stringify(actualizados));
    }
  };

  // Alternar favorito
  const handleToggleFavorite = async (id: string, currentStatus: boolean) => {
    const nuevoEstado = !currentStatus;

    if (isSheetsMode) {
      // Modificar en Google Sheets
      const res = await fetch('/api/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, favorito: nuevoEstado }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert('Error al actualizar favorito en Google Sheets.');
        return;
      }
      // Actualizar estado local
      setEventos(
        eventos.map((e) => (e.id === id ? { ...e, favorito: nuevoEstado } : e))
      );
    } else {
      // Modificar localmente
      const actualizados = eventos.map((e) =>
        e.id === id ? { ...e, favorito: nuevoEstado } : e
      );
      setEventos(actualizados);
      localStorage.setItem('qrboletos_local_events', JSON.stringify(actualizados));
    }
  };

  // Eliminar evento
  const handleDeleteEvent = async (id: string) => {
    if (isSheetsMode) {
      // Eliminar de Google Sheets
      const res = await fetch(`/api/events?id=${id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert('Error al eliminar evento en Google Sheets.');
        return;
      }
      // Actualizar estado local
      setEventos(eventos.filter((e) => e.id !== id));
    } else {
      // Eliminar localmente
      const actualizados = eventos.filter((e) => e.id !== id);
      setEventos(actualizados);
      localStorage.setItem('qrboletos_local_events', JSON.stringify(actualizados));
    }
  };

  // Guardar/Actualizar localidades de un evento
  const handleSaveLocalities = async (id: string, localidades: Localidad[]) => {
    if (isSheetsMode) {
      const res = await fetch('/api/events', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, localidades }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Error al guardar localidades en Google Sheets.');
      }
    }

    // Actualizar estado local (para ambos modos)
    const actualizados = eventos.map((e) =>
      e.id === id ? { ...e, localidades } : e
    );
    setEventos(actualizados);

    if (!isSheetsMode) {
      localStorage.setItem('qrboletos_local_events', JSON.stringify(actualizados));
    }

    // Sincronizar el evento seleccionado para reflejar que está guardado
    if (selectedEvento && selectedEvento.id === id) {
      setSelectedEvento({ ...selectedEvento, localidades });
    }
  };

  // Filtros de búsqueda (por nombre, ID de evento, promoterId o eventId)
  const filteredEvents = eventos.filter((e) =>
    (e.nombre && e.nombre.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (e.id && e.id.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (e.promoterId && e.promoterId.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (e.eventId && e.eventId.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Obtener timestamp de hoy a las 00:00:00 local para comparar fechas enteras
  const getTodayStartTimestamp = (): number => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  };

  // Ordenar cronológicamente (más cercano primero)
  const sortedEvents = [...filteredEvents].sort((a, b) => {
    return getEventTimestamp(a.fecha) - getEventTimestamp(b.fecha);
  });

  const todayStart = getTodayStartTimestamp();

  // Dividir en activos (hoy y futuros) y pasados (archivados)
  const activeEvents = sortedEvents.filter((e) => getEventTimestamp(e.fecha) >= todayStart);
  const passedEvents = sortedEvents
    .filter((e) => getEventTimestamp(e.fecha) < todayStart)
    .reverse(); // El más reciente pasado primero

  // Separar en eventos a la venta vs eventos en preparación/configuración (no a la venta aún)
  const onSaleEvents = activeEvents.filter((e) => e.enVenta !== false);
  const inConfigEvents = activeEvents.filter((e) => e.enVenta === false);

  // Clasificar eventos a la venta en favoritos y regulares
  const favoritos = onSaleEvents.filter((e) => e.favorito);
  const regulares = onSaleEvents.filter((e) => !e.favorito);

  return (
    <main className="min-h-screen bg-background text-foreground font-sans selection:bg-emerald-500/20">
      {/* Navbar Superior */}
      <nav className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo y Badge */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                setSelectedEvento(null);
                setIsReportsViewOpen(false);
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all text-left bg-transparent border-none p-0 focus:outline-none"
              title="Ir al inicio"
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
            </button>

            {/* Estado de Persistencia */}
            <div className="shrink-0">
              {isSheetsMode === null ? (
                <span className="w-2.5 h-2.5 bg-slate-700 animate-pulse rounded-full block"></span>
              ) : isSheetsMode ? (
                <div className="bg-emerald-100 dark:bg-emerald-500/5 text-emerald-900 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/20 rounded-full px-3 py-0.5 text-[9px] font-bold flex items-center gap-1 shadow-sm">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-500" />
                  <span>Google Sheets</span>
                </div>
              ) : (
                <div
                  className="bg-amber-100 dark:bg-amber-500/5 text-amber-900 dark:text-amber-400 border border-amber-300 dark:border-amber-500/20 rounded-full px-3 py-0.5 text-[9px] font-bold flex items-center gap-1 shadow-sm cursor-help"
                  title="Google Sheets no configurado. Los datos se guardarán localmente."
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-700 dark:text-amber-500" />
                  <span>Local</span>
                </div>
              )}
            </div>
          </div>

          {/* Controles en Escritorio (md en adelante) */}
          <div className="hidden md:flex items-center gap-3">
            {/* Buscador */}
            <div className="relative w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar evento..."
                className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-400"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Menú Desplegable de Acciones / Herramientas */}
            <div className="relative" ref={actionsMenuRef}>
              <button
                onClick={() => setIsActionsMenuOpen(!isActionsMenuOpen)}
                className={`cursor-pointer bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-xs font-semibold px-3.5 py-2 rounded-xl hover:bg-slate-800 transition-all flex items-center gap-2 shadow-sm text-slate-200 active:scale-95 shrink-0 ${isActionsMenuOpen ? 'ring-2 ring-emerald-500/30 border-emerald-500' : ''
                  }`}
                title="Menú de herramientas y acciones"
              >
                <Menu className="w-4 h-4 text-emerald-500" />
                <span>Menú</span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isActionsMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Popover desplegable */}
              {isActionsMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 space-y-1">
                  {/* 1. Botón Nuevo Evento (Destacado) */}
                  <button
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      setIsAddModalOpen(true);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs py-2.5 px-3 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nuevo Evento</span>
                  </button>

                  <div className="my-1 border-t border-slate-800" />

                  {/* 2. Botón Módulo de Informes */}
                  <button
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      setIsReportsViewOpen(!isReportsViewOpen);
                      setSelectedEvento(null);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-all cursor-pointer ${isReportsViewOpen
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-bold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    title="Ver informe consolidado de ventas y exportar a Excel / PDF"
                  >
                    <BarChart3 className="w-4 h-4 text-emerald-500" />
                    <span className="flex-1">Informes</span>
                    {isReportsViewOpen && (
                      <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono font-bold">
                        Activo
                      </span>
                    )}
                  </button>

                  {/* 3. Botón Sincronizar API */}
                  <button
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      handleSyncFromApi();
                    }}
                    disabled={isSyncing}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                    title="Consultar y sincronizar eventos desde la API de QRBoletos"
                  >
                    <RefreshCw className={`w-4 h-4 text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar API'}</span>
                  </button>

                  {/* 4. Botón Reordenar Banners */}
                  <button
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      handleReorderBanners();
                    }}
                    disabled={isReorderingBanners}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                    title="Reordenar cronológicamente los banners en línea según la fecha del evento"
                  >
                    <ArrowDownUp className={`w-4 h-4 text-cyan-400 ${isReorderingBanners ? 'animate-spin' : ''}`} />
                    <span>{isReorderingBanners ? 'Ordenando...' : 'Reordenar Banners'}</span>
                  </button>

                  {/* 5. Botón Detectar Show en Chrome */}
                  <button
                    onClick={() => {
                      setIsActionsMenuOpen(false);
                      handleDetectChromeShow();
                    }}
                    disabled={isDetectingChrome}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 text-amber-300 hover:bg-amber-500/10 transition-all cursor-pointer disabled:opacity-50"
                    title="Detectar y abrir el show en borrador o configuración que tienes en Chrome"
                  >
                    <Sparkles className={`w-4 h-4 text-amber-400 ${isDetectingChrome ? 'animate-spin' : ''}`} />
                    <span>{isDetectingChrome ? 'Detectando...' : 'Detectar en Chrome'}</span>
                  </button>

                  {/* 6. Botón Google Sheet */}
                  {isSheetsMode && (
                    <>
                      <div className="my-1 border-t border-slate-800" />
                      <a
                        href="https://docs.google.com/spreadsheets/d/1saVyrEYq8ITiSESR4Z13vJufjVvuKVmm9vjAsUFq3jg"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setIsActionsMenuOpen(false)}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 text-slate-300 hover:bg-slate-800 hover:text-white transition-all cursor-pointer"
                      >
                        <Database className="w-4 h-4 text-emerald-500" />
                        <span className="flex-1">Google Sheet</span>
                        <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                      </a>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Botón de Cambio de Tema */}
            <button
              onClick={toggleTheme}
              className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl transition-all hover:text-white cursor-pointer shadow-sm active:scale-95"
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
            </button>
          </div>

          {/* Botón Hamburguesa y Cambio de Tema en Móviles */}
          <div className="flex md:hidden items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-850 text-slate-300 rounded-xl transition-all hover:text-white cursor-pointer active:scale-95"
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {theme === 'dark' ? <Sun className="w-4.5 h-4.5 text-amber-400" /> : <Moon className="w-4.5 h-4.5 text-indigo-400" />}
            </button>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-850 text-slate-300 rounded-xl transition-all hover:text-white cursor-pointer"
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Dropdown del Menú Móvil */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-slate-900 bg-slate-950 p-4 space-y-4 shadow-xl animate-fade-in">
            {/* Buscador Móvil */}
            <div className="relative w-full">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar evento..."
                className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Botones en menú móvil */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Botón Detectar Show en Chrome Móvil */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleDetectChromeShow();
                }}
                disabled={isDetectingChrome}
                className="cursor-pointer bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-300 text-xs font-bold py-3 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-all flex items-center justify-center gap-1.5 shadow-sm text-center sm:col-span-2"
              >
                <Sparkles className={`w-4 h-4 text-amber-700 dark:text-amber-400 ${isDetectingChrome ? 'animate-spin' : ''}`} />
                <span>{isDetectingChrome ? 'Detectando en Chrome...' : '🎯 Detectar Show Activo en Chrome'}</span>
              </button>

              {/* Botón Sincronizar API Móvil */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleSyncFromApi();
                }}
                disabled={isSyncing}
                className="cursor-pointer bg-slate-900 border border-slate-800 hover:border-emerald-500/30 text-xs font-semibold py-3 rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5 shadow-sm text-slate-300 text-center"
              >
                <RefreshCw className={`w-4 h-4 text-emerald-600 dark:text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar API'}</span>
              </button>


              {/* Botón Módulo de Informes Móvil */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsReportsViewOpen(true);
                  setSelectedEvento(null);
                }}
                className={`cursor-pointer border text-xs font-semibold py-3 rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm text-center ${isReportsViewOpen
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-slate-900 border-slate-800 hover:border-emerald-500/30 text-slate-300 hover:bg-slate-800'
                  }`}
              >
                <BarChart3 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>📊 Módulo de Informes</span>
              </button>

              {/* Botón Reordenar Banners Web Móvil */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleReorderBanners();
                }}
                disabled={isReorderingBanners}
                className="cursor-pointer bg-slate-900 border border-slate-800 hover:border-cyan-500/30 text-xs font-semibold py-3 rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5 shadow-sm text-slate-300 text-center"
              >
                <ArrowDownUp className={`w-4 h-4 text-cyan-400 ${isReorderingBanners ? 'animate-spin' : ''}`} />
                <span>{isReorderingBanners ? 'Ordenando...' : 'Reordenar Banners Web'}</span>
              </button>

              {/* Botón Google Sheet */}
              {isSheetsMode && (
                <a
                  href="https://docs.google.com/spreadsheets/d/1saVyrEYq8ITiSESR4Z13vJufjVvuKVmm9vjAsUFq3jg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="cursor-pointer bg-slate-900 border border-slate-850 hover:border-emerald-500/30 text-xs font-semibold py-3 rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5 shadow-sm text-slate-300 text-center"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <Database className="w-4.5 h-4.5 text-emerald-500" />
                  <span>Google Sheet</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                </a>
              )}

              {/* Botón Nuevo Evento */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsAddModalOpen(true);
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-3 rounded-xl transition-all shadow-md hover:shadow-emerald-500/10 flex items-center justify-center gap-1.5 cursor-pointer w-full sm:col-span-2"
              >
                <Plus className="w-4 h-4" />
                <span>Nuevo Evento</span>
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Notificación flotante de sincronización */}
      {syncToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900/95 backdrop-blur-md border border-emerald-500/40 text-emerald-300 px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-medium">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{syncToast}</span>
        </div>
      )}

      {/* Contenido Principal */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isReportsViewOpen ? (
          <ReportsView onBack={() => setIsReportsViewOpen(false)} />
        ) : selectedEvento ? (
          // Vista detallada de Localidades (Scraper)
          <LocalitiesView
            evento={selectedEvento}
            onBack={() => setSelectedEvento(null)}
            onSaveLocalities={handleSaveLocalities}
            onOpenArtworks={() => setArtworksEvento(selectedEvento)}
            onConfigureSettings={() => setSettingsEvento(selectedEvento)}
          />
        ) : (
          // Dashboard principal
          <div className="space-y-8">
            {errorMsg && (
              <div className="bg-amber-500/5 border border-amber-500/20 text-amber-400 p-4 rounded-2xl text-xs flex items-center gap-2">
                <Info className="w-5 h-5 shrink-0 text-amber-500" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Contenedor de la lista de eventos */}
            <div className="space-y-6">
              {/* Cabecera de la lista con Pestañas de Filtrado */}
              <div className="border-b border-slate-800 pb-4 mb-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                  <LayoutGrid className="w-4.5 h-4.5 text-emerald-500" />
                  Eventos ({eventos.length})
                </h2>

                {/* Filtro de Pestañas */}
                <div className="flex items-center gap-1.5 p-1 bg-slate-950/80 border border-slate-800 rounded-xl overflow-x-auto">
                  <button
                    onClick={() => setSelectedTab('todos')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${selectedTab === 'todos'
                        ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-bold'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900'
                      }`}
                  >
                    Todos ({eventos.length})
                  </button>

                  <button
                    onClick={() => setSelectedTab('a_la_venta')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedTab === 'a_la_venta'
                        ? 'bg-emerald-100 dark:bg-emerald-600/20 text-emerald-900 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40 shadow-sm font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-emerald-900 dark:hover:text-emerald-300 hover:bg-slate-100 dark:hover:bg-slate-900'
                      }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span>A la Venta ({onSaleEvents.length})</span>
                  </button>

                  <button
                    onClick={() => setSelectedTab('en_configuracion')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedTab === 'en_configuracion'
                        ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40 shadow-sm font-bold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-amber-900 dark:hover:text-amber-300 hover:bg-slate-100 dark:hover:bg-slate-900'
                      }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span>En Configuración ({inConfigEvents.length})</span>
                  </button>

                  {passedEvents.length > 0 && (
                    <button
                      onClick={() => setSelectedTab('archivados')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${selectedTab === 'archivados'
                          ? 'bg-slate-200 dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm font-bold'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900'
                        }`}
                    >
                      <Archive className="w-3.5 h-3.5" />
                      <span>Archivados ({passedEvents.length})</span>
                    </button>
                  )}
                </div>
              </div>

              {isLoading ? (
                // Skeletal Loading
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-64 bg-slate-900/50 border border-slate-800 animate-pulse rounded-2xl"></div>
                  ))}
                </div>
              ) : eventos.length === 0 ? (
                // Estado Vacío
                <div className="bg-slate-900/30 border border-slate-900 rounded-3xl p-16 text-center max-w-xl mx-auto">
                  <div className="bg-slate-950 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto text-slate-600 border border-slate-900 mb-4 shadow-inner">
                    <LayoutGrid className="w-7 h-7" />
                  </div>
                  <h3 className="text-slate-300 font-semibold mb-1 text-sm">No hay eventos agregados</h3>
                  <p className="text-slate-500 text-xs max-w-sm mx-auto mb-4">
                    Comienza agregando un evento haciendo clic en el botón "+ Nuevo Evento" de arriba o detecta el show en Chrome.
                  </p>
                  <button
                    onClick={() => setIsAddModalOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2.5 px-5 rounded-xl transition-all shadow-md cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar Evento
                  </button>
                </div>
              ) : filteredEvents.length === 0 ? (
                // Búsqueda sin coincidencias
                <div className="bg-slate-900/10 border border-slate-900 rounded-3xl p-12 text-center max-w-md mx-auto">
                  <Search className="w-8 h-8 text-slate-500 mx-auto mb-3" />
                  <h3 className="text-slate-300 font-semibold text-sm mb-1">Sin Resultados</h3>
                  <p className="text-slate-500 text-xs">
                    No encontramos ningún evento que coincida con &quot;{searchQuery}&quot;.
                  </p>
                </div>
              ) : (
                // Mostrar Listado
                <div className="space-y-8">
                  {/* SECCIÓN 1: EVENTOS EN CONFIGURACIÓN / NO A LA VENTA (BORRADORES EN SHEETS) */}
                  {(selectedTab === 'todos' || selectedTab === 'en_configuracion') && inConfigEvents.length > 0 && (
                    <div className="space-y-4 p-5 rounded-2xl bg-gradient-to-b from-amber-500/10 via-amber-500/[0.03] to-transparent border border-amber-400/40 dark:border-amber-500/30 shadow-lg">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-amber-400/20 dark:border-amber-500/20 pb-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-500/30">
                            <Sparkles className="w-4 h-4" />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-amber-900 dark:text-amber-300 uppercase tracking-wide">
                              Eventos en Configuración / No a la Venta ({inConfigEvents.length})
                            </h3>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400">
                              Guardados en Google Sheets. Se sincronizarán automáticamente con Firebase cuando se publiquen en QRBoletos.
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono font-bold bg-amber-100 dark:bg-amber-500/10 text-amber-900 dark:text-amber-400 border border-amber-300 dark:border-amber-500/20 px-2.5 py-1 rounded-full self-start sm:self-auto">
                          Google Sheets Persisted
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-1">
                        {inConfigEvents.map((evento) => (
                          <EventCard
                            key={evento.id}
                            evento={evento}
                            onToggleFavorite={handleToggleFavorite}
                            onDeleteEvent={handleDeleteEvent}
                            onOpenLocalities={setSelectedEvento}
                            onOpenArtworks={setArtworksEvento}
                            onConfigureSettings={setSettingsEvento}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SECCIÓN 2: EVENTOS A LA VENTA - FAVORITOS */}
                  {(selectedTab === 'todos' || selectedTab === 'a_la_venta') && favoritos.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-500 flex items-center gap-1">
                        <Star className="w-3.5 h-3.5" fill="currentColor" />
                        Favoritos a la Venta ({favoritos.length})
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {favoritos.map((evento) => (
                          <EventCard
                            key={evento.id}
                            evento={evento}
                            onToggleFavorite={handleToggleFavorite}
                            onDeleteEvent={handleDeleteEvent}
                            onOpenLocalities={setSelectedEvento}
                            onOpenArtworks={setArtworksEvento}
                            onConfigureSettings={setSettingsEvento}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SECCIÓN 3: EVENTOS A LA VENTA - OTROS PRÓXIMOS */}
                  {(selectedTab === 'todos' || selectedTab === 'a_la_venta') && (
                    <div className="space-y-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        Eventos Próximos a la Venta ({regulares.length})
                      </div>
                      {regulares.length === 0 && favoritos.length > 0 ? (
                        <p className="text-slate-650 text-xs italic">No hay más eventos próximos</p>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {regulares.map((evento) => (
                            <EventCard
                              key={evento.id}
                              evento={evento}
                              onToggleFavorite={handleToggleFavorite}
                              onDeleteEvent={handleDeleteEvent}
                              onOpenLocalities={setSelectedEvento}
                              onOpenArtworks={setArtworksEvento}
                              onConfigureSettings={setSettingsEvento}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* SECCIÓN 4: EVENTOS ARCHIVADOS (HISTORIAL) */}
                  {(selectedTab === 'todos' || selectedTab === 'archivados') && passedEvents.length > 0 && (
                    <div className="border-t border-slate-900 pt-6 mt-8 space-y-4">
                      {/* Cabecera del Acordeón Archivados */}
                      <button
                        onClick={() => setIsArchiveExpanded(!isArchiveExpanded)}
                        className="w-full flex items-center justify-between text-left text-slate-400 hover:text-slate-200 transition-all py-2.5 px-4 bg-slate-950/20 hover:bg-slate-950/50 rounded-2xl border border-slate-900 cursor-pointer group active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-2">
                          <Archive className="w-4 h-4 text-slate-500 group-hover:text-slate-400 transition-colors" />
                          <span className="text-xs font-bold uppercase tracking-wider">
                            Eventos Archivados / Pasados ({passedEvents.length})
                          </span>
                        </div>
                        <div className="text-slate-500 group-hover:text-slate-300 transition-colors">
                          {isArchiveExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </button>

                      {/* Listado de Archivados */}
                      {(isArchiveExpanded || selectedTab === 'archivados') && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2 animate-fade-in">
                          {passedEvents.map((evento) => (
                            <div key={evento.id} className="opacity-60 hover:opacity-100 transition-opacity duration-200">
                              <EventCard
                                key={evento.id}
                                evento={evento}
                                onToggleFavorite={handleToggleFavorite}
                                onDeleteEvent={handleDeleteEvent}
                                onOpenLocalities={setSelectedEvento}
                                onOpenArtworks={setArtworksEvento}
                                onConfigureSettings={setSettingsEvento}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal para Agregar Evento */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in transition-all">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl relative overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header del Modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
              <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                <Plus className="text-emerald-500 w-4.5 h-4.5" />
                Agregar Nuevo Evento
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Contenido / Formulario */}
            <div className="p-6 overflow-y-auto">
              <AddEventForm
                onAddEvent={async (nuevo) => {
                  await handleAddEvent(nuevo);
                  setIsAddModalOpen(false); // Cerrar tras agregar
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal Selector de Pestañas de Chrome */}
      <ChromeTabSelectorModal
        isOpen={isTabModalOpen}
        onClose={() => setIsTabModalOpen(false)}
        tabs={detectedTabs}
        onSelectTab={(tabId) => handleDetectChromeShow(tabId)}
        isLoading={isDetectingChrome}
      />

      {/* Modal de Reemplazo y Actualización de Artes (Digital & Físico) */}
      {artworksEvento && (
        <ArtworksManagerModal
          evento={artworksEvento}
          onClose={() => setArtworksEvento(null)}
        />
      )}

      {/* Modal de Configuración del Evento (HTMLs, Restricciones, Switches, Imágenes) */}
      {settingsEvento && (
        <EventSettingsModal
          evento={settingsEvento}
          onClose={() => setSettingsEvento(null)}
        />
      )}
    </main>
  );
}

