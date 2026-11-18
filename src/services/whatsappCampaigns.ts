import fs from 'fs';
import path from 'path';

export interface PersistentCampaignStats {
  total: number;
  sent: number;
  failed: number;
  delivered: number;
  read: number;
  interacted: number;
  costUsd?: number;
  metaSynced?: boolean;
  lastMetaSyncAt?: string;
  buttonClicksBreakdown?: Array<{
    type?: string;
    button_content?: string;
    count: number;
  }>;
}

export interface PersistentCampaign {
  id: string;
  title: string;
  templateName: string;
  languageCode?: string;
  eventHint?: string;
  linkedEvents?: string[];
  createdAt: string;
  updatedAt: string;
  source?: 'historical_nodejs' | 'masivos_web' | 'meta_analytics' | 'imported_json';
  stats: PersistentCampaignStats;
  sentPhones: string[];
  deliveredPhones?: string[];
  readPhones?: string[];
  interactedPhones?: string[];
}

interface CampaignsFileSchema {
  updatedAt: string;
  campaigns: PersistentCampaign[];
}

const CAMPAIGNS_DIR = path.join(process.cwd(), 'data', 'whatsapp-campaigns');
const CAMPAIGNS_FILE = path.join(CAMPAIGNS_DIR, 'campaigns.json');

function ensureDir() {
  if (!fs.existsSync(CAMPAIGNS_DIR)) {
    fs.mkdirSync(CAMPAIGNS_DIR, { recursive: true });
  }
}

export function getPersistentCampaigns(): PersistentCampaign[] {
  try {
    if (!fs.existsSync(CAMPAIGNS_FILE)) {
      return [];
    }
    const raw = fs.readFileSync(CAMPAIGNS_FILE, 'utf-8');
    const parsed: CampaignsFileSchema = JSON.parse(raw);
    const list = Array.isArray(parsed.campaigns) ? parsed.campaigns : [];
    list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return list;
  } catch (err) {
    console.warn('Error leyendo data/whatsapp-campaigns/campaigns.json:', err);
    return [];
  }
}

export function savePersistentCampaignsList(campaigns: PersistentCampaign[]): boolean {
  try {
    ensureDir();
    const payload: CampaignsFileSchema = {
      updatedAt: new Date().toISOString(),
      campaigns,
    };
    fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    return true;
  } catch (err) {
    // En entornos serverless de solo lectura (Vercel), el guardado en disco local puede fallar silenciosamente
    // mientras el cliente mantiene la copia en IndexedDB
    console.warn('Aviso: No se pudo escribir en disco local campaigns.json (posible entorno serverless):', err);
    return false;
  }
}

export function upsertPersistentCampaign(incoming: PersistentCampaign): {
  campaigns: PersistentCampaign[];
  persistedToDisk: boolean;
} {
  const list = getPersistentCampaigns();
  const idx = list.findIndex(
    (c) =>
      c.id === incoming.id ||
      (incoming.templateName &&
        c.templateName.toLowerCase() === incoming.templateName.toLowerCase() &&
        c.id === incoming.id)
  );

  if (idx >= 0) {
    const existing = list[idx];
    const mergedSentPhones = Array.from(
      new Set([...(existing.sentPhones || []), ...(incoming.sentPhones || [])])
    );
    const mergedReadPhones = Array.from(
      new Set([...(existing.readPhones || []), ...(incoming.readPhones || [])])
    );
    const mergedInteractedPhones = Array.from(
      new Set([...(existing.interactedPhones || []), ...(incoming.interactedPhones || [])])
    );

    list[idx] = {
      ...existing,
      ...incoming,
      updatedAt: new Date().toISOString(),
      sentPhones: mergedSentPhones,
      readPhones: mergedReadPhones,
      interactedPhones: mergedInteractedPhones,
      stats: {
        ...existing.stats,
        ...incoming.stats,
        sent: Math.max(incoming.stats?.sent || 0, mergedSentPhones.length),
        read: Math.max(
          incoming.stats?.read ?? existing.stats?.read ?? 0,
          mergedReadPhones.length
        ),
        interacted: Math.max(
          incoming.stats?.interacted ?? existing.stats?.interacted ?? 0,
          mergedInteractedPhones.length
        ),
      },
    };
  } else {
    list.unshift({
      ...incoming,
      createdAt: incoming.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const persistedToDisk = savePersistentCampaignsList(list);
  return { campaigns: list, persistedToDisk };
}

export function deletePersistentCampaign(id: string): {
  campaigns: PersistentCampaign[];
  persistedToDisk: boolean;
} {
  const list = getPersistentCampaigns().filter((c) => c.id !== id);
  const persistedToDisk = savePersistentCampaignsList(list);
  return { campaigns: list, persistedToDisk };
}

/**
 * Registra eventos entrantes desde el Webhook de Meta:
 * - status: 'sent' | 'delivered' | 'read' | 'failed'
 * - isInteraction: true cuando el cliente responde un mensaje o presiona un botón
 */
export function recordWebhookEvent(params: {
  phone: string;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  isInteraction?: boolean;
}) {
  const cleanPhone = String(params.phone || '').replace(/[^0-9]/g, '');
  if (!cleanPhone) return;

  const list = getPersistentCampaigns();
  if (list.length === 0) return;

  // Buscar la campaña más reciente que contenga este número en sentPhones
  let target = list.find((c) => c.sentPhones?.includes(cleanPhone));
  if (!target) {
    // Si no está explícitamente en sentPhones, asociar a la campaña más reciente
    target = list[0];
  }

  if (!target.deliveredPhones) target.deliveredPhones = [];
  if (!target.readPhones) target.readPhones = [];
  if (!target.interactedPhones) target.interactedPhones = [];

  let changed = false;

  if (params.status === 'delivered' || params.status === 'read') {
    if (!target.deliveredPhones.includes(cleanPhone)) {
      target.deliveredPhones.push(cleanPhone);
      target.stats.delivered = Math.max(
        target.stats.delivered || 0,
        target.deliveredPhones.length
      );
      changed = true;
    }
  }

  if (params.status === 'read') {
    if (!target.readPhones.includes(cleanPhone)) {
      target.readPhones.push(cleanPhone);
      target.stats.read = Math.max(target.stats.read || 0, target.readPhones.length);
      changed = true;
    }
  }

  if (params.isInteraction) {
    // Si interactuó, por definición también fue entregado y leído
    if (!target.readPhones.includes(cleanPhone)) {
      target.readPhones.push(cleanPhone);
      target.stats.read = Math.max(target.stats.read || 0, target.readPhones.length);
    }
    if (!target.interactedPhones.includes(cleanPhone)) {
      target.interactedPhones.push(cleanPhone);
      target.stats.interacted = Math.max(
        target.stats.interacted || 0,
        target.interactedPhones.length
      );
      changed = true;
    }
  }

  if (changed) {
    target.updatedAt = new Date().toISOString();
    savePersistentCampaignsList(list);
  }
}
