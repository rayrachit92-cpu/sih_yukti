import { useMemo, useState } from 'react';
import AnimatedButton from './AnimatedButton';
import type { ParcelRecord } from '../types/ulpin';
import { saveMunicipalProperty } from '../data/api';

interface Props {
  parcels: ParcelRecord[];
  onSaved: () => Promise<ParcelRecord[]> | void;
  onSelect: (p: ParcelRecord) => void;
  onGenerate: (p: ParcelRecord) => void;
}

type UnitDraft = { floor_number: number; floor_label: string; unit_id: string; unit_type: string; bhk: string; owner_name: string; notes: string };

export default function MunicipalDataIntake({ parcels, onSaved, onSelect, onGenerate }: Props) {
  const [step, setStep] = useState(1);
  const [source, setSource] = useState<'existing' | 'new'>('existing');
  const [selectedName, setSelectedName] = useState(parcels.find(p => p.type === 'Polygon')?.name || '');
  const [form, setForm] = useState({
    state: 'Maharashtra', district: 'Pune', city: 'Pimpri-Chinchwad', ward: '', locality: '', land_name: '',
    category: 'apartment', owner_name: '', land_owner: '', bhk: '', floors: '1', underground: 'no', underground_levels: '0', underground_type: '',
    ulpin_2d: '', feature_name: '', polygon: '', notes: ''
  });
  const [units, setUnits] = useState<UnitDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const selected = useMemo(() => parcels.find(p => p.name === selectedName), [parcels, selectedName]);
  const apartments = form.category === 'apartment';

  const set = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));
  const addUnit = () => setUnits(prev => [...prev, { floor_number: 1, floor_label: 'Floor 1', unit_id: `UNIT-${prev.length + 1}`, unit_type: 'flat', bhk: '2BHK', owner_name: '', notes: '' }]);
  const updateUnit = (i: number, key: keyof UnitDraft, value: string | number) => setUnits(prev => prev.map((u, idx) => idx === i ? { ...u, [key]: value } : u));

  function chooseSource(next: 'existing' | 'new') {
    setSource(next);
    setStep(2);
    setMessage('');
    if (next === 'existing') {
      const p = parcels.find(x => x.name === selectedName) || parcels.find(x => x.type === 'Polygon');
      if (p) {
        setSelectedName(p.name);
        set('feature_name', p.name);
        set('ulpin_2d', p.ownership?.ulpin_2d || p.name);
        set('category', p.ownership?.category === 'independent_house' ? 'independent_house' : p.ownership?.category || 'apartment');
        set('owner_name', p.ownership?.owner_name || '');
        set('land_owner', p.ownership?.land_owner || '');
      }
    } else {
      set('feature_name', ''); set('ulpin_2d', '');
    }
  }

  async function submit() {
    if (!form.city || !form.state || !form.district || !form.land_name) { setMessage('Complete the land location fields first.'); return; }
    if (source === 'existing' && !selected) { setMessage('Select an existing 2D ULPIN parcel.'); return; }
    if (source === 'new' && form.polygon.trim().split(';').filter(Boolean).length < 3) { setMessage('Enter at least 3 lat,lon polygon points.'); return; }
    setSaving(true); setMessage('Saving municipal record to CSV…');
    try {
      const payload = {
        source, state: form.state, district: form.district, city: form.city, ward: form.ward, locality: form.locality,
        land_name: form.land_name, category: form.category, owner_name: form.owner_name, land_owner: form.land_owner,
        bhk: apartments ? '' : form.bhk, floors: Number(form.floors || 1), underground: apartments ? form.underground === 'yes' : false,
        underground_levels: apartments ? Number(form.underground_levels || 0) : 0, underground_type: apartments ? form.underground_type : '',
        ulpin_2d: source === 'existing' ? (selected?.ownership?.ulpin_2d || selected?.name || '') : form.ulpin_2d,
        feature_name: source === 'existing' ? (selected?.name || '') : form.feature_name,
        polygon: source === 'new' ? form.polygon : '', notes: form.notes, units: apartments ? units : []
      };
      const saved = await saveMunicipalProperty(payload);
      setMessage(`Saved ${saved.feature_name || saved.ulpin_2d || 'municipal property'} to the project CSV records.`);
      const refreshedData = await onSaved();
      const refreshed = Array.isArray(refreshedData) ? refreshedData.find(p => p.name === (saved.feature_name || '')) : undefined;
      if (refreshed) { onSelect(refreshed); onGenerate(refreshed); }
      setStep(4);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to save municipal data.'); }
    finally { setSaving(false); }
  }

  return <div className="municipal-intake">
    <div className="intake-hero"><div><div className="eyebrow">MUNICIPAL DATA INTAKE</div><h1>Build the property record from land upward.</h1><p>Enter jurisdiction and project land first. Then use an existing 2D ULPIN or draw a new parcel before adding building-specific data.</p></div><div className="intake-stepper">{[1,2,3,4].map(n => <span className={step >= n ? 'active' : ''} key={n}>0{n}</span>)}</div></div>

    {step === 1 && <section className="intake-card"><div className="eyebrow">01 · PROJECT LAND</div><h2>Where is this land?</h2><div className="intake-grid"><label>State<input value={form.state} onChange={e => set('state', e.target.value)} /></label><label>District<input value={form.district} onChange={e => set('district', e.target.value)} /></label><label>City / Municipal area<input value={form.city} onChange={e => set('city', e.target.value)} /></label><label>Ward / Zone<input value={form.ward} onChange={e => set('ward', e.target.value)} placeholder="e.g. Ward 12" /></label><label>Locality / Village<input value={form.locality} onChange={e => set('locality', e.target.value)} /></label><label>Project land name<input value={form.land_name} onChange={e => set('land_name', e.target.value)} placeholder="e.g. Riverside Residential Parcel" /></label></div><AnimatedButton onClick={() => setStep(2)}>Continue to parcel source →</AnimatedButton></section>}

    {step === 2 && <section className="intake-card"><div className="eyebrow">02 · PARCEL SOURCE</div><h2>Use existing 2D ULPIN or add a new polygon.</h2><div className="source-choice-grid"><button className={source === 'existing' ? 'selected' : ''} onClick={() => chooseSource('existing')}><b>Load existing 2D ULPIN</b><span>Use the supplied KML/CSV parcel geometry.</span></button><button className={source === 'new' ? 'selected' : ''} onClick={() => chooseSource('new')}><b>Enter new polygon</b><span>Create a municipal parcel from latitude/longitude points.</span></button></div>{source === 'existing' ? <div className="intake-grid"><label>Existing parcel<select value={selectedName} onChange={e => { setSelectedName(e.target.value); const p=parcels.find(x=>x.name===e.target.value); if(p){set('feature_name',p.name);set('ulpin_2d',p.ownership?.ulpin_2d||p.name);set('category',p.ownership?.category==='independent_house'?'independent_house':p.ownership?.category||'apartment');set('owner_name',p.ownership?.owner_name||'');} }}><option value="">Select parcel</option>{parcels.filter(p=>p.type==='Polygon').map(p=><option value={p.name} key={p.name}>{p.name} · {p.ownership?.ulpin_2d || p.name}</option>)}</select></label><div className="intake-source-summary">{selected ? <><b>{selected.name}</b><span>Source geometry: KML/CSV</span><span>Current category: {selected.building_type || '—'}</span></> : <span>Select a parcel.</span>}</div></div> : <div className="intake-grid"><label>New feature name<input value={form.feature_name} onChange={e => set('feature_name', e.target.value)} placeholder="NEW-ULPIN-001" /></label><label>2D ULPIN (optional)<input value={form.ulpin_2d} onChange={e => set('ulpin_2d', e.target.value)} placeholder="MH..." /></label><label className="wide">Polygon coordinates<input value={form.polygon} onChange={e => set('polygon', e.target.value)} placeholder="18.6710,73.8906; 18.6711,73.8907; 18.6710,73.8908" /></label></div>}<div className="intake-actions"><button onClick={() => setStep(1)}>← Back</button><AnimatedButton onClick={() => setStep(3)}>Continue to property data →</AnimatedButton></div></section>}

    {step === 3 && <section className="intake-card"><div className="eyebrow">03 · BUILDING DATA</div><h2>{apartments ? 'Apartment / multi-unit details' : 'Residence house details'}</h2><div className="intake-grid"><label>Property category<select value={form.category} onChange={e => set('category', e.target.value)}><option value="apartment">Apartment</option><option value="independent_house">Residence house</option><option value="shop_complex_with_basement">Commercial / shop complex</option><option value="vacant_land">Vacant land</option></select></label><label>Owner name<input value={form.owner_name} onChange={e => set('owner_name', e.target.value)} /></label><label>Land owner<input value={form.land_owner} onChange={e => set('land_owner', e.target.value)} /></label><label>Above-ground floors<input type="number" min="1" value={form.floors} onChange={e => set('floors', e.target.value)} /></label>{!apartments && <label>BHK / residence type<input value={form.bhk} onChange={e => set('bhk', e.target.value)} placeholder="e.g. 2BHK" /></label>}{apartments && <><label>Underground structure<select value={form.underground} onChange={e => set('underground', e.target.value)}><option value="no">No direct record</option><option value="yes">Yes — add underground record</option></select></label>{form.underground === 'yes' && <><label>Underground levels<input type="number" min="1" value={form.underground_levels} onChange={e => set('underground_levels', e.target.value)} /></label><label>Underground type<input value={form.underground_type} onChange={e => set('underground_type', e.target.value)} placeholder="Basement / Parking / Shops" /></label></>}</>}<label className="wide">Notes<textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Municipal verification notes" /></label></div>{apartments && <div className="unit-editor"><div className="unit-editor-head"><div><div className="eyebrow">FLOOR PLAN INVENTORY</div><b>Add apartment units/floor-plan records</b></div><button onClick={addUnit}>+ Add unit</button></div>{units.map((u,i)=><div className="unit-row" key={i}><input value={u.unit_id} onChange={e=>updateUnit(i,'unit_id',e.target.value)} placeholder="Unit ID"/><input type="number" value={u.floor_number} onChange={e=>updateUnit(i,'floor_number',Number(e.target.value))}/><input value={u.floor_label} onChange={e=>updateUnit(i,'floor_label',e.target.value)} placeholder="Floor 1"/><input value={u.unit_type} onChange={e=>updateUnit(i,'unit_type',e.target.value)} placeholder="Flat / shop"/><input value={u.bhk} onChange={e=>updateUnit(i,'bhk',e.target.value)} placeholder="2BHK"/><input value={u.owner_name} onChange={e=>updateUnit(i,'owner_name',e.target.value)} placeholder="Unit owner"/></div>)}</div>}{!apartments && <div className="residence-note">Residence houses use one simple residence record instead of apartment-style unit/floor-plan subdivision.</div>}<div className="intake-actions"><button onClick={() => setStep(2)}>← Back</button><AnimatedButton onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save municipal property →'}</AnimatedButton></div>{message&&<div className="intake-message">{message}</div>}</section>}

    {step === 4 && <section className="intake-card success-intake"><div className="success-icon">✓</div><div className="eyebrow">RECORD SAVED</div><h2>Municipal property record updated.</h2><p>The location, parcel source, ownership/building data and apartment inventory were written to the project CSV records. You can now inspect the 2D parcel or generate its 3D digital twin.</p><div className="intake-actions"><AnimatedButton onClick={() => setStep(1)}>Add another property</AnimatedButton><button onClick={() => selected && onGenerate(selected)}>Generate 3D selected parcel →</button></div><div className="intake-message">{message}</div></section>}
  </div>;
}
