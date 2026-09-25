import { useMemo, useState } from 'react';
import type { ParcelRecord } from '../types/ulpin';
import AnimatedButton from './AnimatedButton';

type Props = {
  polygons: ParcelRecord[];
  selected?: ParcelRecord;
  onGenerate: (p?: ParcelRecord) => void;
  onAddPolygon: (name: string, raw: string) => void;
  onSelect: (p: ParcelRecord) => void;
  onGo: (page: string) => void;
  message?: string;
};

export default function NewPolygonPage({ polygons, selected, onGenerate, onAddPolygon, onSelect, onGo, message }: Props) {
  const [existing, setExisting] = useState(selected?.name ?? polygons[0]?.name ?? '');
  const [newName, setNewName] = useState('');
  const [coords, setCoords] = useState('18.67105747518837,73.89057196971277;\n18.671007313266,73.89067735250644;\n18.67106667510083,73.89071315823728;\n18.6711101588053,73.89059533121382');

  const chosen = useMemo(() => polygons.find(p => p.name === existing), [polygons, existing]);

  const selectExisting = (value: string) => {
    setExisting(value);
    const parcel = polygons.find(p => p.name === value);
    if (parcel) onSelect(parcel);
  };

  return (
    <div className="new-polygon-page">
      <div className="new-polygon-header">
        <div>
          <div className="eyebrow">ADMIN PROPERTY GEOMETRY</div>
          <h1>Add / Generate Polygon</h1>
          <p>Create a validated polygon or generate a 3D ULPIN from an existing source parcel.</p>
        </div>
        <div className="new-polygon-actions">
          <button onClick={() => onGo('Full 3D Map')}>Open Full 3D Map →</button>
          <button className="ghost" onClick={() => onGo('2D Map')}>Open 2D Map</button>
        </div>
      </div>

      <div className="new-polygon-grid">
        <section className="new-polygon-card">
          <div className="panel-kicker">EXISTING SOURCE PARCEL</div>
          <h2>Generate from existing 2D ULPIN</h2>
          <p>Select a parcel from the supplied KML/CSV dataset. Its exact polygon is retained for 3D generation.</p>

          <label>2D ULPIN / Parcel</label>
          <select value={existing} onChange={e => selectExisting(e.target.value)}>
            {polygons.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>

          <div className="new-polygon-meta">
            <div><span>Geometry</span><b>Exact source polygon</b></div>
            <div><span>Height</span><b>{chosen?.building_height_m != null ? `${chosen.building_height_m.toFixed(2)} m` : '—'}</b></div>
            <div><span>Floors</span><b>{chosen?.detected_floors ?? chosen?.declared_floors ?? '—'}</b></div>
          </div>

          <AnimatedButton className="primary-flow" onClick={() => chosen && onGenerate(chosen)} disabled={!chosen}>
            Generate 3D ULPIN <span>→</span>
          </AnimatedButton>
        </section>

        <section className="new-polygon-card blue-card">
          <div className="panel-kicker">NEW GEOMETRY</div>
          <h2>Create new polygon coordinates</h2>
          <p>Enter a new 2D polygon. The existing validation logic checks coordinate range, topology, duplicate names and overlap before generation.</p>

          <label>New 2D ULPIN / Name</label>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. NEW-ULPIN-001" />

          <label>Polygon coordinates <small>(lat,lon; lat,lon; ...)</small></label>
          <textarea value={coords} onChange={e => setCoords(e.target.value)} rows={7} />

          <div className="new-polygon-hint">✓ Minimum 3 points · ✓ latitude/longitude range · ✓ non-zero area · ✓ duplicate-name check · ✓ overlap review</div>

          <AnimatedButton className="primary-flow blue-btn" onClick={() => onAddPolygon(newName, coords)}>
            Validate & Create 3D ULPIN <span>→</span>
          </AnimatedButton>

          {message && <div className="workflow-message">{message}</div>}
        </section>
      </div>

      <div className="new-polygon-note">
        <b>Data honesty:</b> source geometry and supplied DEM/DSM values remain unchanged. New polygons without measured elevation remain <strong>REVIEW REQUIRED</strong>; underground structures remain <strong>INFERRED — NOT DIRECTLY MEASURED</strong>.
      </div>
    </div>
  );
}
