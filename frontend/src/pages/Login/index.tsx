import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Anchor, LockKeyhole, Mail } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

export default function LoginPage() {
  const { login, isAuthenticated, authLoading } = useAppContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!authLoading && isAuthenticated) return <Navigate to="/dosya-takip" replace />;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await login(email, password);
      const state = location.state as { from?: string } | null;
      navigate(state?.from || '/dosya-takip', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Giriş yapılamadı.');
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center px-5">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-sidebar flex items-center justify-center"><Anchor size={23} className="text-accent-light" /></div>
          <div><h1 className="text-[21px] font-extrabold text-text-strong">Export Declaration</h1><p className="text-[12.5px] text-muted">Gümrük operasyon yönetimi</p></div>
        </div>

        <form onSubmit={submit} className="bg-surface border border-line rounded-2xl shadow-sm p-6">
          <h2 className="text-[18px] font-bold text-text-strong">Kullanıcı Girişi</h2>
          <p className="text-[12.5px] text-muted mt-1 mb-5">Devam etmek için e-posta adresiniz ve şifrenizle giriş yapın.</p>

          <label className="block text-[11px] uppercase tracking-wide font-semibold text-muted mb-1.5">E-posta</label>
          <div className="relative mb-4"><Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"/><input autoFocus type="email" autoComplete="username" value={email} onChange={(e)=>setEmail(e.target.value)} className="w-full h-10 pl-9 pr-3 border border-line-strong rounded-lg bg-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint text-[13px]" placeholder="kullanici@firma.com" required /></div>

          <label className="block text-[11px] uppercase tracking-wide font-semibold text-muted mb-1.5">Şifre</label>
          <div className="relative"><LockKeyhole size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"/><input type="password" autoComplete="current-password" value={password} onChange={(e)=>setPassword(e.target.value)} className="w-full h-10 pl-9 pr-3 border border-line-strong rounded-lg bg-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-tint text-[13px]" required /></div>

          {error && <div className="mt-4 px-3 py-2.5 rounded-lg border border-red-200 bg-red-50 text-red-700 text-[12px]">{error}</div>}
          <button disabled={loading} className="mt-5 w-full h-10 rounded-lg bg-accent text-white text-[13px] font-bold hover:opacity-90 disabled:opacity-60">{loading ? 'Giriş yapılıyor…' : 'Giriş Yap'}</button>
        </form>
      </div>
    </div>
  );
}
