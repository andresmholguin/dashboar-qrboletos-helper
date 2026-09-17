'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users,
  Search,
  Download,
  RefreshCw,
  ArrowLeft,
  Mail,
  Phone,
  TrendingUp,
  DollarSign,
  Tag,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  Sparkles,
  Award,
  Database
} from 'lucide-react';
import { Customer } from '@/lib/qrboletosApi';
import {
  getCachedCustomersFromDb,
  saveCustomersBatchToDb,
  clearCustomersDb,
  getDbMetadata,
  setDbMetadata
} from '@/lib/customersDb';

export interface CustomersViewProps {
  onBack: () => void;
}

export default function CustomersView({ onBack }: CustomersViewProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ loaded: number; page: number; totalEstimated?: number } | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventFilter, setSelectedEventFilter] = useState<string>('todos');
  const [selectedEventsCountFilter, setSelectedEventsCountFilter] = useState<string>('todos');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Paginación de la tabla visual
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const isAbortingRef = useRef(false);

  // Reiniciar a la página 1 cuando cambia la búsqueda, filtro de evento, filtro de cantidad o tamaño de página
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedEventFilter, selectedEventsCountFilter, pageSize]);

  // Cargar desde IndexedDB al inicio, o iniciar sincronización si la base local está vacía
  useEffect(() => {
    let isMounted = true;
    async function loadCached() {
      setLoading(true);
      try {
        const cached = await getCachedCustomersFromDb();
        if (isMounted && cached && cached.length > 0) {
          setCustomers(cached);
          const meta = await getDbMetadata('last_sync');
          if (meta) setLastSyncTime(meta);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Error inicializando caché IndexedDB:', err);
      }

      if (isMounted) {
        syncAllCustomers(false);
      }
    }

    loadCached();

    return () => {
      isMounted = false;
      isAbortingRef.current = true;
    };
  }, []);

  const syncAllCustomers = async (isFullRefresh = false) => {
    setSyncingAll(true);
    setError(null);
    isAbortingRef.current = false;

    try {
      let allCustomers: Customer[] = isFullRefresh ? [] : [...customers];
      if (isFullRefresh) {
        await clearCustomersDb();
        setCustomers([]);
      }

      const seenIds = new Set(allCustomers.map((c) => c.id_cliente));
      let cursor: string | undefined = undefined;
      let page = 0;
      let hasMore = true;

      while (hasMore && !isAbortingRef.current) {
        page++;
        let url = '/api/customers?limit=500';
        if (cursor) url += '&cursor=' + encodeURIComponent(cursor);

        const res = await fetch(url);
        const json = await res.json();

        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Error consultando clientes de QRBoletos.');
        }

        const batch: Customer[] = json.data || [];
        if (batch.length === 0) break;

        // Guardar lote de 500 en IndexedDB inmediatamente
        await saveCustomersBatchToDb(batch);

        batch.forEach((c) => {
          if (!seenIds.has(c.id_cliente)) {
            seenIds.add(c.id_cliente);
            allCustomers.push(c);
          }
        });

        setCustomers([...allCustomers]);
        setSyncProgress({
          loaded: allCustomers.length,
          page,
          totalEstimated: 24416,
        });

        hasMore = Boolean(json.has_more && json.next_cursor);
        cursor = json.next_cursor;
      }

      const nowIso = new Date().toISOString();
      await setDbMetadata('last_sync', nowIso);
      setLastSyncTime(nowIso);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncingAll(false);
      setLoading(false);
    }
  };

  const uniqueEvents = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      c.eventos?.forEach((e) => {
        if (e.evento) set.add(e.evento);
      });
    });
    return Array.from(set).sort();
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return customers.filter((c) => {
      const matchesSearch =
        !q ||
        c.nombre?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.telefono?.includes(q) ||
        c.identificacion?.numero?.includes(q);

      const matchesEvent =
        selectedEventFilter === 'todos' ||
        c.eventos?.some((e) => e.evento === selectedEventFilter);

      // Conteo de eventos únicos/distintos comprados (no cuenta compras repetidas del mismo evento)
      const distinctEventsCount = new Set(
        (c.eventos || []).map((e) => (e.evento || '').trim().toLowerCase()).filter(Boolean)
      ).size;

      let matchesCount = true;
      if (selectedEventsCountFilter === '0') matchesCount = distinctEventsCount === 0;
      else if (selectedEventsCountFilter === '1') matchesCount = distinctEventsCount === 1;
      else if (selectedEventsCountFilter === '2') matchesCount = distinctEventsCount === 2;
      else if (selectedEventsCountFilter === '3') matchesCount = distinctEventsCount === 3;
      else if (selectedEventsCountFilter === '4') matchesCount = distinctEventsCount === 4;
      else if (selectedEventsCountFilter === '5+') matchesCount = distinctEventsCount >= 5;
      else if (selectedEventsCountFilter === '2+') matchesCount = distinctEventsCount >= 2;
      else if (selectedEventsCountFilter === '3+') matchesCount = distinctEventsCount >= 3;

      return matchesSearch && matchesEvent && matchesCount;
    });
  }, [customers, searchQuery, selectedEventFilter, selectedEventsCountFilter]);

  const stats = useMemo(() => {
    let totalLtv = 0;
    let buyersCount = 0;
    filteredCustomers.forEach((c) => {
      const customerLtv = c.ltv?.reduce((acc, curr) => acc + (curr.valor || 0), 0) || 0;
      totalLtv += customerLtv;
      if ((c.eventos?.length || 0) > 0 || customerLtv > 0) {
        buyersCount++;
      }
    });
    const avgTicket = buyersCount > 0 ? Math.round(totalLtv / buyersCount) : 0;
    return {
      total: filteredCustomers.length,
      buyersCount,
      totalLtv,
      avgTicket,
    };
  }, [filteredCustomers]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredCustomers.length);
  const paginatedCustomers = useMemo(() => {
    return filteredCustomers.slice(startIndex, endIndex);
  }, [filteredCustomers, startIndex, endIndex]);

  const handleExportCsv = () => {
    if (filteredCustomers.length === 0) return;

    const headers = ['ID Cliente', 'Tipo Doc', 'Documento', 'Nombre', 'Email', 'Telefono', 'Genero', 'Fecha Registro', 'LTV', 'Cant. Eventos', 'Eventos'];
    const rows = filteredCustomers.map((c) => {
      const docTipo = c.identificacion?.tipo || '';
      const docNum = c.identificacion?.numero || '';
      const totalLtv = c.ltv?.reduce((acc, curr) => acc + (curr.valor || 0), 0) || 0;
      const distinctCount = new Set(
        (c.eventos || []).map((e) => (e.evento || '').trim().toLowerCase()).filter(Boolean)
      ).size;
      const eventosStr = (c.eventos || []).map((e) => e.evento).join(' | ');

      return [
        c.id_cliente,
        docTipo,
        docNum,
        '"' + (c.nombre || '').replace(/"/g, '""') + '"',
        c.email,
        c.telefono || '',
        c.genero || '',
        c.fecha_registro,
        totalLtv,
        distinctCount,
        '"' + eventosStr.replace(/"/g, '""') + '"',
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    const today = new Date().toISOString().split('T')[0];
    const filterSuffix = selectedEventFilter !== 'todos' ? '_' + selectedEventFilter.substring(0, 15).replace(/[^a-zA-Z0-9]/g, '_') : '';
    link.setAttribute('download', 'Clientes_QRBoletos_' + today + filterSuffix + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer shadow-sm"
            title="Volver al Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold text-white tracking-wide uppercase flex items-center gap-2">
                Directorio de Audiencia & CRM
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold border border-emerald-500/30">
                Customers API v1
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">
              Consulta de compradores, historial de boletas adquiridas y exportación para pauta
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto flex-wrap">
          <button
            onClick={() => syncAllCustomers(true)}
            disabled={syncingAll}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer border border-slate-700 disabled:opacity-50"
            title="Descargar y sincronizar la base completa de QRBoletos"
          >
            <RefreshCw className={'w-3.5 h-3.5 ' + (syncingAll ? 'animate-spin text-emerald-400' : '')} />
            <span>{syncingAll ? 'Sincronizando...' : 'Sincronizar Todo'}</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={filteredCustomers.length === 0}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-emerald-950/40 cursor-pointer disabled:opacity-50 active:scale-95"
            title="Exportar todos los clientes filtrados a formato CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV ({filteredCustomers.length.toLocaleString()})</span>
          </button>
        </div>
      </div>

      {/* Banner de Sincronización Progresiva */}
      {syncingAll && syncProgress && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/60 to-slate-900 border border-emerald-500/30 shadow-lg space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />
              <span className="font-bold text-white">
                Sincronizando audiencia completa de QRBoletos...
              </span>
              <span className="font-mono text-emerald-400 font-bold">
                {syncProgress.loaded.toLocaleString()} clientes cargados
              </span>
              <span className="text-slate-400 font-mono hidden sm:inline">
                (Página {syncProgress.page})
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] text-slate-300 font-bold">
                {Math.min(100, Math.round((syncProgress.loaded / (syncProgress.totalEstimated || 24416)) * 100))}%
              </span>
              <button
                onClick={() => {
                  isAbortingRef.current = true;
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-rose-200 text-[11px] font-semibold transition-all cursor-pointer"
                title="Detener sincronización y mantener lo cargado hasta ahora"
              >
                Pausar
              </button>
            </div>
          </div>
          <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300 rounded-full"
              style={{
                width: `${Math.min(100, Math.round((syncProgress.loaded / (syncProgress.totalEstimated || 24416)) * 100))}%`,
              }}
            />
          </div>
          <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <Database className="w-3 h-3 text-emerald-400 shrink-0" />
            <span>
              Puedes buscar y filtrar clientes mientras continúa la sincronización en segundo plano. La información queda guardada localmente en tu navegador.
            </span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400 font-semibold block flex items-center gap-1">
            <Users className="w-3.5 h-3.5 text-slate-400" /> Clientes Registrados
          </span>
          <span className="text-2xl font-black text-white font-mono block">{stats.total.toLocaleString()}</span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400 font-semibold block flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-emerald-400" /> Compradores Activos
          </span>
          <span className="text-2xl font-black text-emerald-400 font-mono block">
            {stats.buyersCount.toLocaleString()}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-amber-400 font-semibold block flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" /> Recaudo Histórico (LTV)
          </span>
          <span className="text-2xl font-black text-amber-400 font-mono block">
            ${stats.totalLtv.toLocaleString()}
          </span>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-cyan-400 font-semibold block flex items-center gap-1">
            <DollarSign className="w-3.5 h-3.5 text-cyan-400" /> Ticket Promedio
          </span>
          <span className="text-2xl font-black text-cyan-400 font-mono block">
            ${stats.avgTicket.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row gap-3 items-center justify-between shadow-sm">
        <div className="relative w-full lg:w-80 xl:w-96">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nombre, email, teléfono o cédula..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto justify-end">
          {/* Filtro por Cantidad de Eventos Comprados (Eventos distintos) */}
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-400 font-semibold shrink-0 uppercase font-mono">
              Cant. Eventos:
            </label>
            <select
              value={selectedEventsCountFilter}
              onChange={(e) => setSelectedEventsCountFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="todos">Cualquier cantidad</option>
              <option value="0">0 eventos (Sin compras)</option>
              <option value="1">1 evento</option>
              <option value="2">2 eventos</option>
              <option value="3">3 eventos</option>
              <option value="4">4 eventos</option>
              <option value="5+">5 o más eventos</option>
              <option value="2+">≥ 2 eventos (Recurrentes)</option>
              <option value="3+">≥ 3 eventos (Super Fans / VIP)</option>
            </select>
          </div>

          {/* Filtro por Evento específico */}
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-400 font-semibold shrink-0 uppercase font-mono">
              Filtrar por Evento:
            </label>
            <select
              value={selectedEventFilter}
              onChange={(e) => setSelectedEventFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer w-full sm:w-auto max-w-xs truncate"
            >
              <option value="todos">Todos los Eventos ({uniqueEvents.length})</option>
              {uniqueEvents.map((evName, idx) => (
                <option key={idx} value={evName}>
                  {evName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-400">
            <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
            <p className="text-xs font-semibold">Cargando base de datos de compradores...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
            <h3 className="text-sm font-bold text-white uppercase">Estado de la API de Clientes</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">{error}</p>
            <div className="pt-2">
              <button
                onClick={() => syncAllCustomers(true)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all shadow-md inline-flex items-center gap-2 cursor-pointer border border-slate-700"
              >
                <RefreshCw className="w-4 h-4 text-emerald-400" />
                <span>Reintentar Conexión</span>
              </button>
            </div>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="py-20 text-center space-y-2 text-slate-500 text-xs">
            <Users className="w-8 h-8 mx-auto opacity-40" />
            <p className="font-semibold">No se encontraron clientes con los filtros actuales.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400 font-mono text-[10px] uppercase border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">Cliente / Identificación</th>
                  <th className="px-5 py-3">Contacto</th>
                  <th className="px-5 py-3 text-center">Eventos</th>
                  <th className="px-5 py-3 text-right">LTV Acumulado</th>
                  <th className="px-5 py-3 text-right">Última Actividad</th>
                  <th className="px-4 py-3 text-center">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {paginatedCustomers.map((cust) => {
                  const customerLtv = cust.ltv?.reduce((acc, curr) => acc + (curr.valor || 0), 0) || 0;
                  const isTopBuyer = customerLtv > 500000;

                  return (
                    <tr
                      key={cust.id_cliente}
                      className="hover:bg-slate-800/40 transition-colors cursor-pointer group"
                      onClick={() => setSelectedCustomer(cust)}
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white group-hover:text-emerald-400 transition-colors">
                            {cust.nombre || 'Sin Nombre'}
                          </span>
                          {isTopBuyer && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold font-mono flex items-center gap-0.5">
                              <Sparkles className="w-2.5 h-2.5" /> VIP
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono pt-0.5">
                          {cust.identificacion ? cust.identificacion.tipo + ' ' + cust.identificacion.numero : 'ID: #' + cust.id_cliente}
                        </div>
                      </td>

                      <td className="px-5 py-3.5 space-y-0.5">
                        <div className="flex items-center gap-1.5 text-slate-300 text-xs">
                          <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                          <span className="truncate max-w-[200px]">{cust.email}</span>
                        </div>
                        {cust.telefono && (
                          <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-mono">
                            <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                            <span>{cust.telefono}</span>
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-center font-mono">
                        {(() => {
                          const distinctCount = new Set(
                            (cust.eventos || []).map((e) => (e.evento || '').trim().toLowerCase()).filter(Boolean)
                          ).size;
                          const totalCompras = cust.eventos?.length || 0;

                          return (
                            <div className="flex flex-col items-center">
                              <span
                                className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-200 font-bold text-xs"
                                title={`${distinctCount} evento(s) distinto(s)`}
                              >
                                {distinctCount} {distinctCount === 1 ? 'evento' : 'eventos'}
                              </span>
                              {totalCompras > distinctCount && (
                                <span
                                  className="text-[10px] text-slate-500 font-mono mt-0.5"
                                  title={`${totalCompras} compras totales registradas`}
                                >
                                  ({totalCompras} compras)
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>

                      <td className="px-5 py-3.5 text-right font-mono font-bold text-emerald-400 text-sm">
                        ${customerLtv.toLocaleString()}
                      </td>

                      <td className="px-5 py-3.5 text-right font-mono text-[11px] text-slate-400">
                        {cust.fecha_ultima_compra ? cust.fecha_ultima_compra.split(' ')[0] : cust.fecha_registro?.split(' ')[0] || 'N/A'}
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCustomer(cust);
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-400 hover:text-white transition-all cursor-pointer"
                          title="Ver historial detallado de boletas"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Barra de Paginación */}
            {filteredCustomers.length > 0 && (
              <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-400">
                  <span>Mostrando</span>
                  <span className="font-mono text-white font-bold">
                    {(startIndex + 1).toLocaleString()} - {endIndex.toLocaleString()}
                  </span>
                  <span>de</span>
                  <span className="font-mono text-emerald-400 font-bold">
                    {filteredCustomers.length.toLocaleString()}
                  </span>
                  <span>clientes</span>
                  {filteredCustomers.length !== customers.length && (
                    <span className="text-[11px] text-slate-500 font-mono">
                      (filtrados de {customers.length.toLocaleString()} totales)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 mr-2">
                    <span className="text-slate-400 text-[11px]">Por pág:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded-lg px-2 py-1 focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                    </select>
                  </div>

                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title="Primera página"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title="Página anterior"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="px-3 py-1 font-mono text-xs text-white bg-slate-900 border border-slate-800 rounded-lg">
                    {currentPage} / {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title="Página siguiente"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title="Última página"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  Perfil del Cliente
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold">
                    ID: #{selectedCustomer.id_cliente}
                  </span>
                </h3>
                <p className="text-xs text-slate-400">{selectedCustomer.nombre}</p>
              </div>
              <button
                onClick={() => setSelectedCustomer(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-200 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800/80">
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Identificación</span>
                  <span className="font-bold text-white">
                    {selectedCustomer.identificacion ? selectedCustomer.identificacion.tipo + ' ' + selectedCustomer.identificacion.numero : 'No registrada'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Email</span>
                  <span className="font-semibold text-slate-300 break-all">{selectedCustomer.email}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Teléfono</span>
                  <span className="font-semibold text-slate-300">{selectedCustomer.telefono || 'No registrado'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Género</span>
                  <span className="font-semibold text-slate-300">{selectedCustomer.genero || 'No registrado'}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-slate-500 block">Fecha Registro</span>
                  <span className="font-mono text-slate-300">{selectedCustomer.fecha_registro}</span>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono text-emerald-400 block">LTV Total</span>
                  <span className="font-bold font-mono text-emerald-400 text-sm">
                    ${(selectedCustomer.ltv?.reduce((a, b) => a + (b.valor || 0), 0) || 0).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-emerald-400" /> Historial de Boletas y Eventos ({selectedCustomer.eventos?.length || 0})
                </h4>

                {(!selectedCustomer.eventos || selectedCustomer.eventos.length === 0) ? (
                  <p className="text-slate-500 italic text-center py-4 bg-slate-950/40 rounded-2xl border border-slate-800/40">
                    Este usuario no registra compras de boletos todavía.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedCustomer.eventos.map((ev, eIdx) => (
                      <div key={eIdx} className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="font-bold text-sm text-white uppercase block">{ev.evento}</span>
                            <span className="text-[11px] text-slate-400 font-mono">Fecha: {ev.fecha_evento}</span>
                          </div>
                          <span className="font-mono font-bold text-emerald-400 text-sm">
                            ${ev.total_evento?.toLocaleString()} {ev.moneda}
                          </span>
                        </div>

                        {ev.localidades && ev.localidades.length > 0 && (
                          <div className="pt-2 border-t border-slate-900 space-y-1">
                            {ev.localidades.map((loc, lIdx) => (
                              <div key={lIdx} className="flex justify-between text-[11px] text-slate-400">
                                <span>{loc.nombre} ({loc.cantidad} boletos)</span>
                                <span className="font-mono text-slate-300">${loc.valor?.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-all cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
