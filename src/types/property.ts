export interface Coordinate { lat: number; lon: number }
export interface Parcel { id: string; name: string; description?: string; coordinates: Coordinate[]; area?: number }
export interface ElevationPoint { lat: number; lon: number; elevation: number; buildingHeight?: number; floors?: number; parcelId?: string }
export interface Property3D extends Parcel { buildingHeight: number; floors: number; dem?: number; dsm?: number; ndsm?: number; confidence: number; status: 'VERIFIED' | 'REVIEW REQUIRED'; }
