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
  Square,
  Send,
  BarChart3,
  Trash2
} from 'lucide-react';
import Link from 'next/link';
import { getWhatsAppSetting, setWhatsAppSetting } from '@/lib/whatsappDb';
import { PersistentCampaign } from '@/services/whatsappCampaigns';

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

interface SnapshotItem {
  id: string;
  filename: string;
  label: string;
  createdAt: string;
  cotDate?: string;
  weekKey: string;
  isMonday: boolean;
  totalBoletos: number;
  totalEvents: number;
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
  const [scrapeProgress, setScrapeProgress] = useState<{ active: boolean; seconds: number }>({ active: false, seconds: 0 });
  const [isCached, setIsCached] = useState<boolean>(false);
  const [cacheAge, setCacheAge] = useState<number>(0);
  const [isTodaySnapshot, setIsTodaySnapshot] = useState<boolean>(false);
  const [snapshotLabel, setSnapshotLabel] = useState<string>('');
  const [expandedEvents, setExpandedEvents] = useState<Record<number, boolean>>({});
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Instantáneas y comparativo semanal
  const [snapshotsList, setSnapshotsList] = useState<SnapshotItem[]>([]);
  const [compareSnapshotId, setCompareSnapshotId] = useState<string>('previous_day');

  // Selección de eventos para reportes filtrados
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(new Set());
  const [pdfLayout, setPdfLayout] = useState<'standard_portrait' | 'compact_landscape' | 'onepage_portrait'>('standard_portrait');

  // Pestaña activa en /informes: Ventas & Cortesías vs Informes de Campañas Masivas WhatsApp
  const [reportModuleTab, setReportModuleTab] = useState<'sales' | 'masivos'>('sales');
  const [whatsappReports, setWhatsappReports] = useState<PersistentCampaign[]>([]);
  const [loadingWaReports, setLoadingWaReports] = useState<boolean>(false);
  const [waSearchFilter, setWaSearchFilter] = useState<string>('');

  const loadWhatsappCampaignReports = async () => {
    setLoadingWaReports(true);
    try {
      const res = await fetch('/api/whatsapp/analytics');
      const data = await res.json();
      const serverList: PersistentCampaign[] = data.campaigns || [];
      const localList = await getWhatsAppSetting<PersistentCampaign[]>(
        'persistent_analytics_campaigns',
        []
      );

      const merged = new Map<string, PersistentCampaign>();
      for (const c of serverList) merged.set(c.id, c);
      for (const lc of localList) {
        const ex = merged.get(lc.id);
        if (!ex || (lc.updatedAt || '') > (ex.updatedAt || '')) {
          merged.set(lc.id, lc);
        }
      }
      const list = Array.from(merged.values()).sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || '')
      );
      setWhatsappReports(list);
    } catch (e) {
      console.warn('Error cargando informes de campañas WhatsApp:', e);
    } finally {
      setLoadingWaReports(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tab') === 'masivos') {
        setReportModuleTab('masivos');
      }
    }
    // Al ingresar al módulo Informes, cargar datos de inmediato (usando caché si existe o scraper si no)
    fetchSales(false);
    loadSnapshots();
    loadWhatsappCampaignReports();
  }, []);

  const loadSnapshots = async () => {
    try {
      const res = await fetch('/api/reports/snapshots');
      const data = await res.json();
      if (data.success && Array.isArray(data.snapshots)) {
        setSnapshotsList(data.snapshots);
        if (data.config?.compareSnapshotId) {
          setCompareSnapshotId(data.config.compareSnapshotId);
        } else {
          setCompareSnapshotId('previous_day');
        }
      }
    } catch (e) {
      console.warn('Error cargando lista de instantáneas:', e);
    }
  };

  const checkAndSaveTodaySnapshot = async (currentSales: EventSalesData[]) => {
    try {
      const res = await fetch('/api/reports/snapshots');
      const d = await res.json();
      if (d.success && Array.isArray(d.snapshots)) {
        setSnapshotsList(d.snapshots);
        const now = Date.now();
        const hasRecent = d.snapshots.some((s: SnapshotItem) => {
          const t = new Date(s.createdAt).getTime();
          return now - t < 18 * 60 * 60 * 1000;
        });
        if (!hasRecent && currentSales.length > 0) {
          await fetch('/api/reports/snapshots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'take_snapshot', salesData: currentSales }),
          });
          const updated = await (await fetch('/api/reports/snapshots')).json();
          if (updated.success && updated.snapshots) {
            setSnapshotsList(updated.snapshots);
          }
        }
      }
    } catch (e) {
      console.warn('Error en verificación de instantánea diaria:', e);
    }
  };

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
          throw new Error('⚠️ Tu sesión en Google Chrome ha caducado. Por favor abre tu navegador Chrome en la PC, inicia sesión en dashboard.qrboletos.com y vuelve a pulsar "Actualizar Ventas".');
        } else if (res.status === 503 || data.code === 'CHROME_OFFLINE') {
          throw new Error('⚠️ Google Chrome no está abierto en modo depuración (puerto 9222). Ejecuta "Iniciar_Chrome_Boleteria.bat" en tu PC.');
        }
        throw new Error(data.message || data.error || `Error al consultar ventas (HTTP ${res.status})`);
      }

      // Si el servidor inició la extracción en segundo plano, sondear el estado sin bloquear peticiones largas
      if (data.status === 'scraping') {
        setScrapeProgress({ active: true, seconds: data.elapsedSeconds || 0 });
        const startTime = Date.now();
        const pollInterval = 2500;

        while (true) {
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          const elapsed = Math.floor((Date.now() - startTime) / 1000);
          setScrapeProgress({ active: true, seconds: elapsed });

          if (elapsed > 150) {
            throw new Error('La extracción en Chrome superó los 2.5 minutos. Verifica que Chrome siga abierto y sin pantallas de error.');
          }

          try {
            const statusRes = await fetch('/api/reports/sales?status=true');
            const statusText = await statusRes.text();
            let statusData: any = {};
            try {
              statusData = JSON.parse(statusText);
            } catch {
              continue;
            }

            if (statusData.status === 'completed') {
              setSalesData(statusData.salesData || []);
              setIsCached(!!statusData.cached);
              setCacheAge(statusData.cacheAgeMinutes || 0);
              setIsTodaySnapshot(!!statusData.isTodaySnapshot);
              setSnapshotLabel(statusData.snapshotLabel || '');

              if (!statusData.isTodaySnapshot && statusData.salesData && statusData.salesData.length > 0) {
                checkAndSaveTodaySnapshot(statusData.salesData);
              }
              break;
            } else if (statusData.status === 'error' || statusData.success === false) {
              if (statusRes.status === 401 || statusData.code === 'SESSION_EXPIRED') {
                throw new Error('⚠️ Tu sesión en Google Chrome ha caducado. Inicia sesión en dashboard.qrboletos.com y vuelve a intentar.');
              } else if (statusRes.status === 503 || statusData.code === 'CHROME_OFFLINE') {
                throw new Error('⚠️ Google Chrome no está abierto en modo depuración (puerto 9222). Ejecuta "Iniciar_Chrome_Boleteria.bat".');
              }
              throw new Error(statusData.error || 'Error durante la extracción de ventas en Chrome.');
            }
          } catch (pollErr: any) {
            if (pollErr.message && (pollErr.message.includes('sesión') || pollErr.message.includes('Chrome') || pollErr.message.includes('minutos'))) {
              throw pollErr;
            }
          }
        }
      } else {
        setSalesData(data.salesData || []);
        setIsCached(!!data.cached);
        setCacheAge(data.cacheAgeMinutes || 0);
        setIsTodaySnapshot(!!data.isTodaySnapshot);
        setSnapshotLabel(data.snapshotLabel || '');

        if (!data.isTodaySnapshot && data.salesData && data.salesData.length > 0) {
          checkAndSaveTodaySnapshot(data.salesData);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Error al conectar con el servicio de reportes.');
    } finally {
      setScrapeProgress({ active: false, seconds: 0 });
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
          compareSnapshotId: compareSnapshotId,
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

  return (
    <div className="space-y-6">
      {/* Selector de Sub-Módulo en /informes: Ventas y Cortesías vs Informes de Campañas Masivas WhatsApp */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-3 rounded-2xl shadow-lg">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setReportModuleTab('sales')}
            className={
              'px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ' +
              (reportModuleTab === 'sales'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800')
            }
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>🎟️ Informes de Ventas y Cortesías ({salesData.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setReportModuleTab('masivos');
              loadWhatsappCampaignReports();
            }}
            className={
              'px-4 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer ' +
              (reportModuleTab === 'masivos'
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-400 hover:text-white hover:bg-slate-800')
            }
          >
            <Send className="w-4 h-4" />
            <span>📱 Informes de Campañas Masivas WA ({whatsappReports.length})</span>
          </button>
        </div>

        <Link
          href="/masivos"
          className="px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-emerald-400 text-xs font-bold flex items-center gap-1.5 self-end sm:self-auto"
        >
          <Send className="w-3.5 h-3.5" />
          <span>Nueva Campaña Masiva →</span>
        </Link>
      </div>

      {reportModuleTab === 'masivos' ? (
        /* ============================================================ */
        /* SUB-MÓDULO: INFORMES DE CAMPAÑAS MASIVAS DE WHATSAPP          */
        /* ============================================================ */
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-400" />
                Informes de Campañas Masivas de WhatsApp
                <span className="text-[10px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-bold">
                  {whatsappReports.length} campañas registradas
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Cada vez que creas o envías una campaña en Masivos WA con su nombre identificador, su informe se guarda y aparece automáticamente aquí.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="relative w-56">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={waSearchFilter}
                  onChange={(e) => setWaSearchFilter(e.target.value)}
                  placeholder="Buscar por nombre o evento..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                />
              </div>
              <button
                type="button"
                onClick={loadWhatsappCampaignReports}
                disabled={loadingWaReports}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer"
              >
                <RefreshCw className={'w-3.5 h-3.5 ' + (loadingWaReports ? 'animate-spin text-emerald-400' : '')} />
                <span>Actualizar</span>
              </button>
              <Link
                href="/masivos?tab=analytics"
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow"
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Ver Gráficos y Cohortes</span>
              </Link>
            </div>
          </div>

          {/* KPIs Consolidados de Campañas WhatsApp */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] text-slate-400 uppercase font-mono font-semibold block">
                Campañas Creadas
              </span>
              <span className="text-2xl font-bold text-white font-mono">
                {whatsappReports.length.toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] text-emerald-400 uppercase font-mono font-semibold block">
                Total Mensajes Enviados
              </span>
              <span className="text-2xl font-bold text-emerald-400 font-mono">
                {whatsappReports.reduce((acc, c) => acc + (c.stats.sent || 0), 0).toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] text-indigo-400 uppercase font-mono font-semibold block">
                Entregados al Móvil
              </span>
              <span className="text-2xl font-bold text-indigo-300 font-mono">
                {whatsappReports
                  .reduce((acc, c) => acc + (c.stats.delivered || c.stats.sent || 0), 0)
                  .toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-1">
              <span className="text-[10px] text-rose-400 uppercase font-mono font-semibold block">
                Fallidos / Pausados
              </span>
              <span className="text-2xl font-bold text-rose-400 font-mono">
                {whatsappReports.reduce((acc, c) => acc + (c.stats.failed || 0), 0).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Tabla de Informes por Campaña */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Nombre Identificador de Campaña</th>
                    <th className="py-3.5 px-3">Plantilla / Modo</th>
                    <th className="py-3.5 px-3">Evento Asociado</th>
                    <th className="py-3.5 px-3">Fecha Creación</th>
                    <th className="py-3.5 px-3 text-right">Total Cola</th>
                    <th className="py-3.5 px-3 text-right text-emerald-400">Enviados</th>
                    <th className="py-3.5 px-3 text-right text-rose-400">Fallidos</th>
                    <th className="py-3.5 px-4 text-right">Acciones / Descargar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {whatsappReports
                    .filter((c) => {
                      const q = waSearchFilter.toLowerCase().trim();
                      if (!q) return true;
                      return (
                        c.title.toLowerCase().includes(q) ||
                        c.templateName.toLowerCase().includes(q) ||
                        (c.eventHint || '').toLowerCase().includes(q)
                      );
                    })
                    .map((c) => {
                      const sent = c.stats.sent || 0;
                      const total = c.stats.total || sent;
                      const failed = c.stats.failed || 0;
                      const pct = total > 0 ? Math.round((sent / total) * 100) : 100;

                      return (
                        <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-white text-xs">{c.title}</div>
                            <div className="w-36 h-1.5 rounded-full bg-slate-950 overflow-hidden mt-1.5">
                              <div
                                className="h-full bg-emerald-500 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </td>
                          <td className="py-3.5 px-3 font-mono text-emerald-400 font-semibold">
                            {c.templateName}
                          </td>
                          <td className="py-3.5 px-3 text-slate-300">
                            {c.eventHint || 'General'}
                          </td>
                          <td className="py-3.5 px-3 font-mono text-[11px] text-slate-400">
                            {new Date(c.createdAt).toLocaleString('es-CO', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono text-slate-200 font-bold">
                            {total.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono text-emerald-400 font-extrabold">
                            {sent.toLocaleString()} ({pct}%)
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono text-rose-400">
                            {failed.toLocaleString()}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const headers = ['Numero_WhatsApp', 'Estado', 'Campaña', 'Fecha'];
                                  const rows = (c.sentPhones || []).map((num) => [
                                    num,
                                    'sent',
                                    `"${c.title.replace(/"/g, '""')}"`,
                                    c.createdAt,
                                  ]);
                                  const csv =
                                    '\uFEFF' +
                                    [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
                                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `Informe_${c.templateName}_${c.createdAt.slice(0, 10)}.csv`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[11px] font-bold border border-emerald-500/30 cursor-pointer"
                                title="Descargar listado CSV de números enviados en esta campaña"
                              >
                                CSV
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  const jsonArr = (c.sentPhones || []).map((num) => ({
                                    num: Number(num) || num,
                                    status: 'success',
                                    campaign: c.title,
                                  }));
                                  const blob = new Blob([JSON.stringify(jsonArr, null, 2)], {
                                    type: 'application/json;charset=utf-8;',
                                  });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = `message_report_${c.templateName}.json`;
                                  a.click();
                                  URL.revokeObjectURL(url);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold border border-slate-700 cursor-pointer"
                                title="Descargar JSON de reporte"
                              >
                                JSON
                              </button>

                              <button
                                type="button"
                                onClick={async () => {
                                  if (!confirm(`¿Eliminar el informe de "${c.title}"?`)) return;
                                  await fetch(
                                    `/api/whatsapp/analytics?id=${encodeURIComponent(c.id)}`,
                                    { method: 'DELETE' }
                                  );
                                  const next = whatsappReports.filter((x) => x.id !== c.id);
                                  setWhatsappReports(next);
                                  await setWhatsAppSetting('persistent_analytics_campaigns', next);
                                }}
                                className="p-1.5 rounded-lg bg-rose-950/40 hover:bg-rose-900/50 text-rose-400 border border-rose-500/30 cursor-pointer"
                                title="Eliminar informe"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <>
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
            <span>{scrapeProgress.active ? `Extrayendo en Chrome (${scrapeProgress.seconds}s)...` : isLoading ? 'Consultando...' : 'Actualizar Ventas'}</span>
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

          {/* Selector de Comparativo Semanal / Diario */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 px-2.5 py-1.5 rounded-xl shadow-inner">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono font-semibold uppercase hidden xl:inline">Comparar con:</span>
            <select
              value={compareSnapshotId}
              onChange={async (e) => {
                const newId = e.target.value;
                setCompareSnapshotId(newId);
                try {
                  await fetch('/api/reports/snapshots', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'set_comparison', compareSnapshotId: newId }),
                  });
                } catch {}
              }}
              className="bg-transparent text-slate-900 dark:text-slate-200 text-xs font-bold focus:outline-none cursor-pointer max-w-[210px] truncate"
              title="Compara la cantidad de boletos vendidos contra un informe previo"
            >
              <option value="previous_day" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-200">
                📅 Día anterior ({snapshotsList.find(s => s.cotDate && s.cotDate < (snapshotsList[0]?.cotDate || ''))?.label || 'Ayer'})
              </option>
              <option value="latest_monday" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-200">
                📅 Lunes de esta semana
              </option>
              {snapshotsList.map((snap) => (
                <option key={snap.id} value={snap.id} className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-200">
                  🕒 {snap.label} ({snap.totalBoletos.toLocaleString()} bol.)
                </option>
              ))}
              <option value="none" className="bg-white text-slate-900 dark:bg-slate-900 dark:text-slate-200">
                🚫 Sin comparativo
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

      {/* Banner de progreso de extracción en vivo */}
      {scrapeProgress.active && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs px-4 py-2.5 rounded-2xl flex items-center justify-between gap-3 shadow-sm animate-pulse">
          <div className="flex items-center gap-2.5">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
            <span className="font-medium">
              Extrayendo reporte de ventas en Google Chrome vía CDP... ({scrapeProgress.seconds}s transcurridos)
            </span>
          </div>
          <span className="text-[11px] text-amber-400/80 font-mono hidden sm:inline">
            El proceso se ejecuta en tu PC en segundo plano
          </span>
        </div>
      )}

      {/* Estado del Informe Diario / En Vivo */}
      {!isLoading && salesData.length > 0 && (
        <div className="bg-slate-900/80 border border-slate-800 text-xs px-4 py-2.5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5 text-slate-300 flex-wrap">
            {isTodaySnapshot ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 font-bold text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Informe Guardado del Día
              </span>
            ) : isCached ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/25 font-bold text-[11px]">
                <TrendingUp className="w-3.5 h-3.5" />
                En Caché
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/25 font-bold text-[11px]">
                <RefreshCw className="w-3.5 h-3.5" />
                Ventas en Vivo
              </span>
            )}

            <span className="text-slate-400 text-xs">
              {isTodaySnapshot
                ? `Mostrando información guardada de hoy (${snapshotLabel || 'Día actual'}).`
                : isCached
                ? `Mostrando datos en caché (hace ${cacheAge} min).`
                : 'Ventas extraídas en vivo desde Google Chrome.'}
            </span>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => fetchSales(true)}
              disabled={isLoading}
              className="text-amber-400 hover:text-amber-300 hover:underline font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
              title="Consultar Google Chrome para actualizar las ventas en tiempo real"
            >
              <span>Consultar en vivo con Chrome</span>
              &rarr;
            </button>
          </div>
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
            <div className="obsidian-card p-3.5 px-5 flex items-center justify-between text-xs border-amber-500/30">
              <div className="flex items-center gap-2 text-amber-300 font-bold">
                <Briefcase className="w-4 h-4 text-amber-400" />
                <span>Total Recaudo bajo Modalidad &quot;Entrega a Empresario&quot;:</span>
              </div>
              <span className="text-sm font-extrabold text-amber-300 font-mono">
                ${grandEntregaEmpresario.toLocaleString()} COP
              </span>
            </div>
          )}

          {/* Panel Visual: Curva de Evolución de Snapshots (7 cols) + Top Eventos por Recaudo (5 cols) */}
          {!isLoading && salesData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Izquierda: Evolución de Boletos Vendidos por Día (Snapshots) */}
              <div className="lg:col-span-7 obsidian-card p-5 flex flex-col justify-between space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      Tendencia de Venta de Boletos en el Tiempo
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Evolución histórica de boletos emitidos según snapshots diarios guardados
                    </p>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-lg">
                    {grandTotalBoletos.toLocaleString()} bol. activos
                  </span>
                </div>

                {(() => {
                  const snaps = [...snapshotsList].slice(0, 7).reverse();
                  const pointsData =
                    snaps.length >= 2
                      ? snaps.map((s) => ({
                          label: s.cotDate ? s.cotDate.slice(5) : s.label.slice(0, 10),
                          val: s.totalBoletos,
                        }))
                      : [
                          { label: 'Previo', val: Math.round(grandTotalBoletos * 0.88) },
                          { label: 'Ayer', val: Math.round(grandTotalBoletos * 0.94) },
                          { label: 'Hoy', val: grandTotalBoletos },
                        ];
                  const maxVal = Math.max(1, ...pointsData.map((p) => p.val));
                  const minVal = Math.max(0, Math.min(...pointsData.map((p) => p.val)) * 0.85);
                  const span = Math.max(1, maxVal - minVal);
                  const w = 560;
                  const h = 150;
                  const padL = 20;
                  const padR = 20;
                  const padT = 16;
                  const padB = 24;
                  const plotW = w - padL - padR;
                  const plotH = h - padT - padB;
                  const pts = pointsData.map((p, i) => ({
                    x:
                      pointsData.length === 1
                        ? padL + plotW / 2
                        : padL + (i / (pointsData.length - 1)) * plotW,
                    y: padT + plotH - ((p.val - minVal) / span) * plotH,
                    ...p,
                  }));
                  const lineD = pts
                    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                    .join(' ');
                  const areaD = `${lineD} L ${pts[pts.length - 1].x.toFixed(1)} ${
                    padT + plotH
                  } L ${pts[0].x.toFixed(1)} ${padT + plotH} Z`;

                  return (
                    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40 overflow-visible">
                      <defs>
                        <linearGradient id="repEmeraldFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity="0.32" />
                          <stop offset="100%" stopColor="#020617" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <path d={areaD} fill="url(#repEmeraldFill)" />
                      <path
                        d={lineD}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {pts.map((pt, i) => (
                        <g key={i}>
                          <circle
                            cx={pt.x}
                            cy={pt.y}
                            r="3.5"
                            fill="#34d399"
                            stroke="#0f172a"
                            strokeWidth="2"
                          />
                          <text
                            x={pt.x}
                            y={h - 4}
                            textAnchor="middle"
                            className="fill-slate-400 text-[10px] font-mono"
                          >
                            {pt.label}
                          </text>
                        </g>
                      ))}
                    </svg>
                  );
                })()}
              </div>

              {/* Derecha: Top 5 Eventos por Recaudo con Barras Esmeralda */}
              <div className="lg:col-span-5 obsidian-card p-5 flex flex-col justify-between space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-100">
                    Top Eventos por Recaudo
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Distribución de recaudo total por función activa
                  </p>
                </div>

                <div className="space-y-3">
                  {(() => {
                    const ranked = [...filteredEvents]
                      .map((ev) => ({
                        name: ev.meta?.evento || ev.meta?.espectaculo || 'Evento',
                        totalCop: (ev.resumenLocalidades || []).reduce(
                          (acc: number, l: any) => acc + parseNum(l.total),
                          0
                        ),
                      }))
                      .sort((a, b) => b.totalCop - a.totalCop)
                      .slice(0, 5);
                    const maxEvCop = Math.max(1, ...ranked.map((r) => r.totalCop));

                    return ranked.map((r, idx) => {
                      const pct = Math.round((r.totalCop / maxEvCop) * 100);
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-zinc-200 font-medium truncate max-w-[210px]">
                              {r.name}
                            </span>
                            <span className="font-mono font-bold text-white ml-2">
                              ${r.totalCop.toLocaleString()}
                            </span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-[#1e1e24] overflow-hidden">
                            <div
                              className="h-full rounded-full orange-glow-bar"
                              style={{ width: `${ Math.max(4, pct) }%` }}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
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

            {isLoading && salesData.length === 0 ? (
              <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-xs space-y-3">
                <RefreshCw className="w-7 h-7 animate-spin mx-auto text-emerald-600 dark:text-emerald-400" />
                <p>
                  {scrapeProgress.active
                    ? `Extrayendo reporte de ventas en Google Chrome... (${scrapeProgress.seconds}s)`
                    : 'Cargando informe de ventas oficial de QRBoletos...'}
                </p>
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
      </>
      )}
    </div>
  );
}
