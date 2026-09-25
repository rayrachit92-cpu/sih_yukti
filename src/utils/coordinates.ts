import type { Coordinate } from '../types/property';
export const toLocal = (point: Coordinate, origin: Coordinate): [number, number] => {
  const latScale = 111320;
  const lonScale = 111320 * Math.cos(origin.lat * Math.PI / 180);
  return [(point.lon - origin.lon) * lonScale, (point.lat - origin.lat) * latScale];
};
