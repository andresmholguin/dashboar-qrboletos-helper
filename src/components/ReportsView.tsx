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
  Briefcase,
  CheckSquare,
  Square
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

  // Selección de eventos para reportes filtrados
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
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
      const rawText = await res.text();

      let data: any = null;
      try {
        data = JSON.parse(rawText);
      } catch {
        // La respuesta no es JSON válido (ej. error 502/504 en HTML o texto crudo)
        if (rawText.includes('FUNCTION_INVOCATION_TIMEOUT') || rawText.includes('504')) {
          throw new Error('La extracción tardó más de lo esperado en la nube. Vuelve a intentar o utiliza los datos en caché.');
        } else if (rawText.includes('TUNNEL_CONNECTION_FAILED') || rawText.includes('502') || rawText.includes('Bad Gateway')) {
          throw new Error('No se pudo conectar con el PC local. Asegúrate de tener "Iniciar_Tunel_Local.bat" en ejecución.');
        } else {
          throw new Error(rawText.slice(0, 180) || `Error del servidor (HTTP ${res.status})`);
        }
      }

      if (!res.ok || !data.success) {
        if (res.status === 401 || data.code === 'SESSION_EXPIRED' || data.error?.includes('expirado') || data.error?.includes('login.aspx') || data.message?.includes('expirado')) {
          throw new Error('⚠️ Tu sesión en Google Chrome ha caducado. Por favor abre tu navegador Chrome en la PC, inicia sesión en dashboard.qrboletos.com y vuelve a pulsar "Consultar Ventas".');
        } else if (res.status === 503 || data.code === 'CHROME_OFFLINE') {
          throw new Error('⚠️ Google Chrome no está abierto en modo depuración (puerto 9222). Ejecuta "Iniciar_Chrome_Boleteria.bat" en tu PC.');
        }
        throw new Error(data.message || data.error || `Error al consultar ventas (HTTP ${res.status})`);
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

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    try {
      const selectedArray = Array.from(selectedUrls);
      const targetData = selectedArray.length > 0 
        ? salesData.filter(ev => selectedArray.includes(ev.url))
        : salesData;

      if (targetData.length === 0) throw new Error("No hay eventos disponibles para generar el informe.");

      let response: Response;
      response = await fetch('/api/reports/download-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salesData: targetData,
          mode: 'general',
          type: 'general',
          layout: pdfLayout,
        }),
      });

      if (!response.ok) {
        const rawText = await response.text();
        let errText = rawText;
        try {
          const errJson = JSON.parse(rawText);
          if (response.status === 401 || errJson.code === 'SESSION_EXPIRED' || errJson.error?.includes('expirado') || errJson.error?.includes('login.aspx')) {
            errText = '⚠️ Tu sesión en Google Chrome ha caducado. Por favor inicia sesión en dashboard.qrboletos.com en tu PC y vuelve a intentarlo.';
          } else if (response.status === 503 || errJson.code === 'CHROME_OFFLINE') {
            errText = '⚠️ Google Chrome no está abierto en modo depuración (puerto 9222). Inicia "Iniciar_Chrome_Boleteria.bat".';
          } else {
            errText = errJson.message || errJson.error || rawText;
          }
        } catch {
          if (rawText.includes('504') || rawText.includes('TIMEOUT')) {
            errText = 'Tiempo de espera agotado generando el PDF.';
          } else if (rawText.includes('502') || rawText.includes('Bad Gateway') || rawText.includes('TUNNEL_CONNECTION_FAILED')) {
            errText = 'No se pudo comunicar con el PC local. Asegúrate de tener el túnel abierto.';
          }
        }
        throw new Error(errText);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      const todayStr = new Date().toISOString().split('T')[0];
      const filenamePrefix = selectedUrls.size > 0 ? 'Informe_Filtrado_Ventas' : 'Informe_Consolidado_Ventas';
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

  const handleDownloadExcel = async () => {
    setIsDownloadingExcel(true);
    try {
      const selectedArray = Array.from(selectedUrls);
      const response = await fetch('/api/reports/download-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUrls: selectedArray }),
      });
      if (!response.ok) {
        const rawText = await response.text();
        let errText = rawText;
        try {
          const errJson = JSON.parse(rawText);
          if (response.status === 401 || errJson.code === 'SESSION_EXPIRED' || errJson.error?.includes('expirado') || errJson.error?.includes('login.aspx')) {
            errText = '⚠️ Tu sesión en Google Chrome ha caducado. Por favor inicia sesión en dashboard.qrboletos.com en tu PC y vuelve a intentarlo.';
          } else if (response.status === 503 || errJson.code === 'CHROME_OFFLINE') {
            errText = '⚠️ Google Chrome no está abierto en modo depuración (puerto 9222). Inicia "Iniciar_Chrome_Boleteria.bat".';
          } else {
            errText = errJson.message || errJson.error || rawText;
          }
        } catch {
          if (rawText.includes('504') || rawText.includes('TIMEOUT')) {
            errText = 'Tiempo de espera agotado generando el Excel.';
          } else if (rawText.includes('502') || rawText.includes('Bad Gateway') || rawText.includes('TUNNEL_CONNECTION_FAILED')) {
            errText = 'No se pudo comunicar con el PC local. Asegúrate de tener el túnel abierto.';
          }
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

  const toggleEventSelection = (url: string) => {
    setSelectedUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
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

          <button
            onClick={handleDownloadPdf}
            disabled={isDownloadingPdf || salesData.length === 0}
            className="bg-rose-600 hover:bg-rose-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
            title="Generar y descargar informe en PDF"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>{isDownloadingPdf ? 'Generando PDF...' : (selectedUrls.size > 0 ? `PDF Selección (${selectedUrls.size})` : 'PDF Consolidado')}</span>
          </button>

          <button
            onClick={handleDownloadExcel}
            disabled={isDownloadingExcel || salesData.length === 0}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md cursor-pointer active:scale-95 disabled:opacity-50"
            title="Generar y descargar informe en Excel (.xlsx)"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isDownloadingExcel ? 'Generando Excel...' : (selectedUrls.size > 0 ? `Excel Selección (${selectedUrls.size})` : 'Excel Consolidado')}</span>
          </button>
        </div>
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
      {/* INFORME GENERAL CONSOLIDADO */}
      {/* ============================================================ */}
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
                          {/* Fila 1: Checkbox y Título del evento */}
                          <div className="flex items-start sm:items-center gap-3">
                            <button
                              type="button"
                              onClick={() => toggleEventSelection(ev.url)}
                              className="focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-md mt-0.5 sm:mt-0 transition-transform active:scale-90"
                              title={`Seleccionar ${ev.meta?.evento || 'este evento'} para reporte`}
                            >
                              {selectedUrls.has(ev.url) ? (
                                <CheckSquare className="w-5 h-5 text-emerald-500" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-400 hover:text-emerald-400 transition-colors" />
                              )}
                            </button>
                            <span className="font-extrabold text-sm text-slate-900 dark:text-white uppercase tracking-wide cursor-pointer" onClick={() => toggleEventSelection(ev.url)}>
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
    </div>
  );
}
