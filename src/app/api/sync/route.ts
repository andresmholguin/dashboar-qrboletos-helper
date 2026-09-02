import { NextResponse } from 'next/server';
import {
  isSheetsConfigured,
  syncEventsFromFirestore,
  checkFirestoreUpdates,
  fetchEventosFromSheets
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

    const check = await checkFirestoreUpdates();
    return NextResponse.json({
      success: true,
      check,
    });
  } catch (error: any) {
    console.error('Error en GET /api/sync:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al consultar actualizaciones' },
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

    const result = await syncEventsFromFirestore();
    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('Error en POST /api/sync:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al sincronizar con Firestore' },
      { status: 500 }
    );
  }
}
