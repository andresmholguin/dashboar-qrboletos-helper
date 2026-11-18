import { NextRequest, NextResponse } from 'next/server';

async function resolveWabaId(token: string, providedWabaId?: string): Promise<string> {
  if (providedWabaId && providedWabaId.trim()) {
    return providedWabaId.trim();
  }
  if (process.env.WHATSAPP_WABA_ID) {
    return process.env.WHATSAPP_WABA_ID.trim();
  }

  // Auto-descubrir desde debug_token
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

  throw new Error(
    'No se pudo detectar automáticamente el WABA ID (ID de la cuenta de WhatsApp Business). Ingresa el WABA ID en el panel de configuración.'
  );
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = (searchParams.get('token') || process.env.WHATSAPP_TOKEN || '').trim();
    const rawWabaId = searchParams.get('wabaId') || '';

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Falta el Access Token de Meta.' },
        { status: 400 }
      );
    }

    const wabaId = await resolveWabaId(token, rawWabaId);
    const url = `https://graph.facebook.com/v22.0/${encodeURIComponent(wabaId)}/message_templates?limit=200&fields=id,name,status,category,language,components,quality_score`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      const err = data.error || {};
      return NextResponse.json(
        {
          success: false,
          tokenExpired: err.code === 190,
          errorCode: err.code,
          error: err.message || 'Error consultando plantillas desde Meta Graph API.',
        },
        { status: res.status || 400 }
      );
    }

    return NextResponse.json({
      success: true,
      wabaId,
      templates: data.data || [],
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error obteniendo plantillas de WhatsApp.',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = (body.token || process.env.WHATSAPP_TOKEN || '').trim();
    const wabaId = await resolveWabaId(token, body.wabaId);

    const name = String(body.name || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_');
    const language = String(body.language || 'es_CO').trim();
    const category = String(body.category || 'MARKETING').trim().toUpperCase();
    const headerType = String(body.headerType || 'NONE').toUpperCase();
    const headerText = String(body.headerText || '').trim();
    const bodyText = String(body.bodyText || '').trim();
    const footerText = String(body.footerText || '').trim();
    const buttonType = String(body.buttonType || 'NONE').toUpperCase();
    const buttonText = String(body.buttonText || '').trim();
    const buttonUrl = String(body.buttonUrl || '').trim();
    const buttonCouponExample = String(body.buttonCouponExample || 'PROMO20').trim();

    if (!name || !bodyText) {
      return NextResponse.json(
        {
          success: false,
          error: 'El nombre de la plantilla y el texto del mensaje (Body) son obligatorios.',
        },
        { status: 400 }
      );
    }

    const components: any[] = [];

    if (headerType === 'TEXT' && headerText) {
      components.push({
        type: 'HEADER',
        format: 'TEXT',
        text: headerText,
      });
    }

    // Detectar si el body tiene variables {{1}}, {{2}}... para incluir ejemplos requeridos por Meta
    const varMatches = bodyText.match(/\{\{\d+\}\}/g) || [];
    const bodyComponent: any = {
      type: 'BODY',
      text: bodyText,
    };
    if (varMatches.length > 0) {
      bodyComponent.example = {
        body_text: [varMatches.map((_, idx) => (idx === 0 ? 'Carlos' : `Valor${idx + 1}`))],
      };
    }
    components.push(bodyComponent);

    if (footerText) {
      components.push({
        type: 'FOOTER',
        text: footerText,
      });
    }

    if (buttonType === 'URL' && buttonText && buttonUrl) {
      components.push({
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: buttonText,
            url: buttonUrl,
          },
        ],
      });
    } else if (buttonType === 'QUICK_REPLY' && buttonText) {
      components.push({
        type: 'BUTTONS',
        buttons: [
          {
            type: 'QUICK_REPLY',
            text: buttonText,
          },
        ],
      });
    } else if (buttonType === 'COPY_CODE') {
      components.push({
        type: 'BUTTONS',
        buttons: [
          {
            type: 'COPY_CODE',
            example: buttonCouponExample,
          },
        ],
      });
    }

    const res = await fetch(
      `https://graph.facebook.com/v22.0/${encodeURIComponent(wabaId)}/message_templates`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          language,
          category,
          components,
        }),
      }
    );

    const data = await res.json();
    if (!res.ok || data.error) {
      const err = data.error || {};
      return NextResponse.json(
        {
          success: false,
          error: err.error_user_msg || err.message || 'Meta rechazó la creación de la plantilla.',
          details: err,
        },
        { status: res.status || 400 }
      );
    }

    return NextResponse.json({
      success: true,
      template: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error creando plantilla en Meta.',
      },
      { status: 500 }
    );
  }
}
