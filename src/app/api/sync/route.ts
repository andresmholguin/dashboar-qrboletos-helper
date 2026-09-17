import { NextResponse } from 'next/server';
import {
  isSheetsConfigured,
  syncEventsFromCatalog,
  checkCatalogUpdates,
  fetchEventosFromSheets,
} from '@/services/googleSheets';

export async function GET() {
  try {
    const configured = isSheetsConfigured();
    if (!configured) {
      return NextResponse.json({
        success: false,
        error: 'Google Sheets no está configurado.',
      }, { status: 400 });
    }

    const check = await checkCatalogUpdates();
    return NextResponse.json({
      success: true,
      check,
    });
  } catch (error: any) {
    console.error('Error en GET /api/sync:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al consultar actualizaciones del catálogo' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const configured = isSheetsConfigured();
    if (!configured) {
      return NextResponse.json({
        success: false,
        error: 'Google Sheets no está configurado.',
      }, { status: 400 });
    }

    const result = await syncEventsFromCatalog();
    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('Error en POST /api/sync:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al sincronizar con la API de Catálogo' },
      { status: 500 }
    );
  }
}
