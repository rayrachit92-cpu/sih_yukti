import { useMemo, useState } from 'react';
import type { ParcelRecord } from '../types/ulpin';

type Props = {
  polygons: ParcelRecord[];
  selected?: ParcelRecord;
  onGenerate: (p?: ParcelRecord) => void;
  onAddPolygon: (name: string, raw: string) => void;
  onSelect: (p: ParcelRecord) => void;
  onGo: (page: string) => void;
  message?: string;
  focusNewPolygon?: boolean;
};

const steps = [
  ['01', 'Select / Input', '2D parcel or new polygon'],
  ['02', 'Validate Geometry', 'Format · topology · overlap'],
  ['03', 'Elevation Sampling', '4-point DEM / DSM → nDSM'],
  ['04', 'Classify Building', 'Independent · Apartment · Underground'],
  ['05', 'Generate 3D', 'Exact footprint + floors'],
  ['06', 'Validate 3D', 'Footprint · floors · height'],
  ['07', 'Visualize', 'Interactive 3D property / city'],
  ['08', 'Report & Export', 'Record · conflict · GeoJSON'],
];

export default function WorkflowPage({ polygons, selected, onGenerate, onAddPolygon, onSelect, onGo, message, focusNewPolygon }: Props) {
  const [mode, setMode] = useState<'existing' | 'new'>(focusNewPolygon ? 'new' : 'existing');
  const [existing, setExisting] = useState(selected?.name ?? polygons[0]?.name ?? '');
  const [newName, setNewName] = useState('');
  const [coords, setCoords] = useState('18.67105747518837,73.89057196971277;\n18.671007313266,73.89067735250644;\n18.67106667510083,73.89071315823728;\n18.6711101588053,73.89059533121382');

  const chosen = useMemo(() => polygons.find(p => p.name === existing), [polygons, existing]);

  function downloadFile(filename: string, content: string, type = 'application/json') {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function exportRecords() {
    downloadFile('ulpin-3d-registry.json', JSON.stringify(polygons.map(p => ({
      parent_2d_ulpin: p.name, geometry: p.coordinates, building_height_m: p.building_height_m,
      floors: p.detected_floors ?? p.declared_floors, dem_m: p.elevation_dem_m, dsm_m: p.elevation_dsm_m,
      ndsm_m: p.ndsm_m, status: p.conflict ? 'REVIEW REQUIRED' : 'VERIFIED'
    })), null, 2));
  }

  function exportGeoJSON() {
    const geojson = { type: 'FeatureCollection', features: polygons.map(p => ({
      type: 'Feature', properties: { name: p.name, height_m: p.building_height_m, floors: p.detected_floors ?? p.declared_floors },
      geometry: { type: 'Polygon', coordinates: [[...p.coordinates.map(c => [c.lon, c.lat]), [p.coordinates[0]?.lon, p.coordinates[0]?.lat]]] }
    })) };
    downloadFile('ulpin-parcels.geojson', JSON.stringify(geojson, null, 2), 'application/geo+json');
  }

  const sourceStats = {
    parcels: polygons.length,
    buildings: polygons.filter(p => (p.building_height_m ?? 0) > 0).length,
    elevation: polygons.filter(p => p.elevation_dem_m != null && p.elevation_dsm_m != null).length,
    conflicts: polygons.filter(p => p.conflict).length,
  };

  const selectExisting = (value: string) => {
    setExisting(value);
    const p = polygons.find(x => x.name === value);
    if (p) onSelect(p);
  };

  return <div className="workflow-page">
    <div className="workflow-hero">
      <div>
        <div className="eyebrow">3D ULPIN GENERATION PIPELINE</div>
        <h1>From 2D Land Records to a Complete 3D Digital Property Map</h1>
        <p>Two entry paths use the same processing, elevation, 3D reconstruction and validation pipeline. Existing parcels preserve their exact KML/CSV footprint; new polygons are validated before they enter the 3D pipeline.</p>
      </div>
      <div className="workflow-hero-actions"><button onClick={() => onGo('Full 3D Tree')}>Open Full 3D Tree →</button><button className="ghost" onClick={() => onGo('2D Map')}>Open 2D Map</button></div>
    </div>

    <div className="source-strip">
      <div><span>DATA SOURCE</span><b>Existing 2D ULPIN</b><small>KML + CSV</small></div>
      <div><span>ELEVATION</span><b>DEM / DSM</b><small>nDSM = DSM − DEM</small></div>
      <div><span>MAP</span><b>Satellite / Cadastral</b><small>Current map module</small></div>
      <div><span>PROPERTY</span><b>Ownership + Floor Plans</b><small>20 ownership · 41 unit records</small></div>
      <div><span>LIVE DATASET</span><b>{sourceStats.parcels} parcels · {sourceStats.buildings} buildings</b><small>{sourceStats.elevation} DEM/DSM · reserve points available</small></div>
    </div>

    <section className="workflow-entry-grid">
      <div className={`workflow-entry ${mode === 'existing' ? 'active' : ''}`}>
        <div className="entry-number">1</div>
        <div className="entry-head"><div><div className="panel-kicker">GENERATE FROM EXISTING DATA</div><h2>Existing 2D ULPIN</h2><p>Select a parcel already present in the supplied KML/CSV dataset.</p></div><button className="mode-btn" onClick={() => setMode('existing')}>{mode === 'existing' ? 'ACTIVE' : 'USE THIS'}</button></div>
        <div className="workflow-form">
          <label>2D ULPIN / Parcel</label>
          <select value={existing} onChange={e => selectExisting(e.target.value)}>{polygons.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}</select>
          <div className="entry-meta"><span>Geometry <b>Exact source polygon</b></span><span>Height <b>{chosen?.building_height_m != null ? `${chosen.building_height_m.toFixed(2)} m` : '—'}</b></span><span>Floors <b>{chosen?.detected_floors ?? chosen?.declared_floors ?? '—'}</b></span></div>
          <button className="primary-flow" onClick={() => chosen && onGenerate(chosen)} disabled={!chosen}>Generate 3D ULPIN <span>→</span></button>
        </div>
      </div>

      <div className={`workflow-entry new-entry ${mode === 'new' ? 'active' : ''}`}>
        <div className="entry-number blue">2</div>
        <div className="entry-head"><div><div className="panel-kicker">CREATE NEW GEOMETRY</div><h2>Add New Polygon Coordinates</h2><p>Draw or paste a new polygon. The project validates it before 3D generation.</p></div><button className="mode-btn" onClick={() => setMode('new')}>{mode === 'new' ? 'ACTIVE' : 'USE THIS'}</button></div>
        <div className="workflow-form">
          <label>New 2D ULPIN / Name</label>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. NEW-ULPIN-001" />
          <label>Polygon coordinates <small>(lat,lon; lat,lon; ...)</small></label>
          <textarea value={coords} onChange={e => setCoords(e.target.value)} rows={4} />
          <div className="format-hint">✓ Minimum 3 points · ✓ latitude/longitude range · ✓ non-zero area · ✓ duplicate-name check · ✓ overlap review</div>
          <button className="primary-flow blue-btn" onClick={() => onAddPolygon(newName, coords)}>Validate & Create 3D ULPIN <span>→</span></button>
          {message && <div className="workflow-message">{message}</div>}
        </div>
      </div>
    </section>

    <section className="flow-board">
      <div className="flow-board-title"><div><div className="panel-kicker">SHARED PROCESSING PIPELINE</div><h2>One workflow, two entry points</h2></div><div className="live-badge"><i/> LIVE SOURCE PIPELINE</div></div>
      <div className="flow-step-grid">
        {steps.map((s, i) => <div className="flow-step" key={s[0]}><div className="flow-step-num">{s[0]}</div><b>{s[1]}</b><span>{s[2]}</span>{i < steps.length - 1 && <em>→</em>}</div>)}
      </div>
    </section>

    <section className="architecture-grid">
      <PipelineCard number="A" title="Data Processing Layer" accent="green" items={['Geospatial processing', '4-point DEM / DSM sampling', 'nDSM = DSM − DEM', 'Spatial-ready parcel records']} />
      <PipelineCard number="B" title="3D Model Generation" accent="blue" items={['Exact footprint extrusion', 'Non-uniform building heights', 'Floor-plan unit inventory', 'Inferred underground volume']} />
      <PipelineCard number="C" title="ML & Validation Layer" accent="purple" items={['Ownership + floor-plan linkage', 'Floor-count consistency', 'Footprint mismatch', 'Conflict score + confidence']} />
    </section>

    <section className="output-grid">
      <div className="output-card visual-output"><div className="panel-kicker">OUTPUT & VISUALIZATION</div><h2>Interactive 3D Digital Twin</h2><div className="output-list"><span>◈ View every supplied building in Full 3D Tree</span><span>◈ Click a building to highlight it</span><span>◈ Open exact floor-wise 3D property</span><span>◈ Toggle 2D / 3D / satellite context</span></div><button onClick={() => onGo('Full 3D Tree')}>Open interactive 3D viewer →</button></div>
      <div className="output-card"><div className="panel-kicker">RESULT & SERVICES</div><h2>Evidence-backed records</h2><div className="result-stats"><div><b>{sourceStats.parcels}</b><span>2D records</span></div><div><b>{sourceStats.buildings}</b><span>3D buildings</span></div><div><b>{sourceStats.conflicts}</b><span>review queue</span></div></div><div className="output-actions"><button onClick={() => onGo('Reports')}>Conflict report</button><button onClick={exportRecords}>Export records</button><button onClick={exportGeoJSON}>GeoJSON</button><button onClick={() => onGo('ULPIN Registry')}>3D ULPIN registry</button></div></div>
      <div className="output-card"><div className="panel-kicker">REPORTING & DECISION SUPPORT</div><h2>Review-ready outputs</h2><div className="output-list"><span>◈ Validation evidence</span><span>◈ Automated review status</span><span>◈ Derived vs inferred data labels</span><span>◈ Registry / planning support</span></div><button onClick={() => onGo('Reports')}>Open reports →</button></div>
    </section>

    <div className="workflow-footnote"><b>Data honesty:</b> source geometry and supplied DEM/DSM values are preserved. New polygons without measured elevation remain <strong>REVIEW REQUIRED</strong>; underground structures are <strong>INFERRED — NOT DIRECTLY MEASURED</strong>.</div>
  </div>;
}

function PipelineCard({ number, title, accent, items }: { number: string; title: string; accent: string; items: string[] }) {
  return <div className={`pipeline-card ${accent}`}><div className="pipeline-top"><span>{number}</span><div><div className="panel-kicker">PROCESSING STAGE</div><h3>{title}</h3></div></div><ul>{items.map(x => <li key={x}>{x}</li>)}</ul></div>;
}
