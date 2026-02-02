"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { useRouter } from "next/navigation";

export default function AdminItens() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  const [campanhas, setCampanhas] = useState([]);
  const [itemes, setItens] = useState([]);

  const [campanhaId, setCampanhaId] = useState("");

  const [form, setForm] = useState({
    nome: "",
    ordem: 0,
    ativo: true,
  });

  const campanhasMap = useMemo(() => {
    const m = new Map();
    campanhas.forEach((c) => m.set(c.id, c.nome));
    return m;
  }, [campanhas]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push("/login");
        return;
      }
      await carregarCampanhas();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarCampanhas() {
    setLoading(true);
    setErro(null);
    setOk(null);

    const { data, error } = await supabase
      .from("campanhas")
      .select("id, nome, ativa, data_inicio, criado_em")
      .order("ativa", { ascending: false })
      .order("data_inicio", { ascending: false });

    if (error) {
      console.error(error);
      setErro("Erro ao carregar campanhas.");
      setLoading(false);
      return;
    }

    setCampanhas(data || []);

    // default: campanha ativa
    const ativa = (data || []).find((c) => c.ativa);
    const chosen = ativa?.id || (data?.[0]?.id || "");
    setCampanhaId(chosen);

    if (chosen) {
      await carregarItens(chosen);
    } else {
      setItens([]);
    }

    setLoading(false);
  }

  async function carregarItens(id) {
    setErro(null);
    const { data, error } = await supabase
      .from("itens")
      .select("id, campanha_id, nome, ativo, ordem")
      .eq("campanha_id", id)
      .order("ordem", { ascending: true });

    if (error) {
      console.error(error);
      setErro("Erro ao carregar itemes.");
      return;
    }

    setItens(data || []);
  }

  async function trocarCampanha(id) {
    setCampanhaId(id);
    await carregarItens(id);
  }

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({
      ...p,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function adicionar(e) {
    e.preventDefault();
    setErro(null);
    setOk(null);

    if (!campanhaId) return setErro("Selecione uma campanha.");
    const nome = String(form.nome || "").trim();
    if (!nome) return setErro("Informe o nome do item.");

    const ordem = Number(form.ordem || 0);
    const payload = {
      campanha_id: campanhaId,
      nome,
      ordem: Number.isFinite(ordem) ? ordem : 0,
      ativo: !!form.ativo,
    };

    const { error } = await supabase.from("itens").insert(payload);
    if (error) return setErro(error.message);

    setOk("Sabor adicionado ✅");
    setForm({ nome: "", ordem: 0, ativo: true });
    await carregarItens(campanhaId);
  }

  async function toggleAtivo(s) {
    setErro(null);
    setOk(null);

    const { error } = await supabase.from("itens").update({ ativo: !s.ativo }).eq("id", s.id);
    if (error) return setErro(error.message);

    await carregarItens(campanhaId);
  }

  async function salvarOrdem(s, novaOrdem) {
    const ordem = Number(novaOrdem);
    if (!Number.isFinite(ordem)) return;

    const { error } = await supabase.from("itens").update({ ordem }).eq("id", s.id);
    if (error) return setErro(error.message);

    setOk("Ordem atualizada ✅");
    await carregarItens(campanhaId);
  }

  async function renomear(s) {
    const novo = prompt("Novo nome do item:", s.nome);
    if (novo == null) return;
    const nome = String(novo).trim();
    if (!nome) return;

    const { error } = await supabase.from("itens").update({ nome }).eq("id", s.id);
    if (error) return setErro(error.message);

    setOk("Nome atualizado ✅");
    await carregarItens(campanhaId);
  }

  async function remover(s) {
    const ok = confirm(`Remover o item "${s.nome}"?`);
    if (!ok) return;

    const { error } = await supabase.from("itens").delete().eq("id", s.id);
    if (error) return setErro(error.message);

    setOk("Sabor removido ✅");
    await carregarItens(campanhaId);
  }

  if (loading) {
    return (
      <>
        <div className="bg">
          <div className="card">
            <h1>Itens</h1>
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
              <h1>Itens</h1>
              <p className="muted">Cadastre e organize os itemes por campanha</p>
            </div>
            <button className="btnLight" onClick={() => router.push("/admin")}>
              Voltar
            </button>
          </div>

          {erro ? <div className="alert warn">{erro}</div> : null}
          {ok ? <div className="alert ok">{ok}</div> : null}

          <div className="panel">
            <label>Campanha</label>
            <select value={campanhaId} onChange={(e) => trocarCampanha(e.target.value)}>
              <option value="">Selecione…</option>
              {campanhas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ativa ? "⭐ " : ""}{c.nome}
                </option>
              ))}
            </select>
            {campanhaId ? (
              <div className="miniMuted">
                Campanha atual: <strong>{campanhasMap.get(campanhaId) || "—"}</strong>
              </div>
            ) : null}
          </div>

          <div className="grid">
            <div className="panel">
              <div className="panelTitle">Lista de itemes</div>

              {itemes.length === 0 ? (
                <div className="empty">Nenhum item cadastrado para esta campanha.</div>
              ) : (
                <div className="list">
                  {itemes.map((s) => (
                    <div key={s.id} className="rowItem">
                      <div>
                        <div className="rowTitle">
                          {s.nome} {s.ativo ? <span className="pill ok">ATIVO</span> : <span className="pill">inativo</span>}
                        </div>
                        <div className="rowSub">Ordem: {s.ordem ?? 0}</div>
                      </div>

                      <div className="rowBtns">
                        <button className="btnMini" onClick={() => renomear(s)}>
                          Renomear
                        </button>

                        <button className="btnMini" onClick={() => toggleAtivo(s)}>
                          {s.ativo ? "Desativar" : "Ativar"}
                        </button>

                        <div className="ordemBox">
                          <span>Ordem</span>
                          <input
                            type="number"
                            defaultValue={s.ordem ?? 0}
                            onBlur={(e) => salvarOrdem(s, e.target.value)}
                          />
                        </div>

                        <button className="btnMini danger" onClick={() => remover(s)}>
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="panel">
              <div className="panelTitle">Adicionar novo item</div>

              <form onSubmit={adicionar} className="form">
                <label>Nome do item</label>
                <input
                  name="nome"
                  value={form.nome}
                  onChange={onChange}
                  placeholder="Ex: Calabresa, Mussarela…"
                />

                <div className="grid2">
                  <div>
                    <label>Ordem</label>
                    <input name="ordem" type="number" value={form.ordem} onChange={onChange} />
                  </div>

                  <div className="checkWrap">
                    <label className="check">
                      <input type="checkbox" name="ativo" checked={form.ativo} onChange={onChange} />
                      Ativo
                    </label>
                  </div>
                </div>

                <button className="btn" type="submit" disabled={!campanhaId}>
                  Adicionar
                </button>

                <div className="note">
                  Dica: use a <strong>ordem</strong> para controlar a posição na tela pública.
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
      h1 { margin: 0; font-size: 22px; }
      .muted { color: var(--muted); font-size: 13px; margin: 6px 0 0 0; }
      .miniMuted { margin-top: 6px; color: var(--muted); font-size: 12px; }

      .grid { display:grid; grid-template-columns: 1.15fr 0.85fr; gap: 12px; margin-top: 12px; }
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
      .rowBtns { display:flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }

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

      .form { display:flex; flex-direction:column; gap: 10px; }
      .grid2 { display:grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      .checkWrap { display:flex; align-items:flex-end; }
      .check { display:flex; align-items:center; gap: 10px; user-select:none; }

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

      .ordemBox {
        display:flex;
        align-items:center;
        gap: 8px;
        padding: 6px 8px;
        border-radius: 12px;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.85);
        font-size: 12px;
        color: var(--muted);
      }
      .ordemBox input {
        width: 90px;
        padding: 8px 10px;
        border-radius: 10px;
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
