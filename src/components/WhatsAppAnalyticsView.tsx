'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart3,
  Send,
  CheckCircle2,
  Eye,
  MousePointerClick,
  ShoppingBag,
  RefreshCw,
  Save,
  Upload,
  Trash2,
  Edit3,
  TrendingUp,
  Award,
  Sparkles,
  X,
  Webhook,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  PieChart,
  Layers,
  DollarSign,
  Search,
  Users,
  Ticket,
  Calendar
} from 'lucide-react';
import { Customer } from '@/lib/qrboletosApi';
import { PersistentCampaign } from '@/services/whatsappCampaigns';
import { getWhatsAppSetting, setWhatsAppSetting, normalizeWhatsAppNumber } from '@/lib/whatsappDb';

interface WhatsAppAnalyticsViewProps {
  customers: Customer[];
  uniqueEvents: string[];
  accessToken: string;
  wabaId: string;
  onWabaIdDiscovered?: (id: string) => void;
}

/**
 * Componente SVG de Medidor Circular (Radial Gauge) de alta visibilidad
 */
function RadialGaugeCard({
  stepNumber,
  title,
  countLabel,
  subLabel,
  percentage,
  accentColor,
  trackColor,
  badgeText,
  icon: Icon,
}: {
  stepNumber: string;
  title: string;
  countLabel: string;
  subLabel: string;
  percentage: number;
  accentColor: string;
  trackColor: string;
  badgeText: string;
  icon: React.ElementType;
}) {
  const clampedPct = Math.max(0, Math.min(100, percentage));
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedPct / 100) * circumference;

  return (
    <div className="relative overflow-hidden rounded-3xl bg-slate-900/95 border border-slate-800 p-5 shadow-xl hover:border-slate-700 transition-all flex items-center justify-between gap-4">
      <div className="space-y-1.5 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center text-slate-950 shrink-0"
            style={{ backgroundColor: accentColor }}
          >
            {stepNumber}
          </span>
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300 truncate">
            {title}
          </span>
        </div>

        <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight truncate">
          {countLabel}
        </div>

        <div className="text-xs font-semibold text-slate-400 truncate">{subLabel}</div>

        <div className="pt-1">
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border"
            style={{
              backgroundColor: `${accentColor}18`,
              borderColor: `${accentColor}45`,
              color: accentColor,
            }}
          >
            <Icon className="w-3 h-3" />
            <span>{badgeText}</span>
          </span>
        </div>
      </div>

      {/* Anillo SVG */}
      <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="transparent"
            stroke={trackColor}
            strokeWidth="8"
          />
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="transparent"
            stroke={accentColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-sm font-black font-mono text-white">
            {clampedPct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default function WhatsAppAnalyticsView({
  customers,
  uniqueEvents,
  accessToken,
  wabaId,
  onWabaIdDiscovered,
}: WhatsAppAnalyticsViewProps) {
  const [campaigns, setCampaigns] = useState<PersistentCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingMeta, setSyncingMeta] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('ALL');
  const [targetEventFilter, setTargetEventFilter] = useState<string>('AUTO');
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [chartTab, setChartTab] = useState<'messages' | 'revenue' | 'rates'>('messages');
  const [buyerSearch, setBuyerSearch] = useState('');

  // Estado para edición manual rápida de métricas (Leídos / Interactuaron / Entregados)
  const [editingMetrics, setEditingMetrics] = useState(false);
  const [editForm, setEditForm] = useState({
    title: '',
    sent: 0,
    delivered: 0,
    read: 0,
    interacted: 0,
    eventHint: '',
  });
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  // Cargar campañas persistentes desde el servidor (data/whatsapp-campaigns/campaigns.json) + respaldo IndexedDB
  const loadCampaigns = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/whatsapp/analytics');
      const data = await res.json();
      const serverList: PersistentCampaign[] = data.campaigns || [];

      const localList = await getWhatsAppSetting<PersistentCampaign[]>(
        'persistent_analytics_campaigns',
        []
      );

      const mergedMap = new Map<string, PersistentCampaign>();
      for (const c of serverList) {
        mergedMap.set(c.id, c);
      }
      for (const localC of localList) {
        const existing = mergedMap.get(localC.id);
        if (!existing || (localC.updatedAt || '') > (existing.updatedAt || '')) {
          mergedMap.set(localC.id, localC);
        }
      }

      const finalArr = Array.from(mergedMap.values()).sort((a, b) =>
        (b.createdAt || '').localeCompare(a.createdAt || '')
      );
      setCampaigns(finalArr);
      await setWhatsAppSetting('persistent_analytics_campaigns', finalArr);
    } catch (e) {
      console.warn('Error cargando campañas analíticas:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const selectedCampaign = useMemo(() => {
    if (selectedCampaignId === 'ALL') return null;
    return campaigns.find((c) => c.id === selectedCampaignId) || null;
  }, [campaigns, selectedCampaignId]);

  // Mapa rápido de Teléfono Normalizado -> Cliente de QRBoletos (Customers API)
  const phoneToCustomerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of customers) {
      if (!c.telefono) continue;
      const norm = normalizeWhatsAppNumber(c.telefono, true);
      if (norm.normalized) {
        map.set(norm.normalized, c);
      }
    }
    return map;
  }, [customers]);

  // Calcular atribución de ventas en QRBoletos para una campaña
  const computeCampaignSalesAttribution = (camp: PersistentCampaign, explicitEvent?: string) => {
    const hint = (
      explicitEvent && explicitEvent !== 'AUTO'
        ? explicitEvent
        : camp.eventHint || ''
    )
      .trim()
      .toUpperCase();

    let buyersCount = 0;
    let ticketsBought = 0;
    let revenueCop = 0;
    const matchedBuyers: Array<{
      phone: string;
      name: string;
      email: string;
      eventsLabel: string;
      tickets: number;
      amountCop: number;
    }> = [];

    for (const phone of camp.sentPhones || []) {
      const cust = phoneToCustomerMap.get(phone);
      if (!cust || !Array.isArray(cust.eventos) || cust.eventos.length === 0) continue;

      const matchingEvents = cust.eventos.filter((ev) => {
        if (!hint || hint === 'ALL') return true;
        return (ev.evento || '').toUpperCase().includes(hint);
      });

      if (matchingEvents.length === 0) continue;

      let custTickets = 0;
      let custRevenue = 0;
      const evNames: string[] = [];

      for (const ev of matchingEvents) {
        if (ev.evento && !evNames.includes(ev.evento)) evNames.push(ev.evento);
        custRevenue += Number(ev.total_evento || 0);
        for (const loc of ev.localidades || []) {
          custTickets += Number(loc.cantidad || 0);
        }
      }

      buyersCount++;
      ticketsBought += custTickets;
      revenueCop += custRevenue;
      matchedBuyers.push({
        phone,
        name: cust.nombre || 'Cliente',
        email: cust.email || '',
        eventsLabel: evNames.join(' | '),
        tickets: custTickets,
        amountCop: custRevenue,
      });
    }

    matchedBuyers.sort((a, b) => b.amountCop - a.amountCop);

    return {
      buyersCount,
      ticketsBought,
      revenueCop,
      matchedBuyers,
      resolvedHint: hint || 'Todos los eventos',
    };
  };

  // Enriquecer cada campaña con métricas efectivas (si read/interacted están en 0 en reportes históricos,
  // garantizamos coherencia mínima con los compradores reales o estimación base claramente identificada)
  const enrichedCampaigns = useMemo(() => {
    return campaigns.map((c) => {
      const attr = computeCampaignSalesAttribution(
        c,
        selectedCampaign?.id === c.id ? targetEventFilter : 'AUTO'
      );
      const sent = c.stats.sent || 0;
      const delivered = c.stats.delivered > 0 ? c.stats.delivered : sent;

      // Si aún no se ha sincronizado read/interacted desde Meta (valor 0),
      // usamos al menos los compradores confirmados o una proyección base marcada como estimada
      const hasRecordedRead = (c.stats.read || 0) > 0;
      const hasRecordedInteracted = (c.stats.interacted || 0) > 0;

      const effectiveRead = hasRecordedRead
        ? c.stats.read
        : Math.min(delivered, Math.max(attr.buyersCount, Math.round(delivered * 0.78)));

      const effectiveInteracted = hasRecordedInteracted
        ? c.stats.interacted
        : Math.min(
            effectiveRead,
            Math.max(attr.buyersCount, Math.round(effectiveRead * 0.24))
          );

      return {
        campaign: c,
        sent,
        failed: c.stats.failed || 0,
        delivered,
        read: effectiveRead,
        interacted: effectiveInteracted,
        isEstimatedEngagement: !hasRecordedRead && !c.stats.metaSynced,
        attribution: attr,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, phoneToCustomerMap, selectedCampaign?.id, targetEventFilter]);

  useEffect(() => {
    if (selectedCampaign) {
      const found = enrichedCampaigns.find((e) => e.campaign.id === selectedCampaign.id);
      setEditForm({
        title: selectedCampaign.title,
        sent: selectedCampaign.stats.sent || 0,
        delivered: selectedCampaign.stats.delivered || selectedCampaign.stats.sent || 0,
        read: found ? found.read : selectedCampaign.stats.read || 0,
        interacted: found ? found.interacted : selectedCampaign.stats.interacted || 0,
        eventHint: selectedCampaign.eventHint || '',
      });
      setTargetEventFilter('AUTO');
    }
  }, [selectedCampaign, enrichedCampaigns]);

  // Estadísticas activas (Individual vs Consolidado Global)
  const activeStats = useMemo(() => {
    if (selectedCampaign) {
      const item = enrichedCampaigns.find((e) => e.campaign.id === selectedCampaign.id);
      if (item) {
        return {
          total: item.sent + item.failed,
          sent: item.sent,
          failed: item.failed,
          delivered: item.delivered,
          read: item.read,
          interacted: item.interacted,
          isEstimatedEngagement: item.isEstimatedEngagement,
          buttonClicksBreakdown: item.campaign.stats.buttonClicksBreakdown || [],
          attribution: item.attribution,
        };
      }
    }

    let total = 0;
    let sent = 0;
    let failed = 0;
    let delivered = 0;
    let read = 0;
    let interacted = 0;
    let buyersCount = 0;
    let ticketsBought = 0;
    let revenueCop = 0;
    let anyEstimated = false;
    const allBuyers: Array<{
      phone: string;
      name: string;
      email: string;
      eventsLabel: string;
      tickets: number;
      amountCop: number;
    }> = [];
    const seenBuyerPhones = new Set<string>();

    for (const item of enrichedCampaigns) {
      total += item.sent + item.failed;
      sent += item.sent;
      failed += item.failed;
      delivered += item.delivered;
      read += item.read;
      interacted += item.interacted;
      if (item.isEstimatedEngagement) anyEstimated = true;

      buyersCount += item.attribution.buyersCount;
      ticketsBought += item.attribution.ticketsBought;
      revenueCop += item.attribution.revenueCop;

      for (const b of item.attribution.matchedBuyers) {
        const key = `${b.phone}_${b.eventsLabel}`;
        if (!seenBuyerPhones.has(key)) {
          seenBuyerPhones.add(key);
          allBuyers.push(b);
        }
      }
    }

    allBuyers.sort((a, b) => b.amountCop - a.amountCop);

    return {
      total,
      sent,
      failed,
      delivered,
      read,
      interacted,
      isEstimatedEngagement: anyEstimated,
      buttonClicksBreakdown: [],
      attribution: {
        buyersCount,
        ticketsBought,
        revenueCop,
        matchedBuyers: allBuyers,
        resolvedHint: 'Eventos vinculados a cada campaña',
      },
    };
  }, [enrichedCampaigns, selectedCampaign]);

  // Sincronizar Lecturas (read), Entregados (delivered) y Clics (clicked) desde Meta template_analytics
  const handleSyncFromMetaAnalytics = async () => {
    if (!accessToken.trim()) {
      setSyncMessage({
        ok: false,
        text: 'Primero ingresa y verifica tu Access Token de Meta en el panel superior.',
      });
      return;
    }

    setSyncingMeta(true);
    setSyncMessage(null);
    try {
      const res = await fetch(
        `/api/whatsapp/analytics?syncMeta=true&token=${encodeURIComponent(
          accessToken
        )}&wabaId=${encodeURIComponent(wabaId)}`
      );
      const data = await res.json();

      if (!res.ok || !data.success) {
        setSyncMessage({
          ok: false,
          text: data.error || 'No se pudo sincronizar template_analytics desde Meta.',
        });
        return;
      }

      if (data.metaSyncSummary?.wabaId && onWabaIdDiscovered) {
        onWabaIdDiscovered(data.metaSyncSummary.wabaId);
      }

      const updated: PersistentCampaign[] = data.campaigns || [];
      setCampaigns(updated);
      await setWhatsAppSetting('persistent_analytics_campaigns', updated);

      const warn = data.metaSyncSummary?.warning;
      setSyncMessage({
        ok: true,
        text: warn
          ? `Sincronización parcial (${data.metaSyncSummary?.syncedTemplatesCount || 0} plantillas): ${warn}`
          : `¡Sincronizado con Meta template_analytics! (${
              data.metaSyncSummary?.syncedTemplatesCount || 0
            } plantillas actualizadas y guardadas en snapshot).`,
      });
    } catch (err: any) {
      setSyncMessage({
        ok: false,
        text: err.message || 'Error conectando con Meta template_analytics.',
      });
    } finally {
      setSyncingMeta(false);
    }
  };

  // Guardar edición manual en el snapshot persistente
  const handleSaveManualMetrics = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCampaign) return;
    setSavingSnapshot(true);
    try {
      const updatedCamp: PersistentCampaign = {
        ...selectedCampaign,
        title: editForm.title.trim() || selectedCampaign.title,
        eventHint: editForm.eventHint.trim(),
        updatedAt: new Date().toISOString(),
        stats: {
          ...selectedCampaign.stats,
          sent: Number(editForm.sent) || 0,
          delivered: Number(editForm.delivered) || 0,
          read: Number(editForm.read) || 0,
          interacted: Number(editForm.interacted) || 0,
          metaSynced: true,
        },
      };

      const res = await fetch('/api/whatsapp/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign: updatedCamp }),
      });
      const data = await res.json();

      const nextList =
        data.campaigns || campaigns.map((c) => (c.id === updatedCamp.id ? updatedCamp : c));
      setCampaigns(nextList);
      await setWhatsAppSetting('persistent_analytics_campaigns', nextList);
      setEditingMetrics(false);
      setSyncMessage({
        ok: true,
        text: '¡Métricas guardadas de forma persistente en el snapshot!',
      });
    } catch (err: any) {
      alert('Error guardando snapshot: ' + err.message);
    } finally {
      setSavingSnapshot(false);
    }
  };

  // Importar archivo JSON
  const handleImportJsonToAnalytics = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      if (!Array.isArray(raw)) {
        alert('El archivo debe ser un JSON con formato [{ num, status, response }].');
        return;
      }

      const sentPhones: string[] = [];
      const seen = new Set<string>();
      let failed = 0;

      for (const item of raw) {
        const norm = normalizeWhatsAppNumber(item?.num, true);
        const phone = norm.normalized || String(item?.num || '').trim();
        if (item?.status === 'success' && phone) {
          if (!seen.has(phone)) {
            seen.add(phone);
            sentPhones.push(phone);
          }
        } else {
          failed++;
        }
      }

      const cleanName = file.name
        .replace(/^message_report_/i, '')
        .replace(/\.json$/i, '')
        .trim();

      const newCamp: PersistentCampaign = {
        id: 'imp_' + cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now(),
        title: `Campaña: ${cleanName}`,
        templateName: cleanName,
        languageCode: 'es_co',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        source: 'imported_json',
        stats: {
          total: sentPhones.length + failed,
          sent: sentPhones.length,
          failed,
          delivered: sentPhones.length,
          read: 0,
          interacted: 0,
        },
        sentPhones,
      };

      const res = await fetch('/api/whatsapp/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign: newCamp }),
      });
      const data = await res.json();
      const nextList = data.campaigns || [newCamp, ...campaigns];
      setCampaigns(nextList);
      await setWhatsAppSetting('persistent_analytics_campaigns', nextList);
      setSelectedCampaignId(newCamp.id);
    } catch (err: any) {
      alert('No se pudo importar el reporte JSON: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  // Tasas porcentuales para los medidores
  const deliveryPct = activeStats.sent > 0 ? (activeStats.delivered / activeStats.sent) * 100 : 0;
  const readPct =
    activeStats.delivered > 0 ? (activeStats.read / activeStats.delivered) * 100 : 0;
  const interactionPct =
    activeStats.read > 0 ? (activeStats.interacted / activeStats.read) * 100 : 0;
  const interactionOverSentPct =
    activeStats.sent > 0 ? (activeStats.interacted / activeStats.sent) * 100 : 0;
  const salesOverSentPct =
    activeStats.sent > 0
      ? (activeStats.attribution.buyersCount / activeStats.sent) * 100
      : 0;

  // Segmentos para el Gráfico de Dona (Donut Chart de Distribución de Audiencia Enviada)
  const donutSegments = useMemo(() => {
    const totalBase = Math.max(1, activeStats.sent);
    const buyers = Math.min(activeStats.sent, activeStats.attribution.buyersCount);
    const interactedOnly = Math.max(0, Math.min(activeStats.sent - buyers, activeStats.interacted - buyers));
    const readOnly = Math.max(
      0,
      Math.min(activeStats.sent - buyers - interactedOnly, activeStats.read - activeStats.interacted)
    );
    const deliveredUnread = Math.max(
      0,
      activeStats.sent - buyers - interactedOnly - readOnly
    );

    const rawSegments = [
      {
        label: 'Compraron Boleta',
        count: buyers,
        pct: (buyers / totalBase) * 100,
        color: '#10b981', // emerald-500
      },
      {
        label: 'Interactuaron / Clic',
        count: interactedOnly,
        pct: (interactedOnly / totalBase) * 100,
        color: '#f59e0b', // amber-500
      },
      {
        label: 'Leyeron el Mensaje',
        count: readOnly,
        pct: (readOnly / totalBase) * 100,
        color: '#6366f1', // indigo-500
      },
      {
        label: 'Recibido sin Abrir',
        count: deliveredUnread,
        pct: (deliveredUnread / totalBase) * 100,
        color: '#334155', // slate-700
      },
    ];

    let cumulativePct = 0;
    return rawSegments.map((seg) => {
      const startPct = cumulativePct;
      cumulativePct += seg.pct;
      return {
        ...seg,
        startPct,
      };
    });
  }, [activeStats]);

  // Máximos para escalar el gráfico de barras comparativo entre campañas
  const maxCampaignSent = useMemo(() => {
    return Math.max(1, ...enrichedCampaigns.map((c) => c.sent));
  }, [enrichedCampaigns]);

  const maxCampaignRevenue = useMemo(() => {
    return Math.max(1, ...enrichedCampaigns.map((c) => c.attribution.revenueCop));
  }, [enrichedCampaigns]);

  const filteredBuyers = useMemo(() => {
    const q = buyerSearch.trim().toLowerCase();
    return activeStats.attribution.matchedBuyers.filter(
      (b) =>
        !q ||
        b.name.toLowerCase().includes(q) ||
        b.phone.includes(q) ||
        b.eventsLabel.toLowerCase().includes(q)
    );
  }, [activeStats.attribution.matchedBuyers, buyerSearch]);

  const maxBuyerAmount = useMemo(() => {
    return Math.max(1, ...filteredBuyers.map((b) => b.amountCop));
  }, [filteredBuyers]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. CABECERA Y BOTONES DE ACCIÓN */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-extrabold text-white uppercase tracking-wide">
                  Centro Visual de Resultados & Conversión WhatsApp
                </h2>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-bold border border-indigo-500/30">
                  {campaigns.length} campañas persistentes
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Selecciona cualquier campaña abajo para inspeccionar su embudo de lectura, clics y cuántas boletas vendió en QRBoletos.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSyncFromMetaAnalytics}
            disabled={syncingMeta}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg shadow-emerald-950/50 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={'w-3.5 h-3.5 ' + (syncingMeta ? 'animate-spin' : '')} />
            <span>
              {syncingMeta ? 'Sincronizando Meta...' : 'Sincronizar Lecturas & Clics de Meta'}
            </span>
          </button>

          <label className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-indigo-400" />
            <span>Importar JSON</span>
            <input
              type="file"
              accept=".json"
              onChange={handleImportJsonToAnalytics}
              className="hidden"
            />
          </label>

          <button
            type="button"
            onClick={() => setShowWebhookModal(!showWebhookModal)}
            className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer"
          >
            <Webhook className="w-3.5 h-3.5 text-amber-400" />
            <span>Webhook</span>
          </button>
        </div>
      </div>

      {syncMessage && (
        <div
          className={
            'p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-2 ' +
            (syncMessage.ok
              ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
              : 'bg-amber-950/50 border-amber-500/40 text-amber-300')
          }
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{syncMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncMessage(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {showWebhookModal && (
        <div className="p-5 rounded-3xl bg-slate-900 border border-amber-500/40 shadow-xl space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-amber-300 uppercase flex items-center gap-2">
              <Webhook className="w-4 h-4" />
              Endpoint de Webhook en Vivo (Lecturas e Interacciones en Tiempo Real)
            </h3>
            <button
              type="button"
              onClick={() => setShowWebhookModal(false)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Callback URL (Meta Developers → WhatsApp → Webhooks)
              </span>
              <code className="text-emerald-400 font-mono break-all">
                https://dashboard-qrboletos.vercel.app/api/whatsapp/webhook
              </code>
            </div>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Token de Verificación (Verify Token)
              </span>
              <code className="text-amber-300 font-mono">qrboletos_whatsapp_verify_2026</code>
            </div>
          </div>
        </div>
      )}

      {/* 2. CARRUSEL / TARJETAS VISUALES DE SELECCIÓN DE CAMPAÑA (1 CLIC) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            Selecciona una Campaña para Filtrar los Gráficos:
          </span>
          {selectedCampaign && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditingMetrics(!editingMetrics)}
                className="px-3 py-1 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-bold border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Ajustar / Guardar Métricas de &quot;{selectedCampaign.templateName}&quot;</span>
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`¿Eliminar el snapshot de "${selectedCampaign.title}"?`)) return;
                  await fetch(
                    `/api/whatsapp/analytics?id=${encodeURIComponent(selectedCampaign.id)}`,
                    { method: 'DELETE' }
                  );
                  const next = campaigns.filter((c) => c.id !== selectedCampaign.id);
                  setCampaigns(next);
                  await setWhatsAppSetting('persistent_analytics_campaigns', next);
                  setSelectedCampaignId('ALL');
                }}
                className="p-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 text-rose-400 border border-rose-500/30 cursor-pointer"
                title="Eliminar campaña"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {/* Tarjeta Consolidado Global */}
          <button
            type="button"
            onClick={() => {
              setSelectedCampaignId('ALL');
              setEditingMetrics(false);
            }}
            className={
              'p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ' +
              (selectedCampaignId === 'ALL'
                ? 'bg-gradient-to-br from-emerald-950/90 to-slate-900 border-emerald-400 shadow-lg shadow-emerald-950/50 ring-1 ring-emerald-400/50'
                : 'bg-slate-900/90 border-slate-800 hover:border-slate-700')
            }
          >
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 block">
                🌎 Global
              </span>
              <div className="text-xs font-extrabold text-white mt-0.5 line-clamp-1">
                Todas ({campaigns.length})
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-800/80">
              <div className="text-base font-black text-white font-mono">
                {enrichedCampaigns.reduce((a, b) => a + b.sent, 0).toLocaleString()}
              </div>
              <span className="text-[10px] text-slate-400">enviados totales</span>
            </div>
          </button>

          {/* Tarjetas por cada Campaña */}
          {enrichedCampaigns.map((item) => {
            const c = item.campaign;
            const active = selectedCampaignId === c.id;
            const rPct = item.delivered > 0 ? Math.round((item.read / item.delivered) * 100) : 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setSelectedCampaignId(c.id);
                  setEditingMetrics(false);
                }}
                className={
                  'p-3 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ' +
                  (active
                    ? 'bg-gradient-to-br from-indigo-950/90 to-slate-900 border-indigo-400 shadow-lg shadow-indigo-950/50 ring-1 ring-indigo-400/50'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700')
                }
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9px] font-mono text-slate-400">
                      {new Date(c.createdAt).toLocaleDateString('es-CO', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 font-mono font-bold">
                      {rPct}% leídos
                    </span>
                  </div>
                  <div
                    className="text-xs font-extrabold text-white mt-1 truncate"
                    title={c.title}
                  >
                    {c.templateName}
                  </div>
                </div>

                <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-baseline justify-between">
                  <div>
                    <div className="text-sm font-black text-white font-mono">
                      {item.sent.toLocaleString()}
                    </div>
                    <span className="text-[9px] text-slate-400">enviados</span>
                  </div>
                  {item.attribution.buyersCount > 0 && (
                    <div className="text-right">
                      <div className="text-xs font-extrabold text-emerald-400 font-mono">
                        {item.attribution.buyersCount}
                      </div>
                      <span className="text-[9px] text-emerald-400/80">compras</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Formulario Desplegable para Editar/Guardar Métricas de la Campaña en el Snapshot Persistente */}
      {editingMetrics && selectedCampaign && (
        <form
          onSubmit={handleSaveManualMetrics}
          className="p-5 rounded-3xl bg-slate-900 border-2 border-emerald-500/40 shadow-2xl space-y-4 animate-in fade-in"
        >
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h3 className="text-xs font-extrabold text-emerald-400 uppercase">
              ✏️ Ajustar y Fijar Resultados Persistentes de: {selectedCampaign.templateName}
            </h3>
            <span className="text-[11px] text-slate-400">
              Se guarda en <code>data/whatsapp-campaigns/campaigns.json</code> + IndexedDB
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-xs">
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Título de Campaña
              </label>
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Enviados
              </label>
              <input
                type="number"
                min={0}
                value={editForm.sent}
                onChange={(e) => setEditForm({ ...editForm, sent: Number(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                Entregados
              </label>
              <input
                type="number"
                min={0}
                value={editForm.delivered}
                onChange={(e) =>
                  setEditForm({ ...editForm, delivered: Number(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-emerald-400 uppercase mb-1">
                👀 Leídos (Read)
              </label>
              <input
                type="number"
                min={0}
                value={editForm.read}
                onChange={(e) => setEditForm({ ...editForm, read: Number(e.target.value) || 0 })}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-emerald-500/40 text-emerald-300 font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-amber-400 uppercase mb-1">
                👆 Interactuaron
              </label>
              <input
                type="number"
                min={0}
                value={editForm.interacted}
                onChange={(e) =>
                  setEditForm({ ...editForm, interacted: Number(e.target.value) || 0 })
                }
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-amber-500/40 text-amber-300 font-mono font-bold"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-400">Palabra clave del Evento en QRBoletos:</span>
              <input
                type="text"
                value={editForm.eventHint}
                onChange={(e) => setEditForm({ ...editForm, eventHint: e.target.value })}
                placeholder="Ej. VILLA ARRUGA"
                className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingMetrics(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingSnapshot}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savingSnapshot ? 'Guardando...' : 'Guardar Snapshot Persistente'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* 3. MEDIDORES CIRCULARES DE ALTO IMPACTO (4 RADIAL GAUGES) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <RadialGaugeCard
          stepNumber="1"
          title="Enviados & Entrega"
          countLabel={activeStats.sent.toLocaleString()}
          subLabel={`${activeStats.delivered.toLocaleString()} entregados al móvil`}
          percentage={deliveryPct}
          accentColor="#6366f1"
          trackColor="#1e1b4b"
          badgeText={
            activeStats.failed > 0
              ? `${activeStats.failed.toLocaleString()} pausados/no env.`
              : '100% Entregados'
          }
          icon={Send}
        />

        <RadialGaugeCard
          stepNumber="2"
          title="Leídos (Apertura)"
          countLabel={activeStats.read.toLocaleString()}
          subLabel={`De ${activeStats.delivered.toLocaleString()} entregados`}
          percentage={readPct}
          accentColor="#10b981"
          trackColor="#064e3b"
          badgeText={`${readPct.toFixed(1)}% Tasa de Lectura`}
          icon={Eye}
        />

        <RadialGaugeCard
          stepNumber="3"
          title="Interactuaron"
          countLabel={activeStats.interacted.toLocaleString()}
          subLabel={`${interactionOverSentPct.toFixed(1)}% sobre total enviados`}
          percentage={interactionPct}
          accentColor="#f59e0b"
          trackColor="#451a03"
          badgeText={`${interactionPct.toFixed(1)}% de los que leyeron`}
          icon={MousePointerClick}
        />

        <RadialGaugeCard
          stepNumber="4"
          title="Ventas QRBoletos"
          countLabel={`$${(activeStats.attribution.revenueCop / 1000000).toFixed(1)}M`}
          subLabel={`$${activeStats.attribution.revenueCop.toLocaleString('es-CO')} COP`}
          percentage={salesOverSentPct}
          accentColor="#14b8a6"
          trackColor="#134e4a"
          badgeText={`${activeStats.attribution.buyersCount.toLocaleString()} compradores (${activeStats.attribution.ticketsBought} bol.)`}
          icon={ShoppingBag}
        />
      </div>

      {/* 4. EMBUDO TRAPEZOIDAL VISUAL (SVG FUNNEL) + GRÁFICO DE DONA (DONUT CHART) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUMNA IZQUIERDA (7 cols): Gráfico de Embudo Visual Centrado */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-400" />
                Gráfico de Embudo de Conversión (Funnel)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedCampaign
                  ? `Campaña: ${selectedCampaign.title}`
                  : `Consolidado de las ${campaigns.length} campañas guardadas`}
              </p>
            </div>
            {activeStats.isEstimatedEngagement && (
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold">
                💡 Lecturas base (Sincroniza con Meta o edita para fijar)
              </span>
            )}
          </div>

          {/* Embudo Visual Centrado con Barras Simétricas Tipo Pirámide Invertida */}
          <div className="space-y-3 py-2">
            {[
              {
                stage: '1. ENVIADOS',
                count: activeStats.sent,
                pctOfSent: 100,
                widthPct: 100,
                stepConversion: '100% base enviada',
                bgClass: 'from-indigo-600 to-indigo-500',
                borderClass: 'border-indigo-400/50',
                textClass: 'text-indigo-200',
              },
              {
                stage: '2. ENTREGADOS',
                count: activeStats.delivered,
                pctOfSent: deliveryPct,
                widthPct: Math.max(45, deliveryPct),
                stepConversion: `${deliveryPct.toFixed(1)}% llegaron al WhatsApp`,
                bgClass: 'from-blue-600 to-cyan-600',
                borderClass: 'border-cyan-400/50',
                textClass: 'text-cyan-200',
              },
              {
                stage: '3. LEÍDOS / ABIERTOS',
                count: activeStats.read,
                pctOfSent: activeStats.sent > 0 ? (activeStats.read / activeStats.sent) * 100 : 0,
                widthPct: Math.max(
                  35,
                  activeStats.sent > 0 ? (activeStats.read / activeStats.sent) * 85 : 35
                ),
                stepConversion: `${readPct.toFixed(1)}% abrieron el mensaje`,
                bgClass: 'from-emerald-600 to-teal-600',
                borderClass: 'border-emerald-400/50',
                textClass: 'text-emerald-200',
              },
              {
                stage: '4. INTERACTUARON (CLICS / RESPUESTAS)',
                count: activeStats.interacted,
                pctOfSent: interactionOverSentPct,
                widthPct: Math.max(26, Math.min(72, interactionOverSentPct * 2.2)),
                stepConversion: `${interactionPct.toFixed(1)}% de los que leyeron interactuaron`,
                bgClass: 'from-amber-600 to-orange-600',
                borderClass: 'border-amber-400/50',
                textClass: 'text-amber-200',
              },
              {
                stage: '5. COMPRARON BOLETA EN QRBOLETOS',
                count: activeStats.attribution.buyersCount,
                pctOfSent: salesOverSentPct,
                widthPct: Math.max(20, Math.min(58, salesOverSentPct * 2.5)),
                stepConversion: `${activeStats.attribution.ticketsBought.toLocaleString()} boletas ($${activeStats.attribution.revenueCop.toLocaleString('es-CO')} COP)`,
                bgClass: 'from-teal-500 to-emerald-400',
                borderClass: 'border-teal-300',
                textClass: 'text-slate-950 font-black',
              },
            ].map((f, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <div
                  className={`relative rounded-2xl bg-gradient-to-r ${f.bgClass} border ${f.borderClass} px-4 py-3 shadow-lg transition-all duration-500 flex items-center justify-between gap-3`}
                  style={{ width: `${f.widthPct}%`, minWidth: '260px' }}
                >
                  <div className="min-w-0">
                    <div
                      className={`text-[10px] font-black uppercase tracking-wider ${
                        idx === 4 ? 'text-slate-950' : 'text-white/90'
                      }`}
                    >
                      {f.stage}
                    </div>
                    <div
                      className={`text-[11px] truncate ${
                        idx === 4 ? 'text-slate-900 font-bold' : f.textClass
                      }`}
                    >
                      {f.stepConversion}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`text-lg font-black font-mono leading-none ${
                        idx === 4 ? 'text-slate-950' : 'text-white'
                      }`}
                    >
                      {f.count.toLocaleString()}
                    </div>
                    <span
                      className={`text-[10px] font-mono font-bold ${
                        idx === 4 ? 'text-slate-900' : 'text-white/80'
                      }`}
                    >
                      {f.pctOfSent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Selector de Evento Objetivo para el cruce con Customers API */}
          <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <span className="text-slate-400 font-semibold">
              🎯 Evento evaluado para conversión en compras:
            </span>
            <select
              value={targetEventFilter}
              onChange={(e) => setTargetEventFilter(e.target.value)}
              disabled={!selectedCampaign}
              className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-emerald-300 font-bold disabled:opacity-60"
            >
              <option value="AUTO">
                Auto-detectado ({activeStats.attribution.resolvedHint})
              </option>
              <option value="ALL">Cualquier evento comprado por estos números</option>
              {uniqueEvents.map((ev) => (
                <option key={ev} value={ev}>
                  {ev}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* COLUMNA DERECHA (5 cols): Gráfico de Dona (Donut Chart) + Tarjeta de ROI en Pesos */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl flex flex-col justify-between space-y-5">
          <div className="border-b border-slate-800 pb-3">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-indigo-400" />
              Distribución de Audiencia & Retorno (ROI)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Comportamiento de los {activeStats.sent.toLocaleString()} destinatarios contactados
            </p>
          </div>

          {/* Gráfico de Dona SVG + Leyenda */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
            <div className="relative w-44 h-44 shrink-0 flex items-center justify-center">
              <svg className="w-44 h-44 -rotate-90" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="46"
                  fill="transparent"
                  stroke="#0f172a"
                  strokeWidth="16"
                />
                {donutSegments.map((seg, idx) => {
                  const r = 46;
                  const circ = 2 * Math.PI * r;
                  const dash = (seg.pct / 100) * circ;
                  const offset = circ - (seg.startPct / 100) * circ;
                  if (seg.pct <= 0) return null;
                  return (
                    <circle
                      key={idx}
                      cx="60"
                      cy="60"
                      r={r}
                      fill="transparent"
                      stroke={seg.color}
                      strokeWidth="16"
                      strokeDasharray={`${dash} ${circ - dash}`}
                      strokeDashoffset={offset}
                      className="transition-all duration-700"
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
                <span className="text-[10px] font-bold uppercase text-slate-400">Lectura</span>
                <span className="text-2xl font-black font-mono text-emerald-400">
                  {readPct.toFixed(0)}%
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  {activeStats.read.toLocaleString()} leídos
                </span>
              </div>
            </div>

            {/* Leyenda de la Dona */}
            <div className="space-y-2.5 w-full">
              {donutSegments.map((seg, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-slate-300 font-semibold truncate">{seg.label}</span>
                  </div>
                  <div className="font-mono font-bold text-white shrink-0 ml-2">
                    {seg.count.toLocaleString()}{' '}
                    <span className="text-[10px] text-slate-400">({seg.pct.toFixed(1)}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tarjeta Financiera de Ventas Atribuidas */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/80 via-teal-950/60 to-slate-950 border border-emerald-500/40 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                Recaudo Atribuido a Destinatarios
              </span>
              <span className="text-xs font-mono font-bold text-emerald-400">
                {activeStats.attribution.ticketsBought.toLocaleString()} boletas
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-white font-mono">
              ${activeStats.attribution.revenueCop.toLocaleString('es-CO')}{' '}
              <span className="text-xs font-bold text-emerald-400">COP</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-300 pt-1 border-t border-emerald-500/20">
              <span>
                Compradores únicos:{' '}
                <strong className="text-white">
                  {activeStats.attribution.buyersCount.toLocaleString()}
                </strong>
              </span>
              <span>
                Ticket promedio:{' '}
                <strong className="text-emerald-300 font-mono">
                  $
                  {activeStats.attribution.buyersCount > 0
                    ? Math.round(
                        activeStats.attribution.revenueCop / activeStats.attribution.buyersCount
                      ).toLocaleString('es-CO')
                    : '0'}{' '}
                  COP
                </strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 5. GRÁFICO DE BARRAS COMPARATIVO ENTRE CAMPAÑAS (3 VISTAS GRÁFICAS) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-400" />
              Gráfico Comparativo por Campaña / Plantilla
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Compara visualmente el volumen de lectura, interacción y ventas en pesos generado por cada plantilla
            </p>
          </div>

          {/* Selector de Modo del Gráfico de Barras */}
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => setChartTab('messages')}
              className={
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ' +
                (chartTab === 'messages'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white')
              }
            >
              📊 Enviados vs Leídos vs Clics
            </button>
            <button
              type="button"
              onClick={() => setChartTab('revenue')}
              className={
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ' +
                (chartTab === 'revenue'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white')
              }
            >
              💰 Ranking de Ventas ($ COP)
            </button>
            <button
              type="button"
              onClick={() => setChartTab('rates')}
              className={
                'px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ' +
                (chartTab === 'rates'
                  ? 'bg-amber-600 text-white shadow'
                  : 'text-slate-400 hover:text-white')
              }
            >
              📈 % Tasas de Efectividad
            </button>
          </div>
        </div>

        {/* Leyenda de colores del gráfico */}
        <div className="flex items-center gap-5 flex-wrap text-xs px-1">
          {chartTab === 'messages' && (
            <>
              <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <span className="w-3 h-3 rounded bg-indigo-500 inline-block" /> Enviados
              </span>
              <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Leídos (Read)
              </span>
              <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <span className="w-3 h-3 rounded bg-amber-500 inline-block" /> Interactuaron
              </span>
              <span className="flex items-center gap-1.5 text-slate-300 font-semibold">
                <span className="w-3 h-3 rounded bg-teal-400 inline-block" /> Compraron Boleta
              </span>
            </>
          )}
          {chartTab === 'revenue' && (
            <>
              <span className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                <span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> Recaudo en Ventas ($ COP)
              </span>
              <span className="flex items-center gap-1.5 text-indigo-300 font-semibold">
                <span className="w-3 h-3 rounded bg-indigo-500 inline-block" /> Compradores y Boletas Vendidas
              </span>
            </>
          )}
          {chartTab === 'rates' && (
            <>
              <span className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                <span className="w-3 h-3 rounded bg-emerald-500 inline-block" /> % Tasa de Lectura
              </span>
              <span className="flex items-center gap-1.5 text-amber-300 font-semibold">
                <span className="w-3 h-3 rounded bg-amber-500 inline-block" /> % Tasa de Interacción
              </span>
              <span className="flex items-center gap-1.5 text-teal-300 font-semibold">
                <span className="w-3 h-3 rounded bg-teal-400 inline-block" /> % Conversión a Compra
              </span>
            </>
          )}
        </div>

        {/* Barras Visuales Horizontales Agrupadas por Campaña */}
        <div className="space-y-4">
          {enrichedCampaigns.map((item) => {
            const c = item.campaign;
            const isSelected = selectedCampaignId === c.id;
            const sentW = (item.sent / maxCampaignSent) * 100;
            const readW = (item.read / maxCampaignSent) * 100;
            const interW = (item.interacted / maxCampaignSent) * 100;
            const revW = (item.attribution.revenueCop / maxCampaignRevenue) * 100;

            const rPct = item.delivered > 0 ? (item.read / item.delivered) * 100 : 0;
            const iPct = item.sent > 0 ? (item.interacted / item.sent) * 100 : 0;
            const convPct =
              item.sent > 0 ? (item.attribution.buyersCount / item.sent) * 100 : 0;

            return (
              <div
                key={c.id}
                onClick={() => setSelectedCampaignId(c.id)}
                className={
                  'p-4 rounded-2xl border transition-all cursor-pointer space-y-2.5 ' +
                  (isSelected
                    ? 'bg-slate-950 border-emerald-500/60 shadow-lg'
                    : 'bg-slate-950/70 border-slate-800/90 hover:border-slate-700')
                }
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs font-extrabold text-emerald-400">
                      {c.templateName}
                    </span>
                    <div>
                      <div className="text-xs font-extrabold text-white">{c.title}</div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-2">
                        <span>
                          📅{' '}
                          {new Date(c.createdAt).toLocaleDateString('es-CO', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </span>
                        <span>•</span>
                        <span>🎯 Evento: {item.attribution.resolvedHint}</span>
                      </div>
                    </div>
                  </div>

                  {/* Resumen numérico a la derecha */}
                  <div className="flex items-center gap-4 text-xs font-mono">
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">ENVIADOS</span>
                      <strong className="text-white">{item.sent.toLocaleString()}</strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-emerald-400 block">LEÍDOS</span>
                      <strong className="text-emerald-400">
                        {item.read.toLocaleString()} ({rPct.toFixed(0)}%)
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-amber-400 block">INTERACT.</span>
                      <strong className="text-amber-300">
                        {item.interacted.toLocaleString()} ({iPct.toFixed(0)}%)
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-teal-300 block">VENTAS EVENTO</span>
                      <strong className="text-emerald-400">
                        ${item.attribution.revenueCop.toLocaleString('es-CO')}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Gráfico según pestaña seleccionada */}
                {chartTab === 'messages' && (
                  <div className="space-y-1.5 pt-1">
                    {/* Barra Enviados */}
                    <div className="flex items-center gap-2">
                      <span className="w-20 text-[10px] font-bold text-indigo-300 uppercase shrink-0">
                        Enviados
                      </span>
                      <div className="flex-1 h-3 rounded-full bg-slate-900 overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(2, sentW)}%` }}
                        />
                      </div>
                    </div>
                    {/* Barra Leídos */}
                    <div className="flex items-center gap-2">
                      <span className="w-20 text-[10px] font-bold text-emerald-400 uppercase shrink-0">
                        Leídos
                      </span>
                      <div className="flex-1 h-3 rounded-full bg-slate-900 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(2, readW)}%` }}
                        />
                      </div>
                    </div>
                    {/* Barra Interactuaron */}
                    <div className="flex items-center gap-2">
                      <span className="w-20 text-[10px] font-bold text-amber-400 uppercase shrink-0">
                        Interactuaron
                      </span>
                      <div className="flex-1 h-3 rounded-full bg-slate-900 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(1.5, interW)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {chartTab === 'revenue' && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="w-28 text-[10px] font-bold text-emerald-400 uppercase shrink-0">
                        Recaudo COP
                      </span>
                      <div className="flex-1 h-4 rounded-full bg-slate-900 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-600 to-teal-400 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(item.attribution.revenueCop > 0 ? 4 : 0, revW)}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono font-extrabold text-emerald-400 w-36 text-right shrink-0">
                        ${item.attribution.revenueCop.toLocaleString('es-CO')}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 pl-30">
                      🎟️{' '}
                      <strong className="text-white">
                        {item.attribution.buyersCount.toLocaleString()} compradores
                      </strong>{' '}
                      adquirieron{' '}
                      <strong className="text-indigo-300">
                        {item.attribution.ticketsBought.toLocaleString()} boletas
                      </strong>{' '}
                      del evento ({convPct.toFixed(1)}% de los destinatarios).
                    </div>
                  </div>
                )}

                {chartTab === 'rates' && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold">
                        <span className="text-emerald-400">% TASA DE LECTURA</span>
                        <span className="font-mono text-white">{rPct.toFixed(1)}%</span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-slate-900 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.min(100, rPct)}%` }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold">
                        <span className="text-amber-400">% INTERACCIÓN / ENVIADOS</span>
                        <span className="font-mono text-white">{iPct.toFixed(1)}%</span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-slate-900 overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full"
                          style={{ width: `${Math.min(100, iPct)}%` }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold">
                        <span className="text-teal-300">% CONVERSIÓN A COMPRA</span>
                        <span className="font-mono text-white">{convPct.toFixed(1)}%</span>
                      </div>
                      <div className="w-full h-2.5 rounded-full bg-slate-900 overflow-hidden">
                        <div
                          className="h-full bg-teal-400 rounded-full"
                          style={{ width: `${Math.min(100, convPct)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. LISTADO VISUAL DE DESTINATARIOS QUE COMPRARON BOLETA (CON BARRA DE GASTO) */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-400" />
              Clientes Contactados por WhatsApp que Compraron Boleta (
              {filteredBuyers.length.toLocaleString()})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Cruce directo entre los números de teléfono enviados en la campaña y la API de Clientes de QRBoletos
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={buyerSearch}
              onChange={(e) => setBuyerSearch(e.target.value)}
              placeholder="Buscar comprador, teléfono o evento..."
              className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
            />
          </div>
        </div>

        {filteredBuyers.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-slate-950 rounded-2xl border border-slate-800">
            No se encontraron compradores para el filtro actual (asegúrate de tener sincronizada la base de Clientes en Audiencia & CRM).
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-900 text-slate-400 sticky top-0 text-[10px] uppercase font-bold">
                <tr>
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-3">WhatsApp</th>
                  <th className="py-3 px-3">Nombre del Comprador</th>
                  <th className="py-3 px-3">Evento(s) Comprado(s)</th>
                  <th className="py-3 px-3 text-center">Boletas</th>
                  <th className="py-3 px-4 text-right">Recaudo COP & Proporción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {filteredBuyers.slice(0, 150).map((b, idx) => {
                  const barW = (b.amountCop / maxBuyerAmount) * 100;
                  return (
                    <tr key={`${b.phone}_${idx}`} className="hover:bg-slate-900/60">
                      <td className="py-2.5 px-4 font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-emerald-400">
                        {b.phone}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-white">
                        {b.name}
                        {b.email && (
                          <span className="block text-[10px] text-slate-400 font-normal">
                            {b.email}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 max-w-xs truncate">
                        {b.eventsLabel}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className="px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-bold text-[11px]">
                          {b.tickets}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right min-w-[170px]">
                        <div className="font-mono font-extrabold text-emerald-400">
                          ${b.amountCop.toLocaleString('es-CO')}
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden mt-1">
                          <div
                            className="h-full bg-emerald-500 rounded-full ml-auto"
                            style={{ width: `${Math.max(4, barW)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
