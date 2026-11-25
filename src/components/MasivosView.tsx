'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Send,
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Play,
  Pause,
  RotateCcw,
  Download,
  Upload,
  Key,
  ShieldAlert,
  Sparkles,
  Image as ImageIcon,
  Video,
  FileText,
  Plus,
  Trash2,
  Search,
  Filter,
  Ban,
  Eye,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  Zap,
  Clock,
  Smartphone,
  History,
  FolderOpen,
  BarChart3
} from 'lucide-react';
import WhatsAppAnalyticsView from '@/components/WhatsAppAnalyticsView';
import { Customer } from '@/lib/qrboletosApi';
import {
  getCachedCustomersFromDb,
  saveCustomersBatchToDb,
  setDbMetadata,
  getDbMetadata
} from '@/lib/customersDb';
import {
  WhatsAppCampaign,
  CampaignRecipient,
  TemplateConfig,
  DEFAULT_BLOCKED_NUMBERS,
  saveCampaignToDb,
  getAllCampaignsFromDb,
  deleteCampaignFromDb,
  getWhatsAppSetting,
  setWhatsAppSetting,
  normalizeWhatsAppNumber
} from '@/lib/whatsappDb';

interface MetaTemplate {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: Array<{
    type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
    format?: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'TEXT';
    text?: string;
    buttons?: Array<{
      type: string;
      text?: string;
      url?: string;
    }>;
  }>;
}

export interface MasivosViewProps {
  externalTab?: 'sender' | 'analytics';
  onExternalTabChange?: (tab: 'sender' | 'analytics') => void;
}

export default function MasivosView({
  externalTab,
  onExternalTabChange,
}: MasivosViewProps = {}) {
  // Pestaña activa: Envío de Campaña vs Visualización de Resultados Persistentes
  const [internalTab, setInternalTab] = useState<'sender' | 'analytics'>(
    externalTab || 'analytics'
  );
  const activeTab = externalTab || internalTab;
  const setActiveTab = (t: 'sender' | 'analytics') => {
    setInternalTab(t);
    if (onExternalTabChange) onExternalTabChange(t);
  };

  // 1. Credenciales Meta Cloud API (Híbrido .env + IndexedDB)
  const [phoneNumberId, setPhoneNumberId] = useState('684708368066383');
  const [wabaId, setWabaId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [verifyingToken, setVerifyingToken] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<{
    valid: boolean;
    verifiedName?: string;
    displayPhone?: string;
    qualityRating?: string;
    isPermanent?: boolean;
    expiresAt?: number | null;
    error?: string;
  } | null>(null);
  const [showPermanentTokenGuide, setShowPermanentTokenGuide] = useState(false);
  const [showCredentialsPanel, setShowCredentialsPanel] = useState(true);

  // 2. Plantillas de Meta
  const [metaTemplates, setMetaTemplates] = useState<MetaTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false);
  const [newTpl, setNewTpl] = useState({
    name: '',
    language: 'es_CO',
    category: 'MARKETING',
    headerType: 'NONE',
    headerText: '',
    bodyText: '',
    footerText: '',
    buttonType: 'NONE',
    buttonText: '',
    buttonUrl: '',
  });
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  // Nombre personalizado e identificador de la campaña y evento vinculado para Informes
  const [campaignCustomName, setCampaignCustomName] = useState('');
  const [campaignEventHint, setCampaignEventHint] = useState('');
  const [reportCreatedBanner, setReportCreatedBanner] = useState<{
    id: string;
    title: string;
    sent: number;
    total: number;
  } | null>(null);

  // Configuración activa de la plantilla o Envío Directo (Direct Send)
  const [templateConfig, setTemplateConfig] = useState<TemplateConfig>({
    sendMode: 'template',
    name: 'info_villaarruga',
    languageCode: 'es_co',
    headerType: 'IMAGE',
    headerMediaUrl:
      'https://res.cloudinary.com/dyxdoanm5/image/upload/v1793995639/WhatsApp_Image_2026-11-06_at_2.52.08_PM_glnnbm.jpg',
    bodyVariables: [],
    buttonType: 'NONE',
    buttonValue: '',
    directBodyText:
      'Hola {{primer_nombre}}, te compartimos información importante sobre tu ingreso al evento en Arena USC.',
    directFooterText: 'QRBoletos Oficial',
    directButtonType: 'NONE',
    directButtonText: 'Ver Detalles',
    directButtonUrl: 'https://qrboletos.com',
  });

  // Prueba rápida individual
  const [testPhone, setTestPhone] = useState('573163197319');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // 3. Base de Clientes (IndexedDB / Customers API) y Segmentación
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [syncingCustomers, setSyncingCustomers] = useState(false);
  const [syncProgress, setSyncProgress] = useState<{ loaded: number; page: number } | null>(null);

  // Filtros de Audiencia
  const [audienceSource, setAudienceSource] = useState<'crm' | 'external' | 'both'>('crm');
  const [includeEvents, setIncludeEvents] = useState<string[]>([]);
  const [excludeEvents, setExcludeEvents] = useState<string[]>([]);
  const [includeDropdownOpen, setIncludeDropdownOpen] = useState(false);
  const [excludeDropdownOpen, setExcludeDropdownOpen] = useState(false);
  const [includeEventSearch, setIncludeEventSearch] = useState('');
  const [excludeEventSearch, setExcludeEventSearch] = useState('');
  const [minEventsCount, setMinEventsCount] = useState<string>('todos');
  const [minLtvCop, setMinLtvCop] = useState<number>(0);
  const [allowInternational, setAllowInternational] = useState<boolean>(false);

  // Números externos (pegados o cargados de CSV / nums.js)
  const [externalRawText, setExternalRawText] = useState('');
  // Lista negra (numsBlock) y excluidos de reportes JSON previos
  const [blockedNumbersText, setBlockedNumbersText] = useState(DEFAULT_BLOCKED_NUMBERS.join('\n'));
  const [previouslySentNumbers, setPreviouslySentNumbers] = useState<Set<string>>(new Set());
  const [importedReportName, setImportedReportName] = useState<string | null>(null);

  // Rango opcional (start / end como en index.js)
  const [rangeStart, setRangeStart] = useState<number>(0);
  const [rangeEnd, setRangeEnd] = useState<number>(0);
  const [useCustomRange, setUseCustomRange] = useState<boolean>(false);

  // 4. Motor de Envío Masivo Paralelo y Campañas Guardadas
  const [concurrency, setConcurrency] = useState<number>(50); // 50+ msg/seg por defecto
  const [campaigns, setCampaigns] = useState<WhatsAppCampaign[]>([]);
  const [activeCampaign, setActiveCampaign] = useState<WhatsAppCampaign | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendSpeedMsgPerSec, setSendSpeedMsgPerSec] = useState<number>(0);
  const [tokenExpiredAlert, setTokenExpiredAlert] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<'all' | 'sent' | 'failed' | 'pending'>('all');

  const stopRequestedRef = useRef(false);
  const includeRef = useRef<HTMLDivElement>(null);
  const excludeRef = useRef<HTMLDivElement>(null);

  // Cerrar dropdowns al hacer clic fuera
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (includeRef.current && !includeRef.current.contains(e.target as Node)) {
        setIncludeDropdownOpen(false);
      }
      if (excludeRef.current && !excludeRef.current.contains(e.target as Node)) {
        setExcludeDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  // Cargar configuración inicial, clientes en caché y campañas guardadas
  useEffect(() => {
    async function init() {
      try {
        // 1. Cargar ajustes guardados en IndexedDB
        const savedPhoneId = await getWhatsAppSetting('phoneNumberId', '');
        const savedWabaId = await getWhatsAppSetting('wabaId', '');
        const savedToken = await getWhatsAppSetting('accessToken', '');
        const savedTestPhone = await getWhatsAppSetting('testPhone', '573163197319');
        const savedBlocked = await getWhatsAppSetting(
          'blockedNumbersText',
          DEFAULT_BLOCKED_NUMBERS.join('\n')
        );
        const savedTplConfig = await getWhatsAppSetting<TemplateConfig | null>(
          'lastTemplateConfig',
          null
        );

        if (savedTestPhone) setTestPhone(savedTestPhone);
        if (savedBlocked) setBlockedNumbersText(savedBlocked);
        if (savedTplConfig) setTemplateConfig(savedTplConfig);

        // 2. Consultar valores por defecto de .env en el servidor
        const envRes = await fetch('/api/whatsapp/config');
        const envJson = await envRes.json();

        const finalPhoneId = savedPhoneId || envJson.phoneNumberId || '684708368066383';
        const finalWabaId = savedWabaId || envJson.wabaId || '';
        const finalToken = savedToken || envJson.token || '';

        setPhoneNumberId(finalPhoneId);
        setWabaId(finalWabaId);
        setAccessToken(finalToken);

        // 3. Cargar campañas guardadas en IndexedDB
        const savedCampaigns = await getAllCampaignsFromDb();
        setCampaigns(savedCampaigns);
        if (savedCampaigns.length > 0) {
          setActiveCampaign(savedCampaigns[0]);
        }

        // 4. Cargar clientes desde IndexedDB
        const cachedCustomers = await getCachedCustomersFromDb();
        if (cachedCustomers && cachedCustomers.length > 0) {
          setCustomers(cachedCustomers);
        }
      } catch (e) {
        console.warn('Error inicializando módulo /masivos:', e);
      } finally {
        setLoadingCustomers(false);
      }
    }
    init();
  }, []);

  // Guardar cambios de configuración en IndexedDB automáticamente
  useEffect(() => {
    if (phoneNumberId) setWhatsAppSetting('phoneNumberId', phoneNumberId);
  }, [phoneNumberId]);

  useEffect(() => {
    if (wabaId) setWhatsAppSetting('wabaId', wabaId);
  }, [wabaId]);

  useEffect(() => {
    if (accessToken) setWhatsAppSetting('accessToken', accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (testPhone) setWhatsAppSetting('testPhone', testPhone);
  }, [testPhone]);

  useEffect(() => {
    setWhatsAppSetting('blockedNumbersText', blockedNumbersText);
  }, [blockedNumbersText]);

  useEffect(() => {
    setWhatsAppSetting('lastTemplateConfig', templateConfig);
  }, [templateConfig]);

  // Verificar Access Token y auto-descubrir WABA ID
  const handleVerifyToken = async (customToken?: string) => {
    const tokenToUse = (customToken !== undefined ? customToken : accessToken).trim();
    if (!tokenToUse) {
      setTokenStatus({ valid: false, error: 'Ingresa un Access Token de Meta.' });
      return false;
    }

    setVerifyingToken(true);
    setTokenStatus(null);
    try {
      const res = await fetch('/api/whatsapp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenToUse,
          phoneNumberId,
          wabaId,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setTokenStatus({
          valid: false,
          error: data.error || 'Token inválido o expirado.',
        });
        return false;
      }

      if (data.wabaId && !wabaId) {
        setWabaId(data.wabaId);
      }

      setTokenStatus({
        valid: true,
        verifiedName: data.phone?.verifiedName,
        displayPhone: data.phone?.displayPhoneNumber,
        qualityRating: data.phone?.qualityRating,
        isPermanent: data.tokenInfo?.isPermanent,
        expiresAt: data.tokenInfo?.expiresAt,
      });
      setTokenExpiredAlert(null);

      // Si descubrimos o tenemos WABA ID, cargar plantillas automáticamente
      if (data.wabaId || wabaId) {
        fetchMetaTemplates(tokenToUse, data.wabaId || wabaId);
      }
      return true;
    } catch (err: any) {
      setTokenStatus({
        valid: false,
        error: err.message || 'Error conectando con Meta Graph API.',
      });
      return false;
    } finally {
      setVerifyingToken(false);
    }
  };

  // Consultar plantillas aprobadas desde Meta
  const fetchMetaTemplates = async (overrideToken?: string, overrideWaba?: string) => {
    const t = (overrideToken || accessToken).trim();
    const w = (overrideWaba || wabaId).trim();
    if (!t) return;

    setLoadingTemplates(true);
    try {
      const res = await fetch(
        `/api/whatsapp/templates?token=${encodeURIComponent(t)}&wabaId=${encodeURIComponent(w)}`
      );
      const data = await res.json();
      if (res.ok && data.success) {
        setMetaTemplates(data.templates || []);
        if (data.wabaId && !wabaId) {
          setWabaId(data.wabaId);
        }
      }
    } catch (e) {
      console.warn('Error cargando plantillas de Meta:', e);
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Al seleccionar una plantilla de la lista de Meta, auto-configurar sus componentes
  const handleSelectMetaTemplate = (tpl: MetaTemplate) => {
    let headerType: TemplateConfig['headerType'] = 'NONE';
    let extractedVars: string[] = [];
    let buttonType: TemplateConfig['buttonType'] = 'NONE';

    for (const comp of tpl.components || []) {
      if (comp.type === 'HEADER') {
        if (comp.format === 'IMAGE') headerType = 'IMAGE';
        else if (comp.format === 'VIDEO') headerType = 'VIDEO';
        else if (comp.format === 'DOCUMENT') headerType = 'DOCUMENT';
      } else if (comp.type === 'BODY' && comp.text) {
        const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
        let m: RegExpExecArray | null;
        while ((m = regex.exec(comp.text)) !== null) {
          extractedVars.push(m[1]);
        }
      } else if (comp.type === 'BUTTONS' && Array.isArray(comp.buttons)) {
        for (const btn of comp.buttons) {
          if (btn.type === 'COPY_CODE') buttonType = 'COPY_CODE';
          else if (btn.type === 'URL' && btn.url?.includes('{{')) buttonType = 'URL_SUFFIX';
        }
      }
    }

    setTemplateConfig((prev) => ({
      ...prev,
      name: tpl.name,
      languageCode: tpl.language || 'es_co',
      headerType,
      bodyVariables: extractedVars.map((varToken, i) => ({
        type: i === 0 || /nombre|name/i.test(varToken) ? 'customer_first_name' : 'fixed',
        value: i === 0 || /nombre|name/i.test(varToken) ? 'Cliente' : '',
        paramName: /^\d+$/.test(varToken) ? '' : varToken,
      })),
      buttonType,
    }));
  };

  // Crear nueva plantilla en Meta desde el modal
  const handleCreateMetaTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTpl.name || !newTpl.bodyText) return;
    setCreatingTemplate(true);
    try {
      const res = await fetch('/api/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: accessToken,
          wabaId,
          ...newTpl,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert('Error creando plantilla en Meta: ' + (data.error || 'Verifica los campos.'));
        return;
      }
      alert('¡Plantilla enviada a Meta exitosamente!');
      setShowCreateTemplateModal(false);
      await fetchMetaTemplates();
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setCreatingTemplate(false);
    }
  };

  // Sincronizar clientes desde /api/customers si IndexedDB está vacía o el usuario quiere refrescar
  const handleSyncCustomersFromApi = async () => {
    setSyncingCustomers(true);
    try {
      const all: Customer[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined = undefined;
      let hasMore = true;
      let page = 0;

      while (hasMore) {
        page++;
        let url = '/api/customers?limit=500';
        if (cursor) url += '&cursor=' + encodeURIComponent(cursor);
        const res = await fetch(url);
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Error sincronizando clientes.');
        }
        const batch: Customer[] = json.data || [];
        if (batch.length === 0) break;

        await saveCustomersBatchToDb(batch);
        for (const c of batch) {
          if (!seen.has(c.id_cliente)) {
            seen.add(c.id_cliente);
            all.push(c);
          }
        }
        setCustomers([...all]);
        setSyncProgress({ loaded: all.length, page });
        hasMore = Boolean(json.has_more && json.next_cursor);
        cursor = json.next_cursor;
      }
      await setDbMetadata('last_sync', new Date().toISOString());
    } catch (err: any) {
      alert('Error sincronizando clientes: ' + err.message);
    } finally {
      setSyncingCustomers(false);
      setSyncProgress(null);
    }
  };

  // Lista única de eventos en la base de clientes
  const uniqueEvents = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      c.eventos?.forEach((e) => {
        if (e.evento) set.add(e.evento);
      });
    });
    return Array.from(set).sort();
  }, [customers]);

  // Conjunto de números bloqueados (numsBlock)
  const blockedSet = useMemo(() => {
    const set = new Set<string>();
    const matches = blockedNumbersText.match(/\d{7,15}/g) || [];
    for (const m of matches) {
      const norm = normalizeWhatsAppNumber(m, true);
      if (norm.normalized) set.add(norm.normalized);
      set.add(m);
    }
    return set;
  }, [blockedNumbersText]);

  // Procesamiento, filtrado, limpieza y deduplicación de destinatarios
  const audienceAnalysis = useMemo(() => {
    const seenPhones = new Set<string>();
    const recipients: CampaignRecipient[] = [];

    let rawCrmMatched = 0;
    let invalidPhonesCount = 0;
    let duplicatePhonesCount = 0;
    let excludedByEventCount = 0;
    let excludedByBlocklistCount = 0;
    let excludedByPrevReportCount = 0;

    // 1. Procesar desde CRM (Customers API)
    if (audienceSource === 'crm' || audienceSource === 'both') {
      for (const c of customers) {
        const customerEvents = (c.eventos || []).map((e) => e.evento).filter(Boolean);
        const distinctEventsCount = new Set(
          customerEvents.map((e) => e.trim().toLowerCase())
        ).size;
        const customerLtv = c.ltv?.reduce((acc, curr) => acc + (curr.valor || 0), 0) || 0;

        // ¿Está excluido por haber comprado ya el evento promocionado?
        if (
          excludeEvents.length > 0 &&
          customerEvents.some((ev) => excludeEvents.includes(ev))
        ) {
          excludedByEventCount++;
          continue;
        }

        // Filtro por eventos incluidos
        const matchesIncludeEvent =
          includeEvents.length === 0 ||
          customerEvents.some((ev) => includeEvents.includes(ev));
        if (!matchesIncludeEvent) continue;

        // Filtro por cantidad de eventos comprados
        let matchesCount = true;
        if (minEventsCount === '0') matchesCount = distinctEventsCount === 0;
        else if (minEventsCount === '1+') matchesCount = distinctEventsCount >= 1;
        else if (minEventsCount === '2+') matchesCount = distinctEventsCount >= 2;
        else if (minEventsCount === '3+') matchesCount = distinctEventsCount >= 3;
        else if (minEventsCount === '5+') matchesCount = distinctEventsCount >= 5;
        if (!matchesCount) continue;

        // Filtro por LTV mínimo
        if (minLtvCop > 0 && customerLtv < minLtvCop) continue;

        rawCrmMatched++;

        const norm = normalizeWhatsAppNumber(c.telefono, allowInternational);
        if (!norm.valid) {
          invalidPhonesCount++;
          continue;
        }

        if (blockedSet.has(norm.normalized)) {
          excludedByBlocklistCount++;
          continue;
        }

        if (previouslySentNumbers.has(norm.normalized)) {
          excludedByPrevReportCount++;
          continue;
        }

        if (seenPhones.has(norm.normalized)) {
          duplicatePhonesCount++;
          continue;
        }

        seenPhones.add(norm.normalized);
        recipients.push({
          num: norm.normalized,
          name: c.nombre || '',
          email: c.email || '',
          eventsCount: distinctEventsCount,
          ltv: customerLtv,
          status: 'pending',
        });
      }
    }

    // 2. Procesar desde Lista Externa (CSV / nums.js / texto pegado con o sin nombre)
    if ((audienceSource === 'external' || audienceSource === 'both') && externalRawText.trim()) {
      // Mapa rápido para rescatar el nombre de la base local de Clientes API si solo pegan el número
      const crmNameByPhone = new Map<string, string>();
      for (const c of customers) {
        if (!c.telefono || !c.nombre) continue;
        const n = normalizeWhatsAppNumber(c.telefono, allowInternational);
        if (n.valid && !crmNameByPhone.has(n.normalized)) {
          crmNameByPhone.set(n.normalized, c.nombre.trim());
        }
      }

      const lines = externalRawText.split(/\r?\n/);
      for (const rawLine of lines) {
        const cleanedLine = rawLine.trim();
        if (!cleanedLine) continue;
        // Extraer secuencias numéricas de 10 a 15 dígitos en la línea
        const numMatches = cleanedLine.match(/\+?\d{10,15}/g) || [];
        if (numMatches.length === 0) continue;

        // Si hay exactamente 1 número en la línea, todo el texto restante (quitando separadores , ; | - tab) es el nombre manual
        let explicitLineName = '';
        if (numMatches.length === 1) {
          explicitLineName = cleanedLine
            .replace(numMatches[0], '')
            .replace(/^[\s,;|:\-\t"']+|[\s,;|:\-\t"']+$/g, '')
            .trim();
          // Ignorar encabezados típicos de CSV o fragmentos de código JS
          if (/^(nombre|name|telefono|celular|phone|whatsapp|const|let|var|export|\[|\])$/i.test(explicitLineName)) {
            explicitLineName = '';
          }
        }

        for (const rawNum of numMatches) {
          const norm = normalizeWhatsAppNumber(rawNum, allowInternational);
          if (!norm.valid) {
            invalidPhonesCount++;
            continue;
          }
          if (blockedSet.has(norm.normalized)) {
            excludedByBlocklistCount++;
            continue;
          }
          if (previouslySentNumbers.has(norm.normalized)) {
            excludedByPrevReportCount++;
            continue;
          }
          if (seenPhones.has(norm.normalized)) {
            duplicatePhonesCount++;
            continue;
          }
          seenPhones.add(norm.normalized);
          const resolvedName = explicitLineName || crmNameByPhone.get(norm.normalized) || '';
          recipients.push({
            num: norm.normalized,
            name: resolvedName,
            status: 'pending',
          });
        }
      }
    }

    // Aplicar rango personalizado si está habilitado
    const finalRecipients = useCustomRange
      ? recipients.slice(
          Math.max(0, rangeStart),
          rangeEnd > rangeStart ? Math.min(recipients.length, rangeEnd) : recipients.length
        )
      : recipients;

    return {
      allValidRecipients: recipients,
      finalRecipients,
      rawCrmMatched,
      invalidPhonesCount,
      duplicatePhonesCount,
      excludedByEventCount,
      excludedByBlocklistCount,
      excludedByPrevReportCount,
    };
  }, [
    customers,
    audienceSource,
    includeEvents,
    excludeEvents,
    minEventsCount,
    minLtvCop,
    allowInternational,
    externalRawText,
    blockedSet,
    previouslySentNumbers,
    useCustomRange,
    rangeStart,
    rangeEnd,
  ]);

  // Importar archivo externo de números (CSV, TXT, nums.js)
  const handleUploadExternalNumbersFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const matches = text.match(/\b\d{10,15}\b/g) || [];
    setExternalRawText((prev) => (prev ? prev + '\n' : '') + matches.join('\n'));
    if (audienceSource === 'crm') {
      setAudienceSource('both');
    }
    e.target.value = '';
  };

  // Importar message_report_*.json anterior para excluir los ya enviados ("status": "success")
  const handleImportPreviousReportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        alert('El archivo JSON no tiene el formato de lista [{ num, status, response }].');
        return;
      }
      const nextSet = new Set(previouslySentNumbers);
      let added = 0;
      for (const item of parsed) {
        if (item && item.status === 'success' && item.num) {
          const norm = normalizeWhatsAppNumber(item.num, true);
          const key = norm.normalized || String(item.num);
          if (!nextSet.has(key)) {
            nextSet.add(key);
            added++;
          }
        }
      }
      setPreviouslySentNumbers(nextSet);
      setImportedReportName(`${file.name} (${added.toLocaleString()} enviados excluidos)`);
    } catch (err: any) {
      alert('No se pudo leer el archivo JSON: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  // Enviar mensaje de prueba a 1 número
  const handleSendTestMessage = async () => {
    const norm = normalizeWhatsAppNumber(testPhone, true);
    if (!norm.valid) {
      setTestResult({ ok: false, msg: 'Número de prueba inválido. Usa formato 573XXXXXXXXX.' });
      return;
    }

    setSendingTest(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/whatsapp/send-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: accessToken,
          phoneNumberId,
          templateConfig,
          recipients: [{ num: norm.normalized, name: 'Prueba Admin' }],
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setTestResult({ ok: false, msg: data.error || 'Error enviando mensaje de prueba.' });
        return;
      }

      const first = data.results?.[0];
      if (first?.status === 'success') {
        setTestResult({
          ok: true,
          msg: `¡Enviado con éxito a ${norm.normalized}! ID: ${first.wamid || 'accepted'}`,
        });
      } else {
        const baseErr =
          first?.error?.error_user_msg ||
          first?.error?.message ||
          JSON.stringify(first?.error || 'Error desconocido');
        const details = first?.error?.error_data?.details;
        const errMsg = details ? `${baseErr} — Detalle: ${details}` : baseErr;
        setTestResult({ ok: false, msg: `Meta rechazó el envío: ${errMsg}` });
      }
    } catch (err: any) {
      setTestResult({ ok: false, msg: err.message });
    } finally {
      setSendingTest(false);
    }
  };

  // Guardar/actualizar el informe persistente de la campaña tanto en data/whatsapp-campaigns/campaigns.json como en IndexedDB
  const persistCampaignReport = async (camp: WhatsAppCampaign) => {
    const sentPhones = camp.recipients.filter((r) => r.status === 'sent').map((r) => r.num);
    const persistentEntry = {
      id: camp.id,
      title: camp.title,
      templateName: camp.customName || camp.templateConfig.name,
      languageCode: camp.templateConfig.languageCode || 'es_co',
      eventHint: camp.eventHint || campaignEventHint || '',
      createdAt: camp.createdAt,
      updatedAt: new Date().toISOString(),
      source: 'masivos_web' as const,
      stats: {
        total: camp.stats.total,
        sent: camp.stats.sent,
        failed: camp.stats.failed,
        delivered: camp.stats.sent,
        read: 0,
        interacted: 0,
      },
      sentPhones,
    };

    try {
      // 1. Guardar en IndexedDB para lectura inmediata en /informes y Analítica
      const localList = await getWhatsAppSetting<any[]>('persistent_analytics_campaigns', []);
      const idx = localList.findIndex((x) => x.id === persistentEntry.id);
      if (idx >= 0) {
        localList[idx] = {
          ...localList[idx],
          ...persistentEntry,
          stats: {
            ...localList[idx].stats,
            ...persistentEntry.stats,
            read: localList[idx].stats?.read || 0,
            interacted: localList[idx].stats?.interacted || 0,
          },
        };
      } else {
        localList.unshift(persistentEntry);
      }
      await setWhatsAppSetting('persistent_analytics_campaigns', localList);
    } catch (e) {
      console.warn('Error guardando informe en IndexedDB:', e);
    }

    try {
      // 2. Guardar snapshot JSON en el servidor (/api/whatsapp/analytics)
      await fetch('/api/whatsapp/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign: persistentEntry }),
      });
    } catch (e) {
      console.warn('No se pudo persistir snapshot en servidor:', e);
    }
  };

  // Crear nueva campaña lista para disparar con la audiencia filtrada actual
  const handleCreateCampaignQueue = async () => {
    if (audienceAnalysis.finalRecipients.length === 0) {
      alert('No hay destinatarios válidos en la selección actual.');
      return;
    }
    const isDirect = templateConfig.sendMode === 'direct_send';
    if (!isDirect && !templateConfig.name.trim()) {
      alert('Ingresa o selecciona el nombre de la plantilla de Meta.');
      return;
    }
    if (isDirect && !(templateConfig.directBodyText || '').trim()) {
      alert('Escribe el texto del mensaje para Envío Directo (Direct Send).');
      return;
    }

    const customTrimmed = campaignCustomName.trim();
    const baseIdentifier =
      customTrimmed ||
      (isDirect
        ? `Envío Directo ${campaignEventHint || 'WhatsApp'}`
        : templateConfig.name.trim());

    const dateShort = new Date().toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    const resolvedEventHint =
      campaignEventHint ||
      (includeEvents.length === 1 ? includeEvents[0] : '') ||
      (excludeEvents.length === 1 ? excludeEvents[0] : '');

    const newCampaign: WhatsAppCampaign = {
      id: 'camp_' + Date.now(),
      title: customTrimmed ? `${customTrimmed} (${dateShort})` : `${baseIdentifier} (${dateShort})`,
      customName: baseIdentifier,
      eventHint: resolvedEventHint,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',
      templateConfig: {
        ...templateConfig,
        name: isDirect ? baseIdentifier : templateConfig.name.trim(),
      },
      recipients: audienceAnalysis.finalRecipients.map((r) => ({ ...r, status: 'pending' })),
      stats: {
        total: audienceAnalysis.finalRecipients.length,
        sent: 0,
        failed: 0,
        pending: audienceAnalysis.finalRecipients.length,
      },
    };

    await saveCampaignToDb(newCampaign);
    await persistCampaignReport(newCampaign);
    const updatedList = await getAllCampaignsFromDb();
    setCampaigns(updatedList);
    setActiveCampaign(newCampaign);
    setTokenExpiredAlert(null);
  };

  // Motor principal de envío paralelo por lotes con checkpoint en IndexedDB y detección de Token vencido (Code 190)
  const runCampaignLoop = async (campaignToRun: WhatsAppCampaign, retryFailed = false) => {
    if (!accessToken.trim()) {
      alert('Configura tu Access Token de Meta antes de iniciar el envío.');
      return;
    }

    stopRequestedRef.current = false;
    setIsSending(true);
    setTokenExpiredAlert(null);

    // Clonar estado mutable de la campaña
    const workingCampaign: WhatsAppCampaign = {
      ...campaignToRun,
      templateConfig: { ...templateConfig },
      status: 'running',
      recipients: campaignToRun.recipients.map((r) =>
        retryFailed && r.status === 'failed' ? { ...r, status: 'pending', error: undefined } : { ...r }
      ),
    };

    await saveCampaignToDb(workingCampaign);
    setActiveCampaign({ ...workingCampaign });

    // Obtener índices de todos los que están en 'pending'
    const pendingIndices: number[] = [];
    workingCampaign.recipients.forEach((r, idx) => {
      if (r.status === 'pending') pendingIndices.push(idx);
    });

    const batchSize = Math.max(1, Math.min(100, concurrency));
    let processedInSession = 0;
    const sessionStartTime = Date.now();

    for (let i = 0; i < pendingIndices.length; i += batchSize) {
      if (stopRequestedRef.current) {
        workingCampaign.status = 'paused';
        await saveCampaignToDb(workingCampaign);
        setActiveCampaign({ ...workingCampaign });
        break;
      }

      const sliceIndices = pendingIndices.slice(i, i + batchSize);
      const batchPayload = sliceIndices.map((idx) => ({
        num: workingCampaign.recipients[idx].num,
        name: workingCampaign.recipients[idx].name,
      }));

      try {
        const res = await fetch('/api/whatsapp/send-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: accessToken,
            phoneNumberId,
            templateConfig: workingCampaign.templateConfig,
            recipients: batchPayload,
          }),
        });

        const data = await res.json();

        // Actualizar resultados número por número
        const resultMap = new Map<string, any>();
        for (const r of data.results || []) {
          resultMap.set(String(r.num), r);
        }

        for (const idx of sliceIndices) {
          const rec = workingCampaign.recipients[idx];
          const resItem = resultMap.get(String(rec.num));
          if (!resItem) continue;

          if (resItem.status === 'success') {
            rec.status = 'sent';
            rec.wamid = resItem.wamid;
            rec.error = undefined;
            rec.updatedAt = new Date().toISOString();
            processedInSession++;
          } else if (resItem.status === 'token_expired') {
            // ¡IMPORTANTE! Se deja en 'pending' para que al pegar el nuevo token se reanude exactamente aquí
            rec.status = 'pending';
          } else {
            rec.status = 'failed';
            rec.error = resItem.error;
            rec.updatedAt = new Date().toISOString();
            processedInSession++;
          }
        }

        // Calcular velocidad real (msg/seg)
        const elapsedSec = Math.max(0.5, (Date.now() - sessionStartTime) / 1000);
        setSendSpeedMsgPerSec(Math.round(processedInSession / elapsedSec));

        // Si el token expiró durante este lote, auto-pausar inmediatamente y guardar checkpoint
        if (data.tokenExpired || res.status === 401) {
          workingCampaign.status = 'token_expired';
          await saveCampaignToDb(workingCampaign);
          setActiveCampaign({ ...workingCampaign });
          const updatedList = await getAllCampaignsFromDb();
          setCampaigns(updatedList);
          setTokenExpiredAlert(
            data.tokenExpiredMessage ||
              'El Access Token de Meta venció durante el envío. La campaña se pausó automáticamente y guardó el progreso exacto.'
          );
          setIsSending(false);
          return;
        }

        // Guardar checkpoint del lote en IndexedDB
        await saveCampaignToDb(workingCampaign);
        setActiveCampaign({ ...workingCampaign });
      } catch (err: any) {
        // Error de red local: pausar para no perder la cola
        workingCampaign.status = 'paused';
        await saveCampaignToDb(workingCampaign);
        setActiveCampaign({ ...workingCampaign });
        alert('Pausa automática por corte de red: ' + err.message);
        setIsSending(false);
        return;
      }
    }

    if (!stopRequestedRef.current) {
      const stillPending = workingCampaign.recipients.some((r) => r.status === 'pending');
      workingCampaign.status = stillPending ? 'paused' : 'completed';
      await saveCampaignToDb(workingCampaign);
      setActiveCampaign({ ...workingCampaign });
    }

    // Crear y guardar automáticamente el informe persistente de la campaña
    await persistCampaignReport(workingCampaign);
    setReportCreatedBanner({
      id: workingCampaign.id,
      title: workingCampaign.title,
      sent: workingCampaign.stats.sent,
      total: workingCampaign.stats.total,
    });

    const updatedList = await getAllCampaignsFromDb();
    setCampaigns(updatedList);
    setIsSending(false);
  };

  // Exportar el reporte exactamente con el formato JSON de D:\whatsapp_api_nodejs-main\message_report_*.json
  const handleDownloadJsonReport = (camp: WhatsAppCampaign) => {
    const formatted = camp.recipients
      .filter((r) => r.status === 'sent' || r.status === 'failed')
      .map((r) => {
        if (r.status === 'sent') {
          return {
            num: Number(r.num) || r.num,
            status: 'success',
            response: {
              messaging_product: 'whatsapp',
              contacts: [{ input: r.num, wa_id: r.num }],
              messages: [{ id: r.wamid || '', message_status: 'accepted' }],
            },
          };
        }
        return {
          num: Number(r.num) || r.num,
          status: 'error',
          error: r.error || { message: 'Failed' },
        };
      });

    const blob = new Blob([JSON.stringify(formatted, null, 2)], {
      type: 'application/json;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `message_report_${camp.templateConfig.name}_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Exportar CSV con estado de envío
  const handleDownloadCsvReport = (camp: WhatsAppCampaign) => {
    const headers = ['Numero_WhatsApp', 'Nombre', 'Estado', 'WAMID', 'Error', 'Hora_Actualizacion'];
    const rows = camp.recipients.map((r) => [
      r.num,
      '"' + (r.name || '').replace(/"/g, '""') + '"',
      r.status,
      r.wamid || '',
      '"' +
        (r.error ? JSON.stringify(r.error).replace(/"/g, '""') : '') +
        '"',
      r.updatedAt || '',
    ]);
    const csv = '\uFEFF' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Reporte_Masivo_${camp.templateConfig.name}_${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Plantilla seleccionada de Meta para la vista previa de texto
  const selectedMetaTemplateObj = useMemo(() => {
    return metaTemplates.find(
      (t) =>
        t.name.toLowerCase() === templateConfig.name.trim().toLowerCase() &&
        (!templateConfig.languageCode ||
          t.language.toLowerCase() === templateConfig.languageCode.trim().toLowerCase())
    );
  }, [metaTemplates, templateConfig.name, templateConfig.languageCode]);

  const previewBodyText = useMemo(() => {
    if (templateConfig.sendMode === 'direct_send') {
      return (templateConfig.directBodyText || '')
        .replace(/\{\{\s*nombre\s*\}\}/gi, 'Andrés Holguín')
        .replace(/\{\{\s*primer_nombre\s*\}\}/gi, 'Andrés')
        .replace(/\{\{\s*1\s*\}\}/g, 'Andrés');
    }

    const bodyComp = selectedMetaTemplateObj?.components?.find((c) => c.type === 'BODY');
    let text =
      bodyComp?.text ||
      `Plantilla: ${templateConfig.name || 'sin_nombre'} (${templateConfig.languageCode})`;
    templateConfig.bodyVariables.forEach((v, i) => {
      const sample =
        v.type === 'customer_name'
          ? 'Andrés Holguín'
          : v.type === 'customer_first_name'
          ? 'Andrés'
          : v.value || `{{${i + 1}}}`;
      text = text.replace(`{{${i + 1}}}`, sample);
    });
    return text;
  }, [selectedMetaTemplateObj, templateConfig]);

  // Filtrado de la tabla de logs de la campaña activa
  const filteredCampaignRecipients = useMemo(() => {
    if (!activeCampaign) return [];
    return activeCampaign.recipients.filter((r) => {
      if (logFilter === 'all') return true;
      return r.status === logFilter;
    });
  }, [activeCampaign, logFilter]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Encabezado Principal */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 p-5 rounded-3xl shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-lg shadow-emerald-500/5">
            <Send className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-extrabold text-white tracking-wide uppercase">
                Envíos Masivos WhatsApp Cloud API
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-mono font-bold border border-emerald-500/30">
                Meta Graph v22.0 + Whapify Compatible
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Cruza tu base de clientes de QRBoletos, filtra compradores, dispara a 50+ msg/seg y reanuda exactamente donde quedó si vence el token.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto flex-wrap">
          {/* Selector de Pestaña Principal: Enviar Campaña vs Resultados & Analítica */}
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab('sender')}
              className={
                'px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ' +
                (activeTab === 'sender'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white')
              }
            >
              <Send className="w-3.5 h-3.5" />
              <span>Enviar Campaña</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('analytics')}
              className={
                'px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all cursor-pointer ' +
                (activeTab === 'analytics'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white')
              }
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>📊 Resultados & Analítica</span>
            </button>
          </div>

          <button
            onClick={() => setShowCredentialsPanel(!showCredentialsPanel)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 border border-slate-700 transition-all cursor-pointer"
          >
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>Credenciales Meta</span>
            {showCredentialsPanel ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* ALERTA CRÍTICA: Token Vencido a Mitad de Envío (Auto-Pausa con Reanudación en 1 clic) */}
      {tokenExpiredAlert && activeCampaign && (
        <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-950/90 via-red-950/80 to-slate-900 border-2 border-amber-500/60 shadow-2xl space-y-4 animate-in fade-in">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-extrabold text-amber-300 uppercase tracking-wide">
                ⏸️ Envío Auto-Pausado por Vencimiento de Access Token (Progreso Guardado)
              </h3>
              <p className="text-xs text-amber-100/90 mt-1">
                {tokenExpiredAlert} Ya se enviaron{' '}
                <strong className="text-emerald-400">
                  {activeCampaign.stats.sent.toLocaleString()} mensajes
                </strong>{' '}
                y quedan{' '}
                <strong className="text-amber-300">
                  {activeCampaign.stats.pending.toLocaleString()} pendientes
                </strong>
                . Pega tu nuevo Access Token abajo para continuar exactamente donde quedó sin duplicar ningún envío:
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Pega aquí el nuevo Access Token de Meta (EAA...)"
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-slate-950/90 border border-amber-500/40 text-xs text-white font-mono focus:outline-none focus:border-amber-400"
            />
            <button
              onClick={async () => {
                const ok = await handleVerifyToken(accessToken);
                if (ok && activeCampaign) {
                  runCampaignLoop(activeCampaign, false);
                }
              }}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg cursor-pointer shrink-0"
            >
              <Play className="w-4 h-4" />
              <span>Actualizar Token y Reanudar ({activeCampaign.stats.pending.toLocaleString()} restantes)</span>
            </button>
          </div>
        </div>
      )}

      {/* PASO 0: Panel de Credenciales Meta Cloud API */}
      {showCredentialsPanel && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-amber-400" />
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-200">
                Configuración Meta WhatsApp Cloud API (Híbrido .env + Navegador)
              </h2>
            </div>
            <button
              onClick={() => setShowPermanentTokenGuide(!showPermanentTokenGuide)}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>¿Cómo crear un Token Permanente que NUNCA vence?</span>
            </button>
          </div>

          {showPermanentTokenGuide && (
            <div className="p-4 rounded-2xl bg-slate-950 border border-emerald-500/30 text-xs text-slate-300 space-y-2">
              <p className="font-bold text-emerald-400">
                Guía rápida para que el Access Token de Meta no expire cada 24 horas:
              </p>
              <ol className="list-decimal list-inside space-y-1 text-slate-300">
                <li>
                  Entra a{' '}
                  <a
                    href="https://business.facebook.com/settings/system-users"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 underline font-semibold"
                  >
                    Meta Business Suite → Configuración del Negocio → Usuarios del sistema
                  </a>
                  .
                </li>
                <li>
                  Crea o selecciona un <strong>Usuario del sistema</strong> con rol{' '}
                  <strong>Administrador</strong>.
                </li>
                <li>
                  Haz clic en <strong>Asignar activos</strong> y asígnale tu{' '}
                  <strong>App de Meta</strong> y tu <strong>Cuenta de WhatsApp Business</strong> con control total.
                </li>
                <li>
                  Haz clic en <strong>Generar nuevo token</strong>, elige tu App, selecciona caducidad{' '}
                  <strong>&quot;Nunca&quot;</strong>, marca los permisos{' '}
                  <code className="text-emerald-300">whatsapp_business_messaging</code> y{' '}
                  <code className="text-emerald-300">whatsapp_business_management</code>, y pégalo abajo.
                </li>
              </ol>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                Phone Number ID
              </label>
              <input
                type="text"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
                placeholder="684708368066383"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                WABA ID (Auto-detectable)
              </label>
              <input
                type="text"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
                placeholder="Se detecta al verificar token"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                Meta Access Token (Bearer)
              </label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder="EAAKlpDZBm5d..."
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={() => handleVerifyToken()}
                  disabled={verifyingToken}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <RefreshCw className={'w-3.5 h-3.5 ' + (verifyingToken ? 'animate-spin' : '')} />
                  <span>{verifyingToken ? 'Verificando...' : 'Verificar Token'}</span>
                </button>
              </div>
            </div>
          </div>

          {tokenStatus && (
            <div
              className={
                'p-3 rounded-2xl border text-xs flex flex-wrap items-center justify-between gap-2 ' +
                (tokenStatus.valid
                  ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                  : 'bg-red-950/40 border-red-500/30 text-red-300')
              }
            >
              {tokenStatus.valid ? (
                <>
                  <div className="flex items-center gap-2 flex-wrap">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Conectado a <strong>{tokenStatus.verifiedName || 'WhatsApp Business'}</strong> (
                      {tokenStatus.displayPhone})
                    </span>
                    {tokenStatus.qualityRating && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-[10px] font-bold">
                        Calidad: {tokenStatus.qualityRating}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] font-mono">
                    {tokenStatus.isPermanent ? (
                      <span className="text-emerald-400 font-bold">🔒 Token Permanente (No vence)</span>
                    ) : tokenStatus.expiresAt ? (
                      <span className="text-amber-300">
                        ⏳ Vence: {new Date(tokenStatus.expiresAt).toLocaleString('es-CO')}
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{tokenStatus.error}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'analytics' ? (
        <WhatsAppAnalyticsView
          customers={customers}
          uniqueEvents={uniqueEvents}
          accessToken={accessToken}
          wabaId={wabaId}
          onWabaIdDiscovered={(discoveredId) => {
            if (discoveredId && !wabaId) setWabaId(discoveredId);
          }}
        />
      ) : (
        <>
          {/* GRID PRINCIPAL DE 2 COLUMNAS: 1) PLANTILLA Y PRUEBA | 2) SEGMENTACIÓN DE AUDIENCIA */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* COLUMNA IZQUIERDA (5 cols): Configuración de Plantilla + Vista Previa + Envío de Prueba */}
        <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-white">
                1. Mensaje / Plantilla & Multimedia
              </h2>
            </div>
            {(templateConfig.sendMode || 'template') === 'template' && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => fetchMetaTemplates()}
                  disabled={loadingTemplates}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 border border-slate-700 cursor-pointer"
                  title="Sincronizar lista de plantillas aprobadas en Meta"
                >
                  <RefreshCw className={'w-3 h-3 ' + (loadingTemplates ? 'animate-spin text-emerald-400' : '')} />
                  <span>Cargar de Meta ({metaTemplates.length})</span>
                </button>
                <button
                  onClick={() => setShowCreateTemplateModal(true)}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[11px] font-bold flex items-center gap-1 border border-emerald-500/30 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Crear en Meta</span>
                </button>
              </div>
            )}
          </div>

          {/* NOMBRE DE LA CAMPAÑA Y EVENTO ASOCIADO (Visible en ambos modos para identificar el Informe) */}
          <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-emerald-500/30 space-y-3">
            <div>
              <label className="block text-[11px] font-extrabold text-emerald-400 uppercase mb-1">
                🏷️ Nombre para Identificar la Campaña (En Informes)
              </label>
              <input
                type="text"
                value={campaignCustomName}
                onChange={(e) => setCampaignCustomName(e.target.value)}
                placeholder="Ej: Aviso Ingreso Villa Arruga - 19 Nov"
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                🎯 Evento Asociado (Opcional — Para cruzar ventas en el Informe)
              </label>
              <select
                value={campaignEventHint}
                onChange={(e) => setCampaignEventHint(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="">General / Sin evento específico</option>
                {uniqueEvents.map((ev) => (
                  <option key={ev} value={ev}>
                    {ev}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Selector de Modo: Plantilla Clásica vs Envío Directo (Direct Send de Meta) */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-950 border border-slate-800">
            <button
              type="button"
              onClick={() => setTemplateConfig({ ...templateConfig, sendMode: 'template' })}
              className={
                'py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer ' +
                ((templateConfig.sendMode || 'template') === 'template'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-400 hover:text-white')
              }
            >
              📋 Plantilla de Meta (Marketing / Utility)
            </button>
            <button
              type="button"
              onClick={() => setTemplateConfig({ ...templateConfig, sendMode: 'direct_send' })}
              className={
                'py-2 px-3 rounded-xl text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ' +
                (templateConfig.sendMode === 'direct_send'
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white')
              }
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>Envío Directo (Sin Plantilla)</span>
            </button>
          </div>

          {templateConfig.sendMode === 'direct_send' && (
            <div className="p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 text-[11px] text-indigo-200 space-y-1">
              <div className="font-bold text-indigo-300 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Meta Direct Send Activo (category: &quot;utility&quot;)</span>
              </div>
              <p className="text-indigo-200/80 leading-relaxed">
                Envía avisos informativos de eventos (horarios, logística de ingreso, cambios de fecha o recordatorios a compradores) <strong>sin crear ni esperar aprobación de plantilla en Meta</strong>. Meta genera la plantilla automáticamente en segundo plano. <em>(No usar para promociones comerciales puras de Marketing)</em>.
              </p>
            </div>
          )}

          {/* MODO A: PLANTILLA DE META */}
          {(templateConfig.sendMode || 'template') === 'template' && (
            <>
              {/* Selector de plantillas cargadas desde Meta */}
              {metaTemplates.length > 0 && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase">
                    Seleccionar Plantilla de tu cuenta Meta ({metaTemplates.length})
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder="Filtrar plantillas aprobadas..."
                      className="w-full px-3 py-1.5 mb-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                    <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950 divide-y divide-slate-900">
                      {metaTemplates
                        .filter(
                          (t) =>
                            !templateSearch ||
                            t.name.toLowerCase().includes(templateSearch.toLowerCase())
                        )
                        .map((tpl) => (
                          <button
                            key={tpl.id}
                            type="button"
                            onClick={() => handleSelectMetaTemplate(tpl)}
                            className={
                              'w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-slate-900 transition-colors cursor-pointer ' +
                              (templateConfig.name === tpl.name
                                ? 'bg-emerald-950/50 text-emerald-300'
                                : 'text-slate-300')
                            }
                          >
                            <div className="truncate pr-2">
                              <span className="font-mono font-bold">{tpl.name}</span>
                              <span className="text-[10px] text-slate-400 ml-1.5">
                                ({tpl.language})
                              </span>
                            </div>
                            <span
                              className={
                                'text-[10px] px-1.5 py-0.5 rounded font-bold ' +
                                (tpl.status === 'APPROVED'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-amber-500/20 text-amber-400')
                              }
                            >
                              {tpl.status}
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Nombre manual e Idioma (exactamente como en index.js) */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Nombre de Plantilla (template.name)
                  </label>
                  <input
                    type="text"
                    value={templateConfig.name}
                    onChange={(e) =>
                      setTemplateConfig({ ...templateConfig, name: e.target.value })
                    }
                    placeholder="info_villaarruga"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Idioma (code)
                  </label>
                  <input
                    type="text"
                    list="whatsapp-lang-codes"
                    value={templateConfig.languageCode}
                    onChange={(e) =>
                      setTemplateConfig({ ...templateConfig, languageCode: e.target.value })
                    }
                    placeholder="es_co"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <datalist id="whatsapp-lang-codes">
                    <option value="es_co" />
                    <option value="es_CO" />
                    <option value="es" />
                    <option value="es_MX" />
                    <option value="en_US" />
                    <option value="en" />
                  </datalist>
                </div>
              </div>
            </>
          )}

          {/* Header Multimedia (Imagen / Video / Documento / Ninguno) */}
          <div className="space-y-2">
            <label className="block text-[11px] font-bold text-slate-400 uppercase">
              Cabecera Multimedia (Header Component)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'NONE', label: 'Sin Header', icon: X },
                  { id: 'IMAGE', label: 'Imagen', icon: ImageIcon },
                  { id: 'VIDEO', label: 'Video MP4', icon: Video },
                  { id: 'DOCUMENT', label: 'PDF/Doc', icon: FileText },
                ] as const
              ).map((item) => {
                const Icon = item.icon;
                const active = templateConfig.headerType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      setTemplateConfig({ ...templateConfig, headerType: item.id })
                    }
                    className={
                      'py-2 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 border transition-all cursor-pointer ' +
                      (active
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white')
                    }
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {templateConfig.headerType !== 'NONE' && (
              <div>
                <input
                  type="url"
                  value={templateConfig.headerMediaUrl}
                  onChange={(e) =>
                    setTemplateConfig({ ...templateConfig, headerMediaUrl: e.target.value })
                  }
                  placeholder={
                    templateConfig.headerType === 'IMAGE'
                      ? 'https://res.cloudinary.com/.../imagen.jpg'
                      : 'https://res.cloudinary.com/.../video.mp4'
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}
          </div>

          {templateConfig.sendMode === 'direct_send' ? (
            /* CAMPOS EXCLUSIVOS DE ENVÍO DIRECTO (DIRECT SEND - category: "utility") */
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-indigo-300 uppercase">
                    Texto del Mensaje (Direct Send Body)
                  </label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setTemplateConfig({
                          ...templateConfig,
                          directBodyText:
                            (templateConfig.directBodyText || '') + ' {{primer_nombre}}',
                        })
                      }
                      className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold hover:bg-indigo-500/30 cursor-pointer"
                    >
                      + {`{{primer_nombre}}`}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setTemplateConfig({
                          ...templateConfig,
                          directBodyText: (templateConfig.directBodyText || '') + ' {{nombre}}',
                        })
                      }
                      className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] font-mono font-bold hover:bg-indigo-500/30 cursor-pointer"
                    >
                      + {`{{nombre}}`}
                    </button>
                  </div>
                </div>
                <textarea
                  rows={4}
                  value={templateConfig.directBodyText || ''}
                  onChange={(e) =>
                    setTemplateConfig({ ...templateConfig, directBodyText: e.target.value })
                  }
                  placeholder="Hola {{primer_nombre}}, te informamos que las puertas del evento en Arena USC abrirán a las 6:00 PM. Presenta tu código QR al ingreso."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Pie de Mensaje (Footer Opcional)
                  </label>
                  <input
                    type="text"
                    value={templateConfig.directFooterText || ''}
                    onChange={(e) =>
                      setTemplateConfig({ ...templateConfig, directFooterText: e.target.value })
                    }
                    placeholder="QRBoletos Oficial"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Botón Interactivo (Direct Send)
                  </label>
                  <select
                    value={templateConfig.directButtonType || 'NONE'}
                    onChange={(e) =>
                      setTemplateConfig({
                        ...templateConfig,
                        directButtonType: e.target.value as any,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  >
                    <option value="NONE">Sin Botón</option>
                    <option value="CTA_URL">Botón Link Web (CTA URL)</option>
                    <option value="QUICK_REPLY">Botón Respuesta Rápida</option>
                  </select>
                </div>
              </div>

              {templateConfig.directButtonType && templateConfig.directButtonType !== 'NONE' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                      Texto del Botón (Máx 20 car.)
                    </label>
                    <input
                      type="text"
                      maxLength={20}
                      value={templateConfig.directButtonText || ''}
                      onChange={(e) =>
                        setTemplateConfig({ ...templateConfig, directButtonText: e.target.value })
                      }
                      placeholder="Ver Detalles"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                  </div>
                  {templateConfig.directButtonType === 'CTA_URL' && (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                        URL del Botón
                      </label>
                      <input
                        type="url"
                        value={templateConfig.directButtonUrl || ''}
                        onChange={(e) =>
                          setTemplateConfig({ ...templateConfig, directButtonUrl: e.target.value })
                        }
                        placeholder="https://qrboletos.com"
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Variables del Body ({{1}}, {{2}}, ...) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold text-slate-400 uppercase">
                    Variables del Texto Body ({templateConfig.bodyVariables.length})
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setTemplateConfig({
                        ...templateConfig,
                        bodyVariables: [
                          ...templateConfig.bodyVariables,
                          { type: 'customer_first_name', value: 'Cliente' },
                        ],
                      })
                    }
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Agregar Variable {`{{${templateConfig.bodyVariables.length + 1}}}`}</span>
                  </button>
                </div>

                {templateConfig.bodyVariables.map((v, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-2 py-1">
                      <span className="text-[11px] font-mono font-bold text-emerald-400">{"{{"}</span>
                      <input
                        type="text"
                        value={v.paramName ?? ''}
                        onChange={(e) => {
                          const next = [...templateConfig.bodyVariables];
                          next[idx] = { ...next[idx], paramName: e.target.value.replace(/[\{\}\s]/g, '') };
                          setTemplateConfig({ ...templateConfig, bodyVariables: next });
                        }}
                        placeholder={`${idx + 1}`}
                        title="Deja vacío para variable numérica ({{1}}) o escribe el nombre (ej. nombre para {{nombre}})"
                        className="w-16 bg-transparent text-xs font-mono font-bold text-emerald-400 text-center focus:outline-none"
                      />
                      <span className="text-[11px] font-mono font-bold text-emerald-400">{"}}"}</span>
                    </div>
                    <select
                      value={v.type}
                      onChange={(e) => {
                        const next = [...templateConfig.bodyVariables];
                        next[idx] = { ...next[idx], type: e.target.value as any };
                        setTemplateConfig({ ...templateConfig, bodyVariables: next });
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                    >
                      <option value="customer_first_name">Primer Nombre del Cliente</option>
                      <option value="customer_name">Nombre Completo del Cliente</option>
                      <option value="fixed">Texto Fijo</option>
                    </select>
                    <input
                      type="text"
                      value={v.value}
                      onChange={(e) => {
                        const next = [...templateConfig.bodyVariables];
                        next[idx] = { ...next[idx], value: e.target.value };
                        setTemplateConfig({ ...templateConfig, bodyVariables: next });
                      }}
                      placeholder={
                        v.type === 'fixed' ? 'Valor de la variable' : 'Fallback si está vacío'
                      }
                      className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const next = templateConfig.bodyVariables.filter((_, i) => i !== idx);
                        setTemplateConfig({ ...templateConfig, bodyVariables: next });
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Componente de Botón Dinámico (Cupón copy_code como FERIA20 en index.js) */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Parámetro de Botón
                  </label>
                  <select
                    value={templateConfig.buttonType}
                    onChange={(e) =>
                      setTemplateConfig({
                        ...templateConfig,
                        buttonType: e.target.value as TemplateConfig['buttonType'],
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                  >
                    <option value="NONE">Sin parámetro dinámico (o Botón URL Estática)</option>
                    <option value="COPY_CODE">Botón Copiar Cupón (copy_code)</option>
                    <option value="URL_SUFFIX">Botón URL Dinámica (solo si la URL en Meta tiene variable)</option>
                  </select>
                </div>
                {templateConfig.buttonType !== 'NONE' && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                      {templateConfig.buttonType === 'COPY_CODE' ? 'Código de Cupón' : 'Sufijo URL'}
                    </label>
                    <input
                      type="text"
                      value={templateConfig.buttonValue}
                      onChange={(e) =>
                        setTemplateConfig({ ...templateConfig, buttonValue: e.target.value })
                      }
                      placeholder={
                        templateConfig.buttonType === 'COPY_CODE' ? 'FERIA20' : 'evento-123'
                      }
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                    />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Vista Previa Estilo Burbuja de WhatsApp */}
          <div className="p-3.5 rounded-2xl bg-[#0b141a] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase">
              <span className="flex items-center gap-1 text-emerald-400">
                <Eye className="w-3 h-3" /> Vista Previa WhatsApp
              </span>
              <span className="font-mono">{templateConfig.name}</span>
            </div>
            <div className="bg-[#005c4b] text-slate-100 rounded-2xl rounded-tl-none p-3 space-y-2 text-xs shadow-md max-w-sm">
              {templateConfig.headerType === 'IMAGE' && templateConfig.headerMediaUrl && (
                <div className="rounded-xl overflow-hidden bg-black/30 max-h-44 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={templateConfig.headerMediaUrl}
                    alt="Header preview"
                    className="max-h-44 w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              {templateConfig.headerType === 'VIDEO' && templateConfig.headerMediaUrl && (
                <div className="p-2.5 rounded-xl bg-black/40 text-emerald-300 font-mono text-[11px] flex items-center gap-2 truncate">
                  <Video className="w-4 h-4 shrink-0" />
                  <span className="truncate">{templateConfig.headerMediaUrl}</span>
                </div>
              )}
              <p className="whitespace-pre-wrap leading-relaxed">{previewBodyText}</p>
              {templateConfig.buttonType === 'COPY_CODE' && templateConfig.buttonValue && (
                <div className="pt-1.5 border-t border-white/15 text-center text-[11px] font-bold text-emerald-200">
                  📋 Copiar código: {templateConfig.buttonValue}
                </div>
              )}
            </div>
          </div>

          {/* Envío de Prueba Rápido (numsP) */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <label className="block text-[11px] font-bold text-slate-400 uppercase">
              Probar Plantilla en tu WhatsApp antes del Masivo
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="573163197319"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
              />
              <button
                type="button"
                onClick={handleSendTestMessage}
                disabled={sendingTest}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>{sendingTest ? 'Enviando...' : 'Enviar Prueba'}</span>
              </button>
            </div>
            {testResult && (
              <div
                className={
                  'p-2.5 rounded-xl text-xs border ' +
                  (testResult.ok
                    ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-300'
                    : 'bg-red-950/50 border-red-500/40 text-red-300')
                }
              >
                {testResult.msg}
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA (7 cols): Segmentación desde API de Clientes + Exclusión + Limpieza */}
        <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-white">
                2. Segmentación y Limpieza de Números (Customers API)
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">
                Base local:{' '}
                <strong className="text-emerald-400">
                  {customers.length.toLocaleString()} clientes
                </strong>
              </span>
              <button
                type="button"
                onClick={handleSyncCustomersFromApi}
                disabled={syncingCustomers}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 border border-slate-700 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw
                  className={'w-3 h-3 ' + (syncingCustomers ? 'animate-spin text-emerald-400' : '')}
                />
                <span>
                  {syncingCustomers
                    ? `Sincronizando (${syncProgress?.loaded || 0})...`
                    : 'Actualizar Clientes API'}
                </span>
              </button>
            </div>
          </div>

          {/* Selector de Origen de Datos */}
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'crm', label: 'Solo Base Clientes API' },
                { id: 'both', label: 'Clientes API + Lista Externa' },
                { id: 'external', label: 'Solo Lista Externa / CSV' },
              ] as const
            ).map((src) => (
              <button
                key={src.id}
                type="button"
                onClick={() => setAudienceSource(src.id)}
                className={
                  'py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ' +
                  (audienceSource === src.id
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white')
                }
              >
                {src.label}
              </button>
            ))}
          </div>

          {/* Filtros del CRM (Incluir Eventos / Excluir Eventos que ya compraron / Cantidad / LTV) */}
          {(audienceSource === 'crm' || audienceSource === 'both') && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {/* INCLUIR COMPRADORES DE EVENTOS */}
              <div className="relative" ref={includeRef}>
                <label className="block text-[11px] font-bold text-emerald-400 uppercase mb-1">
                  ✅ Incluir compradores de eventos ({includeEvents.length === 0 ? 'Todos' : includeEvents.length})
                </label>
                <button
                  type="button"
                  onClick={() => setIncludeDropdownOpen(!includeDropdownOpen)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-left text-slate-200 flex items-center justify-between cursor-pointer"
                >
                  <span className="truncate">
                    {includeEvents.length === 0
                      ? 'Todos los clientes de la base'
                      : `${includeEvents.length} evento(s) seleccionado(s)`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                </button>

                {includeDropdownOpen && (
                  <div className="absolute z-30 mt-1 w-full rounded-2xl bg-slate-950 border border-slate-700 shadow-2xl p-2 space-y-1.5">
                    <input
                      type="text"
                      value={includeEventSearch}
                      onChange={(e) => setIncludeEventSearch(e.target.value)}
                      placeholder="Buscar evento a incluir..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                    <div className="flex justify-between px-1 text-[10px] text-slate-400">
                      <button
                        type="button"
                        onClick={() => setIncludeEvents([])}
                        className="text-emerald-400 hover:underline cursor-pointer"
                      >
                        Incluir Todos
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-900">
                      {uniqueEvents
                        .filter(
                          (ev) =>
                            !includeEventSearch ||
                            ev.toLowerCase().includes(includeEventSearch.toLowerCase())
                        )
                        .map((ev) => {
                          const checked = includeEvents.includes(ev);
                          return (
                            <button
                              key={ev}
                              type="button"
                              onClick={() =>
                                setIncludeEvents((prev) =>
                                  checked ? prev.filter((x) => x !== ev) : [...prev, ev]
                                )
                              }
                              className="w-full px-2.5 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-slate-900 text-slate-200 cursor-pointer"
                            >
                              <div
                                className={
                                  'w-3.5 h-3.5 rounded flex items-center justify-center border ' +
                                  (checked
                                    ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                                    : 'border-slate-700')
                                }
                              >
                                {checked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>
                              <span className="truncate">{ev}</span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* EXCLUIR COMPRADORES DEL EVENTO ACTUAL (Reemplaza numsBlock27) */}
              <div className="relative" ref={excludeRef}>
                <label className="block text-[11px] font-bold text-rose-400 uppercase mb-1">
                  🚫 Excluir quienes YA compraron ({excludeEvents.length})
                </label>
                <button
                  type="button"
                  onClick={() => setExcludeDropdownOpen(!excludeDropdownOpen)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-rose-500/30 text-xs text-left text-slate-200 flex items-center justify-between cursor-pointer"
                >
                  <span className="truncate">
                    {excludeEvents.length === 0
                      ? 'Ningún evento excluido'
                      : `Excluyendo ${excludeEvents.length} evento(s)`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                </button>

                {excludeDropdownOpen && (
                  <div className="absolute z-30 mt-1 w-full rounded-2xl bg-slate-950 border border-rose-500/40 shadow-2xl p-2 space-y-1.5">
                    <input
                      type="text"
                      value={excludeEventSearch}
                      onChange={(e) => setExcludeEventSearch(e.target.value)}
                      placeholder="Buscar evento cuyos compradores excluir..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                    />
                    <div className="flex justify-between px-1 text-[10px] text-slate-400">
                      <button
                        type="button"
                        onClick={() => setExcludeEvents([])}
                        className="text-rose-400 hover:underline cursor-pointer"
                      >
                        Limpiar exclusiones
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-900">
                      {uniqueEvents
                        .filter(
                          (ev) =>
                            !excludeEventSearch ||
                            ev.toLowerCase().includes(excludeEventSearch.toLowerCase())
                        )
                        .map((ev) => {
                          const checked = excludeEvents.includes(ev);
                          return (
                            <button
                              key={ev}
                              type="button"
                              onClick={() =>
                                setExcludeEvents((prev) =>
                                  checked ? prev.filter((x) => x !== ev) : [...prev, ev]
                                )
                              }
                              className="w-full px-2.5 py-1.5 text-left text-xs flex items-center gap-2 hover:bg-slate-900 text-slate-200 cursor-pointer"
                            >
                              <div
                                className={
                                  'w-3.5 h-3.5 rounded flex items-center justify-center border ' +
                                  (checked
                                    ? 'bg-rose-500 border-rose-500 text-white'
                                    : 'border-slate-700')
                                }
                              >
                                {checked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                              </div>
                              <span className="truncate">{ev}</span>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>

              {/* Filtro por Cantidad de Eventos y LTV mínimo */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Frecuencia de Compra (Eventos distintos)
                </label>
                <select
                  value={minEventsCount}
                  onChange={(e) => setMinEventsCount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white"
                >
                  <option value="todos">Todos (Compradores + Registrados)</option>
                  <option value="1+">1+ Eventos (Al menos 1 compra)</option>
                  <option value="2+">2+ Eventos (Clientes Recurrentes)</option>
                  <option value="3+">3+ Eventos (Fans Frecuentes)</option>
                  <option value="5+">5+ Eventos (Clientes VIP)</option>
                  <option value="0">0 Eventos (Registrados sin compra)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Gasto Acumulado Mínimo (LTV COP)
                </label>
                <input
                  type="number"
                  min={0}
                  step={50000}
                  value={minLtvCop}
                  onChange={(e) => setMinLtvCop(Number(e.target.value) || 0)}
                  placeholder="0"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                />
              </div>
            </div>
          )}

          {/* Lista Externa de Números (Pegar o Subir archivo CSV / nums.js) */}
          {(audienceSource === 'external' || audienceSource === 'both') && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold text-indigo-300 uppercase">
                  Lista Externa de Teléfonos (Pegar o subir CSV / nums.js)
                </label>
                <label className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-[11px] font-bold border border-indigo-500/30 cursor-pointer flex items-center gap-1">
                  <Upload className="w-3 h-3" />
                  <span>Subir CSV / TXT / nums.js</span>
                  <input
                    type="file"
                    accept=".csv,.txt,.js,.json"
                    onChange={handleUploadExternalNumbersFile}
                    className="hidden"
                  />
                </label>
              </div>
              <textarea
                rows={4}
                value={externalRawText}
                onChange={(e) => setExternalRawText(e.target.value)}
                placeholder={`Un contacto por línea con Número y Nombre (o solo el número):\n3163197319, Andrés Holguín\n573158862020, Laura Gómez\n3104005060`}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white font-mono"
              />
            </div>
          )}

          {/* Bloqueados (numsBlock) + Importar message_report.json anterior para excluir ya enviados */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pt-2 border-t border-slate-800">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                🚫 Lista Negra Permanente (numsBlock)
              </label>
              <textarea
                rows={2}
                value={blockedNumbersText}
                onChange={(e) => setBlockedNumbersText(e.target.value)}
                placeholder="573172346545..."
                className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-rose-300 font-mono"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-bold text-slate-400 uppercase">
                📂 Excluir enviados de un message_report.json previo
              </label>
              <div className="flex items-center gap-2">
                <label className="flex-1 px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs text-slate-300 font-semibold cursor-pointer flex items-center justify-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                  <span className="truncate">
                    {importedReportName || 'Cargar message_report_*.json'}
                  </span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportPreviousReportJson}
                    className="hidden"
                  />
                </label>
                {previouslySentNumbers.size > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setPreviouslySentNumbers(new Set());
                      setImportedReportName(null);
                    }}
                    className="p-2 rounded-xl bg-red-950/50 text-red-400 hover:bg-red-900/50 text-xs cursor-pointer"
                    title="Limpiar excluidos del JSON"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allowInternational}
                    onChange={(e) => setAllowInternational(e.target.checked)}
                    className="rounded border-slate-700"
                  />
                  <span>Incluir móviles internacionales (fuera de +57)</span>
                </label>

                <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCustomRange}
                    onChange={(e) => {
                      setUseCustomRange(e.target.checked);
                      if (e.target.checked && rangeEnd === 0) {
                        setRangeEnd(audienceAnalysis.allValidRecipients.length);
                      }
                    }}
                    className="rounded border-slate-700"
                  />
                  <span>Rango (start/end)</span>
                </label>
              </div>

              {useCustomRange && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">
                      Desde índice (start)
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={rangeStart}
                      onChange={(e) => setRangeStart(Number(e.target.value) || 0)}
                      className="w-full px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">
                      Hasta índice (end)
                    </span>
                    <input
                      type="number"
                      min={0}
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(Number(e.target.value) || 0)}
                      className="w-full px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white font-mono"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Resumen de Limpieza y Botón para Preparar Campaña */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
              <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Fijos / Inválidos</div>
                <div className="text-sm font-extrabold text-slate-300 font-mono">
                  -{audienceAnalysis.invalidPhonesCount.toLocaleString()}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Duplicados</div>
                <div className="text-sm font-extrabold text-slate-300 font-mono">
                  -{audienceAnalysis.duplicatePhonesCount.toLocaleString()}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="text-[10px] text-rose-400 font-bold uppercase">Ya Compraron</div>
                <div className="text-sm font-extrabold text-rose-400 font-mono">
                  -{audienceAnalysis.excludedByEventCount.toLocaleString()}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-slate-900/90 border border-slate-800">
                <div className="text-[10px] text-amber-400 font-bold uppercase">Bloq. / JSON Previo</div>
                <div className="text-sm font-extrabold text-amber-400 font-mono">
                  -
                  {(
                    audienceAnalysis.excludedByBlocklistCount +
                    audienceAnalysis.excludedByPrevReportCount
                  ).toLocaleString()}
                </div>
              </div>
              <div className="p-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 col-span-2 sm:col-span-1">
                <div className="text-[10px] text-emerald-300 font-bold uppercase">
                  Listos (573...)
                </div>
                <div className="text-base font-black text-emerald-400 font-mono">
                  {audienceAnalysis.finalRecipients.length.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Zap className="w-4 h-4 text-amber-400" />
                <span>Velocidad paralela:</span>
                <select
                  value={concurrency}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs text-emerald-400 font-bold"
                >
                  <option value={50}>⚡ 50 msg/lote (Máxima Velocidad Paralela)</option>
                  <option value={30}>🚀 30 msg/lote (Turbo)</option>
                  <option value={15}>⚙️ 15 msg/lote (Estándar)</option>
                  <option value={5}>🛡️ 5 msg/lote (Conservador)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleCreateCampaignQueue}
                disabled={audienceAnalysis.finalRecipients.length === 0 || isSending}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 cursor-pointer disabled:opacity-50 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>
                  Cargar Cola de Envío ({audienceAnalysis.finalRecipients.length.toLocaleString()}{' '}
                  números)
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* PASO 3: CONSOLA DE EJECUCIÓN MASIVA, PROGRESO EN TIEMPO REAL Y REANUDACIÓN */}
      {activeCampaign && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-extrabold text-white uppercase tracking-wide">
                  3. Consola de Campaña: {activeCampaign.title}
                </h2>
                <span
                  className={
                    'text-[11px] px-2.5 py-0.5 rounded-full font-mono font-bold uppercase ' +
                    (activeCampaign.status === 'completed'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : activeCampaign.status === 'running'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 animate-pulse'
                      : activeCampaign.status === 'token_expired'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-slate-800 text-slate-300')
                  }
                >
                  {activeCampaign.status === 'token_expired'
                    ? 'PAUSADA (TOKEN VENCIDO)'
                    : activeCampaign.status}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Progreso guardado número por número en IndexedDB. Si se cierra el navegador o vence el token, puedes continuar desde el último pendiente.
              </p>
            </div>

            {/* Botones de Acción de la Campaña */}
            <div className="flex items-center gap-2 flex-wrap">
              {!isSending && activeCampaign.stats.pending > 0 && (
                <button
                  type="button"
                  onClick={() => runCampaignLoop(activeCampaign, false)}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-2 shadow-lg cursor-pointer"
                >
                  <Play className="w-4 h-4" />
                  <span>
                    {activeCampaign.stats.sent > 0
                      ? `Reanudar donde quedó (${activeCampaign.stats.pending.toLocaleString()} pendientes)`
                      : `Iniciar Envío Masivo (${activeCampaign.stats.pending.toLocaleString()})`}
                  </span>
                </button>
              )}

              {isSending && (
                <button
                  type="button"
                  onClick={() => {
                    stopRequestedRef.current = true;
                  }}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold flex items-center gap-2 shadow-lg cursor-pointer"
                >
                  <Pause className="w-4 h-4" />
                  <span>Pausar Envío</span>
                </button>
              )}

              {!isSending && activeCampaign.stats.failed > 0 && (
                <button
                  type="button"
                  onClick={() => runCampaignLoop(activeCampaign, true)}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reintentar Fallidos ({activeCampaign.stats.failed.toLocaleString()})</span>
                </button>
              )}

              <button
                type="button"
                onClick={async () => {
                  await persistCampaignReport(activeCampaign);
                  setReportCreatedBanner({
                    id: activeCampaign.id,
                    title: activeCampaign.title,
                    sent: activeCampaign.stats.sent,
                    total: activeCampaign.stats.total,
                  });
                }}
                className="px-3.5 py-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-xs font-bold flex items-center gap-1.5 border border-emerald-500/30 cursor-pointer"
                title="Guardar o actualizar el informe de esta campaña en el Módulo de Informes"
              >
                <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Guardar en Informes</span>
              </button>

              <Link
                href="/informes?tab=masivos"
                className="px-3.5 py-2.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-xs font-bold flex items-center gap-1.5 border border-indigo-500/30 cursor-pointer"
                title="Abrir esta campaña en el Módulo de Informes (/informes)"
              >
                <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
                <span>Ver en Módulo Informes</span>
              </Link>

              <button
                type="button"
                onClick={() => handleDownloadJsonReport(activeCampaign)}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                title="Descargar JSON idéntico a message_report.json de tu script Node.js"
              >
                <Download className="w-3.5 h-3.5 text-emerald-400" />
                <span>JSON Report</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadCsvReport(activeCampaign)}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                <span>Exportar CSV</span>
              </button>
            </div>
          </div>

          {/* Banner de Informe Creado al finalizar el envío */}
          {reportCreatedBanner && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-indigo-950/60 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <div>
                  <h4 className="text-xs font-extrabold text-emerald-300 uppercase">
                    ✅ Informe Creado: {reportCreatedBanner.title}
                  </h4>
                  <p className="text-[11px] text-slate-300">
                    Se registraron{' '}
                    <strong className="text-white">
                      {reportCreatedBanner.sent.toLocaleString()} enviados
                    </strong>{' '}
                    de {reportCreatedBanner.total.toLocaleString()} en el historial de informes.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('analytics')}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Ver Analítica Aquí</span>
                </button>
                <Link
                  href="/informes?tab=masivos"
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <span>Ir al Módulo de Informes (/informes) →</span>
                </Link>
              </div>
            </div>
          )}

          {/* Tarjetas de Estadísticas y Barra de Progreso */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Total Cola</span>
              <div className="text-xl font-black text-white font-mono mt-0.5">
                {activeCampaign.stats.total.toLocaleString()}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30">
              <span className="text-[10px] font-bold text-emerald-400 uppercase">
                ✅ Enviados (Accepted)
              </span>
              <div className="text-xl font-black text-emerald-400 font-mono mt-0.5">
                {activeCampaign.stats.sent.toLocaleString()}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/30">
              <span className="text-[10px] font-bold text-amber-300 uppercase">⏳ Pendientes</span>
              <div className="text-xl font-black text-amber-300 font-mono mt-0.5">
                {activeCampaign.stats.pending.toLocaleString()}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-rose-950/40 border border-rose-500/30">
              <span className="text-[10px] font-bold text-rose-400 uppercase">❌ Fallidos</span>
              <div className="text-xl font-black text-rose-400 font-mono mt-0.5">
                {activeCampaign.stats.failed.toLocaleString()}
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 col-span-2 sm:col-span-1">
              <span className="text-[10px] font-bold text-indigo-400 uppercase">
                ⚡ Velocidad / ETA
              </span>
              <div className="text-sm font-extrabold text-indigo-300 font-mono mt-1">
                {isSending ? `${sendSpeedMsgPerSec} msg/s` : 'En espera'}
                {isSending && sendSpeedMsgPerSec > 0 && (
                  <span className="block text-[11px] text-slate-400">
                    ~{Math.ceil(activeCampaign.stats.pending / sendSpeedMsgPerSec)}s restantes
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Barra de Progreso */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs font-bold">
              <span className="text-slate-300">
                Progreso:{' '}
                {(
                  ((activeCampaign.stats.sent + activeCampaign.stats.failed) /
                    Math.max(1, activeCampaign.stats.total)) *
                  100
                ).toFixed(1)}
                %
              </span>
              <span className="text-slate-400 font-mono">
                {activeCampaign.stats.sent + activeCampaign.stats.failed} /{' '}
                {activeCampaign.stats.total}
              </span>
            </div>
            <div className="w-full h-3 rounded-full bg-slate-950 overflow-hidden border border-slate-800 flex">
              <div
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{
                  width: `${
                    (activeCampaign.stats.sent / Math.max(1, activeCampaign.stats.total)) * 100
                  }%`,
                }}
              />
              <div
                className="bg-rose-500 h-full transition-all duration-300"
                style={{
                  width: `${
                    (activeCampaign.stats.failed / Math.max(1, activeCampaign.stats.total)) * 100
                  }%`,
                }}
              />
            </div>
          </div>

          {/* Filtros de tabla de destinatarios y selector de campañas anteriores */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'all', label: `Todos (${activeCampaign.stats.total})` },
                  { id: 'sent', label: `Enviados (${activeCampaign.stats.sent})` },
                  { id: 'pending', label: `Pendientes (${activeCampaign.stats.pending})` },
                  { id: 'failed', label: `Fallidos (${activeCampaign.stats.failed})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLogFilter(tab.id)}
                  className={
                    'px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ' +
                    (logFilter === tab.id
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800')
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {campaigns.length > 1 && (
              <div className="flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={activeCampaign.id}
                  onChange={(e) => {
                    const found = campaigns.find((c) => c.id === e.target.value);
                    if (found) setActiveCampaign(found);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200"
                >
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} — {c.stats.sent}/{c.stats.total} env.
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('¿Eliminar este historial de campaña?')) return;
                    await deleteCampaignFromDb(activeCampaign.id);
                    const next = await getAllCampaignsFromDb();
                    setCampaigns(next);
                    setActiveCampaign(next[0] || null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer"
                  title="Eliminar campaña guardada"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Tabla de Estado por Número (Primeros 150 de la vista filtrada para máximo rendimiento) */}
          <div className="max-h-72 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-900/90 text-slate-400 sticky top-0 text-[10px] uppercase font-bold">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">WhatsApp</th>
                  <th className="py-2.5 px-3">Cliente</th>
                  <th className="py-2.5 px-3">Estado</th>
                  <th className="py-2.5 px-3">WAMID / Respuesta Meta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {filteredCampaignRecipients.slice(0, 150).map((r, idx) => (
                  <tr key={r.num} className="hover:bg-slate-900/40">
                    <td className="py-2 px-3 font-mono text-slate-500">{idx + 1}</td>
                    <td className="py-2 px-3 font-mono font-bold text-slate-200">{r.num}</td>
                    <td className="py-2 px-3 text-slate-300 truncate max-w-[180px]">
                      {r.name || '—'}
                    </td>
                    <td className="py-2 px-3">
                      {r.status === 'sent' && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                          ACCEPTED
                        </span>
                      )}
                      {r.status === 'pending' && (
                        <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-bold">
                          PENDIENTE
                        </span>
                      )}
                      {r.status === 'failed' && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 text-[10px] font-bold">
                          ERROR
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-slate-400 truncate max-w-xs">
                      {r.wamid ||
                        (r.error ? r.error.message || JSON.stringify(r.error) : 'En cola')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL PARA CREAR NUEVA PLANTILLA DIRECTAMENTE EN META */}
      {showCreateTemplateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-extrabold text-white uppercase">
                Crear Nueva Plantilla en Meta WhatsApp Manager
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateTemplateModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMetaTemplate} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Nombre (minúsculas_y_guiones)
                  </label>
                  <input
                    type="text"
                    required
                    value={newTpl.name}
                    onChange={(e) => setNewTpl({ ...newTpl, name: e.target.value })}
                    placeholder="promo_concierto_nov"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Idioma
                  </label>
                  <select
                    value={newTpl.language}
                    onChange={(e) => setNewTpl({ ...newTpl, language: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="es_CO">Español Colombia (es_CO)</option>
                    <option value="es">Español General (es)</option>
                    <option value="en_US">Inglés (en_US)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                  Texto del Mensaje (Body) — Usa {`{{1}}`} para variables
                </label>
                <textarea
                  rows={4}
                  required
                  value={newTpl.bodyText}
                  onChange={(e) => setNewTpl({ ...newTpl, bodyText: e.target.value })}
                  placeholder="¡Hola! No te pierdas nuestro próximo evento en Arena USC. Adquiere tus boletas oficiales en QRBoletos."
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    Tipo de Botón (Opcional)
                  </label>
                  <select
                    value={newTpl.buttonType}
                    onChange={(e) => setNewTpl({ ...newTpl, buttonType: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                  >
                    <option value="NONE">Sin Botón</option>
                    <option value="URL">Botón Link Web (URL)</option>
                    <option value="COPY_CODE">Botón Copiar Cupón</option>
                    <option value="QUICK_REPLY">Respuesta Rápida</option>
                  </select>
                </div>
                {newTpl.buttonType !== 'NONE' && (
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                      Texto del Botón
                    </label>
                    <input
                      type="text"
                      value={newTpl.buttonText}
                      onChange={(e) => setNewTpl({ ...newTpl, buttonText: e.target.value })}
                      placeholder="Comprar Boletas"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white"
                    />
                  </div>
                )}
              </div>

              {newTpl.buttonType === 'URL' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                    URL de Destino
                  </label>
                  <input
                    type="url"
                    value={newTpl.buttonUrl}
                    onChange={(e) => setNewTpl({ ...newTpl, buttonUrl: e.target.value })}
                    placeholder="https://qrboletos.com"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateTemplateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creatingTemplate}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer disabled:opacity-50"
                >
                  {creatingTemplate ? 'Enviando a Meta...' : 'Crear Plantilla en Meta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
