"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { useRouter } from "next/navigation";

export default function AdminOrganizacoes() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  const [organizacoes, setOrganizacoes] = useState([]);

  // edição
  const [editandoId, setEditandoId] = useState(null); // null = criando novo
  const [form, setForm] = useState({
    nome: "",
    tipo_chave_pix: "email",
    chave_pix: "",
    banco_pix: "",
    identificador_pix: "", // ✅ NOVO
    ativo: true,
  });

  const tituloForm = useMemo(() => (editandoId ? "Editar organização" : "Nova organização"), [editandoId]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push("/login");
        return;
      }
      await carregarClubes();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarClubes() {
    setLoading(true);
    setErro(null);
    setOk(null);

    const { data, error } = await supabase
      .from("organizacoes")
      .select("id, nome, tipo_chave_pix, chave_pix, banco_pix, identificador_pix, ativo, criado_em") // ✅ NOVO
      .order("criado_em", { ascending: false });

    if (error) {
      console.error(error);
      setErro("Erro ao carregar organizacoes (verifique RLS/admin).");
      setLoading(false);
      return;
    }

    setOrganizacoes(data || []);
    setLoading(false);
  }

  function novo() {
    setErro(null);
    setOk(null);
    setEditandoId(null);
    setForm({
      nome: "",
      tipo_chave_pix: "email",
      chave_pix: "",
      banco_pix: "",
      identificador_pix: "", // ✅ NOVO
      ativo: true,
    });
  }

  function editar(c) {
    setErro(null);
    setOk(null);
    setEditandoId(c.id);
    setForm({
      nome: c.nome || "",
      tipo_chave_pix: c.tipo_chave_pix || "email",
      chave_pix: c.chave_pix || "",
      banco_pix: c.banco_pix || "",
      identificador_pix: c.identificador_pix || "", // ✅ NOVO
      ativo: !!c.ativo,
    });
  }

  function onChange(e) {
    const { name, value, type, checked } = e.target;

    // ✅ Identificador PIX: não permitir espaços
    if (name === "identificador_pix") {
      const semEspaco = String(value || "").replace(/\s+/g, "");
      setForm((p) => ({ ...p, identificador_pix: semEspaco }));
      return;
    }

    setForm((p) => ({
      ...p,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function salvar(e) {
    e.preventDefault();
    setErro(null);
    setOk(null);

    const nome = String(form.nome || "").trim();
    const chave = String(form.chave_pix || "").trim();

    if (!nome) return setErro("Informe o nome do clube.");
    if (!chave) return setErro("Informe a chave PIX.");

    const identificadorPix = String(form.identificador_pix || "")
      .replace(/\s+/g, "")
      .trim();

    // ✅ se vier preenchido, valida (sem espaço e tamanho <= 25 pro TXID)
    if (identificadorPix && identificadorPix.length > 25) {
      return setErro("Identificador PIX deve ter no máximo 25 caracteres (regra do TXID).");
    }

    const payload = {
      nome,
      tipo_chave_pix: form.tipo_chave_pix || null,
      chave_pix: chave,
      banco_pix: String(form.banco_pix || "").trim() || null,
      identificador_pix: identificadorPix || null, // ✅ NOVO
      ativo: !!form.ativo,
    };

    if (!editandoId) {
      const { error } = await supabase.from("organizacoes").insert(payload);
      if (error) return setErro(error.message);

      setOk("Clube criado ✅");
      await carregarClubes();
      novo();
      return;
    }

    const { error } = await supabase.from("organizacoes").update(payload).eq("id", editandoId);
    if (error) return setErro(error.message);

    setOk("Clube atualizado ✅");
    await carregarClubes();
  }

  async function alternarAtivo(c) {
    setErro(null);
    setOk(null);

    const { error } = await supabase.from("organizacoes").update({ ativo: !c.ativo }).eq("id", c.id);
    if (error) return setErro(error.message);

    setOk(`Clube ${!c.ativo ? "ativado" : "desativado"} ✅`);
    await carregarClubes();
  }

  async function remover(c) {
    const confirmar = confirm(
      `Remover o clube "${c.nome}"?\n\nATENÇÃO: Se existir campanha vinculada, pode dar erro de chave estrangeira (o que é bom, evita apagar por engano).`
    );
    if (!confirmar) return;

    setErro(null);
    setOk(null);

    const { error } = await supabase.from("organizacoes").delete().eq("id", c.id);
    if (error) return setErro(error.message);

    setOk("Clube removido ✅");
    if (editandoId === c.id) novo();
    await carregarClubes();
  }

  if (loading) {
    return (
      <>
        <div className="bg">
          <div className="card">
            <h1>Clubes</h1>
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
          <div className="top">
            <div>
              <h1>Cadastro de Clubes</h1>
              <p className="muted">Mantenha os dados do clube, chave PIX e o TXID (identificador PIX)</p>
            </div>

            <div className="topRight">
              <button className="btnLight" onClick={() => router.push("/admin")}>
                Voltar
              </button>
              <button className="btn" onClick={novo}>
                Nova organização
              </button>
            </div>
          </div>

          {erro ? <div className="alert warn">{erro}</div> : null}
          {ok ? <div className="alert ok">{ok}</div> : null}

          <div className="grid">
            <div className="panel">
              <div className="panelTitle">Lista</div>

              {organizacoes.length === 0 ? (
                <div className="empty">Nenhum clube cadastrado.</div>
              ) : (
                <div className="list">
                  {organizacoes.map((c) => (
                    <div key={c.id} className="rowItem">
                      <div>
                        <div className="rowTitle">
                          {c.nome}{" "}
                          {c.ativo ? (
                            <span className="pill ok">ATIVO</span>
                          ) : (
                            <span className="pill">inativo</span>
                          )}
                        </div>

                        <div className="rowSub">
                          PIX: <strong>{c.tipo_chave_pix || "—"}</strong> •{" "}
                          <span className="mono">{c.chave_pix}</span>
                          {c.banco_pix ? (
                            <>
                              {" "}
                              • <span className="muted2">{c.banco_pix}</span>
                            </>
                          ) : null}
                        </div>

                        {/* ✅ NOVO: Identificador PIX */}
                        <div className="rowSub" style={{ marginTop: 6 }}>
                          TXID (Identificador PIX):{" "}
                          <strong className="mono">{c.identificador_pix || "PizzaAmigosParaiso (padrão)"}</strong>
                        </div>
                      </div>

                      <div className="rowBtns">
                        <button className="btnMini" onClick={() => editar(c)}>
                          Editar
                        </button>
                        <button className="btnMini" onClick={() => alternarAtivo(c)}>
                          {c.ativo ? "Desativar" : "Ativar"}
                        </button>
                        <button className="btnMini danger" onClick={() => remover(c)}>
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel">
              <div className="panelTitle">{tituloForm}</div>

              <form onSubmit={salvar} className="form">
                <label>Nome do clube</label>
                <input name="nome" value={form.nome} onChange={onChange} placeholder="Ex: Amigos do Paraíso" />

                <div className="grid2">
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
                    <label>Clube ativo</label>
                    <label className="check">
                      <input type="checkbox" name="ativo" checked={form.ativo} onChange={onChange} />
                      Ativo
                    </label>
                  </div>
                </div>

                <label>Chave PIX</label>
                <input
                  name="chave_pix"
                  value={form.chave_pix}
                  onChange={onChange}
                  placeholder="Ex: email@dominio.com"
                />

                <label>Banco/observação (opcional)</label>
                <input
                  name="banco_pix"
                  value={form.banco_pix}
                  onChange={onChange}
                  placeholder="Ex: Conta Igreja / Banco X"
                />

                {/* ✅ NOVO: Identificador PIX (TXID) */}
                <label>Identificador PIX (TXID) — sem espaço</label>
                <input
                  name="identificador_pix"
                  value={form.identificador_pix}
                  onChange={onChange}
                  placeholder="Ex: PizzaAmigosParaiso"
                />
                <div className="note" style={{ marginTop: 0 }}>
                  Regras: <strong>sem espaço</strong> e até <strong>25 caracteres</strong>. Se ficar vazio, usamos{" "}
                  <strong>PizzaAmigosParaiso</strong>.
                </div>

                <button className="btn" type="submit">
                  Salvar
                </button>

                <div className="note">
                  Dica: manter o <strong>tipo_chave_pix</strong> ajuda a normalizar (CPF só números, telefone com +55…).
                </div>
              </form>
            </div>
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
        max-width: 1080px;
        background: var(--card);
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: 18px;
        box-shadow: 0 25px 60px rgba(0,0,0,0.35);
        padding: 22px;
        backdrop-filter: blur(10px);
      }

      .top { display:flex; align-items:flex-start; justify-content:space-between; gap: 12px; margin-bottom: 14px; }
      .topRight { display:flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }

      h1 { margin: 0; font-size: 22px; }
      .muted { color: var(--muted); font-size: 13px; margin: 6px 0 0 0; }
      .muted2 { color: var(--muted); }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

      .grid { display:grid; grid-template-columns: 1.1fr 0.9fr; gap: 12px; margin-top: 12px; }
      .panel {
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.78);
        border-radius: 16px;
        padding: 14px;
      }
      .panelTitle { font-weight: 900; margin-bottom: 10px; }

      .list { display:flex; flex-direction:column; gap: 10px; }
      .rowItem {
        display:flex; align-items:flex-start; justify-content:space-between; gap: 12px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.9);
        border-radius: 14px;
        padding: 12px;
      }
      .rowTitle { font-weight: 900; display:flex; align-items:center; gap: 8px; }
      .rowSub { margin-top: 6px; color: var(--muted); font-size: 12px; }
      .rowBtns { display:flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

      .pill {
        font-size: 11px;
        border-radius: 999px;
        padding: 4px 8px;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(15,23,42,0.05);
      }
      .pill.ok {
        border-color: rgba(34,197,94,0.22);
        background: rgba(34,197,94,0.12);
        color: #14532d;
      }

      .form { display:flex; flex-direction:column; gap: 10px; }
      label { font-size: 12px; color: var(--muted); }

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

      .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }

      .check {
        display:flex;
        align-items:center;
        gap: 10px;
        user-select:none;
        padding: 12px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.85);
        border-radius: 12px;
      }

      .btn {
        background: linear-gradient(180deg, var(--primary), var(--primary2));
        color: white;
        border: none;
        padding: 12px 14px;
        border-radius: 12px;
        font-weight: 900;
        cursor: pointer;
      }
      .btnLight {
        background: rgba(15,23,42,0.06);
        color: #0f172a;
        border: 1px solid rgba(15,23,42,0.12);
        padding: 10px 12px;
        border-radius: 12px;
        font-weight: 900;
        cursor: pointer;
      }
      .btnMini {
        background: rgba(15,23,42,0.06);
        color: #0f172a;
        border: 1px solid rgba(15,23,42,0.12);
        padding: 8px 10px;
        border-radius: 12px;
        font-weight: 900;
        cursor: pointer;
        font-size: 12px;
      }
      .btnMini.danger {
        border-color: rgba(239, 68, 68, 0.25);
        background: rgba(239, 68, 68, 0.10);
        color: #7f1d1d;
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
        margin-top: 8px;
        font-size: 12px;
        color: var(--muted);
        background: rgba(15,23,42,0.04);
        border: 1px solid rgba(15,23,42,0.08);
        padding: 10px 12px;
        border-radius: 12px;
      }
      .empty { color: var(--muted); font-size: 13px; padding: 10px 0; }

      @media (max-width: 920px) {
        .grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 520px) {
        .grid2 { grid-template-columns: 1fr; }
      }
    `}</style>
  );
}
