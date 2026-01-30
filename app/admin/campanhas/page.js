"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { useRouter } from "next/navigation";

export default function AdminCampanhas() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  const [clubes, setClubes] = useState([]);
  const [campanhas, setCampanhas] = useState([]);

  const [editando, setEditando] = useState(null); // id da campanha ou null
  const [form, setForm] = useState({
    clube_id: "",
    nome: "",
    data_inicio: "",
    data_fim: "",
    valor_pizza: 0,
    identificador_centavos: 0.01,
    ativa: false,
  });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push("/login");
        return;
      }
      await carregarTudo();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarTudo() {
    setLoading(true);
    setErro(null);
    setOk(null);

    // clubes
    const { data: clubesData, error: clubesError } = await supabase
      .from("clubes")
      .select("id, nome, ativo, criado_em")
      .order("criado_em", { ascending: false });

    if (clubesError) {
      console.error(clubesError);
      setErro("Erro ao carregar clubes (verifique RLS/admin).");
      setLoading(false);
      return;
    }

    setClubes(clubesData || []);

    // campanhas
    const { data: campData, error: campError } = await supabase
      .from("campanhas")
      .select("id, clube_id, nome, data_inicio, data_fim, valor_pizza, identificador_centavos, ativa, criado_em")
      .order("criado_em", { ascending: false });

    if (campError) {
      console.error(campError);
      setErro("Erro ao carregar campanhas.");
      setLoading(false);
      return;
    }

    setCampanhas(campData || []);
    setLoading(false);

    // se tiver 1 clube e nenhum selecionado, setar default
    if ((clubesData || []).length === 1 && !form.clube_id) {
      setForm((p) => ({ ...p, clube_id: clubesData[0].id }));
    }
  }

  const clubesMap = useMemo(() => {
    const m = new Map();
    (clubes || []).forEach((c) => m.set(c.id, c.nome));
    return m;
  }, [clubes]);

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({
      ...p,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  function novo() {
    setErro(null);
    setOk(null);
    setEditando(null);
    setForm({
      clube_id: (clubes?.[0]?.id) || "",
      nome: "",
      data_inicio: "",
      data_fim: "",
      valor_pizza: 0,
      identificador_centavos: 0.01,
      ativa: false,
    });
  }

  function editar(c) {
    setErro(null);
    setOk(null);
    setEditando(c.id);
    setForm({
      clube_id: c.clube_id || "",
      nome: c.nome || "",
      data_inicio: c.data_inicio || "",
      data_fim: c.data_fim || "",
      valor_pizza: Number(c.valor_pizza || 0),
      identificador_centavos: Number(c.identificador_centavos ?? 0.01),
      ativa: !!c.ativa,
    });
  }

  async function salvar(e) {
    e.preventDefault();
    setErro(null);
    setOk(null);

    if (!form.clube_id) return setErro("Selecione um clube.");
    if (!String(form.nome || "").trim()) return setErro("Informe o nome da campanha.");
    if (!form.data_inicio) return setErro("Informe a data de início.");
    if (!form.data_fim) return setErro("Informe a data de fim.");

    const valorPizza = Number(form.valor_pizza);
    if (!Number.isFinite(valorPizza) || valorPizza <= 0) return setErro("Valor da pizza deve ser maior que zero.");

    const identificador = Number(form.identificador_centavos);
    if (!Number.isFinite(identificador) || identificador < 0 || identificador >= 1)
      return setErro("Identificador (centavos) deve ser entre 0,00 e 0,99.");

    const payload = {
      clube_id: form.clube_id,
      nome: String(form.nome).trim(),
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      valor_pizza: Math.round(valorPizza * 100) / 100,
      identificador_centavos: Math.round(identificador * 100) / 100,
      ativa: !!form.ativa,
    };

    // Se marcar como ativa, desativa as outras antes (para manter só 1 ativa por clube)
    if (payload.ativa) {
      const { error: offError } = await supabase
        .from("campanhas")
        .update({ ativa: false })
        .eq("clube_id", payload.clube_id);

      if (offError) {
        console.error(offError);
        return setErro("Erro ao desativar outras campanhas.");
      }
    }

    if (!editando) {
      const { error } = await supabase.from("campanhas").insert(payload);
      if (error) {
        console.error(error);
        return setErro(error.message);
      }
      setOk("Campanha criada ✅");
      await carregarTudo();
      novo();
      return;
    }

    const { error } = await supabase.from("campanhas").update(payload).eq("id", editando);
    if (error) {
      console.error(error);
      return setErro(error.message);
    }

    setOk("Campanha atualizada ✅");
    await carregarTudo();
  }

  async function ativarRapido(c) {
    setErro(null);
    setOk(null);

    // desativa outras do mesmo clube e ativa a escolhida
    const { error: offError } = await supabase
      .from("campanhas")
      .update({ ativa: false })
      .eq("clube_id", c.clube_id);

    if (offError) return setErro("Erro ao desativar outras campanhas.");

    const { error: onError } = await supabase.from("campanhas").update({ ativa: true }).eq("id", c.id);
    if (onError) return setErro("Erro ao ativar campanha.");

    setOk("Campanha ativada ✅");
    await carregarTudo();
  }

  async function remover(c) {
    const ok = confirm(`Remover campanha "${c.nome}"? (isso não apaga pedidos já feitos, mas pode quebrar histórico)`);
    if (!ok) return;

    setErro(null);
    setOk(null);

    const { error } = await supabase.from("campanhas").delete().eq("id", c.id);
    if (error) return setErro(error.message);

    setOk("Campanha removida ✅");
    await carregarTudo();
    if (editando === c.id) novo();
  }

  if (loading) {
    return (
      <>
        <div className="bg">
          <div className="card">
            <h1>Campanhas</h1>
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
              <h1>Campanhas</h1>
              <p className="muted">Criar e manter campanhas do Desbrava Pizza</p>
            </div>
            <div className="topRight">
              <button className="btnLight" onClick={() => router.push("/admin")}>
                Voltar
              </button>
              <button className="btn" onClick={novo}>
                Nova campanha
              </button>
            </div>
          </div>

          {erro ? <div className="alert warn">{erro}</div> : null}
          {ok ? <div className="alert ok">{ok}</div> : null}

          <div className="grid">
            <div className="panel">
              <div className="panelTitle">Lista</div>

              {campanhas.length === 0 ? (
                <div className="empty">Nenhuma campanha cadastrada.</div>
              ) : (
                <div className="list">
                  {campanhas.map((c) => (
                    <div key={c.id} className="rowItem">
                      <div>
                        <div className="rowTitle">
                          {c.nome} {c.ativa ? <span className="pill ok">ATIVA</span> : <span className="pill">inativa</span>}
                        </div>
                        <div className="rowSub">
                          Clube: <strong>{clubesMap.get(c.clube_id) || "—"}</strong> •{" "}
                          {fmtData(c.data_inicio)} → {fmtData(c.data_fim)} • R$ {Number(c.valor_pizza).toFixed(2)} • ID:{" "}
                          {Number(c.identificador_centavos ?? 0.01).toFixed(2)}
                        </div>
                      </div>
                      <div className="rowBtns">
                        {!c.ativa ? (
                          <button className="btnMini" onClick={() => ativarRapido(c)}>
                            Ativar
                          </button>
                        ) : null}
                        <button className="btnMini" onClick={() => editar(c)}>
                          Editar
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
              <div className="panelTitle">{editando ? "Editar campanha" : "Nova campanha"}</div>

              <form onSubmit={salvar} className="form">
                <label>Clube</label>
                <select name="clube_id" value={form.clube_id} onChange={onChange}>
                  <option value="">Selecione…</option>
                  {clubes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} {c.ativo ? "" : "(inativo)"}
                    </option>
                  ))}
                </select>

                <label>Nome</label>
                <input name="nome" value={form.nome} onChange={onChange} placeholder="Desbrava Pizza Fevereiro" />

                <div className="grid2">
                  <div>
                    <label>Data início</label>
                    <input type="date" name="data_inicio" value={form.data_inicio} onChange={onChange} />
                  </div>
                  <div>
                    <label>Data fim</label>
                    <input type="date" name="data_fim" value={form.data_fim} onChange={onChange} />
                  </div>
                </div>

                <div className="grid2">
                  <div>
                    <label>Valor da pizza (R$)</label>
                    <input type="number" step="0.01" name="valor_pizza" value={form.valor_pizza} onChange={onChange} />
                  </div>
                  <div>
                    <label>Identificador (centavos)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="0.99"
                      name="identificador_centavos"
                      value={form.identificador_centavos}
                      onChange={onChange}
                    />
                  </div>
                </div>

                <label className="check">
                  <input type="checkbox" name="ativa" checked={form.ativa} onChange={onChange} />
                  Marcar como ativa (desativa as outras do mesmo clube)
                </label>

                <button className="btn" type="submit">
                  Salvar
                </button>

                <div className="note">
                  Dica: deixe <strong>apenas 1 campanha ativa</strong> para a página pública puxar automaticamente.
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

function fmtData(d) {
  if (!d) return "—";
  // d vem YYYY-MM-DD
  const [y, m, day] = String(d).split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
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
