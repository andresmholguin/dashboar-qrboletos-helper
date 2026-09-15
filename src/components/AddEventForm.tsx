'use client';

import React, { useState, useEffect } from 'react';
import { parseEventUrl, ParsedEventUrl } from '@/services/urlParser';
import { PlusCircle, Link, Calendar, FileText, AlertCircle, CheckCircle, Sparkles } from 'lucide-react';
import { Evento } from '@/types';

interface AddEventFormProps {
  onAddEvent: (event: Omit<Evento, 'id' | 'fechaCreacion'>) => Promise<void>;
}

export default function AddEventForm({ onAddEvent }: AddEventFormProps) {
  const [url, setUrl] = useState('');
  const [nombre, setNombre] = useState('');
  const [fecha, setFecha] = useState('');
  const [parsed, setParsed] = useState<ParsedEventUrl | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState('');

  const [isDetecting, setIsDetecting] = useState(false);

  // Autocompletar datos del show que esté abierto en Google Chrome
  const handleAutoFillFromChrome = async () => {
    setIsDetecting(true);
    setError(null);
    try {
      const res = await fetch('/api/chrome/detect-show');
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo detectar el show en Chrome');
      }
      if (data.tabUrl) setUrl(data.tabUrl);
      if (data.evento?.nombre) setNombre(data.evento.nombre);
      if (data.metadata?.fechaInicio) setFecha(data.metadata.fechaInicio);
    } catch (e: any) {
      setError(`No se pudo autocompletar desde Chrome: ${e.message}`);
    } finally {
      setIsDetecting(false);
    }
  };


  // Analizar la URL en tiempo real
  useEffect(() => {
    if (!url) {
      setParsed(null);
      setError(null);
      return;
    }

    const result = parseEventUrl(url);
    if (result) {
      setParsed(result);
      setError(null);
      // Pre-llenar un nombre por defecto si está vacío
      if (!nombre) {
        setNombre(`Evento - Show ${result.showId}`);
      }
    } else {
      setParsed(null);
      setError('El formato de la URL no es válido. Debe contener /promoters/{P}/events/{E}/shows/{S}');
    }
  }, [url]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed) {
      setError('Por favor, ingresa una URL válida primero.');
      return;
    }
    if (!nombre.trim()) {
      setError('Por favor, ingresa un nombre para el evento.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Reconstruir la URL base
      const urlBase = `${parsed.domain}/promoters/${parsed.promoterId}/events/${parsed.eventId}/shows/${parsed.showId}`;

      await onAddEvent({
        nombre: nombre.trim(),
        fecha: fecha || new Date().toISOString().split('T')[0],
        promoterId: parsed.promoterId,
        eventId: parsed.eventId,
        showId: parsed.showId,
        urlBase,
        favorito: false,
        imageUrl: imageUrl.trim(),
      });

      // Limpiar formulario al tener éxito
      setUrl('');
      setNombre('');
      setFecha('');
      setImageUrl('');
      setParsed(null);
      setSuccessMsg('¡Evento agregado con éxito!');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Error al agregar el evento.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-md">
      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
        <PlusCircle className="text-emerald-500 w-5 h-5" />
        Agregar Nuevo Evento
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Campo URL con Autocompletar desde Chrome */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Link className="w-4 h-4 text-slate-400" />
              URL de QRBoletos
            </label>
            <button
              type="button"
              onClick={handleAutoFillFromChrome}
              disabled={isDetecting}
              className="text-xs text-amber-900 dark:text-amber-400 hover:text-amber-950 dark:hover:text-amber-300 flex items-center gap-1.5 bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 px-2.5 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50 font-semibold"
              title="Detectar show abierto en Chrome y llenar los campos automáticamente"
            >
              <Sparkles className={`w-3.5 h-3.5 text-amber-700 dark:text-amber-400 ${isDetecting ? 'animate-spin' : ''}`} />
              <span>{isDetecting ? 'Leyendo Chrome...' : 'Autocompletar desde Chrome'}</span>
            </button>
          </div>
          <input
            type="text"
            className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all placeholder:text-slate-400"
            placeholder="Pega la URL de cualquier reporte del evento o pulsa Autocompletar..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>


        {/* Feedback del Parser */}
        {parsed && (
          <div className="grid grid-cols-3 gap-3 bg-emerald-100 dark:bg-emerald-500/5 border border-emerald-300 dark:border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-900 dark:text-emerald-400">
            <div>
              <span className="block text-slate-600 dark:text-slate-500 font-medium">Promoter ID</span>
              <span className="font-mono text-slate-900 dark:text-slate-200 font-bold">{parsed.promoterId}</span>
            </div>
            <div>
              <span className="block text-slate-600 dark:text-slate-500 font-medium">Event ID</span>
              <span className="font-mono text-slate-900 dark:text-slate-200 font-bold">{parsed.eventId}</span>
            </div>
            <div>
              <span className="block text-slate-600 dark:text-slate-500 font-medium">Show ID</span>
              <span className="font-mono text-slate-900 dark:text-slate-200 font-bold">{parsed.showId}</span>
            </div>
          </div>
        )}

        {/* Inputs de Nombre, Fecha e Imagen (Visibles solo si la URL es válida para no saturar) */}
        <div className={`space-y-4 transition-all duration-300 ${parsed ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-400" />
                Nombre del Evento
              </label>
              <input
                type="text"
                required={!!parsed}
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all"
                placeholder="Ej. Concierto de Rock"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-400" />
                Fecha del Evento
              </label>
              <input
                type="date"
                required={!!parsed}
                className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all cursor-pointer"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Link className="w-4 h-4 text-slate-400" />
              URL de la Imagen (Banner/Flyer)
            </label>
            <input
              type="url"
              className="w-full bg-slate-950 border border-slate-800 text-slate-100 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all placeholder:text-slate-650"
              placeholder="Pega la URL de la imagen del flyer o logo del evento..."
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>
        </div>

        {/* Mensajes de feedback */}
        {error && (
          <div className="bg-red-500/5 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!parsed || isSubmitting}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:opacity-50 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-[0.98] flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Agregando...' : 'Agregar Evento'}
        </button>
      </form>
    </div>
  );
}
