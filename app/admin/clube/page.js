"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { useRouter } from "next/navigation";

export default function AdminClube() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  const [clube, setClube] = useState(null);
  const [form, setForm] = useState({
    nome: "",
    tipo_chave_pix: "email",
    chave_pix: "",
    banco_pix: "",
    ativo: true,
  });

  useEffect(() => {
    (async () => {
      setErro(null);
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push("/login");
        return;
      }

      // carrega o primeiro clube (ou o mais recente)
      const { data: c, error } = await supabase
        .from("clubes")
        .select("id, nome, tipo_chave_pix, chave_pix, banco_pix, ativo, criado_em")
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        setErro("Sem permissão para ler clubes (verifique RLS/admin).");
        setLoading(false);
        return;
      }

      if (!c) {
        setClube(null);
        setForm({
          nome: "Amigos do Paraíso",
          tipo_chave_pix: "email",
          chave_pix: "",
          banco_pix: "",
          ativo: true,
        });
        setLoading(false);
        return;
      }

      setClube(c);
      setForm({
        nome: c.nome || "",
        tipo_chave_pix: c.tipo_chave_pix || "email",
        chave_pix: c.chave_pix || "",
        banco_pix: c.banco_pix || "",
        ativo: !!c.ativo,
      });
      setLoading(false);
    })();
  }, [router]);

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({
      ...p,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function salvar(e) {
    e.preventDefault();
    setErro(null);
    setOk(null);

    if (!form.nome.trim()) return setErro("Informe o nome do clube.");
    if (!form.chave_pix.trim()) return setErro("Informe a chave PIX.");

    const payload = {
      nome: form.nome.trim(),
      tipo_chave_pix: form.tipo_chave_pix,
      chave_pix: form.chave_pix.trim(),
      banco_pix: form.banco_pix.trim() || null,
      ativo: !!form.ativo,
    };

    if (!clube) {
      const { data: created, error } = await supabase
        .from("clubes")
        .insert(payload)
        .select("*")
        .single();

      if (error) return setErro(error.message);
      setClube(created);
      setOk("Clube criado com sucesso ✅");
      return;
    }

    const { error } = await supabase
      .from("clubes")
      .update(payload)
      .eq("id", clube.id);

    if (error) return setErro(error.message);
    setOk("Dados do clube atualizados ✅");
  }

  if (loading) {
    return (
      <>
        <div className="bg"><div className="card"><h1>Clube</h1><p className="muted">Carregando…</p></div></div>
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
              <h1>Cadastro do Clube</h1>
              <p className="muted">Manutenção da chave PIX e dados do clube</p>
            </div>
            <button className="btnLight" onClick={() => router.push("/admin")}>Voltar</button>
          </div>

          {erro ? <div className="alert warn">{erro}</div> : null}
          {ok ? <div className="alert ok">{ok}</div> : null}

          <form onSubmit={salvar} className="grid">
            <div className="span2">
              <label>Nome do clube</label>
              <input name="nome" value={form.nome} onChange={onChange} placeholder="Amigos do Paraíso" />
            </div>

            <div>
              <label>Tipo da chave PIX</label>
              <select name="tipo_chave_pix" value={form.tipo_chave_pix} onChange={onChange}>
                <option value="email">Email</option>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="telefone">Telefone</option>
                <option value="evp">Aleatória (EVP)</option>
              </select>
            </div>

            <div>
              <label>Chave PIX</label>
              <input name="chave_pix" value={form.chave_pix} onChange={onChange} placeholder="ex: email@dominio.com" />
            </div>

            <div className="span2">
              <label>Banco / Observação (opcional)</label>
              <input name="banco_pix" value={form.banco_pix} onChange={onChange} placeholder="Ex: Conta Igreja / Banco X" />
            </div>

            <div className="span2 row">
              <label className="check">
                <input type="checkbox" name="ativo" checked={form.ativo} onChange={onChange} />
                Clube ativo
              </label>

              <button className="btn" type="submit">Salvar</button>
            </div>
          </form>

          <div className="note">
            Dica: manter o <strong>tipo_chave_pix</strong> ajuda a normalizar (CPF só números, telefone com +55, etc.).
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
        max-width: 920px;
        background: var(--card);
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: 18px;
        box-shadow: 0 25px 60px rgba(0,0,0,0.35);
        padding: 22px;
        backdrop-filter: blur(10px);
      }
      .top { display:flex; align-items:center; justify-content:space-between; gap: 10px; margin-bottom: 14px; }
      h1 { margin: 0; font-size: 22px; }
      .muted { color: var(--muted); font-size: 13px; margin: 6px 0 0 0; }

      label { display:block; font-size: 12px; color: var(--muted); margin: 6px 0; }
      input, select {
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

      .grid { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .span2 { grid-column: span 2; }

      .row { display:flex; justify-content:space-between; align-items:center; gap: 10px; margin-top: 6px; }
      .check { display:flex; align-items:center; gap: 10px; user-select:none; }

      .btn {
        background: linear-gradient(180deg, var(--primary), var(--primary2));
        color: white;
        border: none;
        padding: 12px 14px;
        border-radius: 12px;
        font-weight: 800;
        cursor: pointer;
        min-width: 220px;
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

      @media (max-width: 700px) {
        .grid { grid-template-columns: 1fr; }
        .span2 { grid-column: span 1; }
        .row { flex-direction: column; align-items: stretch; }
        .btn { min-width: 100%; }
      }
    `}</style>
  );
}
