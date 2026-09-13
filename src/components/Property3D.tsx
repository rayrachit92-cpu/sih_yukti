import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratedFloor, GeneratedProperty, GeneratedPropertyUnit, LatLng } from '../types/ulpin';

const FLOOR_COLORS = ['#38bdf8', '#22d3ee', '#2dd4bf', '#a3e635', '#facc15', '#fb923c', '#f472b6'];

function localize(points: LatLng[], origin: LatLng) {
  const k = 111320;
  const cos = Math.cos(origin.lat * Math.PI / 180);
  return points.map(p => ({
    x: (p.lon - origin.lon) * k * cos,
    z: -(p.lat - origin.lat) * k,
  }));
}

function cleanPolygon(points: LatLng[]) {
  if (points.length < 3) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (Math.abs(first.lat - last.lat) < 1e-10 && Math.abs(first.lon - last.lon) < 1e-10) return points.slice(0, -1);
  return points;
}

function polygonArea(points: { x: number; z: number }[]) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area / 2;
}

function pointInPolygon(x: number, z: number, points: { x: number; z: number }[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x, zi = points[i].z;
    const xj = points[j].x, zj = points[j].z;
    const intersect = ((zi > z) !== (zj > z)) && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}


function unitDisplayType(unit: GeneratedPropertyUnit) {
  if (unit.unit_type === 'single_room') return 'Single Room';
  if (unit.unit_type === 'big_shop_multi_floor') return 'Big Shop · Multi-floor';
  if (unit.unit_type === 'shop') return 'Shop';
  if (unit.unit_type === 'flat') return `Flat${unit.bhk ? ` · ${unit.bhk}` : ''}`;
  return unit.unit_type.replace(/_/g, ' ');
}

function FootprintOutline({ xy, y, color = '#facc15', opacity = 1, lineWidth = 2 }: { xy: { x: number; z: number }[]; y: number; color?: string; opacity?: number; lineWidth?: number }) {
  const pts = xy.map(p => [p.x, y, p.z] as [number, number, number]);
  pts.push(pts[0]);
  return <Line points={pts} color={color} lineWidth={lineWidth} transparent opacity={opacity} />;
}

function ParcelGround({ xy }: { xy: { x: number; z: number }[] }) {
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    xy.forEach((p, i) => i === 0 ? s.moveTo(p.x, -p.z) : s.lineTo(p.x, -p.z));
    s.closePath();
    return s;
  }, [xy]);
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]}>
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#163044" transparent opacity={0.58} roughness={0.92} metalness={0.08} side={THREE.DoubleSide} />
    </mesh>
    <FootprintOutline xy={xy} y={0.03} color="#facc15" lineWidth={3} />
  </group>;
}

function roomColor(unit: GeneratedPropertyUnit, index: number) {
  // Strictly dark architectural palette so room volumes remain visible against
  // the translucent building shell without turning into bright neon blocks.
  const type = String(unit.unit_type || '').toLowerCase();
  if (type.includes('shop')) return ['#24170f', '#2b1b11', '#312014', '#1d120d'][index % 4];
  if (type.includes('flat')) return ['#0d202b', '#10252f', '#122b2b', '#152238'][index % 4];
  if (type.includes('single_room')) return ['#172615', '#1a2b17', '#20311b'][index % 3];
  return ['#21182c', '#261b2b', '#172131', '#172b25'][index % 4];
}

function rectCorners(x: number, z: number, w: number, d: number) {
  return [
    { x: x - w / 2, z: z - d / 2 },
    { x: x + w / 2, z: z - d / 2 },
    { x: x + w / 2, z: z + d / 2 },
    { x: x - w / 2, z: z + d / 2 },
  ];
}

function findInteriorRoomCells(xy: { x: number; z: number }[], count: number) {
  if (!xy.length || count < 1) return [] as { x: number; z: number; w: number; d: number }[];
  const xs = xy.map(p => p.x), zs = xy.map(p => p.z);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const spanX = Math.max(maxX - minX, 4), spanZ = Math.max(maxZ - minZ, 4);
  const candidates: { x: number; z: number; w: number; d: number; area: number }[] = [];
  const cols = Math.max(5, Math.ceil(Math.sqrt(count) * 3));
  const rows = Math.max(5, Math.ceil(count * 1.5));
  const cellW = spanX / cols;
  const cellD = spanZ / rows;

  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const x = minX + (c + 0.5) * cellW;
    const z = minZ + (r + 0.5) * cellD;
    let w = cellW * 0.88;
    let d = cellD * 0.88;
    // Shrink until every corner is inside the exact parcel polygon.
    for (let k = 0; k < 8 && !rectCorners(x, z, w, d).every(q => pointInPolygon(q.x, q.z, xy)); k++) {
      w *= 0.78;
      d *= 0.78;
    }
    const cornersInside = rectCorners(x, z, w, d).every(q => pointInPolygon(q.x, q.z, xy));
    if (cornersInside) candidates.push({ x, z, w, d, area: w * d });
  }

  // Prefer large cells while enforcing separation so units do not overlap.
  candidates.sort((a, b) => b.area - a.area);
  const chosen: { x: number; z: number; w: number; d: number }[] = [];
  for (const c of candidates) {
    const overlaps = chosen.some(o => Math.abs(o.x - c.x) < (o.w + c.w) * 0.43 && Math.abs(o.z - c.z) < (o.d + c.d) * 0.43);
    if (!overlaps) chosen.push(c);
    if (chosen.length === count) break;
  }

  // If an irregular footprint leaves too few full cells, create tiny interior cells
  // at safe candidate centers rather than allowing geometry to cross the parcel edge.
  if (chosen.length < count) {
    const safe = candidates.length ? candidates : [{ x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: cellW * 0.3, d: cellD * 0.3, area: 1 }];
    let i = 0;
    while (chosen.length < count && i < 200) {
      const c = safe[i % safe.length];
      const w = Math.max(0.45, Math.min(c.w * 0.55, cellW * 0.55));
      const d = Math.max(0.45, Math.min(c.d * 0.55, cellD * 0.55));
      if (rectCorners(c.x, c.z, w, d).every(q => pointInPolygon(q.x, q.z, xy))) {
        chosen.push({ x: c.x, z: c.z, w, d });
      }
      i++;
    }
  }
  return chosen.slice(0, count);
}

function UnitBoxes({ xy, floor, height, visible, units, selectedUnitId, onSelectUnit }: { xy: { x: number; z: number }[]; floor: GeneratedFloor; height: number; visible: boolean; units: GeneratedPropertyUnit[]; selectedUnitId?: string; onSelectUnit: (unit: GeneratedPropertyUnit) => void }) {
  const boxes = useMemo(() => {
    if (!visible || xy.length < 3) return [] as { x: number; z: number; w: number; d: number; unit: GeneratedPropertyUnit; index: number }[];
    const floorUnits = units.filter(u => Number(u.floor_number) === Number(floor.floor_number));
    if (!floorUnits.length) return [];
    const cells = findInteriorRoomCells(xy, floorUnits.length);
    return floorUnits.map((unit, i) => {
      const c = cells[i] ?? cells[cells.length - 1];
      return {
        x: c?.x ?? 0,
        z: c?.z ?? 0,
        w: c?.w ?? 1,
        d: c?.d ?? 1,
        unit,
        index: i,
      };
    });
  }, [xy, floor, visible, units]);

  // Unit geometry stays INSIDE the selected floor slab. It is a shallow room plate,
  // not a second building volume; the CSV does not provide architectural room polygons.
  const floorThickness = Math.max(height, 0.18);
  // Keep the inferred room geometry strictly inside the floor volume.  The
  // room plate sits just below the floor top and the boundary walls never rise
  // above the selected floor's top surface.
  const slabThickness = Math.min(Math.max(floorThickness * 0.055, 0.08), Math.max(0.08, floorThickness * 0.10));
  const wallHeight = Math.min(Math.max(floorThickness * 0.045, 0.07), 0.16);
  const baseY = floor.top_m - slabThickness - wallHeight - 0.015;
  const wallTopY = floor.top_m - 0.012;

  return <group>
    {boxes.map((b) => {
      const selected = b.unit.unit_id === selectedUnitId;
      const color = roomColor(b.unit, b.index);
      const wallY = baseY + slabThickness + wallHeight / 2;
      return <group key={b.unit.unit_id}>
        <mesh
          position={[b.x, baseY + slabThickness / 2, b.z]}
          onClick={(e) => { e.stopPropagation(); onSelectUnit(b.unit); }}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[b.w, slabThickness, b.d]} />
          <meshStandardMaterial
            color={selected ? '#17382f' : color}
            transparent
            opacity={selected ? 0.96 : 0.92}
            roughness={0.78}
            metalness={0.02}
            emissive={selected ? '#0b5a45' : '#02070c'}
            emissiveIntensity={selected ? 0.18 : 0.02}
          />
        </mesh>

        {/* Low dark room boundaries, capped below the floor top so nothing protrudes. */}
        {[
          [b.x, wallY, b.z - b.d / 2, b.w, wallHeight, 0.08],
          [b.x, wallY, b.z + b.d / 2, b.w, wallHeight, 0.08],
          [b.x - b.w / 2, wallY, b.z, 0.08, wallHeight, b.d],
          [b.x + b.w / 2, wallY, b.z, 0.08, wallHeight, b.d],
        ].map((w, wi) => <mesh
          key={wi}
          position={[w[0] as number, Math.min(w[1] as number, wallTopY), w[2] as number]}
          onClick={(e) => { e.stopPropagation(); onSelectUnit(b.unit); }}
        >
          <boxGeometry args={[w[3] as number, w[4] as number, w[5] as number]} />
          <meshStandardMaterial
            color={selected ? '#174f40' : '#050b11'}
            transparent
            opacity={selected ? 1 : 0.98}
            roughness={0.72}
            metalness={0.04}
            emissive={selected ? '#0a3f32' : '#010307'}
            emissiveIntensity={selected ? 0.12 : 0.01}
          />
        </mesh>)}
      </group>;
    })}
  </group>;
}
function FloorVolume({
  floor,
  index,
  xy,
  selected,
  isolated,
  exploded,
  onSelect,
  showUnits,
  units,
  selectedUnitId,
  onSelectUnit,
}: {
  floor: GeneratedFloor;
  index: number;
  xy: { x: number; z: number }[];
  selected: boolean;
  isolated: boolean;
  exploded: boolean;
  onSelect: () => void;
  showUnits: boolean;
  units: GeneratedPropertyUnit[];
  selectedUnitId?: string;
  onSelectUnit: (unit: GeneratedPropertyUnit) => void;
}) {
  const height = Math.max(0.18, floor.top_m - floor.bottom_m);
  const gap = exploded ? 1.6 : 0;
  const y = floor.is_underground ? -gap * (index + 1) : gap * index;
  const color = floor.is_underground ? '#241c3d' : (showUnits && selected ? '#071018' : FLOOR_COLORS[index % FLOOR_COLORS.length]);
  const opacity = isolated
    ? (selected ? (showUnits ? 0.16 : 0.94) : 0.035)
    : (selected ? (showUnits ? 0.22 : 0.86) : 0.42);
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    xy.forEach((p, i) => i === 0 ? s.moveTo(p.x, -p.z) : s.lineTo(p.x, -p.z));
    s.closePath();
    return s;
  }, [xy]);
  const materialRef = useRef<THREE.MeshStandardMaterial>(null);
  useEffect(() => {
    if (materialRef.current) materialRef.current.opacity = opacity;
  }, [opacity]);

  return <group position={[0, y, 0]}>
    <mesh
      position={[0, floor.bottom_m + height / 2, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      castShadow
      receiveShadow
    >
      <extrudeGeometry args={[shape, { depth: height, bevelEnabled: false, steps: 1 }]} />
      <meshStandardMaterial ref={materialRef} color={color} transparent opacity={opacity} roughness={0.46} metalness={0.18} side={THREE.DoubleSide} />
    </mesh>

    <mesh
      position={[0, floor.top_m + 0.018, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
    >
      <shapeGeometry args={[shape]} />
      <meshBasicMaterial color={selected ? '#f8fafc' : color} transparent opacity={selected ? 0.18 : 0.035} side={THREE.DoubleSide} />
    </mesh>

    <FootprintOutline xy={xy} y={floor.top_m + 0.008} color={selected ? (showUnits ? '#7dd3fc' : '#ffffff') : '#243442'} opacity={selected ? 0.9 : 0.3} lineWidth={selected ? 2.2 : 1.0} />
    {showUnits && selected && <mesh
      position={[0, floor.top_m - 0.03, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <shapeGeometry args={[shape]} />
      <meshStandardMaterial color="#03080d" transparent opacity={0.72} roughness={0.92} metalness={0.02} side={THREE.DoubleSide} />
    </mesh>}
    <UnitBoxes xy={xy} floor={floor} height={height} visible={showUnits && selected} units={units} selectedUnitId={selectedUnitId} onSelectUnit={onSelectUnit} />

    {selected && <Html position={[0, floor.top_m + 0.7, 0]} center distanceFactor={34}>
      <div className="floor-tag">{floor.label.toUpperCase()} · {floor.top_m.toFixed(2)} M</div>
    </Html>}
  </group>;
}

function BuildingModel({ property, selectedFloorId, setSelectedFloorId, exploded, scanning, isolate, showUnits, selectedUnitId, onSelectUnit }: {
  property: GeneratedProperty;
  selectedFloorId: string;
  setSelectedFloorId: (id: string) => void;
  exploded: boolean;
  scanning: boolean;
  isolate: boolean;
  showUnits: boolean;
  selectedUnitId?: string;
  onSelectUnit: (unit: GeneratedPropertyUnit) => void;
}) {
  const raw = cleanPolygon(property.coordinates);
  const origin = raw[0];
  const xy = useMemo(() => localize(raw, origin), [raw, origin]);
  const scanRef = useRef<THREE.Mesh>(null);
  const height = Math.max(property.height_m || 3, 3);
  const maxSpan = Math.max(
    Math.max(...xy.map(p => Math.abs(p.x)), 8),
    Math.max(...xy.map(p => Math.abs(p.z)), 8),
  );
  const center = useMemo(() => {
    const box = new THREE.Box3();
    xy.forEach(p => box.expandByPoint(new THREE.Vector3(p.x, 0, p.z)));
    const c = new THREE.Vector3();
    box.getCenter(c);
    return c;
  }, [xy]);

  useFrame((_, delta) => {
    if (scanRef.current && scanning) {
      scanRef.current.position.y += delta * Math.max(4, height * 0.6);
      if (scanRef.current.position.y > height + 2) scanRef.current.position.y = -1;
    }
  });

  return <group position={[-center.x, 0, -center.z]}>
    <ParcelGround xy={xy} />
    {property.floors.map((floor, index) => <FloorVolume
      key={floor.id}
      floor={floor}
      index={index}
      xy={xy}
      selected={floor.id === selectedFloorId}
      isolated={isolate}
      exploded={exploded}
      onSelect={() => setSelectedFloorId(floor.id)}
      showUnits={showUnits}
      units={property.units ?? []}
      selectedUnitId={selectedUnitId}
      onSelectUnit={onSelectUnit}
    />)}

    {/* subtle architectural vertical accents */}
    {!isolate && <Line points={[
      [-maxSpan * 0.42, 0.08, -maxSpan * 0.32],
      [-maxSpan * 0.42, height, -maxSpan * 0.32],
    ]} color="#7dd3fc" transparent opacity={0.22} lineWidth={1} />}

    {scanning && <mesh ref={scanRef} position={[0, -1, 0]}>
      <boxGeometry args={[maxSpan * 2.2, 0.08, maxSpan * 2.2]} />
      <meshBasicMaterial color="#67e8f9" transparent opacity={0.2} />
    </mesh>}

    <mesh position={[0, -0.14, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[maxSpan * 0.52, maxSpan * 0.55, 64]} />
      <meshBasicMaterial color="#facc15" transparent opacity={0.18} side={THREE.DoubleSide} />
    </mesh>
  </group>;
}

function FocusCamera({ property, generationDone, selectedFloorId }: { property: GeneratedProperty; generationDone: boolean; selectedFloorId: string }) {
  const { camera } = useThree();
  const controls = useRef<any>(null);
  useEffect(() => {
    const pts = cleanPolygon(property.coordinates);
    const origin = pts[0];
    const xy = localize(pts, origin);
    const xs = xy.map(p => p.x), zs = xy.map(p => p.z);
    const span = Math.max(Math.max(...xs)-Math.min(...xs), Math.max(...zs)-Math.min(...zs), 12);
    const h = Math.max(property.height_m || 8, 8);
    const floor = property.floors.find(f => f.id === selectedFloorId);
    const targetY = floor ? (floor.bottom_m + floor.top_m) / 2 : h * 0.42;
    const distance = Math.max(span * 2.25, h * 2.2, 30);
    camera.position.set(distance * 0.95, targetY + Math.max(h * 1.05, span * 0.9), distance * 0.95);
    camera.lookAt(0, targetY, 0);
    if (controls.current) controls.current.target.set(0, targetY, 0);
  }, [property, generationDone, selectedFloorId, camera]);
  return <OrbitControls ref={controls} enableDamping dampingFactor={0.08} minDistance={10} maxDistance={320} maxPolarAngle={Math.PI * 0.49} />;
}

function Scene({ property, selectedFloorId, setSelectedFloorId, exploded, scanning, isolate, showUnits, generationDone, selectedUnitId, onSelectUnit }: {
  property: GeneratedProperty;
  selectedFloorId: string;
  setSelectedFloorId: (id: string) => void;
  exploded: boolean;
  scanning: boolean;
  isolate: boolean;
  showUnits: boolean;
  generationDone: boolean;
  selectedUnitId?: string;
  onSelectUnit: (unit: GeneratedPropertyUnit) => void;
}) {
  return <>
    <color attach="background" args={['#06111d']} />
    <fog attach="fog" args={['#06111d', 110, 330]} />
    <ambientLight intensity={1.35} />
    <hemisphereLight intensity={1.15} color="#dff8ff" groundColor="#06111d" />
    <directionalLight castShadow position={[55, 90, 35]} intensity={2.6} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
    <pointLight position={[-35, 32, 20]} intensity={25} distance={150} color="#22d3ee" />
    <pointLight position={[35, 18, -30]} intensity={16} distance={120} color="#a78bfa" />
    <gridHelper args={[240, 48, '#164e63', '#0b2539']} position={[0, -0.12, 0]} />
    <BuildingModel
      property={property}
      selectedFloorId={selectedFloorId}
      setSelectedFloorId={setSelectedFloorId}
      exploded={exploded}
      scanning={scanning}
      isolate={isolate}
      showUnits={showUnits}
      selectedUnitId={selectedUnitId}
      onSelectUnit={onSelectUnit}
    />
    <FocusCamera property={property} generationDone={generationDone} selectedFloorId={selectedFloorId} />
  </>;
}

export default function Property3D({ property, exploded, scanning, generationDone }: { property: GeneratedProperty; exploded: boolean; scanning: boolean; generationDone: boolean }) {
  const defaultFloor = property.floors.find(f => !f.is_underground) ?? property.floors[0];
  const [selectedFloorId, setSelectedFloorId] = useState(defaultFloor?.id ?? '');
  const [isolate, setIsolate] = useState(false);
  const [showUnits, setShowUnits] = useState(true);
  const [selectedUnit, setSelectedUnit] = useState<GeneratedPropertyUnit | null>(null);

  useEffect(() => {
    const next = property.floors.find(f => !f.is_underground) ?? property.floors[0];
    setSelectedFloorId(next?.id ?? '');
    setIsolate(false);
    setSelectedUnit(null);
  }, [property]);

  const selectedFloor = property.floors.find(f => f.id === selectedFloorId) ?? defaultFloor;

  return <div className="property-3d-root">
    <Canvas shadows camera={{ position: [70, 55, 80], fov: 40 }} gl={{ antialias: true }}>
      <Scene
        property={property}
        selectedFloorId={selectedFloorId}
        setSelectedFloorId={setSelectedFloorId}
        exploded={exploded}
        scanning={scanning}
        isolate={isolate}
        showUnits={showUnits}
        generationDone={generationDone}
        selectedUnitId={selectedUnit?.unit_id}
        onSelectUnit={setSelectedUnit}
      />
    </Canvas>

    <div className="floor-selector-3d">
      <div className="panel-kicker">VERTICAL STACK</div>
      <div className="panel-title">Floor Selector</div>
      <div className="floor-buttons">
        {[...property.floors].reverse().map(floor => (
          <button key={floor.id} className={floor.id === selectedFloorId ? 'active' : ''} onClick={() => { setSelectedFloorId(floor.id); setSelectedUnit(null); }}>
            <span>{floor.label}</span>
            <b>{(property.units ?? []).filter(u => Number(u.floor_number) === Number(floor.floor_number)).length} rooms/units · {floor.top_m >= 0 ? '+' : ''}{floor.top_m.toFixed(2)} m</b>
          </button>
        ))}
      </div>
      <div className="floor-controls">
        <button className={isolate ? 'active' : ''} onClick={() => setIsolate(v => !v)}>{isolate ? 'Show full building' : 'Isolate floor'}</button>
        <button className={showUnits ? 'active' : ''} onClick={() => setShowUnits(v => !v)}>Floor plan {showUnits ? 'ON' : 'OFF'}</button>
      </div>
    </div>

    <div className="property-info-3d">
      <div className="panel-kicker">SELECTED PROPERTY</div>
      <div className="property-id-3d">{property.ulpin_3d}</div>
      <div className="info-grid-3d">
        <div><span>Floor</span><b>{selectedFloor?.label ?? '—'}</b></div>
        <div><span>Elevation</span><b>{selectedFloor ? `${selectedFloor.bottom_m.toFixed(2)} → ${selectedFloor.top_m.toFixed(2)} m` : '—'}</b></div>
        <div><span>Height</span><b>{property.height_m.toFixed(2)} m</b></div>
        <div><span>nDSM</span><b>{property.ndsm_m == null ? '—' : `${property.ndsm_m.toFixed(2)} m`}</b></div>
      </div>
      <div className={`status-pill ${property.status === 'VERIFIED' ? 'verified' : 'review'}`}>{property.status}</div>
      <div className="source-note">Exact source footprint · {property.floors.filter(f => !f.is_underground).length} reconstructed floors · basement is inferred</div>
    </div>

    {selectedFloor && <div className="floor-plan-summary-3d">
      <div className="panel-kicker">ROOM / UNIT INVENTORY · SOURCE CSV</div>
      <div className="floor-plan-summary-title"><b>{selectedFloor.label}</b><span>{(property.units ?? []).filter(u => Number(u.floor_number) === Number(selectedFloor.floor_number)).length} rooms / units</span></div>
      {(property.units ?? []).filter(u => Number(u.floor_number) === Number(selectedFloor.floor_number)).map((u) => <button key={u.unit_id} className={selectedUnit?.unit_id === u.unit_id ? 'room-row active' : 'room-row'} onClick={() => setSelectedUnit(u)}>
        <span><b>{u.unit_id}</b><small>{unitDisplayType(u)}</small></span>
        <em>{u.owner_name}</em>
      </button>)}
      {!(property.units ?? []).some(u => Number(u.floor_number) === Number(selectedFloor.floor_number)) && <div className="room-empty">No room/unit inventory supplied for this floor.</div>}
      <div className="room-source-note">Unit/room geometry is inferred because the CSV supplies inventory, not architectural room polygons or dimensions.</div>
    </div>}

    {selectedUnit && <div className="unit-info-3d">
      <div className="panel-kicker">SELECTED UNIT · INFERRED SPATIAL LAYOUT</div>
      <b>{selectedUnit.unit_id}</b>
      <span>{selectedUnit.floor_label} · {unitDisplayType(selectedUnit)}</span>
      <small>{selectedUnit.owner_name}</small>
      <em>CSV inventory source · unit polygon not supplied</em>
    </div>}

    <div className="scene-hint">DRAG ROTATE · SCROLL ZOOM · CLICK FLOOR / UNIT TO SELECT</div>
  </div>;
}
