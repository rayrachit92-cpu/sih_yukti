import { MapContainer, TileLayer, Polygon, Tooltip, useMap } from 'react-leaflet';
import type { LatLngExpression } from 'leaflet';
import { useEffect, useMemo } from 'react';
import type { ParcelRecord } from '../types/ulpin';

const OSM_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const SATELLITE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

function FitSelected({ parcel }: { parcel?: ParcelRecord }) {
  const map = useMap();
  useEffect(() => {
    if (!parcel?.coordinates.length) return;
    const bounds = parcel.coordinates.map(p => [p.lat, p.lon] as [number, number]);
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 19, animate: true });
  }, [parcel, map]);
  return null;
}

export default function ParcelMap({ parcels, selected, onSelect, satellite, canSelect }: { parcels: ParcelRecord[]; selected?: ParcelRecord; onSelect: (p: ParcelRecord) => void; satellite: boolean; canSelect?: (p: ParcelRecord) => boolean }) {
  const center = useMemo<LatLngExpression>(() => {
    const p = selected?.coordinates[0] || parcels.find(p => p.coordinates.length)?.coordinates[0];
    return p ? [p.lat, p.lon] : [18.6712, 73.8907];
  }, [selected, parcels]);
  return <MapContainer center={center} zoom={17} className="map-shell" zoomControl={false}>
    <TileLayer url={satellite ? SATELLITE_URL : OSM_URL} attribution={satellite ? 'Imagery © Esri' : '© OpenStreetMap contributors'} />
    <FitSelected parcel={selected} />
    {parcels.filter(p => p.type === 'Polygon').map(p => {
      const positions = p.coordinates.map(c => [c.lat, c.lon] as [number, number]);
      const active = selected?.name === p.name;
      const selectable = canSelect ? canSelect(p) : true;
      return <Polygon
        key={p.name}
        positions={positions}
        pathOptions={{
          color: active ? '#22d3ee' : selectable ? '#60a5fa' : '#94a3b8',
          weight: active ? 4 : 1.5,
          fillColor: active ? '#22d3ee' : selectable ? '#2563eb' : '#64748b',
          fillOpacity: active ? .25 : selectable ? .08 : .035,
          dashArray: selectable ? undefined : '5 5'
        }}
        eventHandlers={selectable ? { click: () => onSelect(p) } : undefined}
      >
        <Tooltip sticky>{p.name} · {selectable ? `${p.building_height_m ?? '—'} m · ${p.detected_floors ?? p.declared_floors ?? '—'} floors` : 'Restricted property'}</Tooltip>
      </Polygon>;
    })}
  </MapContainer>;
}
