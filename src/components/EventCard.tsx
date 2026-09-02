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
  Globe
} from 'lucide-react';

interface EventCardProps {
  evento: Evento;
  onToggleFavorite: (id: string, currentStatus: boolean) => void;
  onDeleteEvent: (id: string) => void;
  onOpenLocalities: (evento: Evento) => void;
}

export default function EventCard({
  evento,
  onToggleFavorite,
  onDeleteEvent,
  onOpenLocalities,
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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg hover:shadow-xl hover:border-slate-700/80 transition-all group flex flex-col justify-between">
      {/* Cabecera de la Tarjeta */}
      <div>
        {/* Banner/Flyer del Evento desde la API */}
        <div className="w-full h-40 relative rounded-xl overflow-hidden mb-4 border border-slate-800 bg-slate-950 flex items-center justify-center shrink-0 shadow-inner group-hover:border-emerald-500/30 transition-all">
          {imageSrc && !imgError ? (
            <img
              src={imageSrc}
              alt={evento.nombre}
              onError={() => setImgError(true)}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 flex flex-col items-center justify-center text-slate-600 font-mono text-[10px] tracking-wider select-none uppercase font-bold gap-1">
              <Layers className="w-6 h-6 text-slate-700" />
              <span>QRBoletos</span>
            </div>
          )}

          {/* Badge del ID oficial de QRBoletos */}
          {evento.id && (
            <div className="absolute top-2.5 left-2.5 bg-slate-950/85 backdrop-blur-md text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg text-[10px] font-mono font-bold shadow-md">
              ID: #{evento.id}
            </div>
          )}

          {/* Enlace público al evento en qrboletos.com (sin login requerido) */}
          {evento.enlace && (
            <a
              href={evento.enlace}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute top-2.5 right-2.5 bg-slate-950/80 hover:bg-emerald-600 text-slate-300 hover:text-white p-1.5 rounded-lg border border-slate-800 transition-all shadow-md cursor-pointer"
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
              <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                {formatDateString(evento.fecha)}
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-100 mt-1.5 group-hover:text-emerald-400 transition-colors line-clamp-2" title={evento.nombre}>
              {evento.nombre}
            </h3>
          </div>
          
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleFavoriteClick}
              className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                evento.favorito
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
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
        {/* Abrir Localidades dentro de nuestro panel */}
        <button
          onClick={() => onOpenLocalities(evento)}
          className={`w-full rounded-xl py-2.5 px-3 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md cursor-pointer ${
            evento.localidades && evento.localidades.length > 0
              ? 'bg-emerald-600/10 hover:bg-emerald-600 text-emerald-400 hover:text-white border border-emerald-500/20 hover:border-emerald-500'
              : 'bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>Ver Localidades (Panel)</span>
          {evento.localidades && evento.localidades.length > 0 && (
            <span className="ml-1 bg-emerald-500/20 text-emerald-300 text-[10px] px-1.5 py-0.2 rounded-full">
              {evento.localidades.length}
            </span>
          )}
        </button>

        {/* Enlace público al evento en qrboletos.com (sin login) */}
        {evento.enlace && (
          <a
            href={evento.enlace}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl py-2 px-3 text-xs font-medium flex items-center justify-center gap-1.5 bg-slate-950/60 hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 border border-slate-800/60 transition-all cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-500" />
            <span>Ver evento en qrboletos.com</span>
            <ExternalLink className="w-3 h-3 opacity-50" />
          </a>
        )}

        {/* Fecha de Creación o ID */}
        <div className="text-[9px] text-slate-600 text-right pt-1 font-mono">
          {evento.fechaCreacion ? `Añadido el ${evento.fechaCreacion}` : `ID: ${evento.id}`}
        </div>
      </div>
    </div>
  );
}
