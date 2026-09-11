export interface Evento {
  id?: string; // ID único del evento en QRBoletos/Firestore (ej: 2991) o ID de fila
  rowId?: string; // Fila en Google Sheets
  nombre: string;
  fecha: string;
  promoterId: string;
  eventId: string;
  showId: string;
  urlBase: string;
  fechaCreacion: string;
  favorito: boolean;
  imageUrl?: string;
  enlace?: string; // URL pública del evento en qrboletos.com
  localidades?: Localidad[];
  enVenta?: boolean; // true si está a la venta en QRBoletos/Firestore, false si está en configuración/borrador
  espectaculo?: string; // Nombre del espectáculo o función (ej: "31 OCTUBRE 2026")
  sitio?: string; // Recinto o sitio donde se realiza el evento
  pulep?: string; // Código PULEP del evento
}

export interface LocalidadLink {
  label: string;
  url: string;
}

export interface Localidad {
  nombre: string;
  url: string; // Enlace principal de configuración
  id?: string;
  links?: LocalidadLink[]; // Todos los enlaces encontrados dentro de la tarjeta
}

export interface ModuleConfig {
  name: string;
  path: string; // e.g. 'reports/sales/summary.aspx'
  category: 'Informes' | 'Configuración' | 'Ventas' | 'Acomodación';
  icon: string;
}

export interface PrecioItemConfig {
  id?: string;
  referencia: string; // e.g. "PLATEA PRE", "PLATEA FULL"
  etapa: string; // e.g. "Preventa", "Full", "Lanzamiento"
  moneda: string; // "COP"
  valor: number;
  servicio: number;
  aforo: number; // 0 para última etapa (full)
  habilitadoOnline?: boolean;
  habilitadoTaquilla?: boolean;
}

export interface LocalidadPreciosConfig {
  nombre: string; // Nombre normalizado de la localidad (ej. PLATEA, VIP 1)
  seccionId?: string; // ID en QRBoletos extraído de sections.aspx
  aforoTotal?: number;
  precios: PrecioItemConfig[];
}

export interface TarifarioExtracted {
  eventoNombre?: string;
  fecha?: string;
  lugar?: string;
  localidades: LocalidadPreciosConfig[];
  advertencias?: string[];
}

export interface ChromeSyncLog {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  localidad?: string;
  referencia?: string;
}

