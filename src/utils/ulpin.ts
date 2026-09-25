export const make3DULPIN = (parcelId: string, floor: number, unit = 1) => `${parcelId}-B01-F${String(floor).padStart(2,'0')}-U${String(unit).padStart(2,'0')}`;
