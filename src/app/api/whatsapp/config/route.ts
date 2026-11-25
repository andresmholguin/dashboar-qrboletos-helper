import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { DEFAULT_BLOCKED_NUMBERS } from '@/lib/whatsappDb';

const DEFAULT_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || '684708368066383';
const DEFAULT_WABA_ID = process.env.WHATSAPP_WABA_ID || '';
const DEFAULT_TOKEN = process.env.WHATSAPP_TOKEN || '';

const BLOCKED_FILE_PATH = path.join(process.cwd(), 'data', 'whatsapp-campaigns', 'blocked-numbers.json');

function readPersistedBlockedNumbers(): string[] {
  try {
    if (fs.existsSync(BLOCKED_FILE_PATH)) {
      const raw = fs.readFileSync(BLOCKED_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return Array.from(new Set([...DEFAULT_BLOCKED_NUMBERS, ...parsed.map(String).filter(Boolean)]));
      }
    }
  } catch (e) {
    console.warn('No se pudo leer blocked-numbers.json:', e);
  }
  return DEFAULT_BLOCKED_NUMBERS;
}

function writePersistedBlockedNumbers(nums: string[]): string[] {
  const cleaned = Array.from(
    new Set(
      nums
        .map((n) => String(n).replace(/[^0-9]/g, '').trim())
        .filter((n) => n.length >= 7)
    )
  );
  try {
    const dir = path.dirname(BLOCKED_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(BLOCKED_FILE_PATH, JSON.stringify(cleaned, null, 2), 'utf-8');
  } catch (e) {
    console.warn('No se pudo escribir blocked-numbers.json en disco:', e);
  }
  return cleaned;
}

export async function GET() {
  const blockedNumbers = readPersistedBlockedNumbers();
  return NextResponse.json({
    success: true,
    phoneNumberId: DEFAULT_PHONE_NUMBER_ID,
    wabaId: DEFAULT_WABA_ID,
    token: DEFAULT_TOKEN,
    hasEnvToken: Boolean(DEFAULT_TOKEN),
    blockedNumbers,
  });
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const rawList: string[] = Array.isArray(body.blockedNumbers)
      ? body.blockedNumbers
      : String(body.blockedNumbersText || '')
          .split(/[\r\n,;|\t\s]+/)
          .filter(Boolean);
    const saved = writePersistedBlockedNumbers(rawList);
    return NextResponse.json({
      success: true,
      blockedNumbers: saved,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Error guardando lista negra numsBlock.' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = (body.token || DEFAULT_TOKEN || '').trim();
    const phoneNumberId = (body.phoneNumberId || DEFAULT_PHONE_NUMBER_ID || '684708368066383').trim();
    let wabaId = (body.wabaId || DEFAULT_WABA_ID || '').trim();

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Debes proporcionar un Access Token de Meta.' },
        { status: 400 }
      );
    }

    // 1. Verificar el Phone Number ID en Meta Graph API v22.0
    const phoneRes = await fetch(
      `https://graph.facebook.com/v22.0/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating,name_status`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    const phoneData = await phoneRes.json();

    if (!phoneRes.ok || phoneData.error) {
      const err = phoneData.error || {};
      return NextResponse.json(
        {
          success: false,
          tokenExpired: err.code === 190,
          errorCode: err.code,
          errorSubcode: err.error_subcode,
          error: err.message || 'Error validando el Access Token o Phone Number ID en Meta.',
        },
        { status: 401 }
      );
    }

    // 2. Intentar descubrir el WABA_ID e información de expiración mediante debug_token
    let tokenInfo: {
      expiresAt?: number | null;
      isPermanent?: boolean;
      appName?: string;
      scopes?: string[];
      discoveredWabaIds?: string[];
    } = {};

    try {
      const debugRes = await fetch(
        `https://graph.facebook.com/v22.0/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(token)}`
      );
      const debugJson = await debugRes.json();
      if (debugJson?.data) {
        const d = debugJson.data;
        const expiresAt = d.expires_at || 0;
        const discoveredWabaIds: string[] = [];

        if (Array.isArray(d.granular_scopes)) {
          for (const gs of d.granular_scopes) {
            if (
              (gs.scope === 'whatsapp_business_management' || gs.scope === 'whatsapp_business_messaging') &&
              Array.isArray(gs.target_ids)
            ) {
              for (const tid of gs.target_ids) {
                if (tid && !discoveredWabaIds.includes(tid)) {
                  discoveredWabaIds.push(tid);
                }
              }
            }
          }
        }

        if (!wabaId && discoveredWabaIds.length > 0) {
          wabaId = discoveredWabaIds[0];
        }

        tokenInfo = {
          expiresAt: expiresAt > 0 ? expiresAt * 1000 : null,
          isPermanent: expiresAt === 0,
          appName: d.application,
          scopes: d.scopes || [],
          discoveredWabaIds,
        };
      }
    } catch (e) {
      // Si falla debug_token no bloqueamos la verificación principal
      console.warn('No se pudo consultar debug_token:', e);
    }

    return NextResponse.json({
      success: true,
      phone: {
        id: phoneData.id,
        displayPhoneNumber: phoneData.display_phone_number,
        verifiedName: phoneData.verified_name,
        qualityRating: phoneData.quality_rating,
        nameStatus: phoneData.name_status,
      },
      wabaId,
      tokenInfo,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Error interno verificando credenciales de Meta.',
      },
      { status: 500 }
    );
  }
}
