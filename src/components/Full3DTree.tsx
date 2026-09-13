import { Canvas, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import type { ParcelRecord, LatLng } from '../types/ulpin';

type LocalPoint = { x: number; z: number };

function localize(points: LatLng[], origin: LatLng): LocalPoint[] {
  const k = 111320;
  const cos = Math.cos(origin.lat * Math.PI / 180);
  return points.map(p => ({
    x: (p.lon - origin.lon) * k * cos,
    z: -(p.lat - origin.lat) * k,
  }));
}

function clean(points: LatLng[]) {
  if (points.length < 3) return points;
  const a = points[0];
  const b = points[points.length - 1];
  return Math.abs(a.lat - b.lat) < 1e-10 && Math.abs(a.lon - b.lon) < 1e-10 ? points.slice(0, -1) : points;
}

function makeShape(points: LocalPoint[]) {
  const shape = new THREE.Shape();
  points.forEach((p, i) => i === 0 ? shape.moveTo(p.x, -p.z) : shape.lineTo(p.x, -p.z));
  shape.closePath();
  return shape;
}

function heightFor(p: ParcelRecord) {
  if ((p.building_height_m ?? 0) > 0) return p.building_height_m as number;
  const floors = Number(p.detected_floors ?? p.declared_floors ?? 0);
  return floors > 0 ? floors * 3 : 0.35;
}

function Building({ parcel, origin, selected, onSelect, index }: {
  parcel: ParcelRecord;
  origin: LatLng;
  selected: boolean;
  onSelect: () => void;
  index: number;
}) {
  const raw = clean(parcel.coordinates);
  const points = useMemo(() => localize(raw, origin), [raw, origin]);
  const shape = useMemo(() => makeShape(points), [points]);
  const height = Math.max(0.35, heightFor(parcel));
  const floors = Number(parcel.detected_floors ?? parcel.declared_floors ?? 0);
  const base = parcel.elevation_dem_m ?? 0;
  const color = selected ? '#22d3ee' : index % 3 === 0 ? '#64748b' : index % 3 === 1 ? '#718096' : '#526477';
  const opacity = selected ? 0.96 : 0.72;
  const ref = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.userData = { ulpin: parcel.name };
  }, [parcel.name]);

  if (points.length < 3) return null;

  return <group>
    <mesh
      ref={ref}
      position={[0, height / 2, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      castShadow
      receiveShadow
    >
      <extrudeGeometry args={[shape, { depth: height, bevelEnabled: false, steps: 1 }]} />
      <meshStandardMaterial
        color={color}
        transparent
        opacity={opacity}
        roughness={0.5}
        metalness={selected ? 0.28 : 0.08}
        emissive={selected ? '#0e7490' : '#000000'}
        emissiveIntensity={selected ? 0.8 : 0}
        side={THREE.DoubleSide}
      />
    </mesh>
    <Line
      points={[...points.map(p => [p.x, height + 0.04, p.z] as [number, number, number]), [points[0].x, height + 0.04, points[0].z]]}
      color={selected ? '#facc15' : '#334e68'}
      lineWidth={selected ? 3.2 : 1}
      transparent
      opacity={selected ? 1 : 0.55}
    />
    {floors > 1 && Array.from({ length: Math.min(floors - 1, 8) }).map((_, i) => {
      const y = ((i + 1) / floors) * height;
      return <Line
        key={`${parcel.name}-floor-${i}`}
        points={[...points.map(p => [p.x, y, p.z] as [number, number, number]), [points[0].x, y, points[0].z]]}
        color={selected ? '#7dd3fc' : '#243b53'}
        lineWidth={selected ? 1.2 : 0.65}
        transparent
        opacity={selected ? 0.62 : 0.28}
      />;
    })}
    {selected && <Html position={[0, height + 1.4, 0]} center distanceFactor={70}>
      <div className="tree-building-label"><b>{parcel.name}</b><span>{height.toFixed(2)} m · {floors || '—'} floors</span></div>
    </Html>}
    {base !== 0 && <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <shapeGeometry args={[shape]} />
    </mesh>}
  </group>;
}

function Scene({ parcels, selected, onSelect }: { parcels: ParcelRecord[]; selected?: ParcelRecord; onSelect: (p: ParcelRecord) => void }) {
  const origin = useMemo(() => {
    const source = selected?.coordinates?.[0] ?? parcels[0]?.coordinates?.[0];
    return source ?? { lat: 18.6713, lon: 73.8908 };
  }, [selected, parcels]);
  const sceneParcels = useMemo(() => parcels.filter(p => p.type === 'Polygon' && p.coordinates.length >= 3), [parcels]);

  return <>
    <color attach="background" args={['#050d17']} />
    <fog attach="fog" args={['#050d17', 180, 650]} />
    <ambientLight intensity={1.1} />
    <hemisphereLight intensity={1.1} color="#dff9ff" groundColor="#07111f" />
    <directionalLight castShadow position={[100, 160, 70]} intensity={3.4} shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
    <pointLight position={[0, 80, 0]} intensity={22} distance={220} color="#22d3ee" />
    <pointLight position={[-100, 30, 80]} intensity={14} distance={220} color="#818cf8" />
    <gridHelper args={[700, 70, '#12334a', '#0a1d2e']} position={[0, -0.08, 0]} />
    {sceneParcels.map((parcel, index) => <Building
      key={parcel.name}
      parcel={parcel}
      origin={origin}
      selected={parcel.name === selected?.name}
      onSelect={() => onSelect(parcel)}
      index={index}
    />)}
    <FocusCamera parcels={sceneParcels} origin={origin} selected={selected} />
    <OrbitControls enableDamping dampingFactor={0.08} minDistance={18} maxDistance={650} maxPolarAngle={Math.PI * 0.49} />
  </>;
}

function FocusCamera({ parcels, origin, selected }: { parcels: ParcelRecord[]; origin: LatLng; selected?: ParcelRecord }) {
  const { camera } = useThree();
  const last = useRef('');
  useEffect(() => {
    const key = `all-${selected?.name ?? ''}`;
    if (last.current === key) return;
    last.current = key;
    const target = parcels.flatMap(p => localize(clean(p.coordinates), origin));
    if (!target.length) return;
    const xs = target.map(p => p.x);
    const zs = target.map(p => p.z);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ, 25);
    const h = Math.max(...parcels.map(heightFor), 12);
    const distance = Math.max(span * 1.55, h * 2.6, 120);
    camera.position.set(cx + distance * 0.92, h * 1.05 + distance * 0.72, cz + distance * 0.92);
    camera.lookAt(cx, h * 0.3, cz);
  }, [selected, parcels, origin, camera]);
  return null;
}

export default function Full3DTree({ parcels, selected, onSelect, onGenerate }: {
  parcels: ParcelRecord[];
  selected?: ParcelRecord;
  onSelect: (p: ParcelRecord) => void;
  onGenerate: (p?: ParcelRecord) => void;
}) {
  const buildings = parcels.filter(p => p.type === 'Polygon' && p.coordinates.length >= 3);
  return <div className="full-tree-root">
    <Canvas shadows camera={{ position: [130, 110, 130], fov: 42 }} gl={{ antialias: true }}>
      <Scene parcels={buildings} selected={selected} onSelect={onSelect} />
    </Canvas>
    <div className="full-tree-header">
      <div><div className="eyebrow">3D CADASTRAL CITY / BLOCK VIEW</div><h1>Full 3D Tree</h1><p>Every supplied polygon is reconstructed as a 3D footprint. The selected building is highlighted.</p></div>
      <div className="tree-actions"><button onClick={() => onGenerate(selected)} disabled={!selected}>Create selected 3D ULPIN</button></div>
    </div>
    <div className="full-tree-stats"><span><b>{buildings.length}</b> buildings</span><span><b>{selected?.name ?? 'None'}</b> selected</span><span>Exact parcel footprints</span><span>DEM / DSM heights</span></div>
    {selected && <div className="full-tree-selected"><div className="panel-kicker">SELECTED BUILDING</div><strong>{selected.name}</strong><div className="tree-selected-grid"><span>Height <b>{heightFor(selected).toFixed(2)} m</b></span><span>Floors <b>{selected.detected_floors ?? selected.declared_floors ?? '—'}</b></span><span>nDSM <b>{selected.ndsm_m == null ? '—' : `${selected.ndsm_m.toFixed(2)} m`}</b></span></div></div>}
    <div className="full-tree-hint">DRAG ROTATE · SCROLL ZOOM · CLICK ANY BUILDING · SELECTED = CYAN / YELLOW</div>
  </div>;
}
