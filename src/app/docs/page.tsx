'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import packageJson from '../../../package.json';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  Layers,
  Sparkles,
  Ticket,
  Users,
  Palette,
  Settings,
  Database,
  Search,
  ExternalLink,
  ShieldCheck,
  Zap,
  CheckCircle2,
  FileText,
  Clock,
  Code2,
  Bot,
  Sliders,
  ChevronRight,
  TrendingUp,
  Tag,
  Info,
  Globe
} from 'lucide-react';

interface FeatureScope {
  id: string;
  category: string;
  title: string;
  badge: string;
  badgeColor: string;
  description: string;
  capabilities: string[];
  technicalDetails?: string;
  icon: any;
}

const APP_SCOPES: FeatureScope[] = [
  {
    id: 'catalog-live-capacity',
    category: 'Ventas & Aforos',
    title: 'Aforo en Vivo y Catálogo Oficial',
    badge: 'API Oficial v1',
    badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    description:
      'Integración directa server-to-server con la API oficial de Catálogo de QRBoletos. Permite monitorizar el aforo vendido, cupos disponibles y ocupación porcentual en tiempo real.',
    capabilities: [
      'Cálculo en vivo de aforo total vs cupos vendidos y porcentaje de ocupación.',
      'Barras de progresión dinámicas con semáforo inteligente (<60% verde, 60-89% ámbar, >=90% rojo) debajo del título de cada card.',
      'Desglose individual por localidad con aforo, vendidos y porcentaje.',
      'Consolidación automática de localidades duplicadas o con funciones múltiples (ej. Gran Circo de China).',
      'Compatibilidad con eventos simples y eventos con múltiples espectáculos/funciones.'
    ],
    technicalDetails: 'GET /api/catalog | OAuth2 Client Credentials con caché en memoria de 45s.',
    icon: Ticket
  },
  {
    id: 'crm-audience',
    category: 'Audiencia & CRM',
    title: 'Directorio de Compradores & CRM',
    badge: 'Big Data / IndexedDB',
    badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
    description:
      'Directorio integral de más de 24,000 compradores sincronizado desde la API oficial de Compradores de QRBoletos con persistencia local ultrarrápida.',
    capabilities: [
      'Descarga progresiva y paginación por cursores para almacenar decenas de miles de clientes.',
      'Almacenamiento en IndexedDB del navegador (qrboletos_crm_db) para consultas y filtrado en milisegundos.',
      'Búsqueda universal instantánea por nombre, email o número de documento.',
      'Métrica exclusiva de eventos únicos asistidos (cálculo mediante Set para evitar falsos duplicados por compras múltiples).',
      'Filtro dinámico por número de eventos asistidos (1 evento, 2 eventos, 3 o más).',
      'Exportación con 1 clic a Excel (.xlsx) y CSV con soporte UTF-8 BOM para marketing y remarketing.',
      'Modal de auditoría para inspeccionar el JSON original (Raw JSON) de cada cliente.'
    ],
    technicalDetails: 'Ruta dedicada: /clientes | GET /api/customers | IndexedDB local con transacciones readwrite.',
    icon: Users
  },
  {
    id: 'localities-bulk-open',
    category: 'Operaciones & Secciones',
    title: 'Gestor de Localidades & Apertura Masiva',
    badge: 'Operación Rápida',
    badgeColor: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
    description:
      'Panel especializado para organizar, jerarquizar y gestionar todas las secciones de un evento con acciones operativas masivas en un solo clic.',
    capabilities: [
      'Ordenamiento jerárquico inteligente (Platea, VIP, Preferencial, General).',
      'Apertura masiva de todas las localidades en pestañas individuales de un solo clic.',
      'Acceso simultáneo a Configuración de Secciones, Precios/Tarifarios y Asientos numerados.',
      'Retardo escalonado (100ms) para evitar bloqueos del navegador por saturación de ventanas.',
      'Alerta visual con instrucciones para autorizar ventanas emergentes en caso de bloqueo.'
    ],
    technicalDetails: 'Client-side window.open escalonado compatible con cualquier navegador y dispositivo.',
    icon: Layers
  },
  {
    id: 'canonical-flyers',
    category: 'Diseño & Catálogo',
    title: 'Estandarización Canónica de Afiches (CloudFront)',
    badge: 'Imágenes HD',
    badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    description:
      'Motor extractor de afiches oficiales de alta resolución alojados en CloudFront para mantener una imagen uniforme y profesional en todo el dashboard.',
    capabilities: [
      'Extracción automática del flyer vertical canónico home.jpg (720x639 píxeles).',
      'Eliminación de inconsistencias entre banners horizontales de cabecera y miniaturas.',
      'Relación de aspecto vertical consistente (3:4) con desenfoque de fondo y zoom sutil en hover.',
      'Persistencia del enlace del flyer en Google Sheets para sincronización multiusuario.'
    ],
    technicalDetails: 'CDN CloudFront oficial de QRBoletos con fallback inteligente.',
    icon: Palette
  },
  {
    id: 'ai-pricing-extraction',
    category: 'Inteligencia Artificial',
    title: 'Carga de Tarifarios con Inteligencia Artificial',
    badge: 'Gemini Multimodal',
    badgeColor: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
    description:
      'Digitalización y carga automática de listas de precios a partir de fotografías o afiches del comité organizador mediante Google Gemini AI.',
    capabilities: [
      'Análisis multimodal de imágenes de tarifarios físicos o digitales.',
      'Extracción estructurada de nombres de localidades, precios base, servicios y aforos.',
      'Previsualización interactiva con opción de edición antes de sincronizar.',
      'Inyección automatizada en la plataforma de QRBoletos a través del bot local.'
    ],
    technicalDetails: 'Google Gemini 2.5 Flash Multimodal API + Python CDP injector.',
    icon: Sparkles
  },
  {
    id: 'bulk-artwork-updater',
    category: 'Diseño & Taquilla',
    title: 'Actualizador Masivo de Artes Gráficas',
    badge: 'Automatización',
    badgeColor: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
    description:
      'Herramienta para actualizar en lote los diseños visuales de las boletas en todas las localidades del evento sin hacerlo una por una manualmente.',
    capabilities: [
      'Actualización masiva del arte del QRBoleto digital (boleto descargable en PDF/móvil).',
      'Actualización masiva del diseño de Boca (impresión térmica en taquilla física).',
      'Actualización masiva del diseño de Rollo / Godex para eventos masivos.',
      'Verificación previa del estado de los artes en cada sección.'
    ],
    technicalDetails: 'Playwright CDP session conectado a Chrome en puerto 9222.',
    icon: Palette
  },
  {
    id: 'event-settings-central',
    category: 'Configuración de Evento',
    title: 'Configurador Centralizado del Evento',
    badge: 'Administración',
    badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    description:
      'Panel central para editar y sincronizar metadatos globales del evento de forma rápida y controlada.',
    capabilities: [
      'Gestión de descripción general, términos y condiciones y restricciones.',
      'Configuración de edad mínima permitida y políticas de acceso.',
      'Control de switches y flags del evento (preventa, visible en taquilla, boletas nominadas, etc.).',
      'Sincronización de sliders, logos y banners promocionales.'
    ],
    technicalDetails: 'Sincronización dual mediante API de eventos y automatización Chrome.',
    icon: Settings
  },
  {
    id: 'sales-reports',
    category: 'Finanzas & Reportería',
    title: 'Generador de Informes de Ventas & Cortesías',
    badge: 'Reportería PDF/Excel',
    badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    description:
      'Módulo de liquidación y control financiero que genera informes oficiales consolidados de taquilla.',
    capabilities: [
      'Desglose detallado de boletas vendidas, cortesías y recaudación neta.',
      'Filtros multidimensionales por taquilla, método de pago y rango de fechas.',
      'Generación de reportes ejecutivos en formato PDF con formato formal de liquidación.',
      'Exportación a hojas de cálculo Excel (.xlsx) con fórmulas automáticas de sumatoria.'
    ],
    technicalDetails: 'Ruta dedicada: /informes | Generadores Python openpyxl y ReportLab ejecutados en sandbox.',
    icon: FileText
  },
  {
    id: 'hybrid-persistence',
    category: 'Infraestructura',
    title: 'Persistencia Híbrida Google Sheets + Local Storage',
    badge: 'Nube + Local',
    badgeColor: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
    description:
      'Almacenamiento multiusuario en tiempo real con respaldo automático que garantiza disponibilidad total con o sin conexión a la nube.',
    capabilities: [
      'Sincronización bidireccional automática con Google Sheets API v4 mediante Service Account.',
      'Preservación de eventos en borrador (en configuración) y eventos archivados históricos.',
      'Modo Local Storage transparente como contingencia si la conexión a Google Sheets se interrumpe.',
      'Promoción automática de eventos de borrador a activos en cuanto salen a la venta.'
    ],
    technicalDetails: 'Google Sheets API v4 con Service Account IAM y fallback local.',
    icon: Database
  },
  {
    id: 'tunnel-cloud-bridge',
    category: 'Infraestructura',
    title: 'Puente Híbrido Nube-Local (Tunnel Proxy)',
    badge: 'Vercel + Local CDP',
    badgeColor: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    description:
      'Arquitectura de proxy inverso que permite desplegar el dashboard en Vercel mientras ejecuta automatizaciones de Chrome en la máquina local del operador.',
    capabilities: [
      'Detección automática de entorno (Vercel Cloud vs Localhost).',
      'Túnel de reenvío transparente para peticiones de automatización (/api/chrome/*).',
      'Permite acceder al dashboard desde cualquier lugar del mundo manteniendo control del bot local.'
    ],
    technicalDetails: 'Middleware tunnelProxy con tokens seguros y reverse proxying.',
    icon: Zap
  }
];

interface VersionRelease {
  version: string;
  date: string;
  title: string;
  isLatest?: boolean;
  highlight: string;
  changes: {
    type: 'added' | 'changed' | 'fixed' | 'removed';
    text: string;
  }[];
}

const RELEASES: VersionRelease[] = [
  {
    version: '1.2.0',
    date: '2026-09-18',
    title: 'Revolución de Aforos en Vivo, CRM con IndexedDB y Apertura Masiva',
    isLatest: true,
    highlight:
      'Integración total de Catalog API v1 para aforos en tiempo real con barras de progreso, CRM con 24,000 compradores en IndexedDB, afiches CloudFront canónicos y apertura masiva en pestañas.',
    changes: [
      {
        type: 'added',
        text: 'Integración oficial con Catalog API v1 de QRBoletos para aforos vendidos, cupos totales y porcentajes en vivo.'
      },
      {
        type: 'added',
        text: 'Barras de progresión dinámicas con gradientes adaptativos (<60% verde, 60-89% ámbar, >=90% rojo) debajo del título de cada card de evento.'
      },
      {
        type: 'added',
        text: 'Aforo vendido, disponible y barra de progresión individual en cada tarjeta de localidad.'
      },
      {
        type: 'added',
        text: 'Consolidación automática de localidades duplicadas o segmentadas (ej. Gran Circo de China).'
      },
      {
        type: 'added',
        text: 'Módulo Audiencia & CRM con 24,000+ compradores sincronizados en IndexedDB local ultrarrápido.'
      },
      {
        type: 'added',
        text: 'Métrica de cantidad de eventos únicos asistidos (calculada con Set para evitar duplicaciones).'
      },
      {
        type: 'added',
        text: 'Exportación masiva de compradores a Excel (.xlsx) y CSV con codificación UTF-8 BOM.'
      },
      {
        type: 'added',
        text: 'Modal de auditoría con visor de JSON crudo (Raw JSON) por comprador.'
      },
      {
        type: 'added',
        text: 'Barra de apertura masiva de localidades en nuevas pestañas con 1 clic (Configuración, Precios, Asientos).'
      },
      {
        type: 'added',
        text: 'Estandarización de afiches canónicos CloudFront (home.jpg 720x639) en proporción vertical uniforme (3:4).'
      },
      {
        type: 'added',
        text: 'Nueva página interactiva de documentación técnica y de versiones (/docs).'
      },
      {
        type: 'added',
        text: 'Desacoplamiento de módulos hacia rutas dedicadas /informes y /clientes con navegación directa en barra superior y alias de redirección.'
      },
      {
        type: 'changed',
        text: 'Normalización visual de botones: eliminación de emojis dobles en Actualizar Artes, Configurar Evento y Aforo en Vivo.'
      },
      {
        type: 'changed',
        text: 'Estandarización de botones superiores con altura fija (h-9), padding uniforme y prevención de saltos de línea.'
      },
      {
        type: 'changed',
        text: 'Eliminación del scraping antiguo en Firestore (/cache/home) reemplazado por la API oficial de Catálogo.'
      }
    ]
  },
  {
    version: '1.1.2',
    date: '2026-09-16',
    title: 'Sincronización de Variables de Entorno en Nube',
    highlight:
      'Actualización de variables de entorno de servidor en Vercel para credenciales de cliente API QRBoletos.',
    changes: [
      {
        type: 'changed',
        text: 'Despliegue de producción sincronizado con variables seguras en Vercel (QRBOLETOS_CLIENT_ID y QRBOLETOS_CLIENT_SECRET).'
      }
    ]
  },
  {
    version: '1.1.1',
    date: '2026-09-16',
    title: 'Modal de Credenciales Dinámicas en Caliente',
    highlight:
      'Soporte interactivo para configuración de credenciales de API en tiempo de ejecución.',
    changes: [
      {
        type: 'added',
        text: 'Modal interactivo para ingresar client_id y client_secret de las APIs de Eventry / QRBoletos en caliente.'
      },
      {
        type: 'added',
        text: 'Persistencia local segura de credenciales en almacenamiento de navegador.'
      }
    ]
  },
  {
    version: '1.1.0',
    date: '2026-09-16',
    title: 'Fase 1 de Integración con APIs de Eventry / QRBoletos',
    highlight:
      'Lanzamiento del módulo inicial de Audiencia & CRM y del cliente de APIs oficial.',
    changes: [
      {
        type: 'added',
        text: 'Integración oficial con Customers API v1 y Catalog API v1.'
      },
      {
        type: 'added',
        text: 'Módulo inicial de Audiencia & CRM con directorio de compradores y desglose de boletas por evento.'
      },
      {
        type: 'added',
        text: 'Cliente TypeScript QrboletosApiClient con autenticación OAuth2 Client Credentials y caché.'
      },
      {
        type: 'added',
        text: 'Endpoints internos /api/customers y /api/catalog.'
      }
    ]
  },
  {
    version: '1.0.0',
    date: '2026-09-16',
    title: 'Lanzamiento Inicial con SemVer y Módulo de Informes',
    highlight:
      'Primera versión con control de versiones semántico, módulo unificado de informes y vista de eventos.',
    changes: [
      {
        type: 'added',
        text: 'Control de versiones semántico (SemVer) reflejado en la interfaz de usuario.'
      },
      {
        type: 'added',
        text: 'Archivo CHANGELOG.md para el seguimiento formal de cambios.'
      },
      {
        type: 'changed',
        text: 'Refactorización total del módulo de informes unificados de Ventas y Cortesías.'
      },
      {
        type: 'changed',
        text: 'Sustitución de checkboxes nativos por iconos de Lucide (CheckSquare) para modo oscuro.'
      },
      {
        type: 'removed',
        text: 'Eliminación del sub-módulo obsoleto de Reporte Individual.'
      }
    ]
  }
];

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState<'scopes' | 'changelog' | 'architecture'>('scopes');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = ['all', ...Array.from(new Set(APP_SCOPES.map((s) => s.category)))];

  const filteredScopes = APP_SCOPES.filter((scope) => {
    const matchesSearch =
      scope.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scope.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      scope.capabilities.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase())) ||
      scope.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || scope.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const filteredReleases = RELEASES.filter((release) => {
    return (
      release.version.toLowerCase().includes(searchQuery.toLowerCase()) ||
      release.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      release.highlight.toLowerCase().includes(searchQuery.toLowerCase()) ||
      release.changes.some((c) => c.text.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-emerald-500/30 selection:text-emerald-300">
      {/* Barra de Navegación Superior */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white rounded-xl transition-all flex items-center gap-1.5 text-xs font-semibold shadow-sm cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al Dashboard</span>
            </Link>

            <div className="h-4 w-px bg-slate-800 hidden sm:block" />

            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-900/30">
                <BookOpen className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  Documentación & Alcances
                  <span className="text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    v{packageJson.version}
                  </span>
                </h1>
                <p className="text-[11px] text-slate-400">QRBoletos Dashboard Helper • Manual de Sistema</p>
              </div>
            </div>
          </div>

          {/* Selector de Pestañas Principales */}
          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-semibold self-start sm:self-auto">
            <button
              onClick={() => setActiveTab('scopes')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'scopes'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Alcances y Módulos
            </button>
            <button
              onClick={() => setActiveTab('changelog')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'changelog'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Historial de Versiones
            </button>
            <button
              onClick={() => setActiveTab('architecture')}
              className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                activeTab === 'architecture'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Arquitectura Técnica
            </button>
          </div>
        </div>
      </header>

      {/* Contenido Principal */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* Banner de Bienvenida y Buscador */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/40 border border-slate-800 p-6 sm:p-8 shadow-2xl">
          <div className="relative z-10 max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Centro Oficial de Documentación • Versión {packageJson.version}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Alcances, Módulos y Registro de Releases
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Explora todas las capacidades operativas del QRBoletos Dashboard Helper: sincronización de catálogos y aforos en vivo, base de datos CRM de compradores, automatizaciones de Chrome, tarifas con IA y reportería ejecutiva.
            </p>

            {/* Input de Búsqueda Universal */}
            <div className="pt-2">
              <div className="relative max-w-lg">
                <Search className="w-4.5 h-4.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar módulo, función, versión o palabra clave..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ======================================================================= */}
        {/* PESTAÑA 1: ALCANCES Y MÓDULOS DE LA APP                                  */}
        {/* ======================================================================= */}
        {activeTab === 'scopes' && (
          <div className="space-y-6">
            {/* Filtro por Categorías */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap capitalize ${
                    selectedCategory === cat
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {cat === 'all' ? 'Todos los Módulos' : cat}
                </button>
              ))}
            </div>

            {/* Grid de Alcances */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredScopes.map((scope) => {
                const IconComponent = scope.icon;
                return (
                  <div
                    key={scope.id}
                    className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between gap-4 hover:border-slate-700 transition-all shadow-md group"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-emerald-400 group-hover:scale-105 transition-transform shrink-0">
                            <IconComponent className="w-5 h-5" />
                          </div>
                          <div>
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                              {scope.category}
                            </span>
                            <h3 className="text-base font-bold text-white group-hover:text-emerald-400 transition-colors">
                              {scope.title}
                            </h3>
                          </div>
                        </div>

                        <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${scope.badgeColor} shrink-0`}>
                          {scope.badge}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">
                        {scope.description}
                      </p>

                      <div className="space-y-2 pt-2 border-t border-slate-800/80">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                          Funcionalidades y Alcances Clave:
                        </span>
                        <ul className="space-y-1.5">
                          {scope.capabilities.map((cap, idx) => (
                            <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                              <span>{cap}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {scope.technicalDetails && (
                      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                        <span className="flex items-center gap-1 text-slate-400">
                          <Code2 className="w-3.5 h-3.5 text-slate-400" />
                          Implementación:
                        </span>
                        <span className="text-slate-300 truncate max-w-xs">{scope.technicalDetails}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* PESTAÑA 2: HISTORIAL DE VERSIONES (CHANGELOG)                            */}
        {/* ======================================================================= */}
        {activeTab === 'changelog' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Cronología de Entregas y Versionado Semántico</h3>
                  <p className="text-xs text-slate-400">
                    Seguimiento detallado de cada versión publicada en producción y sandbox.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-xl">
                  Versión Actual: v{packageJson.version}
                </span>
              </div>
            </div>

            <div className="space-y-6">
              {filteredReleases.map((release) => (
                <div
                  key={release.version}
                  className={`rounded-3xl border p-6 sm:p-7 transition-all ${
                    release.isLatest
                      ? 'bg-gradient-to-b from-slate-900 via-slate-900 to-emerald-950/20 border-emerald-500/40 shadow-xl'
                      : 'bg-slate-900/70 border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-sm font-mono font-extrabold px-3 py-1 rounded-xl ${
                          release.isLatest
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        v{release.version}
                      </span>
                      <h3 className="text-base font-bold text-white">{release.title}</h3>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{release.date}</span>
                    </div>
                  </div>

                  <div className="py-3">
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">
                      {release.highlight}
                    </p>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-slate-800">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Lista de Cambios ({release.changes.length}):
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {release.changes.map((change, idx) => {
                        const badgeStyles =
                          change.type === 'added'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : change.type === 'changed'
                            ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                            : change.type === 'fixed'
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                            : 'bg-rose-500/10 text-rose-400 border-rose-500/30';

                        const typeLabel =
                          change.type === 'added'
                            ? 'Añadido'
                            : change.type === 'changed'
                            ? 'Modificado'
                            : change.type === 'fixed'
                            ? 'Corregido'
                            : 'Eliminado';

                        return (
                          <div
                            key={idx}
                            className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-2.5 flex items-start gap-2.5"
                          >
                            <span
                              className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 ${badgeStyles}`}
                            >
                              {typeLabel}
                            </span>
                            <span className="text-xs text-slate-300 leading-snug">{change.text}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* PESTAÑA 3: ARQUITECTURA TÉCNICA E INTEGRACIONES                          */}
        {/* ======================================================================= */}
        {activeTab === 'architecture' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Card 1: APIs QRBoletos / Eventry */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-sm">
                  <Globe className="w-4 h-4" />
                  <span>APIs Oficiales Eventry</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Conexión directa vía protocolo OAuth2 Client Credentials contra los servidores oficiales de QRBoletos.
                </p>
                <div className="space-y-1.5 text-xs text-slate-400 font-mono">
                  <div>• Catalog API v1 (Aforos en Vivo)</div>
                  <div>• Customers API v1 (24k+ Compradores)</div>
                  <div>• Autenticación Server-to-Server Bearer</div>
                </div>
              </div>

              {/* Card 2: Almacenamiento & Caché */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2.5 text-indigo-400 font-bold text-sm">
                  <Database className="w-4 h-4" />
                  <span>Almacenamiento Híbrido</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Persistencia multi-nivel para combinar escalabilidad en la nube con velocidad local inmediata.
                </p>
                <div className="space-y-1.5 text-xs text-slate-400 font-mono">
                  <div>• Google Sheets API v4 (Persistencia)</div>
                  <div>• IndexedDB (CRM de Compradores)</div>
                  <div>• In-Memory TTL Cache (Aforos y Catálogo)</div>
                </div>
              </div>

              {/* Card 3: Automatización & IA */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-center gap-2.5 text-teal-400 font-bold text-sm">
                  <Bot className="w-4 h-4" />
                  <span>Automatización & IA</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Herramientas complementarias para tareas de alta fricción manual en la plataforma.
                </p>
                <div className="space-y-1.5 text-xs text-slate-400 font-mono">
                  <div>• Google Gemini 2.5 (Extracción de Tarifas)</div>
                  <div>• Chrome CDP (Playwright Bot puerto 9222)</div>
                  <div>• Tunnel Proxy (Puente Vercel a Local)</div>
                </div>
              </div>
            </div>

            {/* Diagrama de Arquitectura en Tabla de Servicios */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-500" />
                Matriz de Servicios y Endpoints Internos
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Endpoint / Ruta</th>
                      <th className="py-2.5 px-3">Módulo</th>
                      <th className="py-2.5 px-3">Origen de Datos</th>
                      <th className="py-2.5 px-3">Caché / Persistencia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono text-[11px]">
                    <tr>
                      <td className="py-2.5 px-3 text-emerald-400">/api/catalog</td>
                      <td className="py-2.5 px-3 font-sans">Aforos y Localidades</td>
                      <td className="py-2.5 px-3 font-sans">Catalog API v1 (QRBoletos)</td>
                      <td className="py-2.5 px-3">45 segundos (Memoria)</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-emerald-400">/api/customers</td>
                      <td className="py-2.5 px-3 font-sans">Directorio CRM</td>
                      <td className="py-2.5 px-3 font-sans">Customers API v1 (Eventry)</td>
                      <td className="py-2.5 px-3">IndexedDB local</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-emerald-400">/api/sync</td>
                      <td className="py-2.5 px-3 font-sans">Sincronizador Híbrido</td>
                      <td className="py-2.5 px-3 font-sans">Catálogo + CloudFront</td>
                      <td className="py-2.5 px-3">Google Sheets / Local</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-emerald-400">/api/pricing/extract</td>
                      <td className="py-2.5 px-3 font-sans">Tarifario IA</td>
                      <td className="py-2.5 px-3 font-sans">Google Gemini Multimodal</td>
                      <td className="py-2.5 px-3">En caliente</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3 text-emerald-400">/api/reports/*</td>
                      <td className="py-2.5 px-3 font-sans">Ventas & Cortesías</td>
                      <td className="py-2.5 px-3 font-sans">Scripts Python / Sheets</td>
                      <td className="py-2.5 px-3">PDF / Excel descargables</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Footer Informativo */}
        <footer className="pt-6 pb-12 border-t border-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div>
            QRBoletos Dashboard Helper • Versión <strong className="text-slate-300 font-mono">v{packageJson.version}</strong>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:text-emerald-400 transition-colors">
              Ir al Dashboard
            </Link>
            <a
              href="https://github.com/andresmholguin/dashboar-qrboletos-helper"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-emerald-400 transition-colors flex items-center gap-1"
            >
              Repositorio GitHub <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
