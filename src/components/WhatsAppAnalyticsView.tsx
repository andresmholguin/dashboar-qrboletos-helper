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
  DollarSign,
  TrendingUp,
  Award,
  Sparkles,
  Check,
  X,
  Webhook,
  Copy,
  ChevronDown,
  ChevronUp,
  AlertCircle
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
  const [showBuyersList, setShowBuyersList] = useState(false);
  const [showWebhookModal, setShowWebhookModal] = useState(false);

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

      // Combinar con las guardadas localmente en IndexedDB por si en Vercel se editaron en el navegador
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

  // Campaña seleccionada actualmente (o null si está en vista global 'ALL')
  const selectedCampaign = useMemo(() => {
    if (selectedCampaignId === 'ALL') return null;
    return campaigns.find((c) => c.id === selectedCampaignId) || null;
  }, [campaigns, selectedCampaignId]);

  // Al cambiar la campaña seleccionada, inicializar el formulario de edición y auto-seleccionar evento vinculado
  useEffect(() => {
    if (selectedCampaign) {
      setEditForm({
        title: selectedCampaign.title,
        sent: selectedCampaign.stats.sent || 0,
        delivered: selectedCampaign.stats.delivered || selectedCampaign.stats.sent || 0,
        read: selectedCampaign.stats.read || 0,
        interacted: selectedCampaign.stats.interacted || 0,
        eventHint: selectedCampaign.eventHint || '',
      });
      setTargetEventFilter('AUTO');
    }
  }, [selectedCampaign]);

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
            } plantillas con métricas actualizadas y guardadas en snapshot).`,
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

  // Guardar edición manual o actualización de una campaña en el snapshot persistente (disco + IndexedDB)
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
        },
      };

      const res = await fetch('/api/whatsapp/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign: updatedCamp }),
      });
      const data = await res.json();

      const nextList = data.campaigns || campaigns.map((c) => (c.id === updatedCamp.id ? updatedCamp : c));
      setCampaigns(nextList);
      await setWhatsAppSetting('persistent_analytics_campaigns', nextList);
      setEditingMetrics(false);
      setSyncMessage({
        ok: true,
        text: 'Snapshot de resultados guardado de forma persistente.',
      });
    } catch (err: any) {
      alert('Error guardando snapshot: ' + err.message);
    } finally {
      setSavingSnapshot(false);
    }
  };

  // Importar un archivo message_report_*.json y guardarlo como campaña persistente
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
        title: `Reporte Importado: ${cleanName}`,
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

      // Filtrar eventos del cliente que coincidan con el evento de la campaña (o todos si hint === 'ALL' / vacío)
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

  // Estadísticas consolidadas (de la campaña seleccionada o suma global de todas)
  const activeStats = useMemo(() => {
    if (selectedCampaign) {
      const s = selectedCampaign.stats;
      const attribution = computeCampaignSalesAttribution(selectedCampaign, targetEventFilter);
      return {
        total: s.total || s.sent,
        sent: s.sent || 0,
        failed: s.failed || 0,
        delivered: s.delivered || s.sent || 0,
        read: s.read || 0,
        interacted: s.interacted || 0,
        costUsd: s.costUsd || 0,
        buttonClicksBreakdown: s.buttonClicksBreakdown || [],
        attribution,
      };
    }

    // Consolidado Global de todas las campañas
    let total = 0;
    let sent = 0;
    let failed = 0;
    let delivered = 0;
    let read = 0;
    let interacted = 0;
    let costUsd = 0;
    let buyersCount = 0;
    let ticketsBought = 0;
    let revenueCop = 0;

    for (const c of campaigns) {
      total += c.stats.total || c.stats.sent || 0;
      sent += c.stats.sent || 0;
      failed += c.stats.failed || 0;
      delivered += c.stats.delivered || c.stats.sent || 0;
      read += c.stats.read || 0;
      interacted += c.stats.interacted || 0;
      costUsd += c.stats.costUsd || 0;

      const attr = computeCampaignSalesAttribution(c);
      buyersCount += attr.buyersCount;
      ticketsBought += attr.ticketsBought;
      revenueCop += attr.revenueCop;
    }

    return {
      total,
      sent,
      failed,
      delivered,
      read,
      interacted,
      costUsd,
      buttonClicksBreakdown: [],
      attribution: {
        buyersCount,
        ticketsBought,
        revenueCop,
        matchedBuyers: [],
        resolvedHint: 'Evento correspondiente a cada campaña',
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns, selectedCampaign, targetEventFilter, phoneToCustomerMap]);

  const deliveryRate =
    activeStats.sent > 0 ? ((activeStats.delivered / activeStats.sent) * 100).toFixed(1) : '0.0';
  const readRate =
    activeStats.delivered > 0
      ? ((activeStats.read / activeStats.delivered) * 100).toFixed(1)
      : '0.0';
  const interactionRate =
    activeStats.sent > 0
      ? ((activeStats.interacted / activeStats.sent) * 100).toFixed(1)
      : '0.0';
  const salesConversionRate =
    activeStats.sent > 0
      ? ((activeStats.attribution.buyersCount / activeStats.sent) * 100).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Barra Superior de Controles de Analítica y Sincronización con Meta */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-extrabold text-white uppercase tracking-wide">
              Resultados Persistentes & Analítica de Campañas WhatsApp
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-bold border border-indigo-500/30">
              {campaigns.length} campañas guardadas
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Visualiza enviados, entregados, lecturas, interacciones y conversión real en ventas de boletas cruzada con Customers API.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSyncFromMetaAnalytics}
            disabled={syncingMeta}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg cursor-pointer disabled:opacity-50"
            title="Consultar entregados, leídos y clics oficiales desde Meta template_analytics"
          >
            <RefreshCw className={'w-3.5 h-3.5 ' + (syncingMeta ? 'animate-spin' : '')} />
            <span>
              {syncingMeta ? 'Sincronizando con Meta...' : 'Sincronizar Lecturas & Clics de Meta'}
            </span>
          </button>

          <label className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer">
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
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer"
          >
            <Webhook className="w-3.5 h-3.5 text-amber-400" />
            <span>Webhook en Vivo</span>
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

      {/* Panel Desplegable de Configuración del Webhook en Vivo */}
      {showWebhookModal && (
        <div className="p-5 rounded-3xl bg-slate-900 border border-amber-500/40 shadow-xl space-y-3 text-xs">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-amber-300 uppercase flex items-center gap-2">
              <Webhook className="w-4 h-4" />
              Configuración de Webhook para Lecturas (Read) e Interacciones en Tiempo Real
            </h3>
            <button
              type="button"
              onClick={() => setShowWebhookModal(false)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-slate-300 leading-relaxed">
            Además del botón <strong>&quot;Sincronizar Lecturas & Clics de Meta&quot;</strong> (que consulta{' '}
            <code className="text-emerald-300">template_analytics</code> sin tocar tu webhook), ya tienes activo el endpoint de Webhook en tu servidor para recibir confirmaciones de lectura (<code className="text-emerald-300">read</code>) y respuestas entrantes número por número:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                Callback URL (En Meta Developers → WhatsApp → Configuración)
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

      {/* Selector de Campaña a Visualizar + Filtro de Evento para Conversión */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-900/90 border border-slate-800 p-4 rounded-3xl">
        <div className="md:col-span-6">
          <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
            Seleccionar Campaña / Plantilla Guardada
          </label>
          <select
            value={selectedCampaignId}
            onChange={(e) => {
              setSelectedCampaignId(e.target.value);
              setEditingMetrics(false);
            }}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-bold"
          >
            <option value="ALL">
              🌎 CONSOLIDADO GLOBAL ({campaigns.length} campañas —{' '}
              {campaigns.reduce((a, c) => a + (c.stats.sent || 0), 0).toLocaleString()} enviados)
            </option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                📌 {c.title} [{c.templateName}] — {c.stats.sent.toLocaleString()} env. |{' '}
                {new Date(c.createdAt).toLocaleDateString('es-CO')}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-4">
          <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
            Cruzar Ventas con Evento de QRBoletos (ROI)
          </label>
          <select
            value={targetEventFilter}
            onChange={(e) => setTargetEventFilter(e.target.value)}
            disabled={!selectedCampaign}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white disabled:opacity-60"
          >
            <option value="AUTO">
              🎯 Auto-detectado ({activeStats.attribution.resolvedHint})
            </option>
            <option value="ALL">Todos los eventos comprados por estos números</option>
            {uniqueEvents.map((ev) => (
              <option key={ev} value={ev}>
                {ev}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2 flex items-end gap-2">
          {selectedCampaign && (
            <>
              <button
                type="button"
                onClick={() => setEditingMetrics(!editingMetrics)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 border border-slate-700 cursor-pointer"
                title="Actualizar o registrar manualmente lecturas e interacciones"
              >
                <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Editar Datos</span>
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
                className="p-2.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 text-rose-400 border border-rose-500/30 cursor-pointer"
                title="Eliminar campaña"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
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
              ✏️ Actualizar Resultados Persistentes de: {selectedCampaign.templateName}
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

          <div className="flex items-center justify-between pt-2">
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

      {/* TARJETAS DE KPIS PRINCIPALES (5 Tarjetas) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="p-4 rounded-3xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase">
            <span>1. Enviados</span>
            <Send className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-white font-mono mt-1.5">
            {activeStats.sent.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {activeStats.failed > 0 ? `${activeStats.failed.toLocaleString()} no enviados` : '100% aceptados'}
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900 border border-indigo-500/30 shadow-lg">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-300 uppercase">
            <span>2. Entregados</span>
            <CheckCircle2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-black text-indigo-300 font-mono mt-1.5">
            {activeStats.delivered.toLocaleString()}
          </div>
          <div className="text-[11px] text-indigo-400/90 font-semibold mt-1">
            {deliveryRate}% tasa de entrega
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900 border border-emerald-500/30 shadow-lg">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-400 uppercase">
            <span>3. Leídos (Read)</span>
            <Eye className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono mt-1.5">
            {activeStats.read.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-300/90 font-semibold mt-1">
            {readRate}% tasa de lectura
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-slate-900 border border-amber-500/30 shadow-lg">
          <div className="flex items-center justify-between text-xs font-bold text-amber-400 uppercase">
            <span>4. Interactuaron</span>
            <MousePointerClick className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-300 font-mono mt-1.5">
            {activeStats.interacted.toLocaleString()}
          </div>
          <div className="text-[11px] text-amber-300/90 font-semibold mt-1">
            {interactionRate}% CTR (Clics / Respuestas)
          </div>
        </div>

        <div className="p-4 rounded-3xl bg-gradient-to-br from-emerald-950/70 to-slate-900 border border-emerald-500/40 shadow-lg col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-xs font-bold text-emerald-300 uppercase">
            <span>5. Compraron Boleta</span>
            <ShoppingBag className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-black text-emerald-400 font-mono mt-1.5">
            {activeStats.attribution.buyersCount.toLocaleString()} clientes
          </div>
          <div className="text-[11px] text-emerald-200 font-mono font-bold mt-1">
            ${activeStats.attribution.revenueCop.toLocaleString('es-CO')} COP ({salesConversionRate}%)
          </div>
        </div>
      </div>

      {/* EMBUDO DE CONVERSIÓN (FUNNEL) + ATRIBUCIÓN DE VENTAS QRBOLETOS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Embudo Visual de 5 Etapas */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Embudo de Rendimiento (Enviados ➔ Leídos ➔ Interactuaron ➔ Ventas)
            </h3>
          </div>

          <div className="space-y-3.5">
            {[
              {
                label: '1. Mensajes Enviados (Accepted)',
                val: activeStats.sent,
                pct: 100,
                color: 'bg-slate-500',
                textColor: 'text-slate-200',
              },
              {
                label: '2. Mensajes Entregados al Dispositivo',
                val: activeStats.delivered,
                pct: activeStats.sent > 0 ? (activeStats.delivered / activeStats.sent) * 100 : 0,
                color: 'bg-indigo-500',
                textColor: 'text-indigo-300',
              },
              {
                label: '3. Mensajes Leídos / Abiertos por el Cliente',
                val: activeStats.read,
                pct: activeStats.sent > 0 ? (activeStats.read / activeStats.sent) * 100 : 0,
                color: 'bg-emerald-500',
                textColor: 'text-emerald-400',
              },
              {
                label: '4. Interactuaron (Clics en Botón / Respuestas)',
                val: activeStats.interacted,
                pct: activeStats.sent > 0 ? (activeStats.interacted / activeStats.sent) * 100 : 0,
                color: 'bg-amber-500',
                textColor: 'text-amber-300',
              },
              {
                label: `5. Compraron Boleta en QRBoletos (${activeStats.attribution.ticketsBought.toLocaleString()} boletas)`,
                val: activeStats.attribution.buyersCount,
                pct:
                  activeStats.sent > 0
                    ? (activeStats.attribution.buyersCount / activeStats.sent) * 100
                    : 0,
                color: 'bg-teal-400',
                textColor: 'text-teal-300',
              },
            ].map((step, i) => (
              <div key={i} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">{step.label}</span>
                  <span className={`font-mono font-extrabold ${step.textColor}`}>
                    {step.val.toLocaleString()} ({step.pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${step.color}`}
                    style={{ width: `${Math.max(step.val > 0 ? 3 : 0, Math.min(100, step.pct))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {activeStats.buttonClicksBreakdown.length > 0 && (
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <span className="text-[11px] font-bold text-amber-400 uppercase block">
                Desglose de Clics por Botón (Meta template_analytics)
              </span>
              <div className="space-y-1.5">
                {activeStats.buttonClicksBreakdown.map((btn, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs"
                  >
                    <span className="text-slate-300 font-medium">
                      🔘 {btn.button_content || btn.type || 'Botón de Plantilla'}
                    </span>
                    <span className="font-mono font-bold text-amber-300">
                      {btn.count.toLocaleString()} clics
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Cruce con Customers API: Compradores Atribuidos y Recaudo */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-400" />
                Impacto en Ventas (Cruce WhatsApp ➔ Customers API)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Evento evaluado: <strong className="text-emerald-300">{activeStats.attribution.resolvedHint}</strong>
              </p>
            </div>
            {selectedCampaign && activeStats.attribution.matchedBuyers.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBuyersList(!showBuyersList)}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-bold border border-emerald-500/30 flex items-center gap-1 cursor-pointer"
              >
                <span>Ver {activeStats.attribution.matchedBuyers.length} Compradores</span>
                {showBuyersList ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                Destinatarios Compradores
              </span>
              <div className="text-lg font-black text-white font-mono mt-1">
                {activeStats.attribution.buyersCount.toLocaleString()}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                Boletas Adquiridas
              </span>
              <div className="text-lg font-black text-indigo-300 font-mono mt-1">
                {activeStats.attribution.ticketsBought.toLocaleString()}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30">
              <span className="text-[10px] font-bold text-emerald-400 uppercase">
                Recaudo Total COP
              </span>
              <div className="text-lg font-black text-emerald-400 font-mono mt-1">
                ${activeStats.attribution.revenueCop.toLocaleString('es-CO')}
              </div>
            </div>
          </div>

          {selectedCampaign && showBuyersList && activeStats.attribution.matchedBuyers.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-900 text-slate-400 sticky top-0 text-[10px] uppercase font-bold">
                  <tr>
                    <th className="py-2 px-3">WhatsApp</th>
                    <th className="py-2 px-3">Cliente</th>
                    <th className="py-2 px-3 text-center">Boletas</th>
                    <th className="py-2 px-3 text-right">Compra COP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {activeStats.attribution.matchedBuyers.slice(0, 100).map((b) => (
                    <tr key={b.phone} className="hover:bg-slate-900/50">
                      <td className="py-2 px-3 font-mono text-emerald-400 font-bold">{b.phone}</td>
                      <td className="py-2 px-3 text-slate-200 truncate max-w-[160px]">{b.name}</td>
                      <td className="py-2 px-3 text-center font-mono text-slate-300">
                        {b.tickets}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-400">
                        ${b.amountCop.toLocaleString('es-CO')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* TABLA Y GRÁFICA COMPARATIVA DE TODAS LAS CAMPAÑAS PERSISTENTES */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-xs font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            Comparativa Histórica de Plantillas y Campañas Guardadas ({campaigns.length})
          </h3>
          <span className="text-[11px] text-slate-400">
            Haz clic en cualquier fila para inspeccionar o editar su embudo detallado
          </span>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-900 text-slate-400 text-[10px] uppercase font-bold">
              <tr>
                <th className="py-3 px-4">Campaña / Plantilla</th>
                <th className="py-3 px-3">Fecha</th>
                <th className="py-3 px-3 text-right">Enviados</th>
                <th className="py-3 px-3 text-right">Entregados</th>
                <th className="py-3 px-3 text-right">👀 Leídos (%)</th>
                <th className="py-3 px-3 text-right">👆 Interactuaron (%)</th>
                <th className="py-3 px-3 text-right">🎟️ Compradores Evento</th>
                <th className="py-3 px-4 text-right">💰 Recaudo Atribuido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-900">
              {campaigns.map((c) => {
                const sent = c.stats.sent || 0;
                const deliv = c.stats.delivered || sent;
                const read = c.stats.read || 0;
                const inter = c.stats.interacted || 0;
                const rPct = deliv > 0 ? ((read / deliv) * 100).toFixed(1) : '0.0';
                const iPct = sent > 0 ? ((inter / sent) * 100).toFixed(1) : '0.0';
                const attr = computeCampaignSalesAttribution(c);
                const isSelected = selectedCampaignId === c.id;

                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelectedCampaignId(c.id)}
                    className={
                      'cursor-pointer transition-colors ' +
                      (isSelected
                        ? 'bg-emerald-950/40 text-emerald-200'
                        : 'hover:bg-slate-900/60 text-slate-200')
                    }
                  >
                    <td className="py-3 px-4">
                      <div className="font-bold text-white">{c.title}</div>
                      <div className="text-[10px] font-mono text-slate-400">
                        {c.templateName}{' '}
                        {c.stats.metaSynced && (
                          <span className="ml-1 px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400">
                            Meta Sync
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                      {new Date(c.createdAt).toLocaleDateString('es-CO', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-white">
                      {sent.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-indigo-300">
                      {deliv.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      <span className="font-bold text-emerald-400">{read.toLocaleString()}</span>
                      <span className="text-[10px] text-slate-400 ml-1">({rPct}%)</span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono">
                      <span className="font-bold text-amber-300">{inter.toLocaleString()}</span>
                      <span className="text-[10px] text-slate-400 ml-1">({iPct}%)</span>
                    </td>
                    <td className="py-3 px-3 text-right font-mono font-bold text-teal-300">
                      {attr.buyersCount.toLocaleString()} ({attr.ticketsBought} bol.)
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-emerald-400">
                      ${attr.revenueCop.toLocaleString('es-CO')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
