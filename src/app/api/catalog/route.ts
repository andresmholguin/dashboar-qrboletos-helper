import { NextRequest, NextResponse } from 'next/server';
import { QrboletosApiClient } from '@/lib/qrboletosApi';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const showId = searchParams.get('id') || undefined;

    // Permitir pasar credenciales temporales si el usuario las provee desde la UI
    const customClientId = searchParams.get('clientId') || undefined;
    const customClientSecret = searchParams.get('clientSecret') || undefined;

    const client = new QrboletosApiClient({
      clientId: customClientId,
      clientSecret: customClientSecret,
    });

    if (!client.hasCredentials()) {
      return NextResponse.json(
        {
          success: false,
          code: 'MISSING_CREDENTIALS',
          error: 'Credenciales no configuradas. Proporciona QRBOLETOS_CLIENT_ID y QRBOLETOS_CLIENT_SECRET en .env.local o mediante la interfaz.',
        },
        { status: 400 }
      );
    }

    if (showId) {
      const showDetail = await client.getCatalogShowDetail(showId);
      return NextResponse.json({ success: true, data: showDetail.data });
    }

    const catalog = await client.getCatalog();
    return NextResponse.json({ success: true, data: catalog.data.items });
  } catch (error: any) {
    console.error('Error en /api/catalog:', error);
    return NextResponse.json(
      {
        success: false,
        code: 'API_ERROR',
        error: error.message || 'Error comunicando con la API de Catalogo de QRBoletos.',
      },
      { status: 500 }
    );
  }
}
