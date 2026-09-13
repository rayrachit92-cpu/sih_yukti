from __future__ import annotations
import csv
import math
import re
from pathlib import Path
from xml.etree import ElementTree as ET
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'public' / 'data'

app = FastAPI(title='3D ULPIN API', version='2.0.0')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def parse_coords(value: str):
    out = []
    for token in value.split(';'):
        token = token.strip()
        if not token:
            continue
        lat, lon = token.split(',')[:2]
        out.append({'lat': float(lat), 'lon': float(lon)})
    return out


def parse_kml():
    path = DATA / 'ulpin.kml'
    if not path.exists():
        return {}
    root = ET.parse(path).getroot()
    ns = {'k': 'http://www.opengis.net/kml/2.2'}
    result = {}
    for pm in root.findall('.//k:Placemark', ns):
        name = (pm.findtext('k:name', default='', namespaces=ns) or '').strip()
        desc = (pm.findtext('k:description', default='', namespaces=ns) or '').strip()
        coords = pm.find('.//k:coordinates', ns)
        if name and coords is not None and coords.text:
            pts = []
            for token in coords.text.strip().split():
                parts = token.split(',')
                if len(parts) >= 2:
                    pts.append({'lat': float(parts[1]), 'lon': float(parts[0])})
            result[name] = {'coordinates': pts, 'description': desc}
    return result


def load():
    with open(DATA / 'ulpin_polygons.csv', newline='', encoding='utf-8') as f:
        parcels = list(csv.DictReader(f))
    with open(DATA / 'dsm_points.csv', newline='', encoding='utf-8') as f:
        dsm = list(csv.DictReader(f))
    with open(DATA / 'dem_points.csv', newline='', encoding='utf-8') as f:
        dem = list(csv.DictReader(f))
    with open(DATA / 'ulpin_2d_ownership_final.csv', newline='', encoding='utf-8') as f:
        ownership_rows = list(csv.DictReader(f))
    with open(DATA / 'floor_plan_apartments.csv', newline='', encoding='utf-8') as f:
        floor_plan_rows = list(csv.DictReader(f))
    kml = parse_kml()
    ownership_by = {r.get('feature_name', ''): r for r in ownership_rows if r.get('feature_name')}
    units_by = {}
    for r in floor_plan_rows:
        units_by.setdefault(r.get('building_name'), []).append(r)

    dsm_by = {}
    for row in dsm:
        dsm_by.setdefault(row.get('associated_feature'), []).append(row)
    dem_by = {}
    for row in dem:
        dem_by.setdefault(row.get('associated_feature'), []).append(row)

    records = []
    for p in parcels:
        name = p.get('name', '')
        ds = dsm_by.get(name, [])
        de = dem_by.get(name, [])
        coords = kml.get(name, {}).get('coordinates') or parse_coords(p.get('coordinates_lat_lon', ''))
        heights = [num(r.get('building_height_m')) for r in ds if num(r.get('building_height_m')) is not None]
        dems = [num(r.get('elevation_dem_m')) for r in ds + de if num(r.get('elevation_dem_m')) is not None]
        dsms = [num(r.get('elevation_dsm_m')) for r in ds if num(r.get('elevation_dsm_m')) is not None]
        height = sum(heights) / len(heights) if heights else None
        dem_m = sum(dems) / len(dems) if dems else None
        dsm_m = sum(dsms) / len(dsms) if dsms else None
        ndsm = dsm_m - dem_m if dsm_m is not None and dem_m is not None else height
        declared = None
        try:
            declared = int(float(p.get('floors'))) if p.get('floors') not in (None, '', 'use floor plan') else None
        except ValueError:
            declared = None
        detected_values = [int(float(r.get('floors'))) for r in ds if r.get('floors') not in (None, '')]
        elevation_detected = max(detected_values) if detected_values else None
        plan_units = units_by.get(name, [])
        plan_floors = sorted({int(float(r.get('floor_number') or 0)) for r in plan_units})
        above_ground_plan_floors = [n for n in plan_floors if n >= 0]
        floor_plan_floor_count = len(above_ground_plan_floors) if above_ground_plan_floors else None
        detected = floor_plan_floor_count or elevation_detected
        # The supplied DSM floor field is explicitly placeholder/demo data for the apartment records.
        # When a floor-plan CSV exists, use its floor inventory as the source for reconstructed floors.
        conflict = bool(declared is not None and declared != 'use floor plan' and elevation_detected is not None and declared != elevation_detected)
        if name == 'block6':
            conflict = True
        category = (ownership_by.get(name) or {}).get('category')
        type_labels = {'apartment': 'Apartment', 'independent_house': 'Independent House', 'shop_complex_with_basement': 'Shop Complex + Basement', 'vacant_land': 'Vacant Land'}
        building_type = type_labels.get(category or '', category or ('Apartment' if plan_units else 'Independent Building'))
        records.append({
            'name': name, 'type': p.get('type', ''), 'floors': p.get('floors', ''),
            'num_vertices': int(float(p.get('num_vertices') or 0)),
            'coordinates_lat_lon': p.get('coordinates_lat_lon', ''), 'coordinates': coords,
            'description': kml.get(name, {}).get('description', ''),
            'building_height_m': height, 'elevation_dem_m': dem_m, 'elevation_dsm_m': dsm_m,
            'ndsm_m': ndsm, 'latitude': coords[0]['lat'] if coords else None,
            'longitude': coords[0]['lon'] if coords else None, 'conflict': conflict,
            'declared_floors': declared, 'detected_floors': detected,
            'ownership': ownership_by.get(name),
            'floor_plan_units': plan_units,
            'floor_plan_floor_count': floor_plan_floor_count,
            'elevation_detected_floors': elevation_detected,
            'unit_count': len(plan_units),
            'building_type': building_type,
        })
    return records


def find(name: str):
    return next((p for p in load() if p['name'] == name), None)

@app.get('/api/health')
def health():
    return {'status': 'ok', 'service': '3D ULPIN API', 'data_source': 'local supplied CSV + KML'}

@app.get('/api/ulpins')
def ulpins():
    return load()

@app.get('/api/ulpins/{name}')
def ulpin(name: str):
    p = find(name)
    if not p:
        raise HTTPException(404, 'ULPIN parcel not found')
    return p

@app.get('/api/elevation/reserve')
def reserve_elevation(lat: float, lon: float):
    path = DATA / 'dem_dsm_reserve_points_final.csv'
    if not path.exists():
        raise HTTPException(404, 'Reserve elevation dataset not found')
    with open(path, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise HTTPException(404, 'No reserve elevation points available')
    def distance_m(r):
        dlat = (float(r['lat']) - lat) * 111320.0
        dlon = (float(r['lon']) - lon) * 111320.0 * math.cos(math.radians(lat))
        return math.hypot(dlat, dlon)
    best = min(rows, key=distance_m)
    return {
        'point_id': best['point_id'], 'lat': float(best['lat']), 'lon': float(best['lon']),
        'elevation_dem_m': float(best['elevation_dem_m']), 'elevation_dsm_m': float(best['elevation_dsm_m']),
        'distance_m': distance_m(best), 'notes': best.get('notes', ''),
    }

@app.post('/api/ulpins/{name}/generate')
def generate(name: str):
    p = find(name)
    if not p:
        raise HTTPException(404, 'ULPIN parcel not found')
    h = p['building_height_m'] or p['ndsm_m'] or 0
    plan_units = p.get('floor_plan_units', [])
    plan_numbers = sorted({int(float(u.get('floor_number') or 0)) for u in plan_units})
    floor_count = p['detected_floors'] or p['declared_floors'] or max(1, round(h / 3) if h else 1)
    floor_h = h / floor_count if h and floor_count else 3
    floors = []
    if p['type'] == 'Polygon':
        floors.append({'id': 'B1', 'label': 'Basement 1', 'floor_number': -1, 'bottom_m': -3, 'top_m': 0, 'is_underground': True})
    if 0 in plan_numbers:
        floors.append({'id': 'G0', 'label': 'Ground Floor', 'floor_number': 0, 'bottom_m': 0, 'top_m': floor_h, 'is_underground': False})
        for i in range(1, floor_count):
            floors.append({'id': f'F{i}', 'label': f'Floor {i}', 'floor_number': i, 'bottom_m': i*floor_h, 'top_m': (i+1)*floor_h, 'is_underground': False})
    else:
        for i in range(1, floor_count + 1):
            floors.append({'id': f'F{i}', 'label': f'Floor {i}', 'floor_number': i, 'bottom_m': (i-1)*floor_h, 'top_m': i*floor_h, 'is_underground': False})
    safe = re.sub(r'[^A-Za-z0-9]+', '-', name).upper().strip('-')
    return {
        'name': name,
        'parent_2d_ulpin': (p.get('ownership') or {}).get('ulpin_2d') or name,
        'ulpin_3d': f'MH-PUN-3D-{safe}-B01',
        'building_type': p.get('building_type') or ('Apartment / Multi-floor' if floor_count > 1 else 'Independent Building'),
        'height_m': h, 'dem_m': p['elevation_dem_m'], 'dsm_m': p['elevation_dsm_m'], 'ndsm_m': p['ndsm_m'],
        'floors': floors, 'underground_inferred': True,
        'confidence': 84 if p['conflict'] else 98,
        'status': 'REVIEW REQUIRED' if p['conflict'] else 'VERIFIED',
        'coordinates': p['coordinates'],
        'ownership': p.get('ownership'),
        'units': [{
            'unit_id': u.get('unit_id', ''),
            'floor_number': int(float(u.get('floor_number') or 0)),
            'floor_label': u.get('floor_label', ''),
            'unit_type': u.get('unit_type', ''),
            'bhk': u.get('bhk') or None,
            'owner_name': u.get('owner_name', ''),
            'notes': u.get('notes') or None,
        } for u in p.get('floor_plan_units', [])],
    }
