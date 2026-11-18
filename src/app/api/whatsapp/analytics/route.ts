import { NextRequest, NextResponse } from 'next/server';
import {
  getPersistentCampaigns,
  savePersistentCampaignsList,
  upsertPersistentCampaign,
  deletePersistentCampaign,
  PersistentCampaign,
} from '@/services/whatsappCampaigns';

async function resolveWabaId(token: string, providedWabaId?: string): Promise<string> {
  if (providedWabaId && providedWabaId.trim()) return providedWabaId.trim();
  if (process.env.WHATSAPP_WABA_ID) return process.env.WHATSAPP_WABA_ID.trim();

  const debugRes = await fetch(
    `https://graph.facebook.com/v22.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`
  );
  const debugJson = await debugRes.json();
  const granular = debugJson?.data?.granular_scopes || [];
  for (const gs of granular) {
    if (
      (gs.scope === 'whatsapp_business_management' || gs.scope === 'whatsapp_business_messaging') &&
      Array.isArray(gs.target_ids) &&
      gs.target_ids.length > 0
    ) {
      return gs.target_ids[0];
    }
  }
  throw new Error('No se pudo detectar automáticamente el WABA ID.');
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const syncMeta = searchParams.get('syncMeta') === 'true';
    const token = (searchParams.get('token') || process.env.WHATSAPP_TOKEN || '').trim();
    const rawWabaId = searchParams.get('wabaId') || '';

    let campaigns = getPersistentCampaigns();
    let metaSyncSummary: {
      syncedTemplatesCount: number;
      wabaId?: string;
      warning?: string;
    } | null = null;

    if (syncMeta) {
      if (!token) {
        return NextResponse.json(
          {
            success: false,
            error: 'Configura y verifica un Access Token válido de Meta para sincronizar analíticas.',
          },
          { status: 400 }
        );
      }

      const wabaId = await resolveWabaId(token, rawWabaId);

      // 1. Obtener lista de plantillas de la cuenta con sus IDs numéricos
      const tplRes = await fetch(
        `https://graph.facebook.com/v22.0/${encodeURIComponent(wabaId)}/message_templates?limit=200&fields=id,name,status,category,language`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const tplData = await tplRes.json();

      if (!tplRes.ok || tplData.error) {
        return NextResponse.json(
          {
            success: false,
            tokenExpired: tplData.error?.code === 190,
            error:
              tplData.error?.message ||
              'Error consultando plantillas de Meta para sincronizar analíticas.',
          },
          { status: tplRes.status || 400 }
        );
      }

      const templates: Array<{ id: string; name: string; language: string; status: string }> =
        tplData.data || [];

      const idToTemplate = new Map<string, { id: string; name: string; language: string }>();
      for (const t of templates) {
        idToTemplate.set(String(t.id), t);
      }

      // 2. Consultar template_analytics en lotes de hasta 10 template_ids (últimos 90 días, con fallback a 30 días)
      const nowSec = Math.floor(Date.now() / 1000);
      const start90d = nowSec - 89 * 86400;
      const start30d = nowSec - 29 * 86400;

      const templateIds = templates.map((t) => t.id);
      const aggregatedByTplName = new Map<
        string,
        {
          templateName: string;
          language: string;
          sent: number;
          delivered: number;
          read: number;
          clicked: number;
          costUsd: number;
          buttonClicksBreakdown: Array<{ type?: string; button_content?: string; count: number }>;
        }
      >();

      let analyticsWarning: string | undefined = undefined;

      for (let i = 0; i < templateIds.length; i += 10) {
        const chunkIds = templateIds.slice(i, i + 10);
        const idsParam = JSON.stringify(chunkIds);
        const metricsParam = JSON.stringify(['sent', 'delivered', 'read', 'clicked', 'cost']);

        let analyticsUrl = `https://graph.facebook.com/v22.0/${encodeURIComponent(
          wabaId
        )}/template_analytics?start=${start90d}&end=${nowSec}&granularity=DAILY&metric_types=${encodeURIComponent(
          metricsParam
        )}&template_ids=${encodeURIComponent(idsParam)}`;

        let aRes = await fetch(analyticsUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
        let aJson = await aRes.json();

        // Fallback a 30 días o sin clicked si Meta restringe ventana
        if (!aRes.ok || aJson.error) {
          analyticsUrl = `https://graph.facebook.com/v22.0/${encodeURIComponent(
            wabaId
          )}/template_analytics?start=${start30d}&end=${nowSec}&granularity=DAILY&metric_types=${encodeURIComponent(
            JSON.stringify(['sent', 'delivered', 'read', 'clicked'])
          )}&template_ids=${encodeURIComponent(idsParam)}`;
          aRes = await fetch(analyticsUrl, {
            headers: { Authorization: `Bearer ${token}` },
          });
          aJson = await aRes.json();
        }

        if (!aRes.ok || aJson.error) {
          analyticsWarning =
            aJson.error?.error_user_msg ||
            aJson.error?.message ||
            'Meta template_analytics devolvió una advertencia. Asegúrate de tener activadas las estadísticas de plantillas en WhatsApp Manager.';
          break;
        }

        // Parsear data_points de Meta template_analytics
        const dataBlocks = aJson.data || [];
        for (const block of dataBlocks) {
          const points = block.data_points || [];
          for (const pt of points) {
            const tplId = String(pt.template_id || '');
            const tplInfo = idToTemplate.get(tplId);
            const tplName = tplInfo?.name || tplId;
            if (!tplName) continue;

            const current = aggregatedByTplName.get(tplName.toLowerCase()) || {
              templateName: tplName,
              language: tplInfo?.language || 'es_CO',
              sent: 0,
              delivered: 0,
              read: 0,
              clicked: 0,
              costUsd: 0,
              buttonClicksBreakdown: [],
            };

            current.sent += Number(pt.sent || 0);
            current.delivered += Number(pt.delivered || 0);
            current.read += Number(pt.read || 0);

            if (Array.isArray(pt.clicked)) {
              for (const clk of pt.clicked) {
                const cCount = Number(clk.count || 0);
                current.clicked += cCount;
                const existingBtn = current.buttonClicksBreakdown.find(
                  (b) =>
                    b.button_content === clk.button_content && b.type === clk.type
                );
                if (existingBtn) {
                  existingBtn.count += cCount;
                } else if (cCount > 0) {
                  current.buttonClicksBreakdown.push({
                    type: clk.type,
                    button_content: clk.button_content,
                    count: cCount,
                  });
                }
              }
            } else if (typeof pt.clicked === 'number') {
              current.clicked += pt.clicked;
            }

            if (Array.isArray(pt.cost)) {
              for (const cItem of pt.cost) {
                if (cItem.type === 'amount_spent' && cItem.value) {
                  current.costUsd += Number(cItem.value || 0);
                }
              }
            }

            aggregatedByTplName.set(tplName.toLowerCase(), current);
          }
        }
      }

      // 3. Cruzar resultados de Meta template_analytics con nuestras campañas persistentes
      let syncedCount = 0;
      const nowIso = new Date().toISOString();

      for (const [tplKey, metrics] of aggregatedByTplName.entries()) {
        if (
          metrics.sent === 0 &&
          metrics.delivered === 0 &&
          metrics.read === 0 &&
          metrics.clicked === 0
        ) {
          continue;
        }

        syncedCount++;
        const matchingCamp = campaigns.find(
          (c) =>
            c.templateName.toLowerCase() === tplKey ||
            c.templateName.toLowerCase().includes(tplKey) ||
            tplKey.includes(c.templateName.toLowerCase())
        );

        if (matchingCamp) {
          matchingCamp.stats.sent = Math.max(matchingCamp.stats.sent, metrics.sent);
          matchingCamp.stats.delivered =
            metrics.delivered > 0 ? metrics.delivered : matchingCamp.stats.delivered;
          matchingCamp.stats.read = Math.max(matchingCamp.stats.read, metrics.read);
          matchingCamp.stats.interacted = Math.max(
            matchingCamp.stats.interacted,
            metrics.clicked
          );
          matchingCamp.stats.costUsd = Number(metrics.costUsd.toFixed(2));
          matchingCamp.stats.buttonClicksBreakdown = metrics.buttonClicksBreakdown;
          matchingCamp.stats.metaSynced = true;
          matchingCamp.stats.lastMetaSyncAt = nowIso;
          matchingCamp.updatedAt = nowIso;
        } else {
          // Si la plantilla existe en Meta con envíos pero no estaba en campaigns.json, la agregamos
          campaigns.unshift({
            id: 'meta_' + tplKey,
            title: `Plantilla Meta: ${metrics.templateName}`,
            templateName: metrics.templateName,
            languageCode: metrics.language,
            createdAt: nowIso,
            updatedAt: nowIso,
            source: 'meta_analytics',
            stats: {
              total: metrics.sent,
              sent: metrics.sent,
              failed: 0,
              delivered: metrics.delivered,
              read: metrics.read,
              interacted: metrics.clicked,
              costUsd: Number(metrics.costUsd.toFixed(2)),
              buttonClicksBreakdown: metrics.buttonClicksBreakdown,
              metaSynced: true,
              lastMetaSyncAt: nowIso,
            },
            sentPhones: [],
            readPhones: [],
            interactedPhones: [],
          });
        }
      }

      savePersistentCampaignsList(campaigns);
      metaSyncSummary = {
        syncedTemplatesCount: syncedCount,
        wabaId,
        warning: analyticsWarning,
      };
    }

    return NextResponse.json({
      success: true,
      campaigns,
      metaSyncSummary,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error cargando analíticas de campañas de WhatsApp.',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Soportar actualización de una campaña individual o lote
    if (body.campaign) {
      const incoming: PersistentCampaign = body.campaign;
      const result = upsertPersistentCampaign(incoming);
      return NextResponse.json({
        success: true,
        campaigns: result.campaigns,
        persistedToDisk: result.persistedToDisk,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Datos de campaña no proporcionados.' },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error guardando snapshot de resultados de campaña.',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'Falta ID de campaña.' }, { status: 400 });
    }
    const result = deletePersistentCampaign(id);
    return NextResponse.json({
      success: true,
      campaigns: result.campaigns,
      persistedToDisk: result.persistedToDisk,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Error eliminando campaña.' },
      { status: 500 }
    );
  }
}
