import type { Parcel, ElevationPoint, Property3D } from '../types/property';
import { calculateNDSM } from './elevation';
export const buildProperty = (parcel: Parcel, points: ElevationPoint[]): Property3D => {
  const match = points.find(p => p.parcelId === parcel.id) ?? points[0];
  const dem = match?.elevation ?? 0;
  const dsm = dem + (match?.buildingHeight ?? 0);
  const height = match?.buildingHeight ?? calculateNDSM(dsm, dem);
  const floors = Math.max(1, Math.round(match?.floors ?? height / 3));
  return { ...parcel, buildingHeight: height, floors, dem, dsm, ndsm: calculateNDSM(dsm, dem), confidence: match ? 96 : 72, status: match ? 'VERIFIED' : 'REVIEW REQUIRED' };
};
