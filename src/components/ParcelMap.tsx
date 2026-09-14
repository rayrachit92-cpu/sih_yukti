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

export default function ParcelMap({ parcels, selected, onSelect, satellite }: { parcels: ParcelRecord[]; selected?: ParcelRecord; onSelect: (p: ParcelRecord) => void; satellite: boolean }) {
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
      return <Polygon key={p.name} positions={positions} pathOptions={{ color: active ? '#22d3ee' : '#60a5fa', weight: active ? 4 : 1.5, fillColor: active ? '#22d3ee' : '#2563eb', fillOpacity: active ? .25 : .08 }} eventHandlers={{ click: () => onSelect(p) }}>
        <Tooltip sticky>{p.name} · {p.building_height_m ?? '—'} m · {p.detected_floors ?? p.declared_floors ?? '—'} floors</Tooltip>
      </Polygon>;
    })}
  </MapContainer>;
}
