'use client';

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Download,
  RefreshCw,
  TrendingUp,
  Layers,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Calendar,
  MapPin,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  Globe,
  Store,
  Gift,
  Search,
  CheckCircle2,
  Briefcase
} from 'lucide-react';

interface LocalitySummary {
  localidad: string;
  vendidas: string;
  recaudoEntradas: string;
  recaudoServicio: string;
  cortesias?: number;
  boletosPagados?: number;
  totalBoletos?: number;
}

interface ChannelDetail {
  localidad: string;
  etapa: string;
  referencia: string;
  canal: string;
  cupon: string;
  cantidad: string;
  valorEntrada: string;
  totalEntradas: string;
  valorServicio: string;
  totalServicio: string;
  isCortesia?: boolean;
}

interface EntregaEmpresario {
  tiene: boolean;
  metodo: string;
  total: number;
  totalStr?: string;
  totalFormatted?: string;
}

interface RecaudoMetodo {
  metodo: string;
  totalStr: string;
}

interface EventSalesData {
  meta: {
    evento?: string;
    espectaculo?: string;
    pulep?: string;
    sitio?: string;
    fechaInicio?: string;
    fechaFin?: string;
  };
  resumenLocalidades: LocalitySummary[];
  detalleCanales: ChannelDetail[];
  recaudoMetodos?: RecaudoMetodo[];
  entregaEmpresario?: EntregaEmpresario;
  url: string;
}

interface ReportsViewProps {
  onBack: () => void;
}

export default function ReportsView({ onBack }: ReportsViewProps) {
  const [salesData, setSalesData] = useState<EventSalesData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [isDownloadingExcel, setIsDownloadingExcel] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isCached, setIsCached] = useState<boolean>(false);
  const [cacheAge, setCacheAge] = useState<number>(0);
  const [expandedEvents, setExpandedEvents] = useState<Record<number, boolean>>({});
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Pestañas principales
  const [activeTab, setActiveTab] = useState<'general' | 'individual'>('general');
  const [selectedEventIdx, setSelectedEventIdx] = useState<number>(0);
  const [individualSubTab, setIndividualSubTab] = useState<'general' | 'detailed'>('general');
  const [pdfLayout, setPdfLayout] = useState<'standard_portrait' | 'compact_landscape' | 'onepage_portrait'>('standard_portrait');

  useEffect(() => {
    // Al ingresar al módulo Informes, cargar datos de inmediato (usando caché si existe o scraper si no)
    fetchSales(false);
  }, []);

  const fetchSales = async (force: boolean) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = force ? '/api/reports/sales?forceRefresh=true' : '/api/reports/sales';
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudieron consultar los datos de ventas.');
      }

      setSalesData(data.salesData || []);
      setIsCached(!!data.cached);
      setCacheAge(data.cacheAgeMinutes || 0);
    } catch (err: any) {
      setError(err.message || 'Error al conectar con el servicio de reportes.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPdf = async (mode: 'general' | 'individual', type: 'general' | 'detailed' = 'general', targetUrl?: string) => {
    setIsDownloadingPdf(true);
    try {
      let response: Response;
      // Si ya tenemos salesData cargado en memoria, usar POST para enviar los datos y generar el PDF de inmediato (3s sin re-scrapear)
      if (salesData && salesData.length > 0) {
        response = await fetch('/api/reports/download-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            salesData,
            mode,
            type,
            layout: pdfLayout,
            targetUrl,
          }),
        });
      } else {
        let url = `/api/reports/download-pdf?mode=${mode}&type=${type}&layout=${pdfLayout}`;
        if (targetUrl) {
          url += `&targetUrl=${encodeURIComponent(targetUrl)}`;
        }
        response = await fetch(url);
      }

      if (!response.ok) {
        let errText = 'Error desconocido al generar PDF';
        try {
          const errJson = await response.json();
          errText = errJson.message || errJson.error || errText;
        } catch {
          errText = await response.text();
        }
        throw new Error(errText);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const todayStr = new Date().toISOString().split('T')[0];
      const filenamePrefix = mode === 'general' ? 'Informe_Consolidado_Ventas' : `Informe_Ventas_${type}`;
      const layoutLabel = pdfLayout === 'compact_landscape' ? 'Compacto' : (pdfLayout === 'onepage_portrait' ? 'Ficha' : 'Vertical');
      a.download = `${filenamePrefix}_${layoutLabel}_${todayStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      alert(`No se pudo generar el archivo PDF: ${e.message}`);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadExcel = async (targetUrl?: string) => {
    setIsDownloadingExcel(true);
    try {
      let url = '/api/reports/download-excel';
      if (targetUrl) {
        url += `?targetUrl=${encodeURIComponent(targetUrl)}`;
      }
      const response = await fetch(url);
      if (!response.ok) {
        let errText = 'Error descargando Excel';
        try {
          const errJson = await response.json();
          errText = errJson.message || errJson.error || errText;
        } catch {
          errText = await response.text();
        }
        throw new Error(errText);
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `Informe_Ventas_QRBoletos_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (e: any) {
      alert(`No se pudo generar el archivo Excel: ${e.message}`);
    } finally {
      setIsDownloadingExcel(false);
    }
  };

  const toggleEventExpand = (index: number) => {
    setExpandedEvents((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  // Helper para convertir strings monetarios o enteros a números
  const parseNum = (str: string | number | undefined): number => {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    const clean = str.replace(/COP|\$|\.|\,/g, '').trim();
    return parseInt(clean, 10) || 0;
  };

  // Totales globales consolidados (todos los eventos en venta)
  let grandPagados = 0;
  let grandCortesias = 0;
  let grandTotalBoletos = 0;
  let grandRecaudoEntradas = 0;
  let grandRecaudoServicio = 0;
  let grandEntregaEmpresario = 0;

  salesData.forEach((ev) => {
    (ev.resumenLocalidades || []).forEach((l) => {
      const pag = l.boletosPagados !== undefined ? l.boletosPagados : parseNum(l.vendidas);
      const cor = l.cortesias || 0;
      const totB = l.totalBoletos !== undefined ? l.totalBoletos : parseNum(l.vendidas);
      grandPagados += pag;
      grandCortesias += cor;
      grandTotalBoletos += totB;
      grandRecaudoEntradas += parseNum(l.recaudoEntradas);
      grandRecaudoServicio += parseNum(l.recaudoServicio);
    });
    if (ev.entregaEmpresario && ev.entregaEmpresario.tiene) {
      grandEntregaEmpresario += ev.entregaEmpresario.total || 0;
    }
  });

  const grandTotalCOP = grandRecaudoEntradas + grandRecaudoServicio;

  // Filtrado de eventos para la vista general
  const filteredEvents = salesData.filter((ev) => {
    const term = searchFilter.toLowerCase();
    const name = (ev.meta?.evento || '').toLowerCase();
    const espectaculo = (ev.meta?.espectaculo || '').toLowerCase();
    const pulep = (ev.meta?.pulep || '').toLowerCase();
    const sitio = (ev.meta?.sitio || '').toLowerCase();
    return name.includes(term) || espectaculo.includes(term) || pulep.includes(term) || sitio.includes(term);
  });

  const selectedEvent = salesData[selectedEventIdx] || salesData[0];

  return (
    <div className="space-y-6">
      {/* Cabecera del Módulo */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-700 dark:text-slate-300 rounded-xl transition-all hover:text-slate-900 dark:hover:text-white cursor-pointer"
            title="Volver a la lista de eventos"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Módulo de Informes de Ventas y Cortesías
              <span className="text-[10px] bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30 border px-2.5 py-0.5 rounded-full font-bold">
                Eventos a la Venta
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Consulta consolidada o individual de recaudo por localidad, boletos pagados, cortesías emitidas, entrega a empresario y cover service.
            </p>
          </div>
        </div>

        {/* Acciones Globales */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => fetchSales(true)}
            disabled={isLoading}
            className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 dark:border-slate-800 px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
            title="Extraer ventas frescas desde Chrome CDP"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-600 dark:text-amber-400' : ''}`} />
            <span>{isLoading ? 'Consultando...' : 'Actualizar Ventas'}</span>
          </button>

          {/* Selector de Formato del PDF */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 px-2.5 py-1.5 rounded-xl shadow-inner">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-semibold uppercase hidden xl:inline">Formato PDF:</span>
            <select
              value={pdfLayout}
              onChange={(e) => setPdfLayout(e.target.value as any)}
              className="bg-transparent text-slate-900 dark:text-slate-200 text-xs font-bold focus:outline-none cursor-pointer"
              title="Selecciona el formato y orientación del informe PDF"
            >
              <option value="standard_portrait" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-200">
                📄 Estándar Vertical
              </option>
              <option value="compact_landscape" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-200">
                📊 Horizontal Compacto
              </option>
              <option value="onepage_portrait" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-200">
                📋 Ficha Liquidación (One-Page)
              </option>
            </select>
          </div>

          {activeTab === 'general' ? (
            <>
              <button
                onClick={() => handleDownloadPdf('general')}
                disabled={isDownloadingPdf || salesData.length === 0}
                className="bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
                title="Generar y descargar informe consolidado en PDF"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{isDownloadingPdf ? 'Generando PDF...' : 'PDF Consolidado'}</span>
              </button>

              <button
                onClick={() => handleDownloadExcel()}
                disabled={isDownloadingExcel || salesData.length === 0}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
                title="Generar y descargar informe consolidado en Excel (.xlsx)"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isDownloadingExcel ? 'Generando Excel...' : 'Excel Consolidado'}</span>
              </button>
            </>
          ) : (
            selectedEvent && (
              <>
                <button
                  onClick={() => handleDownloadPdf('individual', individualSubTab, selectedEvent.url)}
                  disabled={isDownloadingPdf}
                  className="bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
                  title="Descargar PDF de este evento"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>{isDownloadingPdf ? 'Generando PDF...' : `PDF ${individualSubTab === 'detailed' ? 'Detallado' : 'General'}`}</span>
                </button>

                <button
                  onClick={() => handleDownloadExcel(selectedEvent.url)}
                  disabled={isDownloadingExcel}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
                  title="Descargar Excel de este evento"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isDownloadingExcel ? 'Generando Excel...' : 'Excel Evento'}</span>
                </button>
              </>
            )
          )}
        </div>
      </div>

      {/* Selector de Pestañas Principales */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('general')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'general'
              ? 'bg-emerald-600 dark:bg-emerald-500 text-white dark:text-slate-950 shadow-md shadow-emerald-500/20'
              : 'bg-slate-900/60 hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-800'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Informe General Consolidado (Todos los Eventos en Venta)</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded font-mono bg-black/20">
            {salesData.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('individual')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-2 ${
            activeTab === 'individual'
              ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-md shadow-blue-500/20'
              : 'bg-slate-900/60 hover:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-800'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Informe Individual por Evento</span>
        </button>
      </div>

      {/* Alerta de Caché */}
      {isCached && !isLoading && (
        <div className="bg-slate-900/60 border border-slate-800 text-slate-600 dark:text-slate-400 text-xs px-4 py-2.5 rounded-xl flex items-center justify-between">
          <span>Mostrando datos de ventas en caché (hace {cacheAge} min).</span>
          <button
            onClick={() => fetchSales(true)}
            className="text-amber-600 dark:text-amber-400 hover:underline font-bold ml-2 cursor-pointer"
          >
            Refrescar ahora con Chrome &rarr;
          </button>
        </div>
      )}

      {/* Alerta de Error */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 p-4 rounded-xl text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
          <div className="space-y-1">
            <span className="font-bold block">No se pudo cargar el reporte:</span>
            <p>{error}</p>
            <p className="text-slate-500 text-[11px] mt-1">
              Asegúrate de tener Google Chrome abierto en depuración (puerto 9222) y con tu sesión de QRBoletos iniciada.
            </p>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* VISTA 1: INFORME GENERAL CONSOLIDADO */}
      {/* ============================================================ */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* Tarjetas KPI de Totales Consolidados */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-1">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-mono font-semibold block">Boletos Pagados</span>
              <span className="text-xl font-bold text-slate-900 dark:text-white font-mono">
                {isLoading ? '...' : grandPagados.toLocaleString()}
              </span>
            </div>

            <div className="bg-slate-900 border border-rose-300 dark:border-rose-500/30 rounded-2xl p-4 shadow-sm space-y-1">
              <span className="text-[10px] text-rose-700 dark:text-rose-400 uppercase font-mono font-semibold block flex items-center gap-1">
                <Gift className="w-3 h-3" /> Cortesías
              </span>
              <span className="text-xl font-bold text-rose-700 dark:text-rose-400 font-mono">
                {isLoading ? '...' : grandCortesias.toLocaleString()}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-1">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-mono font-semibold block">Total Boletos</span>
              <span className="text-xl font-bold text-slate-900 dark:text-white font-mono">
                {isLoading ? '...' : grandTotalBoletos.toLocaleString()}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-1">
              <span className="text-[10px] text-emerald-800 dark:text-emerald-400 uppercase font-mono font-semibold block">Recaudo Entradas</span>
              <span className="text-base font-bold text-emerald-800 dark:text-emerald-400 font-mono truncate block">
                {isLoading ? '...' : `$${grandRecaudoEntradas.toLocaleString()}`}
              </span>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-1">
              <span className="text-[10px] text-purple-800 dark:text-purple-300 uppercase font-mono font-semibold block">Cover Service</span>
              <span className="text-base font-bold text-purple-800 dark:text-purple-300 font-mono truncate block">
                {isLoading ? '...' : `$${grandRecaudoServicio.toLocaleString()}`}
              </span>
            </div>

            <div className="bg-amber-50 dark:bg-slate-900 border border-amber-300 dark:border-amber-500/30 rounded-2xl p-4 shadow-sm space-y-1 dark:bg-amber-500/5">
              <span className="text-[10px] text-amber-800 dark:text-amber-400 uppercase font-mono font-semibold block">Gran Total COP</span>
              <span className="text-base font-extrabold text-amber-800 dark:text-amber-400 font-mono truncate block">
                {isLoading ? '...' : `$${grandTotalCOP.toLocaleString()}`}
              </span>
            </div>
          </div>

          {/* Banner de Entrega a Empresario Consolidado si aplica */}
          {grandEntregaEmpresario > 0 && (
            <div className="bg-amber-50 border border-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30 rounded-2xl p-3.5 px-5 flex items-center justify-between text-xs shadow-sm">
              <div className="flex items-center gap-2 text-amber-900 dark:text-amber-300 font-bold">
                <Briefcase className="w-4 h-4 text-amber-700 dark:text-amber-400" />
                <span>Total Recaudo bajo Modalidad &quot;Entrega a Empresario&quot;:</span>
              </div>
              <span className="text-sm font-extrabold text-amber-900 dark:text-amber-300 font-mono">
                ${grandEntregaEmpresario.toLocaleString()} COP
              </span>
            </div>
          )}

          {/* Lista de Eventos Desplegables */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-100 dark:bg-slate-950/60">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Eventos Publicados en Venta
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">({filteredEvents.length})</span>
              </div>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Buscar evento, función o lugar..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-300 dark:bg-slate-900 dark:border-slate-800 rounded-xl pl-8 pr-4 py-1.5 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 w-full sm:w-64"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-xs space-y-3">
                <RefreshCw className="w-7 h-7 animate-spin mx-auto text-emerald-600 dark:text-emerald-400" />
                <p>Consultando el informe de ventas oficial de QRBoletos vía Chrome CDP...</p>
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-xs">
                No se encontraron eventos activos en venta con reportes de ventas disponibles.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800/80">
                {filteredEvents.map((ev, idx) => {
                  const isExpanded = !!expandedEvents[idx];
                  const resumen = ev.resumenLocalidades || [];

                  const evPagados = resumen.reduce((acc, l) => acc + (l.boletosPagados !== undefined ? l.boletosPagados : parseNum(l.vendidas)), 0);
                  const evCortesias = resumen.reduce((acc, l) => acc + (l.cortesias || 0), 0);
                  const evTotalBoletos = resumen.reduce((acc, l) => acc + (l.totalBoletos !== undefined ? l.totalBoletos : parseNum(l.vendidas)), 0);
                  const evEntradas = resumen.reduce((acc, l) => acc + parseNum(l.recaudoEntradas), 0);
                  const evServicio = resumen.reduce((acc, l) => acc + parseNum(l.recaudoServicio), 0);
                  const evTotal = evEntradas + evServicio;

                  const tieneEmpresario = ev.entregaEmpresario && ev.entregaEmpresario.tiene;

                  return (
                    <div key={idx} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-950/30">
                      {/* Fila Cabecera del Evento */}
                      <div className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="space-y-2 flex-1">
                          {/* Fila 1: Título del evento */}
                          <div>
                            <span className="font-extrabold text-sm text-slate-900 dark:text-white uppercase tracking-wide">
                              {ev.meta?.evento || 'Evento QRBoletos'}
                            </span>
                          </div>

                          {/* Fila 2: Nombre de espectáculo */}
                          {ev.meta?.espectaculo && (
                            <div>
                              <span className="text-[10px] bg-sky-600 text-white dark:bg-sky-500 px-2.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider inline-block shadow-sm">
                                {ev.meta.espectaculo}
                              </span>
                            </div>
                          )}

                          {/* Fila 3: Entrega a Empresario */}
                          {tieneEmpresario && (
                            <div>
                              <span className="text-[10px] bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 border px-2.5 py-0.5 rounded font-mono font-bold inline-flex items-center gap-1 shadow-sm">
                                <Briefcase className="w-3 h-3 text-amber-700 dark:text-amber-400" />
                                ENTREGA EMPRESARIO: {ev.entregaEmpresario?.totalFormatted || `$${ev.entregaEmpresario?.total.toLocaleString()}`}
                              </span>
                            </div>
                          )}

                          {/* Metadatos adicionales (PULEP / Lugar / Fecha) */}
                          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 flex-wrap pt-0.5">
                            <span className="font-mono text-xs">
                              <span className="text-[10px] uppercase font-semibold text-slate-400 mr-1">PULEP:</span>
                              <strong className="text-slate-700 dark:text-slate-200">{ev.meta?.pulep || 'N/A'}</strong>
                            </span>
                            <span className="flex items-center gap-1 font-medium">
                              <MapPin className="w-3 h-3 text-rose-600 dark:text-rose-400" />
                              <span className="text-[10px] uppercase font-semibold text-slate-400">Lugar:</span>
                              <strong className="text-slate-700 dark:text-slate-200">{ev.meta?.sitio || 'N/A'}</strong>
                            </span>
                            {ev.meta?.fechaInicio && (
                              <span className="flex items-center gap-1 font-medium">
                                <Calendar className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                                {ev.meta.fechaInicio}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Métricas Resumidas del Evento */}
                        <div className="flex items-center gap-4 shrink-0 flex-wrap">
                          <div className="text-right">
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-mono block">Pagados</span>
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 font-mono">
                              {evPagados.toLocaleString()}
                            </span>
                          </div>

                          <div className="text-right">
                            <span className="text-[9px] text-rose-700 dark:text-rose-400 uppercase font-mono block">Cortesías</span>
                            <span className="text-xs font-bold text-rose-700 dark:text-rose-400 font-mono">
                              {evCortesias.toLocaleString()}
                            </span>
                          </div>

                          <div className="text-right">
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-mono block">Total Boletos</span>
                            <span className="text-xs font-bold text-slate-900 dark:text-white font-mono">
                              {evTotalBoletos.toLocaleString()}
                            </span>
                          </div>

                          <div className="text-right">
                            <span className="text-[9px] text-emerald-800 dark:text-emerald-400 uppercase font-mono block">Entradas</span>
                            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-400 font-mono">
                              ${evEntradas.toLocaleString()}
                            </span>
                          </div>

                          <div className="text-right">
                            <span className="text-[9px] text-purple-800 dark:text-purple-300 uppercase font-mono block">Cover Service</span>
                            <span className="text-xs font-bold text-purple-800 dark:text-purple-300 font-mono">
                              ${evServicio.toLocaleString()}
                            </span>
                          </div>

                          <div className="text-right">
                            <span className="text-[9px] text-amber-800 dark:text-amber-400 uppercase font-mono block">Gran Total</span>
                            <span className="text-sm font-extrabold text-amber-800 dark:text-amber-400 font-mono">
                              ${evTotal.toLocaleString()}
                            </span>
                          </div>

                          {/* Botón expandir */}
                          <button
                            onClick={() => toggleEventExpand(idx)}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-300 rounded-lg transition-colors cursor-pointer"
                            title={isExpanded ? 'Ocultar localidades' : 'Ver ventas por localidad y cortesías'}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Desglose Expandible por Localidad */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 bg-slate-50 dark:bg-slate-950/60 border-t border-slate-200 dark:border-slate-800/60 space-y-3">
                          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                            <table className="w-full text-left text-xs text-slate-800 dark:text-slate-300">
                              <thead className="bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 uppercase font-mono text-[9.5px] border-b border-slate-200 dark:border-slate-800">
                                <tr>
                                  <th className="px-4 py-2">Localidad</th>
                                  <th className="px-4 py-2 text-right">Boletos Pagados</th>
                                  <th className="px-4 py-2 text-right text-rose-700 dark:text-rose-400">Cortesías Emitidas</th>
                                  <th className="px-4 py-2 text-right">Total Boletos</th>
                                  <th className="px-4 py-2 text-right">Recaudo Entradas (COP)</th>
                                  <th className="px-4 py-2 text-right">Cover Service (COP)</th>
                                  <th className="px-4 py-2 text-right">Total Recaudo (COP)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/50">
                                {resumen.map((loc, lIdx) => {
                                  const pag = loc.boletosPagados !== undefined ? loc.boletosPagados : parseNum(loc.vendidas);
                                  const cor = loc.cortesias || 0;
                                  const totB = loc.totalBoletos !== undefined ? loc.totalBoletos : parseNum(loc.vendidas);
                                  const rEnt = parseNum(loc.recaudoEntradas);
                                  const rSer = parseNum(loc.recaudoServicio);
                                  const rTot = rEnt + rSer;

                                  return (
                                    <tr key={lIdx} className="hover:bg-slate-100/80 dark:hover:bg-slate-900/40">
                                      <td className="px-4 py-1.5 font-bold text-slate-900 dark:text-slate-100 uppercase">
                                        {loc.localidad}
                                      </td>
                                      <td className="px-4 py-1.5 text-right font-mono text-slate-800 dark:text-slate-200">
                                        {pag.toLocaleString()}
                                      </td>
                                      <td className={`px-4 py-1.5 text-right font-mono ${cor > 0 ? 'text-rose-700 dark:text-rose-400 font-bold bg-rose-100 dark:bg-rose-500/10' : 'text-slate-400 dark:text-slate-500'}`}>
                                        {cor.toLocaleString()}
                                      </td>
                                      <td className="px-4 py-1.5 text-right font-mono font-semibold text-slate-900 dark:text-white">
                                        {totB.toLocaleString()}
                                      </td>
                                      <td className="px-4 py-1.5 text-right font-mono text-emerald-800 dark:text-emerald-400 font-medium">
                                        ${rEnt.toLocaleString()}
                                      </td>
                                      <td className="px-4 py-1.5 text-right font-mono text-purple-800 dark:text-purple-300 font-medium">
                                        ${rSer.toLocaleString()}
                                      </td>
                                      <td className="px-4 py-1.5 text-right font-mono font-bold text-amber-800 dark:text-amber-400">
                                        ${rTot.toLocaleString()}
                                      </td>
                                    </tr>
                                  );
                                })}
                                {/* Fila Total Evento */}
                                <tr className="bg-slate-100 dark:bg-slate-950 font-bold border-t-2 border-slate-300 dark:border-slate-800">
                                  <td className="px-4 py-2 uppercase text-slate-900 dark:text-white">TOTAL LOCALIDADES</td>
                                  <td className="px-4 py-2 text-right font-mono text-slate-900 dark:text-white">{evPagados.toLocaleString()}</td>
                                  <td className="px-4 py-2 text-right font-mono text-rose-700 dark:text-rose-400">{evCortesias.toLocaleString()}</td>
                                  <td className="px-4 py-2 text-right font-mono text-slate-900 dark:text-white">{evTotalBoletos.toLocaleString()}</td>
                                  <td className="px-4 py-2 text-right font-mono text-emerald-800 dark:text-emerald-400">${evEntradas.toLocaleString()}</td>
                                  <td className="px-4 py-2 text-right font-mono text-purple-800 dark:text-purple-300">${evServicio.toLocaleString()}</td>
                                  <td className="px-4 py-2 text-right font-mono text-amber-800 dark:text-amber-400">${evTotal.toLocaleString()}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* VISTA 2: INFORME INDIVIDUAL POR EVENTO */}
      {/* ============================================================ */}
      {activeTab === 'individual' && (
        <div className="space-y-5">
          {/* Selector de Evento y Modalidad */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] uppercase font-mono font-bold text-slate-500 dark:text-slate-400 block">
                Selecciona el Evento a Consultar:
              </label>
              <select
                value={selectedEventIdx}
                onChange={(e) => setSelectedEventIdx(parseInt(e.target.value, 10))}
                className="bg-slate-50 border border-slate-300 dark:bg-slate-950 dark:border-slate-800 text-slate-900 dark:text-white text-xs font-semibold rounded-xl px-3.5 py-2.5 w-full md:max-w-xl focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                {salesData.map((ev, idx) => (
                  <option key={idx} value={idx} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-200">
                    {ev.meta?.evento || 'Evento'} {ev.meta?.espectaculo ? `(${ev.meta.espectaculo})` : ''} - {ev.meta?.sitio || ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Sub-toggle: General vs Detallado */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1.5 rounded-xl border border-slate-300 dark:border-slate-800 self-start md:self-auto">
              <button
                onClick={() => setIndividualSubTab('general')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  individualSubTab === 'general'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                General del Evento (Localidades)
              </button>
              <button
                onClick={() => setIndividualSubTab('detailed')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  individualSubTab === 'detailed'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Detallado por Canales (Web / POS)
              </button>
            </div>
          </div>

          {selectedEvent && (
            <div className="space-y-5">
              {/* Tarjeta de Metadatos del Evento */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  {/* Fila 1: Título del evento */}
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white uppercase tracking-wide">
                      {selectedEvent.meta?.evento}
                    </h2>
                  </div>

                  {/* Fila 2: Nombre de espectáculo */}
                  {selectedEvent.meta?.espectaculo && (
                    <div>
                      <span className="text-xs bg-sky-600 text-white dark:bg-sky-500 px-2.5 py-0.5 rounded-md font-mono font-bold uppercase tracking-wider inline-block shadow-sm">
                        {selectedEvent.meta.espectaculo}
                      </span>
                    </div>
                  )}

                  {/* Fila 3: Entrega a Empresario */}
                  {selectedEvent.entregaEmpresario && selectedEvent.entregaEmpresario.tiene && (
                    <div>
                      <span className="text-xs bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30 border px-2.5 py-0.5 rounded-md font-mono font-bold inline-flex items-center gap-1 shadow-sm">
                        <Briefcase className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
                        ENTREGA EMPRESARIO: {selectedEvent.entregaEmpresario.totalFormatted || `$${selectedEvent.entregaEmpresario.total.toLocaleString()}`}
                      </span>
                    </div>
                  )}

                  {/* Metadatos PULEP / Lugar / Fecha */}
                  <div className="flex items-center gap-5 text-xs text-slate-500 dark:text-slate-400 flex-wrap pt-0.5">
                    <span className="font-mono text-xs">
                      <span className="text-[10px] uppercase font-semibold text-slate-400 mr-1">PULEP:</span>
                      <strong className="text-slate-700 dark:text-slate-200">{selectedEvent.meta?.pulep || 'N/A'}</strong>
                    </span>
                    <span className="flex items-center gap-1.5 font-medium">
                      <MapPin className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                      <span className="text-[10px] uppercase font-semibold text-slate-400">Lugar:</span>
                      <strong className="text-slate-700 dark:text-slate-200">{selectedEvent.meta?.sitio || 'N/A'}</strong>
                    </span>
                    {selectedEvent.meta?.fechaInicio && (
                      <span className="flex items-center gap-1.5 font-medium">
                        <Calendar className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        {selectedEvent.meta.fechaInicio}
                      </span>
                    )}
                  </div>
                </div>

                {selectedEvent.url && (
                  <a
                    href={selectedEvent.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700 hover:text-slate-900 dark:bg-slate-950 dark:hover:bg-slate-800 dark:border-slate-800 dark:text-slate-300 dark:hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 self-start transition-colors"
                  >
                    <span>Ver en QRBoletos</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>

              {/* Sub-vista: General por Localidad */}
              {individualSubTab === 'general' ? (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/60 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Resumen de Ventas y Cortesías por Localidad
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {selectedEvent.resumenLocalidades?.length || 0} localidades
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-800 dark:text-slate-300">
                      <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase font-mono text-[9.5px] border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-5 py-2.5">Localidad</th>
                          <th className="px-5 py-2.5 text-right">Boletos Pagados</th>
                          <th className="px-5 py-2.5 text-right text-rose-700 dark:text-rose-400">Cortesías Emitidas</th>
                          <th className="px-5 py-2.5 text-right">Total Boletos</th>
                          <th className="px-5 py-2.5 text-right">Recaudo Entradas (COP)</th>
                          <th className="px-5 py-2.5 text-right">Cover Service (COP)</th>
                          <th className="px-5 py-2.5 text-right">Total Recaudo (COP)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                        {(selectedEvent.resumenLocalidades || []).map((loc, lIdx) => {
                          const pag = loc.boletosPagados !== undefined ? loc.boletosPagados : parseNum(loc.vendidas);
                          const cor = loc.cortesias || 0;
                          const totB = loc.totalBoletos !== undefined ? loc.totalBoletos : parseNum(loc.vendidas);
                          const rEnt = parseNum(loc.recaudoEntradas);
                          const rSer = parseNum(loc.recaudoServicio);
                          const rTot = rEnt + rSer;

                          return (
                            <tr key={lIdx} className="hover:bg-slate-100/80 dark:hover:bg-slate-800/30">
                              <td className="px-5 py-2.5 font-bold text-slate-900 dark:text-slate-100 uppercase">
                                {loc.localidad}
                              </td>
                              <td className="px-5 py-2.5 text-right font-mono text-slate-800 dark:text-slate-200">
                                {pag.toLocaleString()}
                              </td>
                              <td className={`px-5 py-2.5 text-right font-mono ${cor > 0 ? 'text-rose-700 dark:text-rose-400 font-bold bg-rose-100 dark:bg-rose-500/10' : 'text-slate-400 dark:text-slate-500'}`}>
                                {cor.toLocaleString()}
                              </td>
                              <td className="px-5 py-2.5 text-right font-mono font-semibold text-slate-900 dark:text-white">
                                {totB.toLocaleString()}
                              </td>
                              <td className="px-5 py-2.5 text-right font-mono text-emerald-800 dark:text-emerald-400 font-medium">
                                ${rEnt.toLocaleString()}
                              </td>
                              <td className="px-5 py-2.5 text-right font-mono text-purple-800 dark:text-purple-300 font-medium">
                                ${rSer.toLocaleString()}
                              </td>
                              <td className="px-5 py-2.5 text-right font-mono font-bold text-amber-800 dark:text-amber-400">
                                ${rTot.toLocaleString()}
                              </td>
                            </tr>
                          );
                        })}

                        {/* Fila Totales del Evento */}
                        {(() => {
                          const resumen = selectedEvent.resumenLocalidades || [];
                          const totPag = resumen.reduce((a, l) => a + (l.boletosPagados !== undefined ? l.boletosPagados : parseNum(l.vendidas)), 0);
                          const totCor = resumen.reduce((a, l) => a + (l.cortesias || 0), 0);
                          const totB = resumen.reduce((a, l) => a + (l.totalBoletos !== undefined ? l.totalBoletos : parseNum(l.vendidas)), 0);
                          const totEnt = resumen.reduce((a, l) => a + parseNum(l.recaudoEntradas), 0);
                          const totSer = resumen.reduce((a, l) => a + parseNum(l.recaudoServicio), 0);
                          const totGen = totEnt + totSer;

                          return (
                            <tr className="bg-slate-100 dark:bg-slate-950 font-extrabold border-t-2 border-slate-300 dark:border-slate-800 text-sm">
                              <td className="px-5 py-3 uppercase text-slate-900 dark:text-white">TOTAL GENERAL EVENTO</td>
                              <td className="px-5 py-3 text-right font-mono text-slate-900 dark:text-white">{totPag.toLocaleString()}</td>
                              <td className="px-5 py-3 text-right font-mono text-rose-700 dark:text-rose-400">{totCor.toLocaleString()}</td>
                              <td className="px-5 py-3 text-right font-mono text-slate-900 dark:text-white">{totB.toLocaleString()}</td>
                              <td className="px-5 py-3 text-right font-mono text-emerald-800 dark:text-emerald-400">${totEnt.toLocaleString()}</td>
                              <td className="px-5 py-3 text-right font-mono text-purple-800 dark:text-purple-300">${totSer.toLocaleString()}</td>
                              <td className="px-5 py-3 text-right font-mono text-amber-800 dark:text-amber-400">${totGen.toLocaleString()}</td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                /* Sub-vista: Detallado por Canales (Web vs Taquilla) */
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                  <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/60 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Desglose Detallado por Etapas, Referencias y Canales
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {selectedEvent.detalleCanales?.length || 0} registros
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-800 dark:text-slate-300">
                      <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 uppercase font-mono text-[9.5px] border-b border-slate-200 dark:border-slate-800">
                        <tr>
                          <th className="px-4 py-2.5">Localidad</th>
                          <th className="px-4 py-2.5">Etapa</th>
                          <th className="px-4 py-2.5">Referencia</th>
                          <th className="px-4 py-2.5">Canal</th>
                          <th className="px-4 py-2.5 text-center">Tipo</th>
                          <th className="px-4 py-2.5 text-right">Cantidad</th>
                          <th className="px-4 py-2.5 text-right">Valor Entrada</th>
                          <th className="px-4 py-2.5 text-right">Total Entradas</th>
                          <th className="px-4 py-2.5 text-right">Valor Servicio</th>
                          <th className="px-4 py-2.5 text-right">Total Servicio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 dark:divide-slate-800/60">
                        {(selectedEvent.detalleCanales || []).map((det, dIdx) => {
                          const isWeb = det.canal.toLowerCase().includes('web');
                          const isCor = !!det.isCortesia;
                          return (
                            <tr key={dIdx} className="hover:bg-slate-100/80 dark:hover:bg-slate-800/30">
                              <td className="px-4 py-2 font-bold text-slate-900 dark:text-slate-100 uppercase">
                                {det.localidad}
                              </td>
                              <td className="px-4 py-2 text-slate-700 dark:text-slate-300 font-mono text-[11px]">
                                {det.etapa}
                              </td>
                              <td className="px-4 py-2 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                                {det.referencia}
                              </td>
                              <td className="px-4 py-2">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold inline-flex items-center gap-1 border ${
                                  isWeb ? 'bg-blue-100 text-blue-900 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30' : 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30'
                                }`}>
                                  {isWeb ? <Globe className="w-2.5 h-2.5" /> : <Store className="w-2.5 h-2.5" />}
                                  {det.canal}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-center">
                                {isCor ? (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-rose-100 text-rose-800 border border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30">
                                    CORTESÍA
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200 text-slate-800 border border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-transparent">
                                    PAGADO
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right font-mono font-bold text-slate-900 dark:text-white">
                                {parseNum(det.cantidad).toLocaleString()}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-slate-600 dark:text-slate-400">
                                {det.valorEntrada}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-emerald-800 dark:text-emerald-400 font-semibold">
                                {det.totalEntradas}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-slate-600 dark:text-slate-400">
                                {det.valorServicio}
                              </td>
                              <td className="px-4 py-2 text-right font-mono text-purple-800 dark:text-purple-300 font-semibold">
                                {det.totalServicio}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
