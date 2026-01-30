"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../src/lib/supabase";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session) router.push("/admin");
      setLoading(false);
    })();
  }, [router]);

  async function entrar(e) {
    e.preventDefault();
    setErro(null);
    setOk(null);

    const em = email.trim().toLowerCase();
    if (!em || !senha) {
      setErro("Informe email e senha.");
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: em,
      password: senha,
    });

    if (error) {
      setErro(error.message);
      return;
    }

    setOk("Logado com sucesso!");
    router.push("/admin");
  }

  if (loading) {
    return (
      <>
        <div className="bg">
          <div className="card">
            <h1>Entrar</h1>
            <p className="muted">Carregando…</p>
          </div>
        </div>
        <Style />
      </>
    );
  }

  return (
    <>
      <div className="bg">
        <div className="card">
          <div className="brand">
            <div className="logo">🔒</div>
            <div>
              <h1>Área Administrativa</h1>
              <p className="muted">Desbrava Pizza • Amigos do Paraíso</p>
            </div>
          </div>

          {erro ? <div className="alert warn">{erro}</div> : null}
          {ok ? <div className="alert ok">{ok}</div> : null}

          <form onSubmit={entrar} className="form">
            <label>Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@exemplo.com"
              autoComplete="email"
            />

            <label>Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />

            <button className="btn" type="submit">
              Entrar
            </button>
          </form>

          <div className="note">
            * Para segurança, o acesso Admin depende de autorização na tabela <strong>usuarios</strong> (perfil admin).
          </div>
        </div>
      </div>

      <Style />
    </>
  );
}

function Style() {
  return (
    <style jsx global>{`
      :root {
        --card: rgba(255, 255, 255, 0.92);
        --text: #0f172a;
        --muted: #475569;
        --line: rgba(15, 23, 42, 0.12);
        --primary: #2563eb;
        --primary2: #1d4ed8;
      }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--text); }
      .bg {
        min-height: 100vh;
        background: radial-gradient(1200px 600px at 20% 10%, rgba(37, 99, 235, 0.45), transparent 60%),
                    radial-gradient(1000px 500px at 90% 30%, rgba(245, 158, 11, 0.35), transparent 60%),
                    linear-gradient(180deg, #0b1220, #0f172a 60%, #0b1220);
        padding: 28px 16px;
        display: grid;
        place-items: center;
      }
      .card {
        width: 100%;
        max-width: 520px;
        background: var(--card);
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: 18px;
        box-shadow: 0 25px 60px rgba(0,0,0,0.35);
        padding: 22px;
        backdrop-filter: blur(10px);
      }
      .brand { display:flex; align-items:center; gap:12px; margin-bottom: 14px; }
      .logo {
        width: 44px; height: 44px; border-radius: 14px;
        background: rgba(37, 99, 235, 0.14);
        display:grid; place-items:center;
      }
      h1 { margin: 0; font-size: 20px; }
      .muted { color: var(--muted); font-size: 13px; margin: 4px 0 0 0; }
      .form { display:flex; flex-direction:column; gap:10px; margin-top: 12px; }
      label { font-size: 12px; color: var(--muted); }
      input {
        width: 100%;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.9);
        border-radius: 12px;
        padding: 12px;
        font-size: 14px;
        outline: none;
        color: #0f172a;
        -webkit-text-fill-color: #0f172a;
        caret-color: #0f172a;
      }
      .btn {
        margin-top: 6px;
        background: linear-gradient(180deg, var(--primary), var(--primary2));
        color: white;
        border: none;
        padding: 12px 14px;
        border-radius: 12px;
        font-weight: 800;
        cursor: pointer;
      }
      .alert {
        border-radius: 12px;
        padding: 10px 12px;
        border: 1px solid rgba(15,23,42,0.12);
        margin: 10px 0;
        font-size: 13px;
      }
      .alert.warn { background: rgba(245, 158, 11, 0.16); border-color: rgba(245,158,11,0.35); }
      .alert.ok { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.22); }
      .note {
        margin-top: 12px;
        font-size: 12px;
        color: var(--muted);
        background: rgba(15,23,42,0.04);
        border: 1px solid rgba(15,23,42,0.08);
        padding: 10px 12px;
        border-radius: 12px;
      }
    `}</style>
  );
}
