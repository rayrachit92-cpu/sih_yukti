import { useEffect, useMemo, useState } from 'react';
import Papa from 'papaparse';
import ParcelMap from './components/ParcelMap';
import Property3D from './components/Property3D';
import Full3DTree from './components/Full3DTree';
import NewPolygonPage from './components/NewPolygonPage';
import { analyzeUnderground, generateProperty, getParcels } from './data/api';
import type { GeneratedProperty, ParcelRecord, ReserveElevationPoint, ReserveElevationSample, UndergroundAIResult } from './types/ulpin';

import AnimatedButton from './components/AnimatedButton';
import SpotlightNavbar from './components/SpotlightNavbar';
import AuthPortal, { type UserRole } from './components/AuthPortal';
import RoleLanding from './components/RoleLanding';
import MunicipalDataIntake from './components/MunicipalDataIntake';
const MUNICIPAL_NAV = ['Municipal Data Intake'];
const ADMIN_NAV = ['Dashboard', 'Full 3D Map', '2D Map', '3D Property', 'Street View', 'Add New Polygon'];
const CITIZEN_NAV = ['2D Map', '3D Property', 'Property Report', 'Settings'];

function fmt(v: number | null | undefined, suffix = '') { return v == null || Number.isNaN(v) ? '—' : `${v.toFixed(2)}${suffix}`; }

export default function App() {
  const [parcels, setParcels] = useState<ParcelRecord[]>([]);
  const [selected, setSelected] = useState<ParcelRecord>();
  const [property, setProperty] = useState<GeneratedProperty>();
  const [undergroundAI, setUndergroundAI] = useState<UndergroundAIResult>();
  const [undergroundAILoading, setUndergroundAILoading] = useState(false);
  const [page, setPage] = useState('Dashboard');
  const [satellite, setSatellite] = useState(true);
  const [search, setSearch] = useState('');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState('Ready');
  const [exploded, setExploded] = useState(false);
  const [backendOk, setBackendOk] = useState(true);
  const [ulpinInput, setUlpInInput] = useState('');
  const [inputMessage, setInputMessage] = useState('');
  const [customPolygonMessage, setCustomPolygonMessage] = useState('');
  const [reservePoints, setReservePoints] = useState<ReserveElevationPoint[]>([]);
  const [session, setSession] = useState<{ role: UserRole; name: string; landing: boolean; ulpin?: string } | null>(() => {
    try {
      const raw = localStorage.getItem('ulpin-session-v1');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('ulpin-theme-v2');
    return saved === 'dark' || saved === 'light' ? saved : 'light';
  });

  useEffect(() => {
    if (session) localStorage.setItem('ulpin-session-v1', JSON.stringify(session));
    else localStorage.removeItem('ulpin-session-v1');
  }, [session]);

  useEffect(() => {
    localStorage.setItem('ulpin-theme-v2', theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!session) return;
    getParcels().then(data => {
      setParcels(data);
      if (session.role === 'citizen' && session.ulpin) {
        const matched = data.find(p => p.type === 'Polygon' && p.ownership?.ulpin_2d?.trim().toUpperCase() === session.ulpin?.trim().toUpperCase());
        setSelected(matched);
        if (!matched) setInputMessage('The signed-in ULPIN is not present in the loaded parcel records.');
      } else {
        setSelected(data.find(p => p.type === 'Polygon'));
      }
    }).catch(() => setBackendOk(false));
    fetch('/data/dem_dsm_reserve_points_final.csv')
      .then(r => r.text())
      .then(text => {
        const parsed = Papa.parse<ReserveElevationPoint>(text, { header: true, skipEmptyLines: true, dynamicTyping: true });
        setReservePoints((parsed.data || []).filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon))));
      })
      .catch(() => setReservePoints([]));
  }, [session]);

  const polygons = parcels.filter(p => p.type === 'Polygon');
  const citizenParcel = useMemo(() => {
    if (session?.role !== 'citizen' || !session.ulpin) return undefined;
    const target = session.ulpin.trim().toUpperCase();
    return polygons.find(p => p.ownership?.ulpin_2d?.trim().toUpperCase() === target);
  }, [polygons, session?.role, session?.ulpin]);
  const filtered = useMemo(() => {
    const matches = parcels.filter(p => `${p.name} ${p.type} ${p.description ?? ''} ${p.ownership?.ulpin_2d ?? ''} ${p.ownership?.owner_name ?? ''}`.toLowerCase().includes(search.toLowerCase()));
    return session?.role === 'citizen' ? (citizenParcel ? [citizenParcel] : []) : matches;
  }, [parcels, search, session?.role, citizenParcel, polygons]);
  const polygonCount = polygons.length;
  const buildingCount = polygons.filter(p => (p.building_height_m ?? 0) > 0).length;
  const floorCount = polygons.reduce((n, p) => n + (p.detected_floors ?? p.declared_floors ?? 0), 0);
  const conflictCount = polygons.filter(p => p.conflict).length;
  const apartmentCount = polygons.filter(p => /apartment/i.test(`${p.name} ${p.description ?? ''}`) || p.ownership?.category === 'apartment').length;
  const unitCount = polygons.reduce((n, p) => n + (p.unit_count ?? p.floor_plan_units?.length ?? 0), 0);
  const avgHeight = buildingCount ? polygons.reduce((n, p) => n + (p.building_height_m ?? 0), 0) / buildingCount : 0;
  const inferredCount = polygons.filter(p => p.conflict || p.detected_floors == null).length;

  const selectParcel = (p: ParcelRecord) => {
    if (session?.role === 'citizen' && citizenParcel && p.name !== citizenParcel.name) {
      setInputMessage('Citizen access is limited to your registered property.');
      return;
    }
    setSelected(p);
    setProperty(undefined);
    setUndergroundAI(undefined);
    setSatellite(true);
    setPage('2D Map');
  };

  async function generate3D(target?: ParcelRecord) {
    const parcel = target ?? selected;
    if (!parcel) return;
    setSelected(parcel);
    setInputMessage(`Creating 3D ULPIN for ${parcel.name}`);
    setGenerating(true); setProgress(0); setPage('3D Property');
    const steps = [
      ['Reading exact polygon footprint', 15],
      ['Sampling DEM + DSM elevations', 32],
      ['Calculating nDSM = DSM − DEM', 48],
      ['Classifying building type', 62],
      ['Extruding exact parcel footprint', 76],
      ['Generating floors + inferred underground', 89],
      ['Running footprint / floor / height validation', 100],
    ] as const;
    for (const [label, value] of steps) {
      setStep(label); setProgress(value);
      await new Promise(r => setTimeout(r, 360));
    }
    try {
      const generated = parcel.description?.includes('User-created polygon')
        ? buildLocalProperty(parcel)
        : await generateProperty(parcel.name);
      setProperty(generated);
      setUndergroundAI(undefined);
      setBackendOk(true);
    } catch {
      // Keep the workflow usable even when the API is offline. Source-backed parcel data
      // can still be reconstructed locally from the exact polygon and available attributes.
      setProperty(buildLocalProperty(parcel));
      setBackendOk(false);
    }
    setGenerating(false); setStep('3D ULPIN ready');
  }

  async function runUndergroundAI() {
    const parcel = selected;
    if (!parcel) return;
    setUndergroundAILoading(true);
    try {
      const result = await analyzeUnderground(parcel.name);
      setUndergroundAI(result);
    } catch (error) {
      setUndergroundAI(undefined);
      setInputMessage(error instanceof Error ? error.message : 'Underground AI analysis failed.');
    } finally {
      setUndergroundAILoading(false);
    }
  }

  function buildLocalProperty(parcel: ParcelRecord): GeneratedProperty {
    const h = parcel.building_height_m ?? (parcel.ndsm_m && parcel.ndsm_m > 0 ? parcel.ndsm_m : 3);
    const floors = Math.max(1, Number(parcel.floor_plan_floor_count ?? parcel.detected_floors ?? parcel.declared_floors ?? 1));
    const floorH = h / floors;
    const safe = parcel.name.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase().replace(/^-|-$/g, '');
    const planNumbers = [...new Set((parcel.floor_plan_units ?? []).map(u => Number(u.floor_number)))].sort((a,b) => a-b);
    const floorItems: GeneratedProperty['floors'] = [
      { id: 'B1', label: 'Basement 1', floor_number: -1, bottom_m: -3, top_m: 0, is_underground: true },
      ...(planNumbers.includes(0)
        ? [
            { id: 'G0', label: 'Ground Floor', floor_number: 0, bottom_m: 0, top_m: floorH, is_underground: false },
            ...Array.from({ length: Math.max(0, floors - 1) }, (_, i) => ({ id: `F${i + 1}`, label: `Floor ${i + 1}`, floor_number: i + 1, bottom_m: (i + 1) * floorH, top_m: (i + 2) * floorH, is_underground: false }))
          ]
        : Array.from({ length: floors }, (_, i) => ({ id: `F${i + 1}`, label: `Floor ${i + 1}`, floor_number: i + 1, bottom_m: i * floorH, top_m: (i + 1) * floorH, is_underground: false })))
    ];
    const status = parcel.conflict || parcel.elevation_dem_m == null || parcel.elevation_dsm_m == null ? 'REVIEW REQUIRED' : 'VERIFIED';
    return {
      name: parcel.name, parent_2d_ulpin: parcel.ownership?.ulpin_2d ?? parcel.name, ulpin_3d: `MH-PUN-3D-${safe}-B01`,
      building_type: parcel.building_type ?? (floors > 1 ? 'Apartment / Multi-floor' : 'Independent Building'), height_m: h,
      dem_m: parcel.elevation_dem_m, dsm_m: parcel.elevation_dsm_m, ndsm_m: parcel.ndsm_m,
      floors: floorItems,
      units: (parcel.floor_plan_units ?? []).map(u => ({ unit_id: u.unit_id, floor_number: u.floor_number, floor_label: u.floor_label, unit_type: u.unit_type, bhk: u.bhk, owner_name: u.owner_name, notes: u.notes })),
      ownership: parcel.ownership ?? null, reserve_elevation: parcel.reserve_elevation ?? null,
      underground_inferred: true, confidence: status === 'VERIFIED' ? 92 : 68, status, coordinates: parcel.coordinates
    };
  }

  function nearestReserve(point: { lat: number; lon: number }): ReserveElevationSample | null {
    if (!reservePoints.length) return null;
    const k = 111320;
    const best = reservePoints.reduce<{ point: ReserveElevationPoint; distance: number } | null>((acc, p) => {
      const dLat = (p.lat - point.lat) * k;
      const dLon = (p.lon - point.lon) * k * Math.cos(point.lat * Math.PI / 180);
      const distance = Math.hypot(dLat, dLon);
      return !acc || distance < acc.distance ? { point: p, distance } : acc;
    }, null);
    return best ? { ...best.point, distance_m: best.distance } : null;
  }

  function addNewPolygon(name: string, raw: string) {
    const clean = raw.replace(/\n/g, ';').replace(/\s*;\s*/g, ';').trim();
    const tokens = clean.split(';').map(x => x.trim()).filter(Boolean);
    const coordinates = tokens.map(token => {
      const parts = token.split(',').map(x => x.trim());
      if (parts.length !== 2) throw new Error('Use lat,lon pairs separated by semicolons.');
      const lat = Number(parts[0]), lon = Number(parts[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) throw new Error('Invalid latitude/longitude value.');
      return { lat, lon };
    });
    if (coordinates.length < 3) throw new Error('A polygon needs at least 3 coordinate points.');
    const first = coordinates[0], last = coordinates[coordinates.length - 1];
    const closed = Math.abs(first.lat-last.lat) < 1e-10 && Math.abs(first.lon-last.lon) < 1e-10;
    const points = closed ? coordinates : [...coordinates, first];
    const area = Math.abs(points.slice(0,-1).reduce((sum,p,i) => { const q=points[i+1]; return sum + p.lon*q.lat-q.lon*p.lat; },0))/2;
    if (area < 1e-10) throw new Error('Topology check failed: polygon area is zero. Check the coordinate order.');
    const orientation = (a:any,b:any,c:any) => (b.lon-a.lon)*(c.lat-a.lat)-(b.lat-a.lat)*(c.lon-a.lon);
    const intersects = (a:any,b:any,c:any,d:any) => {
      const o1=orientation(a,b,c),o2=orientation(a,b,d),o3=orientation(c,d,a),o4=orientation(c,d,b);
      return ((o1>0&&o2<0)||(o1<0&&o2>0)) && ((o3>0&&o4<0)||(o3<0&&o4>0));
    };
    for(let i=0;i<points.length-1;i++) for(let j=i+1;j<points.length-1;j++){
      if(Math.abs(i-j)<=1 || (i===0&&j===points.length-2)) continue;
      if(intersects(points[i],points[i+1],points[j],points[j+1])) throw new Error('Topology check failed: polygon edges cross each other.');
    }
    const polygonName = name.trim() || `NEW-ULPIN-${Date.now().toString().slice(-6)}`;
    if (polygons.some(p => p.name.toLowerCase() === polygonName.toLowerCase())) throw new Error('That ULPIN / parcel name already exists.');
    const minLat=Math.min(...points.map(p=>p.lat)), maxLat=Math.max(...points.map(p=>p.lat)), minLon=Math.min(...points.map(p=>p.lon)), maxLon=Math.max(...points.map(p=>p.lon));
    const overlap = polygons.some(p => p.coordinates.length>=3 && Math.max(...p.coordinates.map(x=>x.lat))>=minLat && Math.min(...p.coordinates.map(x=>x.lat))<=maxLat && Math.max(...p.coordinates.map(x=>x.lon))>=minLon && Math.min(...p.coordinates.map(x=>x.lon))<=maxLon);
    const reserve = nearestReserve(first);
    const record: ParcelRecord = {
      name: polygonName, type: 'Polygon', floors: 1, num_vertices: points.length,
      coordinates_lat_lon: points.map(p => `${p.lat},${p.lon}`).join('; '), coordinates: points,
      description: 'User-created polygon • reference elevation from reserve points; requires validation', building_height_m: null,
      elevation_dem_m: reserve?.elevation_dem_m ?? null, elevation_dsm_m: reserve?.elevation_dsm_m ?? null,
      ndsm_m: reserve ? reserve.elevation_dsm_m - reserve.elevation_dem_m : null, latitude: first.lat, longitude: first.lon,
      conflict: overlap, declared_floors: 1, detected_floors: null, floor_plan_floor_count: null,
      elevation_detected_floors: null, unit_count: 0, building_type: 'User-created polygon',
      ownership: null, floor_plan_units: [], reserve_elevation: reserve
    };
    setParcels(prev => [...prev, record]);
    setSelected(record);
    setCustomPolygonMessage(`Validated ${polygonName}: format + topology passed${overlap ? '; overlap review flagged' : '; no bounding-box overlap detected'}. ${reserve ? `Nearest reserve elevation ${reserve.point_id}: DEM ${reserve.elevation_dem_m.toFixed(2)} m / DSM ${reserve.elevation_dsm_m.toFixed(2)} m (${reserve.distance_m.toFixed(1)} m away). ` : ''}Reference elevation only; building height remains REVIEW REQUIRED until validated.`);
    setInputMessage(`New polygon ${polygonName} added.`);
    return record;
  }

  function createFromNewPolygon(name: string, raw: string) {
    try {
      const record = addNewPolygon(name, raw);
      void generate3D(record);
    } catch (error) {
      setCustomPolygonMessage(error instanceof Error ? error.message : 'Unable to add polygon.');
    }
  }

  function selectByInput() {
    const value = ulpinInput.trim().toLowerCase();
    if (!value) { setInputMessage('Enter a 2D ULPIN / parcel name.'); return; }
    const match = polygons.find(p => p.name.toLowerCase() === value || p.name.toLowerCase().includes(value) || p.ownership?.ulpin_2d?.toLowerCase() === value);
    if (!match) {
      setInputMessage('2D ULPIN not found in the loaded KML/CSV dataset.');
      return;
    }
    void generate3D(match);
  }

  const highlightParcel = (p: ParcelRecord) => {
    setSelected(p);
    setInputMessage(`Highlighted ${p.name}`);
  };

  useEffect(() => {
    if (!session || session.landing) return;
    if (session.role === 'citizen' && !CITIZEN_NAV.includes(page)) {
      setPage('2D Map');
      return;
    }
    if (session.role === 'municipal' && !MUNICIPAL_NAV.includes(page)) {
      setPage('Municipal Data Intake');
      return;
    }
    if (session.role === 'government' && !ADMIN_NAV.includes(page)) {
      setPage('Dashboard');
    }
  }, [session?.role, session?.landing, page]);

  useEffect(() => {
    if (session?.role === 'citizen' && citizenParcel && selected?.name !== citizenParcel.name) {
      setSelected(citizenParcel);
      setProperty(undefined);
      setUndergroundAI(undefined);
    }
  }, [session?.role, citizenParcel, selected?.name]);

  useEffect(() => {
    if (session?.role === 'citizen' && page === '3D Property' && citizenParcel && !property && !generating) {
      void generate3D(citizenParcel);
    }
  }, [session?.role, page, citizenParcel, property, generating]);

  const go = (p: string) => {
    if (session?.role === 'citizen' && !CITIZEN_NAV.includes(p)) return;
    if (session?.role === 'municipal' && !MUNICIPAL_NAV.includes(p)) return;
    if (session?.role === 'government' && !ADMIN_NAV.includes(p)) return;
    setPage(p);
  };
  const nav = session?.role === 'citizen' ? CITIZEN_NAV : session?.role === 'municipal' ? MUNICIPAL_NAV : ADMIN_NAV;
  const logout = () => { setSession(null); setProperty(undefined); setUndergroundAI(undefined); setPage('Dashboard'); };
  const openWorkspace = (targetPage?: string) => {
    const nextPage = session?.role === 'citizen'
      ? '2D Map'
      : targetPage ?? (session?.role === 'municipal' ? 'Municipal Data Intake' : 'Full 3D Map');
    setSession(prev => prev ? { ...prev, landing: false } : prev);
    setPage(nextPage);
  };

  if (!session) return <AuthPortal onLogin={(role, name, ulpin) => {
    const isAdmin = role === 'government';
    setSession({ role, name, ulpin, landing: !isAdmin });
    if (isAdmin) setPage('Dashboard');
  }} />;
  if (session.landing) return <RoleLanding role={session.role} name={session.name} ulpin={session.ulpin} citizenParcel={citizenParcel} onOpenWorkspace={openWorkspace} onLogout={logout} />;

  return <div className={`app-shell theme-${theme}`}>
    <header className={`topbar topbar-${session.role}`}>
      <div className="brand"><div className="brand-mark">3D</div><div><div className="brand-name">3D ULPIN</div><div className="brand-sub">Unified 3D Land & Property Intelligence Platform</div></div></div>
      <SpotlightNavbar activeLabel={page} items={nav.map(label => ({ label, onClick: () => go(label) }))} />
      <div className="top-actions"><div className="role-chip">{session.role === 'citizen' ? '👤 Citizen' : session.role === 'municipal' ? '🏛️ Nagar Palika' : '🛡️ Admin'}</div><button className="landing-btn" onClick={() => setSession(prev => prev ? { ...prev, landing: true } : prev)}>Home</button><div className="search"><span>⌕</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ULPIN / parcel / owner" /></div><button className="theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>☀ {theme === 'dark' ? 'Light' : 'Dark'}</button><button className="logout-btn" onClick={logout}>Sign out</button></div>
    </header>

    <aside className="sidebar">
      <div className="section-label">PLATFORM</div>
      <div className="sidebar-status"><span className="status-pulse" /> LIVE GIS WORKSPACE</div>
      <div className="sidebar-divider" />
      <div className="section-label">DATA PROVENANCE</div>
      <div className="provenance-legend"><div>● <span>Measured / Source</span></div><div>● <span>Derived</span></div><div>● <span>Inferred</span></div></div>
      <div className="provenance"><div className="section-label">DATA PROVENANCE</div><div>● <span>Measured / Source</span></div><div>● <span>Derived</span></div><div>● <span>Inferred</span></div><div className="provenance-note">Underground structures are always labeled inferred.</div></div>
    </aside>

    <main className="workspace">
      {page === 'Municipal Data Intake' && session.role === 'municipal' && <MunicipalDataIntake parcels={polygons} onSaved={async () => { const data = await getParcels(); setParcels(data); setSelected(data.find(p => p.type === 'Polygon')); return data; }} onSelect={highlightParcel} onGenerate={generate3D} />}
      {page === 'Add New Polygon' && <NewPolygonPage polygons={polygons} selected={selected} onGenerate={generate3D} onAddPolygon={createFromNewPolygon} onSelect={highlightParcel} onGo={go} message={customPolygonMessage} />}
      {page === 'Full 3D Map' && <Full3DTree parcels={polygons} selected={selected} onSelect={highlightParcel} onGenerate={generate3D} />}
      {page === '2D Map' && <MapPage {...{filtered, selected, satellite, setSatellite, selectParcel, clearSelection: () => { setSelected(undefined); setProperty(undefined); setUndergroundAI(undefined); }, fmt, polygonCount, buildingCount, conflictCount, generate3D, go, ulpinInput, setUlpInInput, selectByInput, inputMessage}} citizenOnly={session.role === 'citizen'} citizenParcel={citizenParcel} />}
      {page === '3D Property' && <PropertyPage {...{property, selected, generating, progress, step, exploded, setExploded, setPage: go, fmt, onFullTree: () => go('Full 3D Tree'), undergroundAI, undergroundAILoading, onRunUndergroundAI: runUndergroundAI}} />}
      {page === 'Full 3D Tree' && <Full3DTree parcels={polygons} selected={selected} onSelect={highlightParcel} onGenerate={generate3D} />}
      {page === 'Street View' && session.role === 'government' && <StreetViewPage selected={selected} />} 
      {page === 'Dashboard' && <DashboardPage {...{polygons, polygonCount, buildingCount, floorCount, conflictCount, avgHeight, apartmentCount, unitCount, inferredCount, selectParcel, fmt, go, ulpinInput, setUlpInInput, selectByInput, inputMessage, role: session.role}} />}
      {page === 'Parcels' && session.role === 'government' && <DataPage title="Parcels" eyebrow="PARCEL REGISTER" description="Browse and inspect the source parcel inventory." columns={['Parcel / ULPIN', 'Geometry', 'Height', 'Floors', 'Status']} rows={filtered.map(p => [p.name, p.type, fmt(p.building_height_m, ' m'), String(p.detected_floors ?? p.declared_floors ?? '—'), p.conflict ? 'Review required' : 'Verified'])} onRow={(i: number) => selectParcel(filtered[i])} />}
      {page === 'Buildings' && session.role === 'government' && <DataPage title="Buildings" eyebrow="3D BUILDING INVENTORY" description="Buildings reconstructed from supplied parcel, DEM and DSM records." columns={['Building', '2D ULPIN', 'Owner', 'Height', 'Floors', 'Elevation']} rows={polygons.filter(p => (p.building_height_m ?? 0) > 0).map(p => [p.name, p.ownership?.ulpin_2d ?? p.name, p.ownership?.owner_name ?? '—', fmt(p.building_height_m, ' m'), String(p.floor_plan_floor_count ?? p.detected_floors ?? p.declared_floors ?? '—'), `${fmt(p.elevation_dem_m)} / ${fmt(p.elevation_dsm_m)}`])} onRow={(i: number) => selectParcel(polygons.filter((p: ParcelRecord) => (p.building_height_m ?? 0) > 0)[i])} />}
      {page === 'Units / Floors' && session.role === 'government' && <UnitsFloorsPage polygons={polygons} selectParcel={selectParcel} />}
      {page === 'ULPIN Registry' && session.role === 'government' && <RegistryPage polygons={polygons} selectParcel={selectParcel} fmt={fmt} />}
      {page === 'Ownership' && session.role === 'government' && <OwnershipPage polygons={polygons} selectParcel={selectParcel} />}
      {page === 'Reports' && session.role === 'government' && <ReportsPage polygons={polygons} conflictCount={conflictCount} fmt={fmt} />}
      {page === 'Analytics' && session.role === 'government' && <AnalyticsPage polygons={polygons} buildingCount={buildingCount} floorCount={floorCount} avgHeight={avgHeight} conflictCount={conflictCount} />}
      {page === 'Property Report' && session.role === 'citizen' && <CitizenPropertyReport selected={selected} property={property} fmt={fmt} />}
      {page === 'Settings' && <SettingsPage backendOk={backendOk} satellite={satellite} setSatellite={setSatellite} theme={theme} setTheme={setTheme} />}
    </main>
  </div>;
}

function DashboardPage({ polygons, polygonCount, buildingCount, floorCount, conflictCount, avgHeight, apartmentCount, unitCount, inferredCount, selectParcel, fmt, go, ulpinInput, setUlpInInput, selectByInput, inputMessage, role }: any) {
  const tallest = [...polygons].sort((a,b) => (b.building_height_m ?? 0) - (a.building_height_m ?? 0)).slice(0, 6);
  return <div className="page-panel dashboard-page">
    <div className="eyebrow">ULPIN INTELLIGENCE</div><h1>Explore land as a 3D digital twin.</h1><p>Search a ULPIN, inspect its exact parcel geometry, and move from 2D cadastral data to buildings, floors and units in an interactive 3D workspace.</p>
    <section className="ulpin-create-card"><div><div className="card-title">2D ULPIN → 3D ULPIN</div><p>Enter a 2D ULPIN / parcel name from the loaded KML/CSV source, then create its exact polygon-based 3D property.</p></div><div className="ulpin-create-form"><input value={ulpinInput} onChange={(e:any)=>setUlpInInput(e.target.value)} onKeyDown={(e:any)=>{if(e.key==='Enter')selectByInput()}} placeholder="Enter 2D ULPIN / parcel name"/><AnimatedButton onClick={selectByInput}>Create 3D ULPIN <span>→</span></AnimatedButton></div>{inputMessage&&<small className="input-message">{inputMessage}</small>}</section>
    <div className="kpi-row six"><Kpi label="Total parcels" value={polygonCount}/><Kpi label="3D buildings" value={buildingCount}/><Kpi label="Total floors" value={floorCount}/><Kpi label="Floor-plan units" value={unitCount}/><Kpi label="Avg height" value={fmt(avgHeight,' m')}/><Kpi label="Conflicts" value={conflictCount}/></div>
    <div className="dashboard-grid">
      <section className="dash-card"><div className="card-title">Building height distribution</div><div className="bar-chart">{tallest.map(p => <div className="bar-item" key={p.name}><div className="bar-label"><b>{p.name}</b><span>{fmt(p.building_height_m,' m')}</span></div><div className="bar-track"><i style={{width:`${Math.min(100,((p.building_height_m ?? 0)/Math.max(1, tallest[0]?.building_height_m ?? 1))*100)}%`}}/></div></div>)}</div></section>
      <section className="dash-card"><div className="card-title">Validation status</div><div className="status-ring"><div><b>{polygonCount ? Math.round(((polygonCount-conflictCount)/polygonCount)*100) : 0}%</b><span>verified parcels</span></div></div><div className="status-list"><span><i className="dot good-dot"/> Verified <b>{polygonCount-conflictCount}</b></span><span><i className="dot warn-dot"/> Review required <b>{conflictCount}</b></span><span><i className="dot inferred-dot"/> Inferred records <b>{inferredCount}</b></span></div></section>
    </div>
    <section className="dash-card recent"><div className="card-title">Source records</div>{polygons.slice(0,8).map((p: ParcelRecord) => <button key={p.name} onClick={() => selectParcel(p)}><b>{p.name}</b><span>{p.type}</span><span>{fmt(p.building_height_m,' m')}</span><span>{p.detected_floors ?? p.declared_floors ?? '—'} floors</span><em className={p.conflict ? 'warn' : 'good'}>{p.conflict ? 'Review' : 'Verified'}</em></button>)}</section>
    <div className="dashboard-actions">{role === 'municipal' ? <button onClick={() => go('Municipal Data Intake')}>Add / update property data →</button> : <button onClick={() => go('Add New Polygon')}>Add new polygon →</button>}<button onClick={() => go('2D Map')}>Open 2D cadastral map →</button><button onClick={() => go('3D Property')}>Open 3D property viewer →</button></div>
  </div>;
}

function CitizenPropertyReport({selected, property, fmt}: any) {
  const p = property ?? selected;
  const download = () => {
    const report = [
      '3D ULPIN — Citizen Property Report',
      `Generated: ${new Date().toLocaleString()}`,
      '',
      `2D ULPIN: ${p?.ownership?.ulpin_2d ?? p?.name ?? '—'}`,
      `Property: ${p?.name ?? '—'}`,
      `Building type: ${p?.building_type ?? '—'}`,
      `Owner: ${p?.ownership?.owner_name ?? '—'}`,
      `Land owner: ${p?.ownership?.land_owner ?? '—'}`,
      `Floors: ${p?.floor_plan_floor_count ?? p?.detected_floors ?? p?.declared_floors ?? '—'}`,
      `Height: ${p?.building_height_m != null ? fmt(p.building_height_m, ' m') : '—'}`,
      `DEM: ${p?.elevation_dem_m != null ? fmt(p.elevation_dem_m, ' m') : '—'}`,
      `DSM: ${p?.elevation_dsm_m != null ? fmt(p.elevation_dsm_m, ' m') : '—'}`,
      `nDSM: ${p?.ndsm_m != null ? fmt(p.ndsm_m, ' m') : '—'}`,
      `Validation: ${p?.conflict ? 'REVIEW REQUIRED' : 'VERIFIED'}`,
      'Underground note: Underground structures are inferred unless directly supported by source records.'
    ].join('\n');
    const blob = new Blob([report], {type:'text/plain;charset=utf-8'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href=url; a.download=`ULPIN_Property_Report_${p?.ownership?.ulpin_2d ?? p?.name ?? 'property'}.txt`; a.click(); URL.revokeObjectURL(url);
  };
  return <div className="page-panel citizen-report-page">
    <div className="eyebrow">CITIZEN PROPERTY SERVICES</div><h1>Property Report</h1>
    <p>Your property summary and the available ULPIN digital-twin information.</p>
    <section className="report-hero-card">
      <div><span>2D ULPIN</span><b>{p?.ownership?.ulpin_2d ?? p?.name ?? 'No property selected'}</b><small>{p?.name ?? 'Select your property from the 2D map.'}</small></div>
      <AnimatedButton onClick={download}>Download Building Report ↓</AnimatedButton>
    </section>
    <div className="kpi-row four">
      <Kpi label="Building type" value={p?.building_type ?? '—'} />
      <Kpi label="Floors" value={p?.floor_plan_floor_count ?? p?.detected_floors ?? p?.declared_floors ?? '—'} />
      <Kpi label="Height" value={p?.building_height_m != null ? fmt(p.building_height_m, ' m') : '—'} />
      <Kpi label="Status" value={p?.conflict ? 'Review required' : 'Verified'} />
    </div>
    <section className="dash-card"><div className="card-title">Property details</div><div className="detail-list">
      <div><span>Owner</span><b>{p?.ownership?.owner_name ?? '—'}</b></div>
      <div><span>Land owner</span><b>{p?.ownership?.land_owner ?? '—'}</b></div>
      <div><span>DEM / DSM</span><b>{p?.elevation_dem_m != null ? fmt(p.elevation_dem_m,' m') : '—'} / {p?.elevation_dsm_m != null ? fmt(p.elevation_dsm_m,' m') : '—'}</b></div>
      <div><span>nDSM</span><b>{p?.ndsm_m != null ? fmt(p.ndsm_m,' m') : '—'}</b></div>
    </div></section>
    <div className="report-note">This citizen report contains the currently available source and derived property information. Underground structures are labeled inferred unless directly supported by source data.</div>
  </div>;
}

function Kpi({label,value}: {label:string; value:any}) { return <div><span>{label}</span><b>{value}</b></div>; }

function DataPage({title, eyebrow, description, columns, rows, onRow}: any) {
  return <div className="page-panel"><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p><div className="data-card"><div className="data-head">{columns.map((c:string)=><span key={c}>{c}</span>)}</div>{rows.length ? rows.map((r:any[],i:number)=><button className="data-row" key={i} onClick={()=>onRow?.(i)}>{r.map((v:any,j:number)=><span key={j} className={j===r.length-1 && /review|required/i.test(String(v)) ? 'warn' : ''}>{v}</span>)}</button>) : <div className="empty-row">No matching records.</div>}</div></div>;
}

function UnitsFloorsPage({polygons, selectParcel}: any) {
  return <div className="page-panel"><div className="eyebrow">VERTICAL CADASTRE</div><h1>Units / Floors</h1><p>Floor and unit inventory now comes from the supplied floor-plan CSV where available. Spatial unit boxes in 3D remain inferred because the CSV contains inventory, not unit polygons.</p><div className="floor-grid">{polygons.filter((p:any)=>(p.detected_floors ?? p.declared_floors ?? p.floor_plan_floor_count ?? 0)>0).map((p:any)=><button key={p.name} className="floor-card" onClick={()=>selectParcel(p)}><div><b>{p.name}</b><span>{p.floor_plan_units?.length ?? 0} units · {p.building_height_m != null ? `${p.building_height_m.toFixed(2)} m` : 'Height —'}</span></div><div className="floor-stack">{Array.from({length: Math.min(8, Number(p.floor_plan_floor_count ?? p.detected_floors ?? p.declared_floors ?? 0))}).map((_,i)=><i key={i}>F{i+1}</i>)}</div><small>{p.floor_plan_units?.length ? `${p.floor_plan_units.length} source units · click to inspect` : 'No unit plan supplied'}</small></button>)}</div></div>;
}

function RegistryPage({polygons, selectParcel, fmt}: any) {
  return <div className="page-panel"><div className="eyebrow">IDENTITY & HIERARCHY</div><h1>ULPIN Registry</h1><p>Trace each 2D parcel into its derived 3D property identifier.</p><div className="registry-grid">{polygons.map((p:any)=><button key={p.name} onClick={()=>selectParcel(p)}><div className="registry-id">2D ULPIN · {p.ownership?.ulpin_2d ?? p.name}</div><strong>{p.name}</strong><div className="hierarchy"><span>STATE</span><span>DISTRICT</span><span>PARCEL</span><span>BUILDING</span></div><div className="registry-meta"><span>{fmt(p.building_height_m,' m')}</span><span>{p.detected_floors ?? p.declared_floors ?? '—'} floors</span><em className={p.conflict?'warn':'good'}>{p.conflict?'REVIEW':'VERIFIED'}</em></div></button>)}</div></div>;
}

function OwnershipPage({polygons, selectParcel}: any) {
  const owned = polygons.filter((p:any) => p.ownership);
  return <div className="page-panel"><div className="eyebrow">OWNERSHIP REGISTER</div><h1>Ownership</h1><p>Ownership and land-owner relationships from the supplied 2D ownership CSV, linked to parcel feature names.</p><div className="data-card"><div className="data-head"><span>2D ULPIN</span><span>Feature</span><span>Category</span><span>Owner</span><span>Land owner</span></div>{owned.map((p:any)=><button className="data-row" key={p.name} onClick={()=>selectParcel(p)}><span>{p.ownership.ulpin_2d}</span><span>{p.name}</span><span>{p.ownership.category}</span><span>{p.ownership.owner_name}</span><span>{p.ownership.land_owner ?? '—'}</span></button>)}</div></div>;
}

function ReportsPage({polygons, conflictCount, fmt}: any) {
  const source = polygons.filter((p:any)=>p.elevation_dem_m!=null && p.elevation_dsm_m!=null).length;
  return <div className="page-panel"><div className="eyebrow">AUDIT & VALIDATION</div><h1>Reports</h1><p>Evidence-oriented summaries for cadastral review and 3D reconstruction.</p><div className="report-grid"><section className="report-card"><span>Elevation coverage</span><b>{polygons.length ? Math.round(source/polygons.length*100) : 0}%</b><p>{source} of {polygons.length} parcels have DEM + DSM values.</p></section><section className="report-card"><span>Conflict review queue</span><b className={conflictCount?'warn':''}>{conflictCount}</b><p>Records requiring human cadastral review.</p></section><section className="report-card"><span>nDSM consistency</span><b>{polygons.filter((p:any)=>p.ndsm_m!=null).length}</b><p>Parcels with derived surface-minus-ground elevation.</p></section></div><div className="report-table">{polygons.map((p:any)=><div key={p.name}><b>{p.name}</b><span>DEM {fmt(p.elevation_dem_m)}</span><span>DSM {fmt(p.elevation_dsm_m)}</span><span>nDSM {fmt(p.ndsm_m)}</span><em className={p.conflict?'warn':'good'}>{p.conflict?'REVIEW REQUIRED':'VERIFIED'}</em></div>)}</div></div>;
}

function AnalyticsPage({polygons, buildingCount, floorCount, avgHeight, conflictCount}: any) {
  const bins = [0,5,10,15,20].map((min,i)=>({label:i===4?'20+':`${min}-${min+5}`,count:polygons.filter((p:any)=>{const h=p.building_height_m??0; return i===4?h>=20:h>=min&&h<min+5}).length}));
  return <div className="page-panel"><div className="eyebrow">DATA ANALYTICS</div><h1>Analytics</h1><p>Derived metrics from the current source dataset.</p><div className="analytics-kpis"><Kpi label="Buildings" value={buildingCount}/><Kpi label="Floors" value={floorCount}/><Kpi label="Average height" value={`${avgHeight.toFixed(2)} m`}/><Kpi label="Conflicts" value={conflictCount}/></div><div className="analytics-grid"><section className="dash-card"><div className="card-title">Height bands</div>{bins.map(b=><div className="analytic-bar" key={b.label}><span>{b.label} m</span><i style={{width:`${polygons.length?Math.max(3,b.count/polygons.length*100):3}%`}}/><b>{b.count}</b></div>)}</section><section className="dash-card"><div className="card-title">Dataset composition</div><div className="composition"><div><b>{polygons.length}</b><span>Polygon parcels</span></div><div><b>{polygons.filter((p:any)=>p.ndsm_m!=null).length}</b><span>nDSM available</span></div><div><b>{polygons.filter((p:any)=>p.detected_floors!=null).length}</b><span>Detected floors</span></div></div></section></div></div>;
}

function SettingsPage({backendOk, satellite, setSatellite, theme, setTheme}: any) {
  return <div className="page-panel"><div className="eyebrow">SYSTEM CONFIGURATION</div><h1>Settings</h1><p>Configure map defaults, application appearance and data services.</p><div className="settings-card"><SettingRow title="Theme" value={theme === 'dark' ? 'Dark' : 'Light'} toggle={()=>setTheme(theme === 'dark' ? 'light' : 'dark')}/><SettingRow title="Satellite basemap" value={satellite?'Enabled':'Disabled'} toggle={()=>setSatellite(!satellite)}/><SettingRow title="Source geometry" value="KML + CSV parcels"/><SettingRow title="Elevation pipeline" value="DEM + DSM → nDSM"/><SettingRow title="Underground" value="Inferred only"/></div></div>;
}
function SettingRow({title,value,status,toggle}:any){return <div className="setting-row"><div><b>{title}</b><span>{value}</span></div>{toggle?<button onClick={toggle}>{value==='Enabled'?'ON':'OFF'}</button>:<em className={status||''}>{status==='good'?'CONNECTED':status==='warn'?'OFFLINE':'CONFIGURED'}</em>}</div>}

function StreetViewPage({selected}: {selected?: ParcelRecord}) {
  const lat = selected?.latitude;
  const lon = selected?.longitude;
  const url = lat != null && lon != null
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}`
    : 'https://www.google.com/maps';
  return <div className="street-view-page">
    <div className="street-view-hero">
      <div><div className="eyebrow">ADMIN · STREET VIEW</div><h1>Inspect the property from street level.</h1><p>Open the selected parcel location in Google Street View. Street-level imagery is an external reference and is not part of the cadastral source dataset.</p></div>
      <div className="street-view-card"><span>SELECTED PARCEL</span><b>{selected?.name ?? 'Select a parcel from 2D Map'}</b><small>{lat != null && lon != null ? `${lat.toFixed(6)}, ${lon.toFixed(6)}` : 'No coordinates selected'}</small><a href={url} target="_blank" rel="noreferrer">Open Street View ↗</a></div>
    </div>
  </div>;
}

function MapPage({filtered, selected, satellite, setSatellite, selectParcel, clearSelection, fmt, polygonCount, buildingCount, conflictCount, generate3D, go, ulpinInput, setUlpInInput, selectByInput, inputMessage, citizenOnly, citizenParcel}: any) {
  const visibleParcels = filtered;
  const canSelect = (p: ParcelRecord) => !citizenOnly || !citizenParcel || p.name === citizenParcel.name;
  return <div className={`map-page ${citizenOnly ? 'citizen-map' : ''}`}><div className="map-toolbar"><div className="mode-switch"><button className={!satellite?'selected':''} onClick={()=>setSatellite(false)}>Map</button><button className={satellite?'selected':''} onClick={()=>setSatellite(true)}>Satellite</button></div><div className="map-stats"><span>{polygonCount} parcels</span><span>{buildingCount} buildings</span><span>{conflictCount} conflicts</span></div></div>{citizenOnly && <div className="citizen-map-access"><span>🔒</span><div><b>Citizen access</b><small>{citizenParcel?.ownership?.ulpin_2d ?? citizenParcel?.name ?? 'Your registered property'}</small></div></div>}<div className="map-stage"><ParcelMap parcels={visibleParcels} selected={selected} onSelect={selectParcel} satellite={satellite} canSelect={canSelect}/><div className="map-overlay-title"><div className="eyebrow">2D CADASTRAL VIEW</div><h1>{citizenOnly ? 'Your registered property' : 'Actual parcel geometry'}</h1><p>{citizenOnly ? 'Other parcels remain visible for geographic context, but only your registered property can be selected.' : 'Click a ULPIN parcel to inspect its location and generate a focused 3D property.'}</p></div><div className="map-legend"><span><i className="source"/> Source KML</span><span><i className="derived"/> DEM / DSM derived</span></div></div>{!citizenOnly && <div className="map-ulpin-input"><div className="panel-kicker">2D ULPIN INPUT</div><div className="map-input-row"><input value={ulpinInput} onChange={(e:any)=>setUlpInInput(e.target.value)} onKeyDown={(e:any)=>{if(e.key==='Enter')selectByInput()}} placeholder="Enter 2D ULPIN"/><AnimatedButton onClick={selectByInput}>Create 3D</AnimatedButton></div>{inputMessage&&<small>{inputMessage}</small>}</div>}{selected&&<aside className="inspector"><div className="inspector-head"><div><div className="eyebrow">SELECTED 2D ULPIN</div><h2>{selected.name}</h2></div><button className="close" onClick={clearSelection} aria-label="Close property details">×</button></div><div className="source-chip">SOURCE KML + CSV</div><div className="metric-grid"><div><span>Building height</span><b>{fmt(selected.building_height_m,' m')}</b></div><div><span>DEM</span><b>{fmt(selected.elevation_dem_m,' m')}</b></div><div><span>DSM</span><b>{fmt(selected.elevation_dsm_m,' m')}</b></div><div><span>nDSM</span><b>{fmt(selected.ndsm_m,' m')}</b></div></div><div className="detail-list"><div><span>2D ULPIN</span><b>{selected.ownership?.ulpin_2d ?? selected.name}</b></div><div><span>Owner</span><b>{selected.ownership?.owner_name ?? '—'}</b></div><div><span>Unit records</span><b>{selected.unit_count ?? selected.floor_plan_units?.length ?? 0}</b></div><div><span>Declared floors</span><b>{selected.declared_floors ?? 'Source dependent'}</b></div><div><span>Reconstructed floors</span><b>{selected.floor_plan_floor_count ?? selected.detected_floors ?? '—'}</b></div><div><span>Latitude</span><b>{fmt(selected.latitude)}</b></div><div><span>Longitude</span><b>{fmt(selected.longitude)}</b></div><div><span>Status</span><b className={selected.conflict?'warn':'good'}>{selected.conflict?'REVIEW REQUIRED':'VERIFIED'}</b></div></div>{selected.conflict&&<div className="alert">⚠ Potential cadastral conflict: source floor metadata and reconstructed DSM signal differ.</div>}<AnimatedButton className="generate-btn" onClick={() => generate3D(selected)}>Generate 3D ULPIN <span>→</span></AnimatedButton><AnimatedButton className="secondary-action" onClick={()=>go('3D Property')}>View in 3D <span>↗</span></AnimatedButton><div className="hint">Only the selected parcel footprint is sent into the 3D generation workflow.</div></aside>}</div>;
}

function PropertyPage({property, selected, generating, progress, step, exploded, setExploded, setPage, fmt, onFullTree, undergroundAI, undergroundAILoading, onRunUndergroundAI}: any) {
  return <div className="property-view"><div className="property-toolbar"><button onClick={()=>setPage('2D Map')}>← Back to 2D map</button><div className="crumb">2D ULPIN <b>{selected?.name??'—'}</b> → <b>3D Property</b></div><div className="property-toolbar-actions"><button onClick={()=>onFullTree()}>Full 3D Tree</button><button onClick={()=>setExploded(!exploded)}>{exploded?'Collapse floors':'Exploded view'}</button></div></div><div className="three-stage">{property?<Property3D property={property} exploded={exploded} scanning={generating} generationDone={!generating}/>:<div className="empty-3d"><div className="spinner"/><h2>{generating?'Generating selected property':'No 3D property yet'}</h2><p>{step}</p></div>}<div className="three-title"><div className="eyebrow">3D PROPERTY DIGITAL TWIN</div><h1>{property?.parent_2d_ulpin??selected?.name}</h1><p>{property?'Exact selected footprint · DEM/DSM elevation stack · property only':'Select a parcel from the 2D map and generate its 3D property.'}</p></div>{generating&&<div className="generation-card"><div className="eyebrow">RECONSTRUCTION PIPELINE</div><div className="progress-line"><span style={{width:`${progress}%`}}/></div><div className="progress-row"><b>{progress}%</b><span>{step}</span></div></div>}{property&&<div className="underground-ai-card"><div className="underground-ai-head"><div><div className="eyebrow">AI SUBSURFACE INTELLIGENCE</div><h3>Underground screening</h3></div><span className="ai-badge">ML</span></div>{undergroundAI?<><div className="ai-score-row"><div><span>ML anomaly score</span><b>{undergroundAI.ml_anomaly_score}%</b></div><div><span>Screening score</span><b>{undergroundAI.screening_score}%</b></div></div><div className="ai-evidence"><strong>{undergroundAI.explicit_underground_record?'SOURCE-SUPPORTED':'INFERRED'}</strong><p>{undergroundAI.evidence}</p></div><div className="ai-limit">{undergroundAI.status} · Depth: {undergroundAI.estimated_depth_m == null ? 'not estimated from current data' : `${undergroundAI.estimated_depth_m} m`}</div></>:<><p className="ai-copy">Use the Isolation Forest model to screen this parcel for unusual subsurface-related geometry/elevation patterns. It does not directly measure underground structures.</p><button className="ai-run-btn" onClick={onRunUndergroundAI} disabled={undergroundAILoading}>{undergroundAILoading?'Running model…':'Run Underground AI →'}</button></>}</div>}</div>{property&&<div className="property-inspector"><div><span>3D ULPIN</span><b>{property.ulpin_3d}</b></div><div><span>Parent 2D ULPIN</span><b>{property.parent_2d_ulpin}</b></div><div><span>Owner</span><b>{property.ownership?.owner_name ?? '—'}</b></div><div><span>Units</span><b>{property.units?.length ?? 0}</b></div><div><span>Height</span><b>{fmt(property.height_m,' m')}</b></div><div><span>nDSM</span><b>{fmt(property.ndsm_m,' m')}</b></div><div><span>Floors</span><b>{property.floors.filter((f:any)=>!f.is_underground).length}</b></div><div><span>Underground</span><b className="purple">INFERRED</b></div><div><span>Validation</span><b className={property.status==='VERIFIED'?'good':'warn'}>{property.status}</b></div></div>}</div>;
}
