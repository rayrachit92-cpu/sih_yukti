import { useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import Papa from 'papaparse';
import { motion, AnimatePresence } from 'framer-motion';

export type UserRole = 'municipal' | 'government' | 'citizen';

const roles = [
  { id: 'municipal' as UserRole, icon: '🏛️', title: 'Nagar Palika', subtitle: 'Municipal Authority', detail: 'Manage properties, verification, 2D/3D GIS and local reports.' },
  { id: 'government' as UserRole, icon: '🛡️', title: 'Admin', subtitle: 'Government Administration', detail: 'Monitor jurisdictions, data quality, analytics, validation and reports.' },
  { id: 'citizen' as UserRole, icon: '👤', title: 'Citizen', subtitle: 'Citizen Property Portal', detail: 'View your property, 3D record and submit service requests.' },
];

const demoCredentials: Record<Exclude<UserRole, 'citizen'>, { email: string; password: string }> = {
  municipal: { email: 'municipal@ulpin.gov', password: 'ULPIN@123' },
  government: { email: 'admin@ulpin.gov', password: 'ULPIN@123' },
};

export default function AuthPortal({ onLogin }: { onLogin: (role: UserRole, name: string, ulpin?: string) => void }) {
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [citizenUlpIn, setCitizenUlpIn] = useState('');
  const [checkingUlpIn, setCheckingUlpIn] = useState(false);
  const [error, setError] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('ulpin-theme-v2');
    return saved === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    localStorage.setItem('ulpin-theme-v2', theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const role = roles.find(r => r.id === selectedRole);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selectedRole) return;

    if (selectedRole === 'citizen') {
      const value = citizenUlpIn.trim().toUpperCase();
      if (!value) {
        setError('Enter your 2D ULPIN to continue.');
        return;
      }
      setCheckingUlpIn(true);
      setError('');
      try {
        const response = await fetch('/data/ulpin_2d_ownership_final.csv');
        if (!response.ok) throw new Error('Unable to load the ULPIN registry.');
        const csv = await response.text();
        const parsed = Papa.parse<{ ulpin_2d?: string; feature_name?: string; owner_name?: string }> (csv, { header: true, skipEmptyLines: true });
        const match = (parsed.data || []).find(row => String(row.ulpin_2d ?? '').trim().toUpperCase() === value);
        if (!match) {
          setError('ULPIN not found in the registered property dataset. Please enter a valid 2D ULPIN.');
          return;
        }
        const name = 'Citizen';
        onLogin('citizen', name, value);
      } catch {
        setError('Unable to verify the ULPIN registry. Make sure the application is running correctly.');
      } finally {
        setCheckingUlpIn(false);
      }
      return;
    }

    const demo = demoCredentials[selectedRole];
    if (email.trim().toLowerCase() === demo.email && password === demo.password) {
      const name = selectedRole === 'municipal' ? 'Municipal Officer' : 'Admin';
      onLogin(selectedRole, name);
      return;
    }
    setError('Invalid demo credentials. Use the credentials shown below the form.');
  }

  return <div className={`auth-screen auth-${theme}`}>
    <div className="auth-aurora aurora-one" />
    <div className="auth-aurora aurora-two" />
    <div className="auth-grid" />
    <div className="auth-particles" aria-hidden="true">
      {Array.from({ length: 18 }).map((_, i) => <span key={i} style={{ '--i': i } as CSSProperties} />)}
    </div>
    <div className="auth-theme-actions">
      <button className="auth-theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
        {theme === 'dark' ? '☀ Light' : '◐ Dark'}
      </button>
    </div>
    <motion.div className="auth-shell" initial={{ opacity: 0, y: 24, scale: .985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .55, ease: 'easeOut' }}>
      <div className="auth-brand">
        <motion.div className="auth-brand-mark" animate={{ rotate: [0, 2, -2, 0], y: [0, -2, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}>3D</motion.div>
        <div><b>3D ULPIN</b><span>Unified 3D Land & Property Intelligence Platform</span></div>
      </div>
      <div className="auth-heading"><div className="eyebrow">SECURE DIGITAL PROPERTY ACCESS</div><h1>One platform. Three intelligent experiences.</h1><p>Choose your role to enter the ULPIN digital twin workspace, with 2D GIS, 3D property intelligence and AI-assisted validation.</p></div>
      <AnimatePresence mode="wait">
      {!selectedRole ? <motion.div key="roles" className="role-grid" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: .25 }}>
        {roles.map((r, i) => <motion.button key={r.id} className={`role-card role-${r.id}`} onClick={() => { setSelectedRole(r.id); setEmail(r.id === 'citizen' ? '' : demoCredentials[r.id].email); setPassword(r.id === 'citizen' ? '' : demoCredentials[r.id].password); setCitizenUlpIn(''); setError(''); }} whileHover={{ y: -8, scale: 1.012 }} whileTap={{ scale: .985 }} transition={{ duration: .2 }}>
          <div className="role-glow" />
          <div className="role-number">0{i + 1}</div><div className="role-icon">{r.icon}</div><div className="role-copy"><h2>{r.title}</h2><strong>{r.subtitle}</strong><p>{r.detail}</p></div><span className="role-arrow">↗</span>
        </motion.button>)}
      </motion.div> : <motion.div key="login" className="login-panel" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: .25 }}>
        <button className="back-role" onClick={() => { setSelectedRole(null); setEmail(''); setPassword(''); setError(''); }}>← Change role</button>
        <div className="selected-role"><div className="role-icon">{role?.icon}</div><div><div className="eyebrow">SELECTED ROLE</div><h2>{role?.title}</h2><span>{role?.subtitle}</span></div></div>
        <form onSubmit={submit}>
          {selectedRole === 'citizen' ? <>
            <label>2D ULPIN<input value={citizenUlpIn} onChange={e => setCitizenUlpIn(e.target.value.toUpperCase())} placeholder="Enter your 2D ULPIN" autoComplete="off" spellCheck={false} /></label>
            <div className="ulpin-login-note">Enter the ULPIN registered in the official property dataset. Your citizen workspace will show only the records matched to this ULPIN.</div>
          </> : <>
            <label>Official email / User ID<input value={email} onChange={e => setEmail(e.target.value)} placeholder={demoCredentials[selectedRole].email} autoComplete="username" /></label>
            <label>Password<input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Enter password" autoComplete="current-password" /></label>
          </>}
          {error && <div className="auth-error">{error}</div>}
          <motion.button className="login-submit" type="submit" disabled={checkingUlpIn} whileHover={{ y: -2 }} whileTap={{ scale: .985 }}>{checkingUlpIn ? 'Verifying ULPIN…' : selectedRole === 'citizen' ? 'Open Citizen Property →' : `Sign in to ${role?.title}`} <span>→</span></motion.button>
        </form>
        {selectedRole !== 'citizen' && <div className="demo-credentials"><b>Demo access</b><span>Email: {demoCredentials[selectedRole].email}</span><span>Password: {demoCredentials[selectedRole].password}</span></div>}
      </motion.div>}
      </AnimatePresence>
      <div className="auth-footer"><span>● ULPIN INTELLIGENCE</span><span>DEM/DSM · KML/CSV · 3D DIGITAL TWIN · AI</span><span>ROLE-BASED ACCESS</span></div>
    </motion.div>
  </div>;

}
