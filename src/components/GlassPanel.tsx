import type { ReactNode } from 'react';
export function GlassPanel({children,className='' }:{children:ReactNode;className?:string}){return <div className={`rounded-2xl border border-cyan-400/15 bg-slate-950/70 backdrop-blur-xl shadow-2xl ${className}`}>{children}</div>}
