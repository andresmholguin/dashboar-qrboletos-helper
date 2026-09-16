# Changelog

Todas las novedades, correcciones y mejoras del QRBoletos Dashboard Helper sern documentadas aqu.

El formato est basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/), y este proyecto adhiere al [Semantic Versioning](https://semver.org/lang/es/).

## [1.1.2] - 2026-09-16
### Cambiado
- Despliegue de producción sincronizado para activar las variables de entorno de Vercel (`QRBOLETOS_CLIENT_ID` y `QRBOLETOS_CLIENT_SECRET`).

## [1.1.1] - 2026-09-16
### Añadido
- Modal interactivo de configuración de credenciales API en la interfaz de Audiencia & CRM con guardado persistente local.
- Soporte para autenticación dinámica con `client_id` y `client_secret` en tiempo de ejecución tanto en `CustomersView` como en `AvailabilityModal`.

## [1.1.0] - 2026-09-16
### Añadido
- Integración oficial con APIs de Eventry / QRBoletos (`Customers API v1` y `Catalog API v1`).
- Nuevo módulo de **Audiencia & CRM**: Directorio completo de compradores con búsqueda universal, desglose de boletas por evento y exportación de audiencias a formato CSV para marketing.
- Widget de **Aforo y Disponibilidad en Vivo**: Consulta en tiempo real de cupos disponibles vs aforo total, estados de venta y desglose de tarifas por localidad sin necesidad de scraping.
- Cliente TypeScript `QrboletosApiClient` con autenticación OAuth2 Client Credentials y caché en memoria.
- Endpoints internos `/api/customers` y `/api/catalog`.

## [1.0.0] - 2026-09-16
### Aadido
- Control de versiones y semver. Ahora la interfaz muestra la versin de la app.
- Archivo CHANGELOG.md para el seguimiento de versiones.

### Cambiado
- Refactorizacin total del mdulo de informes (Ventas y Cortesas).
- Unificacin de la vista consolidada con soporte de filtros por checkbox.
- Reemplazo de checkboxes nativos por iconos de Lucide (CheckSquare) para mayor claridad visual en el modo oscuro.

### Eliminado
- Eliminado el sub-mdulo obsoleto de 'Reporte Individual'.
