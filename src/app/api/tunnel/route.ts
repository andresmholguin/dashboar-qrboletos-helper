import { NextResponse } from 'next/server';
import { getTunnelConfigFromSheets, saveTunnelConfigToSheets } from '@/services/googleSheets';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === 'true';
    const config = await getTunnelConfigFromSheets(force);

    let isOnline = false;
    if (config.url) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const testRes = await fetch(`${config.url}/api/events`, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'User-Agent': 'VercelTunnelHealthCheck' },
        });
        clearTimeout(timeout);
        isOnline = testRes.ok;
      } catch {
        isOnline = false;
      }
    }

    return NextResponse.json({
      success: true,
      url: config.url,
      updatedAt: config.updatedAt,
      isOnline,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ success: false, error: 'URL requerida.' }, { status: 400 });
    }

    const config = await saveTunnelConfigToSheets(url);
    return NextResponse.json({
      success: true,
      message: 'Túnel registrado exitosamente en Google Sheets.',
      config,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
