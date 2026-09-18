# Changelog

Todas las novedades, correcciones y mejoras del **QRBoletos Dashboard Helper** están documentadas en este archivo.

El formato está basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/) y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

---

## [1.2.0] - 2026-09-18
### Añadido
- **Página de Documentación y Versiones (`/docs`):** Nueva URL interactiva con el desglose exhaustivo de todos los alcances funcionales de la app, arquitectura técnica, integraciones de APIs y cronología de releases.
- **Integración Oficial con Catalog API v1 (Eventry / QRBoletos):**
  - Sincronización oficial de eventos activos sin depender de scraping de base de datos externa.
  - Métricas de aforo en vivo: consulta en tiempo real de cupos vendidos vs aforo total y porcentaje de ocupación.
  - Barras de progresión dinámicas con gradientes adaptativos (`emerald`, `amber`, `rose`) visibles debajo del título de cada tarjeta de evento en el dashboard.
  - Soporte para eventos anidados (funciones/espectáculos) y mapa de silletería numerada.
- **Aforo y Progresión por Localidad:**
  - Desglose detallado de cupos vendidos, disponibles y porcentaje individual en cada tarjeta de localidad.
  - Consolidación automática de aforos en localidades con nombres repetidos o segmentados (ej. Gran Circo de China).
- **Apertura Masiva en Pestañas en 1 Clic:**
  - Acciones rápidas en el encabezado de localidades para abrir de golpe en nuevas pestañas:
    - ⚙️ *Configuración de todas las localidades*.
    - 💲 *Precios/tarifarios de todas las localidades*.
    - 💺 *Asientos/acomodación numerada de todas las localidades*.
  - Retardo escalonado de 100ms para evitar bloqueos del navegador.
- **Estandarización Canónica de Afiches CloudFront:**
  - Extractor de afiches canónicos de alta definición (`home.jpg` 720x639) alojados en la CDN de CloudFront.
  - Relación de aspecto vertical consistente (3:4) para todas las cards, eliminando discrepancias visuales entre banners horizontales y miniaturas.
- **Módulo de Audiencia & CRM Completo:**
  - Paginación automática por cursores para sincronizar más de 24,000 compradores de la API oficial de compradores (`Customers API v1`).
  - Almacenamiento local persistente de alta velocidad con **IndexedDB** (`qrboletos_crm_db`) para consultas y búsquedas instantáneas en milisegundos.
  - Métrica de cantidad de **eventos únicos asistidos** calculada con `Set` (garantizando que compras múltiples para una misma función cuenten como 1 evento).
  - Exportación con un solo clic a formato Excel (.xlsx) y CSV con soporte UTF-8 BOM.
  - Visor de auditoría JSON sin procesar (*Raw JSON*) por comprador.

### Cambiado
- **Uniformidad Visual de Botones:** Eliminación de emojis redundantes en botones con iconos Lucide SVG (`Actualizar Artes`, `Configurar Evento`, `Aforo y Cupos en Vivo`).
- Estandarización de alturas (`h-9`), padding, bordes redondeados y prevención de saltos de línea antiestéticos.
- Promoción de eventos en borrador a *"A LA VENTA"* preservando datos en Google Sheets.
- Eliminación de dependencias de scraping antiguo en Firestore (`/cache/home`) con error de permisos.

---

## [1.1.2] - 2026-09-16
### Cambiado
- Despliegue de producción sincronizado para activar las variables de entorno de Vercel (`QRBOLETOS_CLIENT_ID` y `QRBOLETOS_CLIENT_SECRET`).

---

## [1.1.1] - 2026-09-16
### Añadido
- Modal interactivo de configuración de credenciales API en la interfaz de Audiencia & CRM con guardado persistente local.
- Soporte para autenticación dinámica con `client_id` y `client_secret` en tiempo de ejecución tanto en `CustomersView` como en `AvailabilityModal`.

---

## [1.1.0] - 2026-09-16
### Añadido
- Integración oficial con APIs de Eventry / QRBoletos (`Customers API v1` y `Catalog API v1`).
- Nuevo módulo de **Audiencia & CRM**: Directorio completo de compradores con búsqueda universal, desglose de boletas por evento y exportación de audiencias a formato CSV para marketing.
- Widget de **Aforo y Disponibilidad en Vivo**: Consulta en tiempo real de cupos disponibles vs aforo total, estados de venta y desglose de tarifas por localidad sin necesidad de scraping.
- Cliente TypeScript `QrboletosApiClient` con autenticación OAuth2 Client Credentials y caché en memoria.
- Endpoints internos `/api/customers` y `/api/catalog`.

---

## [1.0.0] - 2026-09-16
### Añadido
- Control de versiones semántico (`SemVer`). La interfaz muestra la versión de la app.
- Archivo `CHANGELOG.md` para el seguimiento formal de versiones.

### Cambiado
- Refactorización total del módulo de informes (Ventas y Cortesías).
- Unificación de la vista consolidada con soporte de filtros por checkbox.
- Reemplazo de checkboxes nativos por iconos de Lucide (`CheckSquare`) para mayor claridad visual en modo oscuro.

### Eliminado
- Eliminado el sub-módulo obsoleto de 'Reporte Individual'.
