import type { GeneratedProperty, ParcelRecord, UndergroundAIResult } from '../types/ulpin';

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

export async function analyzeUnderground(name: string): Promise<UndergroundAIResult> {
  const res = await fetch(`${API_BASE}/ai/underground?name=${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`AI analysis failed (${res.status})`);
  return res.json();
}

export async function saveMunicipalProperty(payload: any): Promise<any> {
  const res = await fetch(`${API_BASE}/municipal/property`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Municipal save failed (${res.status})`);
  }
  return res.json();
}
