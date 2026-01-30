"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../src/lib/supabase";
import { useRouter } from "next/navigation";

export default function AdminHome() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [me, setMe] = useState(null);

  useEffect(() => {
    (async () => {
      setErro(null);
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push("/login");
        return;
      }

      const userId = data.session.user.id;
      const { data: u, error } = await supabase
        .from("usuarios")
        .select("nome, email, perfil, auth_user_id")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (error) {
        setErro(
          "Sem permissão (RLS). Verifique se você está cadastrado em usuarios como admin."
        );
        setLoading(false);
        return;
      }

      if (!u || u.perfil !== "admin") {
        setErro("Seu usuário não está autorizado como ADMIN na tabela usuarios.");
        setLoading(false);
        return;
      }

      setMe(u);
      setLoading(false);
    })();
  }, [router]);

  async function sair() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <>
        <div className="bg">
          <div className="card">
            <h1>Admin</h1>
            <p className="muted">Carregando…</p>
          </div>
        </div>
        <Style />
      </>
    );
  }

  if (erro) {
    return (
      <>
        <div className="bg">
          <div className="card">
            <h1>Admin</h1>
            <div className="alert warn">{erro}</div>
            <button className="btn" onClick={sair}>
              Sair
            </button>
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
          <div className="top">
            <div>
              <h1>Painel Admin</h1>
              <p className="muted">
                Logado como <strong>{me.nome || me.email}</strong> • perfil{" "}
                {me.perfil}
              </p>
            </div>
            <button className="btnLight" onClick={sair}>
              Sair
            </button>
          </div>

          <div className="grid">
            <button className="tile" onClick={() => router.push("/admin/clubes")}>
              <div className="tTitle">Clubes</div>
              <div className="tDesc">Cadastrar e manter clubes + chave PIX</div>
            </button>

            <button
              className="tile"
              onClick={() => router.push("/admin/campanhas")}
            >
              <div className="tTitle">Campanhas</div>
              <div className="tDesc">
                Criar/ativar campanhas, valores e identificador
              </div>
            </button>

            <button className="tile" onClick={() => router.push("/admin/sabores")}>
              <div className="tTitle">Sabores</div>
              <div className="tDesc">Cadastrar sabores por campanha</div>
            </button>

            <button className="tile" onClick={() => router.push("/admin/pedidos")}>
              <div className="tTitle">Pedidos</div>
              <div className="tDesc">Listar, buscar, exportar e mudar status</div>
            </button>

            <button
              className="tile"
              onClick={() => router.push("/admin/pagamentos")}
            >
              <div className="tTitle">Conciliação PIX</div>
              <div className="tDesc">
                Conferir extrato e marcar pedidos como pagos
              </div>
            </button>

            {/* ✅ NOVO TILE */}
            <button
              className="tile"
              onClick={() => router.push("/admin/pagamentos/historico")}
            >
              <div className="tTitle">Histórico PIX</div>
              <div className="tDesc">
                Auditoria e exportação de pagamentos conciliados
              </div>
            </button>

            {/* ✅ NOVO TILE */}
            <button
              className="tile"
              onClick={() => router.push("/admin/relatorios/producao")}
            >
              <div className="tTitle">Relatório de Produção</div>
              <div className="tDesc">
                Totais por sabor para enviar ao fornecedor
              </div>
            </button>

            <button className="tile" onClick={() => router.push("/")}>
              <div className="tTitle">Página Pública</div>
              <div className="tDesc">Voltar para pedidos da campanha</div>
            </button>
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
        max-width: 980px;
        background: var(--card);
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: 18px;
        box-shadow: 0 25px 60px rgba(0,0,0,0.35);
        padding: 22px;
        backdrop-filter: blur(10px);
      }
      h1 { margin: 0; font-size: 22px; }
      .muted { color: var(--muted); font-size: 13px; margin: 6px 0 0 0; }
      .top { display:flex; align-items:center; justify-content:space-between; gap: 10px; margin-bottom: 14px; }

      .grid {
        display:grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
      }
      .tile {
        text-align: left;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.8);
        border-radius: 14px;
        padding: 14px;
        cursor: pointer;
        transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
      }
      .tile:hover {
        transform: translateY(-2px);
        border-color: rgba(37,99,235,0.28);
        box-shadow: 0 14px 26px rgba(15,23,42,0.12);
      }
      .tTitle { font-weight: 900; }
      .tDesc { margin-top: 6px; font-size: 12px; color: var(--muted); }

      .btn {
        background: linear-gradient(180deg, var(--primary), var(--primary2));
        color: white;
        border: none;
        padding: 12px 14px;
        border-radius: 12px;
        font-weight: 800;
        cursor: pointer;
      }
      .btnLight {
        background: rgba(15,23,42,0.06);
        color: #0f172a;
        border: 1px solid rgba(15,23,42,0.12);
        padding: 10px 12px;
        border-radius: 12px;
        font-weight: 800;
        cursor: pointer;
      }
      .alert {
        border-radius: 12px;
        padding: 10px 12px;
        border: 1px solid rgba(245,158,11,0.35);
        background: rgba(245, 158, 11, 0.16);
        margin: 12px 0;
        font-size: 13px;
      }
      @media (max-width: 760px) {
        .grid { grid-template-columns: 1fr; }
        .top { flex-direction: column; align-items: stretch; }
      }
    `}</style>
  );
}
