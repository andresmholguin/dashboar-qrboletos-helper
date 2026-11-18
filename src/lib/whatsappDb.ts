/**
 * Base de datos local IndexedDB para Campañas Masivas de WhatsApp (/masivos)
 * Guarda el progreso número por número en tiempo real para permitir
 * reanudación exacta si el Access Token de Meta vence o se cierra el navegador.
 */

export interface CampaignRecipient {
  num: string; // Formato ej. "573163197319"
  name?: string;
  email?: string;
  eventsCount?: number;
  ltv?: number;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  wamid?: string;
  error?: any;
  updatedAt?: string;
}

export interface TemplateConfig {
  name: string;
  languageCode: string; // ej. "es_co", "es_CO", "es", "en_US"
  headerType: 'NONE' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  headerMediaUrl: string;
  bodyVariables: Array<{
    type: ' fixed' | 'customer_name' | 'customer_first_name' | 'fixed';
    value: string; // valor fijo o fallback si el cliente no tiene nombre
  }>;
  buttonType: 'NONE' | 'COPY_CODE' | 'URL_SUFFIX';
  buttonValue: string; // ej. "FERIA20" para copy_code
}

export interface WhatsAppCampaign {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'draft' | 'running' | 'paused' | 'token_expired' | 'completed';
  templateConfig: TemplateConfig;
  recipients: CampaignRecipient[];
  stats: {
    total: number;
    sent: number;
    failed: number;
    pending: number;
  };
}

const DB_NAME = 'qrboletos_whatsapp_masivos_db';
const DB_VERSION = 1;
const STORE_CAMPAIGNS = 'campaigns';
const STORE_SETTINGS = 'settings';

// Números bloqueados permanentes rescatados de D:\whatsapp_api_nodejs-main\numsBlock.js
export const DEFAULT_BLOCKED_NUMBERS = [
  '573172346545',
  '573008476947',
  '573104332309',
  '573160539404',
];

function openWhatsAppDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB no está disponible en este entorno.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_CAMPAIGNS)) {
        db.createObjectStore(STORE_CAMPAIGNS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
        db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveCampaignToDb(campaign: WhatsAppCampaign): Promise<void> {
  const db = await openWhatsAppDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAMPAIGNS, 'readwrite');
    const store = tx.objectStore(STORE_CAMPAIGNS);

    // Recalcular estadísticas
    let sent = 0;
    let failed = 0;
    let pending = 0;
    for (const r of campaign.recipients) {
      if (r.status === 'sent') sent++;
      else if (r.status === 'failed') failed++;
      else if (r.status === 'pending') pending++;
    }
    campaign.stats = {
      total: campaign.recipients.length,
      sent,
      failed,
      pending,
    };
    campaign.updatedAt = new Date().toISOString();

    store.put(campaign);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getAllCampaignsFromDb(): Promise<WhatsAppCampaign[]> {
  const db = await openWhatsAppDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAMPAIGNS, 'readonly');
    const store = tx.objectStore(STORE_CAMPAIGNS);
    const request = store.getAll();

    request.onsuccess = () => {
      db.close();
      const list: WhatsAppCampaign[] = request.result || [];
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      resolve(list);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function deleteCampaignFromDb(id: string): Promise<void> {
  const db = await openWhatsAppDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_CAMPAIGNS, 'readwrite');
    const store = tx.objectStore(STORE_CAMPAIGNS);
    store.delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

export async function getWhatsAppSetting<T = any>(key: string, defaultValue: T): Promise<T> {
  try {
    const db = await openWhatsAppDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_SETTINGS, 'readonly');
      const store = tx.objectStore(STORE_SETTINGS);
      const req = store.get(key);
      req.onsuccess = () => {
        db.close();
        resolve(req.result ? req.result.value : defaultValue);
      };
      req.onerror = () => {
        db.close();
        resolve(defaultValue);
      };
    });
  } catch {
    return defaultValue;
  }
}

export async function setWhatsAppSetting(key: string, value: any): Promise<void> {
  try {
    const db = await openWhatsAppDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_SETTINGS, 'readwrite');
      const store = tx.objectStore(STORE_SETTINGS);
      store.put({ key, value });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  } catch (e) {
    console.warn('No se pudo guardar setting en IndexedDB:', e);
  }
}

/**
 * Normaliza y valida un número telefónico para WhatsApp Cloud API.
 * - Si tiene 10 dígitos y empieza por 3 (celular Colombia), le antepone "57" -> "573XXXXXXXXX" (12 dígitos).
 * - Si tiene 12 dígitos y empieza por "573", es un celular colombiano válido.
 * - Si empieza por "57" pero el tercer dígito NO es 3 (ej. "57032...", "57113...", "572..."), se descarta por ser fijo o erróneo.
 * - Si allowInternational es true, acepta números internacionales de 11 a 15 dígitos que no empiecen por 57 ni 0.
 */
export function normalizeWhatsAppNumber(
  rawPhone: string | number | null | undefined,
  allowInternational = true
): { valid: boolean; normalized: string; reason?: string } {
  if (rawPhone === null || rawPhone === undefined) {
    return { valid: false, normalized: '', reason: 'Vacío' };
  }

  let digits = String(rawPhone).replace(/[^0-9]/g, '');
  if (!digits) {
    return { valid: false, normalized: '', reason: 'Sin dígitos' };
  }

  // Quitar prefijo 00 internacional si existe (ej. 0057...)
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }

  // Caso 1: Celular colombiano de 10 dígitos (3XXXXXXXXX)
  if (digits.length === 10 && digits.startsWith('3')) {
    return { valid: true, normalized: '57' + digits };
  }

  // Caso 2: Número colombiano con código de país 57
  if (digits.startsWith('57')) {
    if (digits.length === 12 && digits.startsWith('573')) {
      return { valid: true, normalized: digits };
    }
    // A veces digitan 57 + 03... o 57 + fijo
    return {
      valid: false,
      normalized: digits,
      reason: 'Número colombiano no móvil o longitud inválida (debe ser 573XXXXXXXXX)',
    };
  }

  // Caso 3: Internacional (ej. USA 1..., España 34..., UK 44..., etc.)
  if (allowInternational && digits.length >= 11 && digits.length <= 15 && !digits.startsWith('0')) {
    return { valid: true, normalized: digits };
  }

  return {
    valid: false,
    normalized: digits,
    reason: `Formato o longitud inválida (${digits.length} dígitos)`,
  };
}
