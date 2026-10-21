import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, BarChart3, Boxes, ClipboardList, ScanLine, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";
import { Button, Field } from "../components/ui";

const demo = [
  { label: "Yönetici", email: "yonetici@demo.com", text: "Tüm yetkiler" },
  { label: "Depo personeli", email: "depo@demo.com", text: "Hareket ve mal kabul" },
];

const features = [
  { icon: ArrowLeftRight, text: "Giriş, çıkış, depolar arası transfer ve sayım" },
  { icon: ClipboardList, text: "Satın alma siparişi ve kısmi mal kabulü" },
  { icon: BarChart3, text: "Stok değeri, hareket grafikleri, kritik stok uyarısı" },
  { icon: ScanLine, text: "Barkod okuyucu ve kamera ile hızlı ürün bulma" },
  { icon: ShieldCheck, text: "Rol bazlı yetki, her hareketin denetim izi" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent, creds?: { email: string; password: string }) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(creds?.email ?? email, creds?.password ?? password);
      navigate("/", { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-slate-900 p-12 text-white lg:flex lg:flex-col">
        <div className="absolute -left-24 -top-24 size-96 rounded-full bg-brand-600/40 blur-3xl" />
        <div className="absolute -bottom-32 right-0 size-96 rounded-full bg-violet-600/30 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 shadow-lg shadow-brand-600/40">
            <Boxes className="size-6" />
          </div>
          <span className="text-xl font-bold">Depom</span>
        </div>
        <div className="relative my-auto max-w-lg">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">Stoğunuz her an, her depoda kontrol altında.</h1>
          <p className="mt-4 text-lg text-slate-300">Birden fazla depo ile çalışan işletmeler için stok ve satın alma yönetimi.</p>
          <ul className="mt-10 space-y-4">
            {features.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-slate-200">
                <span className="grid size-9 place-items-center rounded-lg bg-white/10"><f.icon className="size-4" /></span>
                {f.text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-slate-500">ASP.NET Core 8 · EF Core · PostgreSQL · React</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-up">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid size-10 place-items-center rounded-xl bg-brand-600 text-white"><Boxes className="size-5" /></div>
            <span className="text-xl font-bold">Depom</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">Giriş yap</h2>
          <p className="mt-1 text-sm text-slate-500">Hesabınızla devam edin.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <Field label="E-posta">
              <input className="field" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label="Şifre">
              <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10">{error}</p>}
            <Button type="submit" loading={busy} className="w-full">Giriş yap</Button>
          </form>

          <div className="mt-8 rounded-2xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Demo hesapları</p>
            <div className="mt-3 grid gap-2">
              {demo.map((d) => (
                <button
                  key={d.email}
                  type="button"
                  disabled={busy}
                  onClick={(e) => submit(e, { email: d.email, password: "demo1234" })}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-left text-sm transition hover:border-brand-300 hover:bg-brand-50 dark:border-slate-800 dark:hover:bg-brand-500/10"
                >
                  <span>
                    <span className="block font-medium">{d.label}</span>
                    <span className="text-xs text-slate-500">{d.email}</span>
                  </span>
                  <span className="text-xs text-slate-400">{d.text}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
