import { NextRequest, NextResponse } from 'next/server';
import { QrboletosApiClient } from '@/lib/qrboletosApi';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor') || undefined;
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 100;
    const updated_since = searchParams.get('updated_since') || undefined;
    const id = searchParams.get('id') || undefined;

    // Permitir pasar credenciales temporales si el usuario las provee desde la UI
    const customClientId = searchParams.get('clientId') || undefined;
    const customClientSecret = searchParams.get('clientSecret') || undefined;

    const client = new QrboletosApiClient({
      scope: 'customers',
      clientId: customClientId,
      clientSecret: customClientSecret,
    });

    if (!client.hasCredentials('customers')) {
      return NextResponse.json(
        {
          success: false,
          code: 'MISSING_CREDENTIALS',
          error: 'Credenciales de Clientes no configuradas. Proporciona QRBOLETOS_CUSTOMERS_CLIENT_ID y QRBOLETOS_CUSTOMERS_CLIENT_SECRET (o QRBOLETOS_CLIENT_ID / QRBOLETOS_CLIENT_SECRET) en .env.local o mediante la interfaz.',
        },
        { status: 400 }
      );
    }

    if (id) {
      const customer = await client.getCustomerById(id);
      return NextResponse.json({ success: true, data: customer.data });
    }

    const result = await client.getCustomers({ cursor, limit, updated_since });
    return NextResponse.json({
      success: true,
      data: result.data.customers,
      next_cursor: result.data.next_cursor,
      has_more: result.data.has_more,
    });
  } catch (error: any) {
    console.error('Error en /api/customers:', error);
    return NextResponse.json(
      {
        success: false,
        code: 'API_ERROR',
        error: error.message || 'Error comunicando con la API de clientes de QRBoletos.',
      },
      { status: 500 }
    );
  }
}
