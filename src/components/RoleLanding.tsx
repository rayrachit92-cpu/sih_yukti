import AnimatedButton from './AnimatedButton';
import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { UserRole } from './AuthPortal';

function downloadCitizenReport(citizenUlpIn: string, citizenParcel?: any) {
  const report = [
    '3D ULPIN — Citizen Building Report',
    'Generated: ' + new Date().toLocaleString(),
    '',
    `2D ULPIN: ${citizenUlpIn}`,
    `Property: ${citizenParcel?.name ?? 'Registered property'}`,
    `Property type: ${citizenParcel?.ownership?.category ?? citizenParcel?.building_type ?? '—'}`,
    `Status: ${citizenParcel?.conflict ? 'REVIEW REQUIRED' : 'VERIFIED'}`,
    `3D digital twin: Available`,
    'Data sources: KML/CSV + DEM/DSM',
    'Note: Underground structures are inferred unless directly supported by source records.'
  ].join('\n');
  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `ULPIN_Building_Report_${citizenUlpIn}.txt`; a.click(); URL.revokeObjectURL(url);
}

export default function RoleLanding({ role, name, ulpin, citizenParcel, onOpenWorkspace, onLogout }: { role: UserRole; name: string; ulpin?: string; citizenParcel?: any; onOpenWorkspace: (targetPage?: string) => void; onLogout: () => void }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => localStorage.getItem('ulpin-theme-v2') === 'dark' ? 'dark' : 'light');
  useEffect(() => { localStorage.setItem('ulpin-theme-v2', theme); document.documentElement.dataset.theme = theme; }, [theme]);
  const municipal = role === 'municipal';
  const government = role === 'government';
  const citizen = role === 'citizen';
  const citizenUlpIn = ulpin ?? citizenParcel?.ownership?.ulpin_2d ?? '—';

  if (citizen) return <div className={`role-landing citizen-landing landing-${theme}`}><div className="landing-aurora aurora-one"/><div className="landing-aurora aurora-two"/><div className="landing-grid"/>
    <div className="landing-top"><div className="brand"><div className="brand-mark">3D</div><div><div className="brand-name">3D ULPIN</div><div className="brand-sub">Citizen Property Portal</div></div></div><div className="landing-actions"><button className="landing-theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀ Light' : '◐ Dark'}</button><button onClick={onLogout}>Sign out</button></div></div>
    <div className="landing-hero"><div><div className="eyebrow">CITIZEN PROPERTY SERVICES</div><h1>Welcome, {name}</h1><p>Enter your registered ULPIN to access the matching parcel, building, floor and elevation records.</p></div><div className="citizen-status"><span>●</span> Property account active</div></div>
    <div className="citizen-grid">
      <section className="citizen-property-card"><div className="eyebrow">MY PROPERTY · ULPIN MATCHED RECORD</div><h2>{citizenUlpIn}</h2><p>{citizenParcel?.name ?? 'Registered property'} · {citizenParcel?.ownership?.category ?? citizenParcel?.building_type ?? 'Source parcel'}</p><div className="citizen-metrics"><div><span>2D ULPIN</span><b>{citizenUlpIn}</b></div><div><span>Owner</span><b>{citizenParcel?.ownership?.owner_name ?? '—'}</b></div><div><span>Floors</span><b>{citizenParcel?.floor_plan_floor_count ?? citizenParcel?.detected_floors ?? citizenParcel?.declared_floors ?? '—'}</b></div><div><span>Status</span><b className={citizenParcel?.conflict ? 'warn' : 'good'}>{citizenParcel?.conflict ? 'REVIEW REQUIRED' : 'VERIFIED'}</b></div></div><AnimatedButton onClick={() => onOpenWorkspace('2D Map')}>View 2D Property →</AnimatedButton></section>
      <section className="citizen-services"><div className="card-title">Property Services</div><div className="service-grid"><button onClick={() => onOpenWorkspace('2D Map')}><b>View Property</b><span>2D parcel + 3D twin</span></button><button><b>Request Update</b><span>Submit a correction request</span></button><button><b>Report an Issue</b><span>Flag a property concern</span></button><button onClick={() => downloadCitizenReport(citizenUlpIn, citizenParcel)}><b>Download Building Report</b><span>3D property, floors, ownership and validation summary</span></button></div></section>
      <section className="citizen-requests"><div className="card-title">My Requests</div><div className="request-row"><span>Property verification</span><b className="good">Completed</b></div><div className="request-row"><span>Ownership update</span><b>Pending</b></div><div className="request-row"><span>Document request</span><b className="good">Completed</b></div></section>
    </div>
  </div>;

  return <div className={`role-landing authority-landing landing-${theme}`}><div className="landing-aurora aurora-one"/><div className="landing-aurora aurora-two"/><div className="landing-grid"/>
    <div className="landing-top"><div className="brand"><div className="brand-mark">3D</div><div><div className="brand-name">3D ULPIN</div><div className="brand-sub">{municipal ? 'Municipal Authority Workspace' : 'Admin Intelligence Workspace'}</div></div></div><div className="landing-user"><span>{municipal ? '🏛️' : '🛡️'} {name}</span><div className="landing-actions"><button className="landing-theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☀ Light' : '◐ Dark'}</button><button onClick={onLogout}>Sign out</button></div></div></div>
    <div className="landing-hero authority-hero"><div><div className="eyebrow">{municipal ? 'MUNICIPAL PROPERTY OPERATIONS' : 'ADMIN PROPERTY INTELLIGENCE'}</div><h1>{municipal ? 'Manage and verify the local property fabric.' : 'Monitor property intelligence across jurisdictions.'}</h1><p>{municipal ? 'Operate the same core 2D/3D ULPIN workspace used for parcel verification, building reconstruction, AI screening and reporting.' : 'Use the common ULPIN workspace for 2D/3D GIS, validation and reporting, with a broader administrative view across municipalities and regions.'}</p></div><div className="scope-card"><span>ACCESS SCOPE</span><b>{municipal ? 'Assigned municipal area' : 'State / district / assigned regions'}</b><small>{municipal ? 'Operational property workflows' : 'Monitoring and comparative analytics'}</small></div></div>
    <div className="authority-kpis"><div><span>Properties</span><b>20</b><small>loaded source parcels</small></div><div><span>3D Buildings</span><b>18</b><small>reconstructed records</small></div><div><span>Validation</span><b>95%</b><small>source records passing checks</small></div>{municipal ? <div><span>Pending Reviews</span><b>12</b><small>local verification queue</small></div> : <div><span>Municipalities</span><b>08</b><small>assigned jurisdictions monitored</small></div>}</div>
    <div className="authority-content"><section className="workspace-card">{municipal ? <><div className="eyebrow">PRIMARY MUNICIPAL ACTION</div><h2>Add or update property data</h2><p className="landing-feature-lead">Start with state, district, city and ward. Then load an existing 2D ULPIN or draw a new parcel. Apartment records can include floor plans and underground information; residence houses stay as simple residence records.</p><div className="feature-grid"><div><b>01 · Land context</b><span>Capture jurisdiction and project land details.</span></div><div><b>02 · Parcel source</b><span>Load supplied KML/CSV or enter a new polygon.</span></div><div><b>03 · Building data</b><span>Add ownership, floors and apartment inventory.</span></div><div><b>04 · Underground</b><span>Record apartment basement/underground information as source data.</span></div></div><AnimatedButton onClick={() => onOpenWorkspace()}>Open Municipal Data Intake →</AnimatedButton></> : <><div className="eyebrow">ADMIN CONTROL CENTRE</div><h2>Monitor the ULPIN network</h2><div className="feature-grid"><div><b>2D / 3D GIS</b><span>Inspect the shared cadastral and digital-twin workspace.</span></div><div><b>Data quality</b><span>Compare validation and conflict trends.</span></div><div><b>AI intelligence</b><span>Review anomaly and subsurface screening.</span></div><div><b>Reports</b><span>Access broader administrative analytics.</span></div></div><AnimatedButton onClick={() => onOpenWorkspace()}>Open Admin Workspace →</AnimatedButton></>}</section><section className="scope-card large"><div className="eyebrow">ROLE SCOPE</div><h3>{municipal ? 'Nagar Palika' : 'Admin'}</h3><ul>{municipal ? <><li>Manage properties within assigned municipal jurisdiction</li><li>Verify parcel, floor and ownership records</li><li>Review AI-assisted conflicts and requests</li><li>Create and update local property records through the municipal intake</li></> : <><li>Monitor municipalities and assigned regions</li><li>Compare property and validation statistics</li><li>Review data-quality and AI screening trends</li><li>Access broader administrative reports</li></>}</ul></section></div>
  </div>;
}
