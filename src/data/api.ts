import type { GeneratedProperty, ParcelRecord } from '../types/ulpin';

const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

export async function getParcels(): Promise<ParcelRecord[]> {
  const res = await fetch(`${API_BASE}/ulpins`);
  if (!res.ok) throw new Error(`Backend error ${res.status}`);
  return res.json();
}

export async function generateProperty(name: string): Promise<GeneratedProperty> {
  const res = await fetch(`${API_BASE}/ulpins/${encodeURIComponent(name)}/generate`, { method: 'POST' });
  if (!res.ok) throw new Error(`Generation failed (${res.status})`);
  return res.json();
}

export { API_BASE };
