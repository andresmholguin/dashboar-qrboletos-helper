'use client';

import React, { useState } from 'react';
import { Evento } from '@/types';
import { formatDateString } from '@/utils/dateFormatter';
import {
  Layers,
  Trash2,
  Star,
  ExternalLink,
  Eye,
  Globe,
  Palette,
  Settings
} from 'lucide-react';

interface EventCardProps {
  evento: Evento;
  onToggleFavorite: (id: string, currentStatus: boolean) => void;
  onDeleteEvent: (id: string) => void;
  onOpenLocalities: (evento: Evento) => void;
  onOpenArtworks?: (evento: Evento) => void;
  onConfigureSettings?: (evento: Evento) => void;
}

export default function EventCard({
  evento,
  onToggleFavorite,
  onDeleteEvent,
  onOpenLocalities,
  onOpenArtworks,
  onConfigureSettings,
}: EventCardProps) {
  const [imgError, setImgError] = useState(false);

  const handleFavoriteClick = () => {
    if (evento.id) {
      onToggleFavorite(evento.id, evento.favorito);
    }
  };

  const handleDeleteClick = () => {
    if (evento.id && confirm(`¿Estás seguro de que deseas eliminar "${evento.nombre}"?`)) {
      onDeleteEvent(evento.id);
    }
  };

  const imageSrc = evento.imageUrl || (evento as any).imagen;

  return (
    <div className={`bg-slate-900 border rounded-2xl p-5 shadow-lg hover:shadow-xl transition-all group flex flex-col justify-between ${
      evento.enVenta === false
        ? 'border-amber-500/30 hover:border-amber-500/50 bg-gradient-to-b from-slate-900 to-amber-950/10'
        : 'border-slate-800 hover:border-slate-700/80'
    }`}>
      {/* Cabecera de la Tarjeta */}
      <div>
        {/* Banner/Flyer del Evento desde la API */}
        <div className="w-full aspect-[4/3] relative rounded-xl overflow-hidden mb-4 border border-slate-800 bg-slate-950 flex items-center justify-center shrink-0 shadow-inner group-hover:border-emerald-500/40 transition-all">
          {imageSrc && !imgError ? (
            <img
              src={imageSrc}
              alt={evento.nombre}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover object-center group-hover:scale-[1.02] transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 flex flex-col items-center justify-center text-slate-600 font-mono text-[10px] tracking-wider select-none uppercase font-bold gap-1">
              <Layers className="w-6 h-6 text-slate-700" />
              <span>QRBoletos</span>
            </div>
          )}

          {/* Badge del ID oficial de QRBoletos y Estado */}
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 flex-wrap">
            {evento.id && (
              <div className="bg-black/75 backdrop-blur-md text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold shadow-md">
                ID: #{evento.id}
              </div>
            )}
            {evento.enVenta === false && (
              <div className="bg-amber-950/90 backdrop-blur-md text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-lg text-[9px] font-bold shadow-md">
                En Configuración
              </div>
            )}
          </div>

          {/* Enlace público al evento en qrboletos.com (sin login requerido) */}
          {evento.enlace && (
            <a
              href={evento.enlace}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-2.5 right-2.5 bg-black/70 hover:bg-emerald-600 text-white/80 hover:text-white p-1.5 rounded-lg border border-white/10 transition-all shadow-md cursor-pointer"
              title="Abrir página oficial del evento en QRBoletos"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Título, Fecha y Acciones */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-800 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-transparent px-2.5 py-0.5 rounded-full">
                {formatDateString(evento.fecha)}
              </span>
              {evento.enVenta === false ? (
                <span className="text-[9px] uppercase font-bold tracking-wider text-amber-900 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/20 px-2 py-0.5 rounded-md">
                  🛠️ No a la venta
                </span>
              ) : (
                <span className="text-[9px] uppercase font-bold tracking-wider text-emerald-900 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/20 px-2 py-0.5 rounded-md">
                  🟢 A la venta
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-1.5 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors line-clamp-2" title={evento.nombre}>
              {evento.nombre}
            </h3>
            {evento.espectaculo && evento.espectaculo !== evento.nombre && (
              <p className="text-xs text-amber-900 dark:text-amber-300 font-semibold mt-1 flex items-center gap-1">
                <span className="text-slate-500 font-normal">Función:</span> {evento.espectaculo}
              </p>
            )}
            {evento.sitio && (
              <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                📍 {evento.sitio}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleFavoriteClick}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                evento.favorito
                  ? 'bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-500 border-amber-300 dark:border-amber-500/30'
                  : 'text-slate-500 border-slate-800 hover:text-amber-500 hover:bg-amber-500/5 hover:border-amber-500/20'
              }`}
              title={evento.favorito ? 'Quitar de favoritos' : 'Marcar como favorito'}
            >
              <Star className="w-4 h-4" fill={evento.favorito ? 'currentColor' : 'none'} />
            </button>
            <button
              onClick={handleDeleteClick}
              className="p-1.5 rounded-lg border border-slate-800 text-slate-500 hover:text-red-400 hover:bg-red-500/5 hover:border-red-500/20 transition-all cursor-pointer"
              title="Eliminar evento"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Controles del Evento */}
      <div className="mt-4 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          {/* Abrir Localidades dentro de nuestro panel */}
          <button
            onClick={() => onOpenLocalities(evento)}
            className={`rounded-xl py-2.5 px-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer ${
              evento.localidades && evento.localidades.length > 0
                ? 'bg-emerald-50 dark:bg-emerald-600/10 hover:bg-emerald-600 text-emerald-800 dark:text-emerald-400 hover:text-white border border-emerald-300 dark:border-emerald-500/20 hover:border-emerald-600'
                : 'bg-slate-100 dark:bg-slate-950 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-800'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Localidades</span>
            {evento.localidades && evento.localidades.length > 0 && (
              <span className="ml-0.5 bg-emerald-200 dark:bg-emerald-500/20 text-emerald-900 dark:text-emerald-300 text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold">
                {evento.localidades.length}
              </span>
            )}
          </button>

          {/* Abrir Gestor de Artes */}
          {onOpenArtworks && (
            <button
              onClick={() => onOpenArtworks(evento)}
              className="rounded-xl py-2.5 px-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-500/25 active:scale-95"
              title="Actualizar o reemplazar QRBoleto digital y diseño de impresión física (Boca/Godex)"
            >
              <Palette className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
              <span>🎨 Artes</span>
            </button>
          )}
        </div>

        {/* Botón para Configurar Evento (HTMLs, Restricciones, Switches, Imágenes) */}
        {onConfigureSettings && (
          <button
            onClick={() => onConfigureSettings(evento)}
            className="w-full rounded-xl py-2 px-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer bg-blue-50 dark:bg-blue-600/10 hover:bg-blue-600 text-blue-800 dark:text-blue-400 hover:text-white border border-blue-300 dark:border-blue-500/25 hover:border-blue-600 active:scale-95"
            title="Configurar descripción, términos, edad mínima, switches e imágenes del evento"
          >
            <Settings className="w-3.5 h-3.5 text-blue-700 dark:text-blue-400" />
            <span>⚙️ Configurar Evento</span>
          </button>
        )}

        {/* Enlace público al evento en qrboletos.com (sin login) */}
        {evento.enlace && (
          <a
            href={evento.enlace}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl py-2 px-3 text-xs font-medium flex items-center justify-center gap-1.5 bg-slate-100 dark:bg-slate-950/60 hover:bg-slate-200 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-slate-300 dark:border-slate-800/60 transition-all cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500" />
            <span>Ver evento en qrboletos.com</span>
            <ExternalLink className="w-3 h-3 opacity-60" />
          </a>
        )}

        {/* Fecha de Creación o ID */}
        <div className="text-[9px] text-slate-500 dark:text-slate-600 text-right pt-1 font-mono">
          {evento.fechaCreacion ? `Añadido el ${evento.fechaCreacion}` : `ID: ${evento.id}`}
        </div>
      </div>
    </div>
  );
}
