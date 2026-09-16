'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  Sparkles,
  Award
} from 'lucide-react';
import { Customer } from '@/lib/qrboletosApi';

export interface CustomersViewProps {
  onBack: () => void;
}

export default function CustomersView({ onBack }: CustomersViewProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventFilter, setSelectedEventFilter] = useState<string>('todos');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  const fetchCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/customers?limit=500');
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'No se pudieron cargar los clientes de QRBoletos.');
      }
      setCustomers(json.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

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

      return matchesSearch && matchesEvent;
    });
  }, [customers, searchQuery, selectedEventFilter]);

  const stats = useMemo(() => {
    let totalLtv = 0;
    let buyersCount = 0;
    customers.forEach((c) => {
      const customerLtv = c.ltv?.reduce((acc, curr) => acc + (curr.valor || 0), 0) || 0;
      totalLtv += customerLtv;
      if ((c.eventos?.length || 0) > 0 || customerLtv > 0) {
        buyersCount++;
      }
    });
    const avgTicket = buyersCount > 0 ? Math.round(totalLtv / buyersCount) : 0;
    return {
      total: customers.length,
      buyersCount,
      totalLtv,
      avgTicket,
    };
  }, [customers]);

  const handleExportCsv = () => {
    if (filteredCustomers.length === 0) return;

    const headers = ['ID Cliente', 'Tipo Doc', 'Documento', 'Nombre', 'Email', 'Telefono', 'Genero', 'Fecha Registro', 'LTV', 'Eventos'];
    const rows = filteredCustomers.map((c) => {
      const docTipo = c.identificacion?.tipo || '';
      const docNum = c.identificacion?.numero || '';
      const totalLtv = c.ltv?.reduce((acc, curr) => acc + (curr.valor || 0), 0) || 0;
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
        '"' + eventosStr.replace(/"/g, '""') + '"',
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('download', 'Clientes_QRBoletos_' + today + '.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          <button
            onClick={fetchCustomers}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={'w-3.5 h-3.5 ' + (loading ? 'animate-spin text-emerald-400' : '')} />
            <span>Sincronizar</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={filteredCustomers.length === 0}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-emerald-950/40 cursor-pointer disabled:opacity-50 active:scale-95"
            title="Exportar listado visible a formato CSV"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV ({filteredCustomers.length})</span>
          </button>
        </div>
      </div>

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

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-center justify-between shadow-sm">
        <div className="relative w-full md:w-96">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por nombre, email, teléfono o cédula..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-slate-200 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 placeholder:text-slate-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <label className="text-[11px] text-slate-400 font-semibold shrink-0 uppercase font-mono">Filtrar por Evento:</label>
          <select
            value={selectedEventFilter}
            onChange={(e) => setSelectedEventFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer w-full md:max-w-xs"
          >
            <option value="todos">Todos los Eventos</option>
            {uniqueEvents.map((evName, idx) => (
              <option key={idx} value={evName}>
                {evName}
              </option>
            ))}
          </select>
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
            <p className="text-[11px] text-slate-500">
              Asegúrate de haber configurado QRBOLETOS_CLIENT_ID y QRBOLETOS_CLIENT_SECRET.
            </p>
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
                {filteredCustomers.map((cust) => {
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
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold text-xs">
                          {cust.eventos?.length || 0}
                        </span>
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
