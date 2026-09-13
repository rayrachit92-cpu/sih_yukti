export type LatLng = { lat: number; lon: number };
export type ParcelType = 'Polygon' | 'LineString' | string;

export interface OwnershipRecord {
  ulpin_2d: string;
  feature_name: string;
  category: string;
  owner_name: string;
  land_owner?: string | null;
  notes?: string | null;
}

export interface FloorPlanUnit {
  building_name: string;
  floor_label: string;
  floor_number: number;
  unit_id: string;
  unit_type: string;
  bhk?: string | null;
  owner_name: string;
  notes?: string | null;
}

export interface ReserveElevationPoint {
  point_id: string;
  lat: number;
  lon: number;
  elevation_dem_m: number;
  elevation_dsm_m: number;
  notes?: string | null;
}

export interface ReserveElevationSample extends ReserveElevationPoint {
  distance_m: number;
}

export interface ParcelRecord {
  name: string;
  type: ParcelType;
  floors: string | number;
  num_vertices: number;
  coordinates_lat_lon: string;
  coordinates: LatLng[];
  description?: string;
  building_height_m: number | null;
  elevation_dem_m: number | null;
  elevation_dsm_m: number | null;
  ndsm_m: number | null;
  latitude: number | null;
  longitude: number | null;
  conflict: boolean;
  declared_floors: number | null;
  detected_floors: number | null;
  floor_plan_floor_count?: number | null;
  elevation_detected_floors?: number | null;
  unit_count?: number;
  building_type?: string;
  ownership?: OwnershipRecord | null;
  floor_plan_units?: FloorPlanUnit[];
  reserve_elevation?: ReserveElevationSample | null;
}

export interface GeneratedFloor {
  id: string;
  label: string;
  bottom_m: number;
  top_m: number;
  is_underground: boolean;
  floor_number?: number;
}

export interface GeneratedPropertyUnit {
  unit_id: string;
  floor_number: number;
  floor_label: string;
  unit_type: string;
  bhk?: string | null;
  owner_name: string;
  notes?: string | null;
}

export interface GeneratedProperty {
  name: string;
  parent_2d_ulpin: string;
  ulpin_3d: string;
  building_type: string;
  height_m: number;
  dem_m: number | null;
  dsm_m: number | null;
  ndsm_m: number | null;
  floors: GeneratedFloor[];
  units?: GeneratedPropertyUnit[];
  ownership?: OwnershipRecord | null;
  reserve_elevation?: ReserveElevationSample | null;
  underground_inferred: boolean;
  confidence: number;
  status: 'VERIFIED' | 'REVIEW REQUIRED';
  coordinates: LatLng[];
}
