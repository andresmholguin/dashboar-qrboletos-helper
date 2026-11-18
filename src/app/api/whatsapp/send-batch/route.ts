import { NextRequest, NextResponse } from 'next/server';
import { TemplateConfig } from '@/lib/whatsappDb';

interface BatchRecipientInput {
  num: string;
  name?: string;
}

function resolveDirectSendText(rawText: string, recipient: BatchRecipientInput): string {
  const fullName = (recipient.name || '').trim() || 'Cliente';
  const firstName = fullName.split(/\s+/)[0] || 'Cliente';
  return rawText
    .replace(/\{\{\s*nombre\s*\}\}/gi, fullName)
    .replace(/\{\{\s*primer_nombre\s*\}\}/gi, firstName)
    .replace(/\{\{\s*1\s*\}\}/g, firstName);
}

function buildDirectSendPayload(recipient: BatchRecipientInput, config: TemplateConfig) {
  const to = String(recipient.num).replace(/[^0-9]/g, '');
  const bodyText = resolveDirectSendText(config.directBodyText || '', recipient).trim();
  const footerText = (config.directFooterText || '').trim();
  const mediaUrl = (config.headerMediaUrl || '').trim();
  const headerText = resolveDirectSendText(config.headerText || '', recipient).trim();
  const btnType = config.directButtonType || 'NONE';
  const btnText = (config.directButtonText || '').trim();
  const btnUrl = (config.directButtonUrl || '').trim();

  // Construir objeto header para mensajes interactive si aplica
  let interactiveHeader: any = undefined;
  if (config.headerType === 'IMAGE' && mediaUrl) {
    interactiveHeader = { type: 'image', image: { link: mediaUrl } };
  } else if (config.headerType === 'VIDEO' && mediaUrl) {
    interactiveHeader = { type: 'video', video: { link: mediaUrl } };
  } else if (config.headerType === 'DOCUMENT' && mediaUrl) {
    interactiveHeader = { type: 'document', document: { link: mediaUrl } };
  } else if (config.headerType === 'TEXT' && headerText) {
    interactiveHeader = { type: 'text', text: headerText };
  }

  // Caso 1: Mensaje Interactivo con Botón CTA URL (Direct Send)
  if (btnType === 'CTA_URL' && btnText && btnUrl) {
    const interactive: any = {
      type: 'cta_url',
      body: { text: bodyText },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: btnText.slice(0, 20),
          url: btnUrl,
        },
      },
    };
    if (interactiveHeader) interactive.header = interactiveHeader;
    if (footerText) interactive.footer = { text: footerText.slice(0, 60) };

    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      category: 'utility',
      interactive,
    };
  }

  // Caso 2: Mensaje Interactivo con Botón de Respuesta Rápida (Direct Send)
  if (btnType === 'QUICK_REPLY' && btnText) {
    const interactive: any = {
      type: 'button',
      body: { text: bodyText },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'btn_reply_1',
              title: btnText.slice(0, 20),
            },
          },
        ],
      },
    };
    if (interactiveHeader) interactive.header = interactiveHeader;
    if (footerText) interactive.footer = { text: footerText.slice(0, 60) };

    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      category: 'utility',
      interactive,
    };
  }

  // Caso 3: Sin botón, pero con Multimedia en Header (Imagen, Video o Documento con caption)
  if (config.headerType === 'IMAGE' && mediaUrl) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      category: 'utility',
      image: {
        link: mediaUrl,
        caption: footerText ? `${bodyText}\n\n${footerText}` : bodyText,
      },
    };
  }

  if (config.headerType === 'VIDEO' && mediaUrl) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'video',
      category: 'utility',
      video: {
        link: mediaUrl,
        caption: footerText ? `${bodyText}\n\n${footerText}` : bodyText,
      },
    };
  }

  if (config.headerType === 'DOCUMENT' && mediaUrl) {
    return {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'document',
      category: 'utility',
      document: {
        link: mediaUrl,
        caption: footerText ? `${bodyText}\n\n${footerText}` : bodyText,
      },
    };
  }

  // Caso 4: Solo Texto Direct Send (category: "utility")
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    category: 'utility',
    text: {
      preview_url: true,
      body: footerText ? `${bodyText}\n\n${footerText}` : bodyText,
    },
  };
}

function buildTemplatePayload(recipient: BatchRecipientInput, config: TemplateConfig) {
  if (config.sendMode === 'direct_send') {
    return buildDirectSendPayload(recipient, config);
  }

  const components: any[] = [];

  // 1. Header component (IMAGE, VIDEO, DOCUMENT)
  const mediaUrl = (config.headerMediaUrl || '').trim();
  if (config.headerType === 'IMAGE' && mediaUrl) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'image',
          image: { link: mediaUrl },
        },
      ],
    });
  } else if (config.headerType === 'VIDEO' && mediaUrl) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'video',
          video: { link: mediaUrl },
        },
      ],
    });
  } else if (config.headerType === 'DOCUMENT' && mediaUrl) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'document',
          document: { link: mediaUrl },
        },
      ],
    });
  }

  // 2. Body variables ({{1}}, {{2}}, ...)
  if (Array.isArray(config.bodyVariables) && config.bodyVariables.length > 0) {
    const bodyParams = config.bodyVariables.map((v) => {
      let textVal = (v.value || '').trim();
      if (v.type === 'customer_name') {
        textVal = (recipient.name || '').trim() || textVal || 'Cliente';
      } else if (v.type === 'customer_first_name') {
        const first = (recipient.name || '').trim().split(/\s+/)[0];
        textVal = first || textVal || 'Cliente';
      }
      return {
        type: 'text',
        text: textVal || ' ',
      };
    });

    components.push({
      type: 'body',
      parameters: bodyParams,
    });
  }

  // 3. Button component (copy_code / url suffix)
  const btnVal = (config.buttonValue || '').trim();
  if (config.buttonType === 'COPY_CODE' && btnVal) {
    components.push({
      type: 'button',
      sub_type: 'copy_code',
      index: 0,
      parameters: [
        {
          type: 'coupon_code',
          coupon_code: btnVal,
        },
      ],
    });
  } else if (config.buttonType === 'URL_SUFFIX' && btnVal) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: 0,
      parameters: [
        {
          type: 'text',
          text: btnVal,
        },
      ],
    });
  }

  const templateObj: any = {
    name: config.name.trim(),
    language: {
      code: (config.languageCode || 'es_co').trim(),
    },
  };

  if (components.length > 0) {
    templateObj.components = components;
  }

  return {
    messaging_product: 'whatsapp',
    to: String(recipient.num).replace(/[^0-9]/g, ''),
    type: 'template',
    template: templateObj,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = (body.token || process.env.WHATSAPP_TOKEN || '').trim();
    const phoneNumberId = (
      body.phoneNumberId ||
      process.env.WHATSAPP_PHONE_NUMBER_ID ||
      '684708368066383'
    ).trim();
    const templateConfig: TemplateConfig = body.templateConfig;
    const recipients: BatchRecipientInput[] = Array.isArray(body.recipients) ? body.recipients : [];

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          tokenExpired: true,
          error: 'No hay Access Token configurado.',
        },
        { status: 401 }
      );
    }

    const isDirectSend = templateConfig?.sendMode === 'direct_send';
    if (!isDirectSend && !templateConfig?.name) {
      return NextResponse.json(
        {
          success: false,
          error: 'Falta el nombre de la plantilla de WhatsApp.',
        },
        { status: 400 }
      );
    }

    if (isDirectSend && !(templateConfig?.directBodyText || '').trim()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Debes escribir el texto del mensaje para Envío Directo (Direct Send).',
        },
        { status: 400 }
      );
    }

    if (recipients.length === 0) {
      return NextResponse.json({
        success: true,
        results: [],
        tokenExpired: false,
      });
    }

    const endpoint = `https://graph.facebook.com/v22.0/${encodeURIComponent(phoneNumberId)}/messages`;
    let tokenExpiredDetected = false;
    let tokenExpiredMessage = '';

    // Envío paralelo de alta velocidad para todo el lote recibido
    const results = await Promise.all(
      recipients.map(async (recipient) => {
        const payload = buildTemplatePayload(recipient, templateConfig);
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });

          const data = await res.json();

          if (!res.ok || data.error) {
            const err = data.error || {};
            const isTokenError =
              err.code === 190 ||
              err.code === 132015 ||
              err.code === 131042 ||
              res.status === 401 ||
              String(err.message || '').toLowerCase().includes('access token') ||
              String(err.message || '').toLowerCase().includes('session has expired') ||
              String(err.message || '').toLowerCase().includes('paused');

            if (isTokenError) {
              tokenExpiredDetected = true;
              tokenExpiredMessage = err.message || 'El Access Token de Meta ha expirado.';
              return {
                num: recipient.num,
                status: 'token_expired' as const,
                error: err,
              };
            }

            return {
              num: recipient.num,
              status: 'error' as const,
              error: err,
            };
          }

          return {
            num: recipient.num,
            status: 'success' as const,
            wamid: data.messages?.[0]?.id || undefined,
            response: data,
          };
        } catch (netErr: any) {
          return {
            num: recipient.num,
            status: 'error' as const,
            error: { message: netErr.message || 'Error de red contactando Meta Graph API' },
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      tokenExpired: tokenExpiredDetected,
      tokenExpiredMessage,
      results,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error procesando el lote de envíos de WhatsApp.',
      },
      { status: 500 }
    );
  }
}
