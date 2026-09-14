export const calculateNDSM = (dsm: number, dem: number): number => dsm - dem;
export const floorHeight = (height: number, floors: number): number => floors > 0 ? height / floors : 0;
