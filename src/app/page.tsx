'use client';

import React, { useState, useEffect } from 'react';
import AddEventForm from '@/components/AddEventForm';
import EventCard from '@/components/EventCard';
import LocalitiesView from '@/components/LocalitiesView';
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
  Check
} from 'lucide-react';

export default function Home() {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [isSheetsMode, setIsSheetsMode] = useState<boolean | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvento, setSelectedEvento] = useState<Evento | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [isArchiveExpanded, setIsArchiveExpanded] = useState(false);

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
      setErrorMsg('No se pudo establecer conexión con el backend de base de datos. Se usará Local Storage temporalmente.');
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

  // Clasificar activos en favoritos y regulares
  const favoritos = activeEvents.filter((e) => e.favorito);
  const regulares = activeEvents.filter((e) => !e.favorito);

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
                setIsMobileMenuOpen(false);
              }}
              className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all text-left bg-transparent border-none p-0 focus:outline-none"
              title="Ir al inicio"
            >
              <div className="bg-emerald-500/10 p-1.5 rounded-xl border border-emerald-500/20 shadow-lg shadow-emerald-500/5 flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-7 h-7">
                  <rect x="10" y="10" width="80" height="80" rx="18" fill="none" stroke="#047857" strokeWidth="6"/>
                  <rect x="21" y="55" width="11" height="25" rx="3" fill="#10B981"/>
                  <rect x="37" y="45" width="11" height="35" rx="3" fill="#10B981"/>
                  <rect x="53" y="35" width="11" height="45" rx="3" fill="#10B981"/>
                  <rect x="69" y="25" width="11" height="55" rx="3" fill="#10B981"/>
                  <path d="M 18 45 Q 45 40 64 22" fill="none" stroke="#047857" strokeWidth="6" strokeLinecap="round"/>
                  <polygon points="56,18 73,13 68,30" fill="#047857" stroke="#047857" strokeWidth="2" strokeLinejoin="round"/>
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
                <div className="bg-emerald-500/5 text-emerald-400 border border-emerald-500/20 rounded-full px-3 py-0.5 text-[9px] font-bold flex items-center gap-1 shadow-sm">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Google Sheets</span>
                </div>
              ) : (
                <div
                  className="bg-amber-500/5 text-amber-400 border border-amber-500/20 rounded-full px-3 py-0.5 text-[9px] font-bold flex items-center gap-1 shadow-sm cursor-help"
                  title="Google Sheets no configurado. Los datos se guardarán localmente."
                >
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
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
                className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-550"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Botón Sincronizar API */}
            <button
              onClick={handleSyncFromApi}
              disabled={isSyncing}
              className={`cursor-pointer bg-slate-900 border border-slate-800 hover:border-emerald-500/40 text-[11px] font-semibold px-3 py-2 rounded-xl hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-sm text-slate-300 active:scale-95 ${
                isSyncing ? 'opacity-75 cursor-not-allowed' : ''
              }`}
              title="Consultar y sincronizar eventos desde la API de QRBoletos"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar API'}</span>
            </button>

            {/* Botón Google Sheet */}
            {isSheetsMode && (
              <a
                href="https://docs.google.com/spreadsheets/d/1saVyrEYq8ITiSESR4Z13vJufjVvuKVmm9vjAsUFq3jg"
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer bg-slate-900 border border-slate-800 hover:border-emerald-500/30 text-[11px] font-semibold px-3 py-2 rounded-xl hover:bg-slate-800 transition-all flex items-center gap-1.5 shadow-sm text-slate-300"
              >
                <Database className="w-4 h-4 text-emerald-500" />
                <span>Google Sheet</span>
                <ExternalLink className="w-3 h-3 opacity-60" />
              </a>
            )}

            {/* Botón de Cambio de Tema */}
            <button
              onClick={toggleTheme}
              className="p-2 bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-xl transition-all hover:text-white cursor-pointer shadow-sm active:scale-95"
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
            </button>

            {/* Botón Nuevo Evento */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs py-2 px-3.5 rounded-xl transition-all shadow-md hover:shadow-emerald-500/10 flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Evento</span>
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
              {/* Botón Sincronizar API Móvil */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  handleSyncFromApi();
                }}
                disabled={isSyncing}
                className="cursor-pointer bg-slate-900 border border-slate-850 hover:border-emerald-500/30 text-xs font-semibold py-3 rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-1.5 shadow-sm text-slate-300 text-center"
              >
                <RefreshCw className={`w-4 h-4 text-emerald-400 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Sincronizando...' : 'Sincronizar API'}</span>
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
        {selectedEvento ? (
          // Vista detallada de Localidades (Scraper)
          <LocalitiesView
            evento={selectedEvento}
            onBack={() => setSelectedEvento(null)}
            onSaveLocalities={handleSaveLocalities}
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
              {/* Cabecera de la lista */}
              <div className="border-b border-slate-800 pb-3 mb-2 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                  <LayoutGrid className="w-4.5 h-4.5 text-emerald-500" />
                  Eventos Guardados ({eventos.length})
                </h2>
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
                    Comienza agregando un evento haciendo clic en el botón "+ Nuevo Evento" de arriba.
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
                  <Search className="w-8 h-8 text-slate-550 mx-auto mb-3" />
                  <h3 className="text-slate-300 font-semibold text-sm mb-1">Sin Resultados</h3>
                  <p className="text-slate-500 text-xs">
                    No encontramos ningún evento que coincida con &quot;{searchQuery}&quot;.
                  </p>
                </div>
              ) : (
                // Mostrar Listado
                <div className="space-y-8">
                  {/* Sección Favoritos */}
                  {favoritos.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1">
                        <Star className="w-3.5 h-3.5" fill="currentColor" />
                        Favoritos ({favoritos.length})
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {favoritos.map((evento) => (
                          <EventCard
                            key={evento.id}
                            evento={evento}
                            onToggleFavorite={handleToggleFavorite}
                            onDeleteEvent={handleDeleteEvent}
                            onOpenLocalities={setSelectedEvento}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Todos los Eventos Próximos */}
                  {(regulares.length > 0 || favoritos.length > 0) && (
                    <div className="space-y-3">
                      {favoritos.length > 0 && (
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-550">
                          Otros Eventos Próximos ({regulares.length})
                        </div>
                      )}
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
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sección Eventos Archivados (Historial) */}
                  {passedEvents.length > 0 && (
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

                      {/* Listado de Archivados (Collapsible) */}
                      {isArchiveExpanded && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2 animate-fade-in">
                          {passedEvents.map((evento) => (
                            <div key={evento.id} className="opacity-60 hover:opacity-100 transition-opacity duration-200">
                              <EventCard
                                evento={evento}
                                onToggleFavorite={handleToggleFavorite}
                                onDeleteEvent={handleDeleteEvent}
                                onOpenLocalities={setSelectedEvento}
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
    </main>
  );
}
