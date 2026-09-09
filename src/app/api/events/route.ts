import { NextResponse } from 'next/server';
import {
  isSheetsConfigured,
  fetchEventosFromSheets,
  addEventoToSheets,
  updateEventoFavoritoInSheets,
  deleteEventoInSheets,
  updateEventoLocalidadesInSheets,
} from '@/services/googleSheets';
import { Evento } from '@/types';

export async function GET() {
  try {
    const configured = isSheetsConfigured();
    if (!configured) {
      return NextResponse.json({
        success: true,
        events: [],
        isSheets: false,
        message: 'Google Sheets no configurado. Usando almacenamiento local.',
      });
    }

    const events = await fetchEventosFromSheets();
    return NextResponse.json({
      success: true,
      events,
      isSheets: true,
    });
  } catch (error: any) {
    console.error('Error en GET /api/events:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error interno del servidor', isSheets: false },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const configured = isSheetsConfigured();
    if (!configured) {
      return NextResponse.json(
        { success: false, error: 'Google Sheets no configurado.', isSheets: false },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { id, nombre, fecha, promoterId, eventId, showId, urlBase, favorito, imageUrl, localidades, enVenta, espectaculo, sitio, pulep } = body;

    if (!nombre || !promoterId || !eventId || !showId) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos (nombre, promoterId, eventId, showId).' },
        { status: 400 }
      );
    }

    const nuevoEvento: Omit<Evento, 'rowId'> = {
      id: id || `${eventId}-${showId}`,
      nombre,
      fecha: fecha || '',
      promoterId,
      eventId,
      showId,
      urlBase: urlBase || '',
      fechaCreacion: new Date().toISOString().split('T')[0], // YYYY-MM-DD
      favorito: !!favorito,
      imageUrl: imageUrl || '',
      localidades: Array.isArray(localidades) ? localidades : undefined,
      enVenta: enVenta !== undefined ? Boolean(enVenta) : false,
      espectaculo: espectaculo || '',
      sitio: sitio || '',
      pulep: pulep || '',
    };

    const creado = await addEventoToSheets(nuevoEvento);
    return NextResponse.json({
      success: true,
      event: creado,
    });
  } catch (error: any) {
    console.error('Error en POST /api/events:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al guardar el evento' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const configured = isSheetsConfigured();
    if (!configured) {
      return NextResponse.json(
        { success: false, error: 'Google Sheets no configurado.', isSheets: false },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { id, favorito, localidades } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Falta el campo requerido (id).' },
        { status: 400 }
      );
    }

    let success = false;
    if (favorito !== undefined) {
      success = await updateEventoFavoritoInSheets(id, favorito);
    } else if (localidades !== undefined) {
      success = await updateEventoLocalidadesInSheets(id, localidades);
    } else {
      return NextResponse.json(
        { success: false, error: 'Se debe proporcionar favorito o localidades para actualizar.' },
        { status: 400 }
      );
    }

    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { success: false, error: 'No se pudo actualizar el evento en Google Sheets' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error en PATCH /api/events:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al actualizar el evento' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const configured = isSheetsConfigured();
    if (!configured) {
      return NextResponse.json(
        { success: false, error: 'Google Sheets no configurado.', isSheets: false },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Se requiere el parámetro "id".' },
        { status: 400 }
      );
    }

    const success = await deleteEventoInSheets(id);
    if (success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json(
        { success: false, error: 'No se pudo eliminar el evento en Google Sheets' },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error en DELETE /api/events:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Error al eliminar el evento' },
      { status: 500 }
    );
  }
}
