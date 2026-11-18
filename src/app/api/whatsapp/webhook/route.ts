import { NextRequest, NextResponse } from 'next/server';
import { recordWebhookEvent } from '@/services/whatsappCampaigns';

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'qrboletos_whatsapp_verify_2026';

/**
 * Verificación oficial del Webhook de Meta (GET)
 * URL para registrar en Meta Developers:
 * https://dashboard-qrboletos.vercel.app/api/whatsapp/webhook
 * Verify Token: qrboletos_whatsapp_verify_2026
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge || '', {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return NextResponse.json(
    {
      success: false,
      message: 'Webhook activo. Usa hub.verify_token = qrboletos_whatsapp_verify_2026 en Meta.',
    },
    { status: 403 }
  );
}

/**
 * Recepción en vivo de eventos de estado (sent, delivered, read) e interacciones (messages / button replies)
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody || '{}');

    // 1. Reenvío opcional en modo Proxy hacia Whapify si se configura WHAPIFY_WEBHOOK_FORWARD_URL
    const forwardUrl = process.env.WHAPIFY_WEBHOOK_FORWARD_URL;
    if (forwardUrl) {
      fetch(forwardUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': request.headers.get('x-hub-signature-256') || '',
        },
        body: rawBody,
      }).catch((e) => console.warn('Error reenviando webhook a Whapify:', e));
    }

    // 2. Procesar estados (statuses: sent, delivered, read, failed) y respuestas/interacciones (messages)
    if (payload.object === 'whatsapp_business_account' && Array.isArray(payload.entry)) {
      for (const entry of payload.entry) {
        for (const change of entry.changes || []) {
          const val = change.value || {};

          // A) Estados de entrega y lectura (delivered, read)
          if (Array.isArray(val.statuses)) {
            for (const st of val.statuses) {
              const phone = st.recipient_id;
              const status = st.status; // 'sent' | 'delivered' | 'read' | 'failed'
              if (phone && (status === 'delivered' || status === 'read')) {
                recordWebhookEvent({
                  phone,
                  status,
                });
              }
            }
          }

          // B) Interacciones entrantes del cliente (respuesta de texto o clic en botón de plantilla)
          if (Array.isArray(val.messages)) {
            for (const msg of val.messages) {
              const fromPhone = msg.from;
              if (fromPhone) {
                recordWebhookEvent({
                  phone: fromPhone,
                  isInteraction: true,
                });
              }
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.warn('Error procesando POST en /api/whatsapp/webhook:', error);
    return NextResponse.json({ success: true }, { status: 200 });
  }
}
