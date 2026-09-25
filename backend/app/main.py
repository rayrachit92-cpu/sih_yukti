from __future__ import annotations
import csv
import math
import re
import json
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional
from xml.etree import ElementTree as ET
from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware

from .underground_ml import analyze_underground

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



def _csv_rows(path: Path):
    if not path.exists():
        return []
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))

def _write_csv(path: Path, fieldnames, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

def _upsert_row(path: Path, fieldnames, key_fields, row):
    rows = _csv_rows(path)
    matched = False
    for old in rows:
        if all(str(old.get(k, '')).strip().lower() == str(row.get(k, '')).strip().lower() for k in key_fields):
            old.update({k: str(row.get(k, '')) for k in fieldnames})
            matched = True
            break
    if not matched:
        rows.append({k: str(row.get(k, '')) for k in fieldnames})
    _write_csv(path, fieldnames, rows)
    return row

@app.get('/api/municipal/records')
def municipal_records():
    return _csv_rows(DATA / 'municipal_property_records.csv')

@app.post('/api/municipal/property')
async def save_municipal_property(request: Request):
    payload = await request.json()
    state = str(payload.get('state', '')).strip()
    district = str(payload.get('district', '')).strip()
    city = str(payload.get('city', '')).strip()
    land_name = str(payload.get('land_name', '')).strip()
    source = str(payload.get('source', 'existing')).strip()
    category = str(payload.get('category', 'apartment')).strip()
    feature_name = str(payload.get('feature_name', '')).strip()
    ulpin_2d = str(payload.get('ulpin_2d', '')).strip()
    if not state or not district or not city or not land_name:
        raise HTTPException(400, 'State, district, city and project land name are required.')
    if source == 'new':
        feature_name = feature_name or f"NEW-ULPIN-{len(_csv_rows(DATA / 'ulpin_polygons.csv')) + 1:03d}"
        if any(r.get('name', '').lower() == feature_name.lower() for r in _csv_rows(DATA / 'ulpin_polygons.csv')):
            raise HTTPException(409, 'That feature name already exists.')
        raw = str(payload.get('polygon', '')).replace('\n', ';')
        points = []
        for token in raw.split(';'):
            token = token.strip()
            if not token:
                continue
            parts = [x.strip() for x in token.split(',')]
            if len(parts) != 2:
                raise HTTPException(400, 'Polygon points must be lat,lon pairs.')
            try:
                lat, lon = float(parts[0]), float(parts[1])
            except ValueError:
                raise HTTPException(400, 'Invalid polygon coordinate.')
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise HTTPException(400, 'Invalid latitude/longitude range.')
            points.append((lat, lon))
        if len(points) < 3:
            raise HTTPException(400, 'A new polygon requires at least 3 points.')
        if points[0] != points[-1]:
            points.append(points[0])
        polygon_rows = _csv_rows(DATA / 'ulpin_polygons.csv')
        polygon_rows.append({
            'name': feature_name, 'type': 'Polygon', 'floors': str(payload.get('floors') or 1),
            'num_vertices': str(len(points)), 'coordinates_lat_lon': '; '.join(f'{lat},{lon}' for lat, lon in points)
        })
        _write_csv(DATA / 'ulpin_polygons.csv', ['name','type','floors','num_vertices','coordinates_lat_lon'], polygon_rows)
        if not ulpin_2d:
            ulpin_2d = f"NEW-{feature_name.upper().replace(' ', '-') }"

    ownership_fields = ['ulpin_2d','feature_name','category','owner_name','land_owner','notes']
    ownership_path = DATA / 'ulpin_2d_ownership_final.csv'
    ownership_row = {
        'ulpin_2d': ulpin_2d or feature_name, 'feature_name': feature_name, 'category': category,
        'owner_name': str(payload.get('owner_name', '')).strip(), 'land_owner': str(payload.get('land_owner', '')).strip(),
        'notes': str(payload.get('notes', '')).strip()
    }
    _upsert_row(ownership_path, ownership_fields, ['feature_name'], ownership_row)

    municipal_fields = ['record_id','ulpin_2d','feature_name','state','district','city','ward','locality','land_name','category','owner_name','land_owner','bhk','floors','underground','underground_levels','underground_type','floor_plan_status','source','notes','updated_at']
    import datetime as _dt
    municipal_row = {
        'record_id': f"MUN-{feature_name.upper().replace(' ', '-')}", 'ulpin_2d': ulpin_2d or feature_name, 'feature_name': feature_name,
        'state': state, 'district': district, 'city': city, 'ward': str(payload.get('ward','')).strip(), 'locality': str(payload.get('locality','')).strip(),
        'land_name': land_name, 'category': category, 'owner_name': ownership_row['owner_name'], 'land_owner': ownership_row['land_owner'],
        'bhk': str(payload.get('bhk','')).strip(), 'floors': str(payload.get('floors') or 1),
        'underground': 'yes' if bool(payload.get('underground')) else 'no', 'underground_levels': str(payload.get('underground_levels') or 0),
        'underground_type': str(payload.get('underground_type','')).strip(), 'floor_plan_status': 'provided' if payload.get('units') else ('not_applicable' if category == 'independent_house' else 'not_provided'),
        'source': source, 'notes': ownership_row['notes'], 'updated_at': _dt.datetime.now().isoformat(timespec='seconds')
    }
    _upsert_row(DATA / 'municipal_property_records.csv', municipal_fields, ['feature_name'], municipal_row)

    units = payload.get('units') or []
    if category == 'apartment' and units:
        unit_fields = ['building_name','floor_label','floor_number','unit_id','unit_type','bhk','owner_name','notes']
        existing_units = [r for r in _csv_rows(DATA / 'floor_plan_apartments.csv') if r.get('building_name') != feature_name]
        for u in units:
            existing_units.append({
                'building_name': feature_name, 'floor_label': str(u.get('floor_label','')), 'floor_number': str(u.get('floor_number',0)),
                'unit_id': str(u.get('unit_id','')), 'unit_type': str(u.get('unit_type','flat')), 'bhk': str(u.get('bhk','')),
                'owner_name': str(u.get('owner_name','')), 'notes': str(u.get('notes',''))
            })
        _write_csv(DATA / 'floor_plan_apartments.csv', unit_fields, existing_units)

    underground_fields = ['feature_name','ulpin_2d','underground','levels','type','source','notes','updated_at']
    if category == 'apartment':
        underground_row = {
            'feature_name': feature_name, 'ulpin_2d': ulpin_2d or feature_name, 'underground': 'yes' if bool(payload.get('underground')) else 'no',
            'levels': str(payload.get('underground_levels') or 0), 'type': str(payload.get('underground_type','')).strip(),
            'source': 'Municipal entry', 'notes': str(payload.get('notes','')).strip(), 'updated_at': _dt.datetime.now().isoformat(timespec='seconds')
        }
        _upsert_row(DATA / 'underground_records.csv', underground_fields, ['feature_name'], underground_row)

    return {'ok': True, 'feature_name': feature_name, 'ulpin_2d': ulpin_2d or feature_name, 'source': source, 'category': category}

@app.get('/api/streets')
def streets(
    min_lat: Optional[float] = Query(None),
    max_lat: Optional[float] = Query(None),
    min_lon: Optional[float] = Query(None),
    max_lon: Optional[float] = Query(None),
    minLat: Optional[float] = Query(None),
    maxLat: Optional[float] = Query(None),
    minLon: Optional[float] = Query(None),
    maxLon: Optional[float] = Query(None),
):
    """Return nearby drivable OpenStreetMap street geometry. Accepts both snake_case and camelCase query names."""
    min_lat = min_lat if min_lat is not None else minLat
    max_lat = max_lat if max_lat is not None else maxLat
    min_lon = min_lon if min_lon is not None else minLon
    max_lon = max_lon if max_lon is not None else maxLon
    if None in (min_lat, max_lat, min_lon, max_lon):
        raise HTTPException(422, 'Street bounding box requires min_lat, max_lat, min_lon and max_lon')
    if min_lat >= max_lat or min_lon >= max_lon:
        raise HTTPException(400, 'Invalid street bounding box')
    query = f'''
    [out:json][timeout:20];
    way["highway"~"motorway|trunk|primary|secondary|tertiary|unclassified|residential|service"]({min_lat},{min_lon},{max_lat},{max_lon});
    out geom;
    '''
    endpoints = [
        'https://overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
    ]
    last_error = 'Street provider unavailable'
    for endpoint in endpoints:
        try:
            payload = urllib.parse.urlencode({'data': query}).encode('utf-8')
            request = urllib.request.Request(
                endpoint,
                data=payload,
                headers={'User-Agent': '3D-ULPIN-Hackathon/2.0'},
                method='POST',
            )
            with urllib.request.urlopen(request, timeout=25) as response:
                data = json.loads(response.read().decode('utf-8'))
            result = []
            for element in data.get('elements', []):
                geometry = element.get('geometry') or []
                coords = [
                    {'lat': float(point['lat']), 'lon': float(point['lon'])}
                    for point in geometry
                    if 'lat' in point and 'lon' in point
                ]
                if len(coords) >= 2:
                    result.append({
                        'id': int(element.get('id', len(result))),
                        'name': (element.get('tags') or {}).get('name'),
                        'highway': (element.get('tags') or {}).get('highway'),
                        'coordinates': coords,
                    })
            return {'count': len(result), 'streets': result, 'source': 'OpenStreetMap / Overpass'}
        except Exception as exc:
            last_error = str(exc)
    raise HTTPException(502, last_error)


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

@app.get('/api/ai/underground')
def underground_ai(name: str):
    records = load()
    p = next((row for row in records if row['name'] == name), None)
    if not p:
        raise HTTPException(404, 'ULPIN parcel not found')
    try:
        return analyze_underground(p, records)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


# Backward-compatible endpoint for older frontend builds that call
# POST /api/underground/generate instead of GET /api/ai/underground.
@app.post('/api/underground/generate')
async def underground_generate(request: Request, name: Optional[str] = None):
    if not name:
        try:
            payload = await request.json()
            if isinstance(payload, dict):
                name = payload.get('name') or payload.get('ulpin') or payload.get('parcel')
        except Exception:
            payload = None
    if not name:
        raise HTTPException(400, 'Missing parcel name. Send ?name=... or JSON {"name":"..."}.')

    records = load()
    p = next((row for row in records if row['name'] == name), None)
    if not p:
        raise HTTPException(404, 'ULPIN parcel not found')
    try:
        return analyze_underground(p, records)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
