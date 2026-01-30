"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../src/lib/supabase";
import { useRouter } from "next/navigation";

export default function PagamentosHistorico() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [carregando, setCarregando] = useState(false);

  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  const [clubes, setClubes] = useState([]);
  const [campanhas, setCampanhas] = useState([]);

  const [clubeId, setClubeId] = useState("");
  const [campanhaId, setCampanhaId] = useState("");

  const [busca, setBusca] = useState("");

  const [pagamentos, setPagamentos] = useState([]);
  const [detalhe, setDetalhe] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push("/login");
        return;
      }

      // admin
      const userId = data.session.user.id;
      const { data: u, error: uErr } = await supabase
        .from("usuarios")
        .select("perfil, auth_user_id")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (uErr) {
        setErro("Sem permissão (RLS). Verifique se você está cadastrado em usuarios como admin.");
        setLoading(false);
        return;
      }
      if (!u || u.perfil !== "admin") {
        setErro("Seu usuário não está autorizado como ADMIN.");
        setLoading(false);
        return;
      }

      await carregarClubes();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarClubes() {
    setErro(null);
    setOk(null);

    const { data, error } = await supabase
      .from("clubes")
      .select("id, nome, ativo, criado_em")
      .order("criado_em", { ascending: false });

    if (error) {
      console.error(error);
      setErro("Erro ao carregar clubes.");
      return;
    }

    const lista = data || [];
    setClubes(lista);

    const ativo = lista.find((c) => c.ativo) || lista[0];
    if (ativo?.id) {
      setClubeId(ativo.id);
      await carregarCampanhas(ativo.id);
    }
  }

  async function carregarCampanhas(clube_id) {
    setErro(null);
    setOk(null);

    setCampanhas([]);
    setCampanhaId("");
    setPagamentos([]);
    setDetalhe(null);

    const { data, error } = await supabase
      .from("campanhas")
      .select("id, clube_id, nome, ativa, data_inicio, data_fim, criado_em")
      .eq("clube_id", clube_id)
      .order("ativa", { ascending: false })
      .order("data_inicio", { ascending: false });

    if (error) {
      console.error(error);
      setErro("Erro ao carregar campanhas.");
      return;
    }

    const lista = data || [];
    setCampanhas(lista);

    const ativa = lista.find((c) => c.ativa) || lista[0];
    if (ativa?.id) {
      setCampanhaId(ativa.id);
      await carregarHistorico(ativa.id);
    }
  }

  async function carregarHistorico(campanha_id) {
    setCarregando(true);
    setErro(null);
    setOk(null);
    setDetalhe(null);

    // 1) buscar pedidos da campanha (para filtrar pagamentos por pedido_id)
    const { data: pedidosIds, error: pErr } = await supabase
      .from("pedidos")
      .select("id")
      .eq("campanha_id", campanha_id)
      .limit(2000);

    if (pErr) {
      console.error(pErr);
      setErro("Erro ao carregar pedidos da campanha (para filtrar pagamentos).");
      setCarregando(false);
      return;
    }

    const ids = (pedidosIds || []).map((x) => x.id);
    if (ids.length === 0) {
      setPagamentos([]);
      setCarregando(false);
      return;
    }

    // 2) buscar pagamentos confirmados desses pedidos
    const { data: pags, error: payErr } = await supabase
      .from("pagamentos")
      .select("id, pedido_id, txid, valor, status, confirmado_em, criado_em, payload")
      .in("pedido_id", ids)
      .eq("status", "confirmado")
      .order("confirmado_em", { ascending: false })
      .limit(2000);

    if (payErr) {
      console.error(payErr);
      setErro("Erro ao carregar histórico de pagamentos.");
      setCarregando(false);
      return;
    }

    const lista = pags || [];

    // 3) enriquecer com dados do pedido (para mostrar código/nome/telefone)
    const { data: pedidosInfo, error: infoErr } = await supabase
      .from("pedidos")
      .select("id, codigo_pedido, nome_comprador, telefone, nome_desbravador, valor_total, status, criado_em")
      .in("id", ids);

    if (infoErr) {
      console.error(infoErr);
      // sem quebrar: mostra só pagamentos
      setPagamentos(lista.map((x) => ({ ...x, pedido: null })));
      setCarregando(false);
      return;
    }

    const mapPedido = new Map((pedidosInfo || []).map((p) => [p.id, p]));
    setPagamentos(lista.map((x) => ({ ...x, pedido: mapPedido.get(x.pedido_id) || null })));

    setCarregando(false);
  }

  async function trocarClube(id) {
    setClubeId(id);
    await carregarCampanhas(id);
  }

  async function trocarCampanha(id) {
    setCampanhaId(id);
    await carregarHistorico(id);
  }

  const filtrados = useMemo(() => {
    const q = String(busca || "").trim().toLowerCase();
    if (!q) return pagamentos;

    return pagamentos.filter((pg) => {
      const tx = String(pg.txid || "").toLowerCase();
      const codigo = String(pg.pedido?.codigo_pedido || "").toLowerCase();
      const nome = String(pg.pedido?.nome_comprador || "").toLowerCase();
      const tel = String(pg.pedido?.telefone || "").toLowerCase();
      const desb = String(pg.pedido?.nome_desbravador || "").toLowerCase();
      return tx.includes(q) || codigo.includes(q) || nome.includes(q) || tel.includes(q) || desb.includes(q);
    });
  }, [pagamentos, busca]);

  const resumo = useMemo(() => {
    const total = filtrados.length;
    const soma = filtrados.reduce((acc, p) => acc + Number(p.valor || 0), 0);
    return { total, soma: Math.round(soma * 100) / 100 };
  }, [filtrados]);

  function exportarCSV() {
    const linhas = [];
    linhas.push([
      "codigo_pedido",
      "txid",
      "valor_pagamento",
      "confirmado_em",
      "nome_comprador",
      "telefone",
      "nome_desbravador",
      "valor_pedido",
      "status_pedido",
      "obs_payload",
    ]);

    for (const pg of filtrados) {
      const obs = pg?.payload?.observacao ?? "";
      linhas.push([
        pg.pedido?.codigo_pedido || "",
        pg.txid || "",
        Number(pg.valor || 0).toFixed(2),
        pg.confirmado_em || "",
        pg.pedido?.nome_comprador || "",
        pg.pedido?.telefone || "",
        pg.pedido?.nome_desbravador || "",
        Number(pg.pedido?.valor_total || 0).toFixed(2),
        pg.pedido?.status || "",
        String(obs || ""),
      ]);
    }

    const csv = linhas.map((row) => row.map(csvEscape).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `historico_pagamentos_${campanhaId || "campanha"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <>
        <div className="bg">
          <div className="card">
            <h1>Histórico de Pagamentos</h1>
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
              <h1>Histórico de Pagamentos</h1>
              <p className="muted">Auditoria do que já foi conciliado</p>
            </div>
            <div className="topRight">
              <button className="btnLight" onClick={() => router.push("/admin")}>
                Voltar
              </button>
              <button className="btnLight" onClick={() => router.push("/admin/pedidos")}>
                Pedidos
              </button>
              <button className="btnLight" onClick={() => router.push("/admin/pagamentos")}>
                Conciliação
              </button>
              <button className="btnLight" onClick={exportarCSV} disabled={filtrados.length === 0}>
                Exportar CSV
              </button>
              <button className="btn" onClick={() => carregarHistorico(campanhaId)} disabled={!campanhaId}>
                Atualizar
              </button>
            </div>
          </div>

          {erro ? <div className="alert warn">{erro}</div> : null}
          {ok ? <div className="alert ok">{ok}</div> : null}

          <div className="filters">
            <div>
              <label>Clube</label>
              <select value={clubeId} onChange={(e) => trocarClube(e.target.value)}>
                {clubes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} {c.ativo ? "" : "(inativo)"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Campanha</label>
              <select value={campanhaId} onChange={(e) => trocarCampanha(e.target.value)} disabled={!clubeId}>
                {campanhas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ativa ? "⭐ " : ""}
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="span2">
              <label>Buscar (TXID, DP-000123, nome, telefone…)</label>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Ex: DP-000123 ou txid…" />
            </div>
          </div>

          <div className="kpis">
            <div className="kpi">
              <div className="kTitle">Registros</div>
              <div className="kValue">{resumo.total}</div>
            </div>
            <div className="kpi">
              <div className="kTitle">Soma (pagamentos)</div>
              <div className="kValue">R$ {Number(resumo.soma).toFixed(2)}</div>
            </div>
          </div>

          <div className="panel">
            <div className="panelTitle">
              Lista
              {carregando ? <span className="miniMuted"> • carregando…</span> : null}
            </div>

            {filtrados.length === 0 ? (
              <div className="empty">Nenhum pagamento confirmado encontrado.</div>
            ) : (
              <div className="list">
                {filtrados.map((pg) => (
                  <button key={pg.id} className="rowItem" type="button" onClick={() => setDetalhe(pg)}>
                    <div className="left">
                      <div className="rowTitle">
                        <span className="mono">{pg.pedido?.codigo_pedido || "—"}</span>
                        <span className="pill ok">CONFIRMADO</span>
                        <span className="pill mid">TXID: {String(pg.txid || "").slice(0, 18)}{String(pg.txid || "").length > 18 ? "…" : ""}</span>
                      </div>
                      <div className="rowSub">
                        <strong>{pg.pedido?.nome_comprador || "—"}</strong> • {pg.pedido?.telefone || "—"} • Desbravador:{" "}
                        {pg.pedido?.nome_desbravador || "—"}
                      </div>
                      <div className="rowSub muted2">
                        Confirmado em: <strong>{fmtDateTime(pg.confirmado_em || pg.criado_em)}</strong>
                      </div>
                    </div>

                    <div className="right">
                      <div className="price">R$ {Number(pg.valor || 0).toFixed(2)}</div>
                      <div className="small muted2">Pedido: R$ {Number(pg.pedido?.valor_total || 0).toFixed(2)}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {detalhe ? (
            <div className="modalBackdrop" onClick={() => setDetalhe(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modalTop">
                  <div>
                    <div className="modalTitle">
                      <span className="mono">{detalhe.pedido?.codigo_pedido || "—"}</span>
                      <span className="pill ok">CONFIRMADO</span>
                    </div>
                    <div className="modalSub">
                      TXID: <span className="mono">{detalhe.txid}</span>
                    </div>
                  </div>
                  <button className="btnMini" type="button" onClick={() => setDetalhe(null)}>
                    Fechar
                  </button>
                </div>

                <div className="modalGrid">
                  <div className="box">
                    <div className="boxTitle">Pagamento</div>
                    <div className="boxValue">R$ {Number(detalhe.valor || 0).toFixed(2)}</div>
                    <div className="boxSmall">Confirmado em {fmtDateTime(detalhe.confirmado_em || detalhe.criado_em)}</div>
                  </div>

                  <div className="box">
                    <div className="boxTitle">Pedido</div>
                    <div className="boxValue">{detalhe.pedido?.nome_comprador || "—"}</div>
                    <div className="boxSmall">Telefone: {detalhe.pedido?.telefone || "—"}</div>
                    <div className="boxSmall">Desbravador: {detalhe.pedido?.nome_desbravador || "—"}</div>
                    <div className="boxSmall">
                      Valor do pedido: <strong>R$ {Number(detalhe.pedido?.valor_total || 0).toFixed(2)}</strong> • Status:{" "}
                      <strong>{detalhe.pedido?.status || "—"}</strong>
                    </div>
                  </div>
                </div>

                <div className="box">
                  <div className="boxTitle">Payload</div>
                  <pre className="pre">{JSON.stringify(detalhe.payload || {}, null, 2)}</pre>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <Style />
    </>
  );
}

/* ===== helpers ===== */

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes(";") || s.includes("\n") || s.includes('"')) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

/* ===== styles ===== */

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
        max-width: 1180px;
        background: var(--card);
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: 18px;
        box-shadow: 0 25px 60px rgba(0,0,0,0.35);
        padding: 22px;
        backdrop-filter: blur(10px);
      }

      .top { display:flex; align-items:flex-start; justify-content:space-between; gap: 12px; margin-bottom: 12px; }
      .topRight { display:flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }

      h1 { margin: 0; font-size: 22px; }
      .muted { color: var(--muted); font-size: 13px; margin: 6px 0 0 0; }
      .muted2 { color: var(--muted); }
      .miniMuted { color: var(--muted); font-size: 12px; font-weight: 600; }

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

      .filters {
        display:grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        padding: 12px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.78);
        border-radius: 16px;
      }
      .span2 { grid-column: span 2; }

      .kpis {
        display:grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        margin-top: 12px;
      }
      .kpi {
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.80);
        border-radius: 16px;
        padding: 12px;
      }
      .kTitle { font-size: 12px; color: var(--muted); font-weight: 700; }
      .kValue { font-size: 18px; font-weight: 900; margin-top: 4px; }

      .panel {
        margin-top: 12px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.78);
        border-radius: 16px;
        padding: 14px;
      }
      .panelTitle { font-weight: 900; margin-bottom: 10px; }

      .list { display:flex; flex-direction:column; gap: 10px; }
      .rowItem {
        text-align: left;
        width: 100%;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.92);
        border-radius: 14px;
        padding: 12px;
        display:flex;
        justify-content: space-between;
        gap: 12px;
        cursor: pointer;
      }

      .left { flex: 1; min-width: 0; }
      .right { width: 260px; text-align: right; }
      .rowTitle { font-weight: 900; display:flex; gap: 8px; align-items:center; flex-wrap: wrap; }
      .rowSub { margin-top: 6px; color: var(--muted); font-size: 12px; }
      .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

      .price { font-weight: 900; font-size: 16px; }
      .small { font-size: 12px; }

      .pill {
        font-size: 11px;
        border-radius: 999px;
        padding: 4px 8px;
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(15,23,42,0.05);
        font-weight: 900;
      }
      .pill.ok { border-color: rgba(34,197,94,0.22); background: rgba(34,197,94,0.12); color: #14532d; }
      .pill.mid { border-color: rgba(59,130,246,0.22); background: rgba(59,130,246,0.10); color: #1e3a8a; }

      .btn {
        background: linear-gradient(180deg, var(--primary), var(--primary2));
        color: white;
        border: none;
        padding: 12px 14px;
        border-radius: 12px;
        font-weight: 900;
        cursor: pointer;
        min-width: 160px;
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

      .alert {
        border-radius: 12px;
        padding: 10px 12px;
        border: 1px solid rgba(15,23,42,0.12);
        margin: 10px 0;
        font-size: 13px;
      }
      .alert.warn { background: rgba(245, 158, 11, 0.16); border-color: rgba(245,158,11,0.35); }
      .alert.ok { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.22); }

      .empty { color: var(--muted); font-size: 13px; padding: 8px 0; }

      /* Modal */
      .modalBackdrop {
        position: fixed;
        inset: 0;
        background: rgba(2, 6, 23, 0.55);
        display: grid;
        place-items: center;
        padding: 18px;
        z-index: 50;
      }
      .modal {
        width: 100%;
        max-width: 900px;
        background: rgba(255,255,255,0.95);
        border: 1px solid rgba(255,255,255,0.4);
        border-radius: 18px;
        box-shadow: 0 30px 80px rgba(0,0,0,0.45);
        padding: 16px;
      }
      .modalTop { display:flex; justify-content: space-between; align-items:flex-start; gap: 10px; }
      .modalTitle { font-weight: 900; font-size: 16px; display:flex; gap: 10px; align-items:center; flex-wrap: wrap; }
      .modalSub { margin-top: 6px; color: var(--muted); font-size: 12px; }

      .modalGrid {
        margin-top: 12px;
        display:grid;
        grid-template-columns: 0.9fr 1.1fr;
        gap: 12px;
      }
      .box {
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.85);
        border-radius: 16px;
        padding: 12px;
        margin-top: 10px;
      }
      .boxTitle { font-weight: 900; color: var(--muted); font-size: 12px; }
      .boxValue { font-weight: 900; font-size: 20px; margin-top: 6px; }
      .boxSmall { margin-top: 6px; font-size: 12px; color: var(--muted); }

      .pre {
        margin: 0;
        padding: 10px;
        border-radius: 12px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(15,23,42,0.04);
        overflow: auto;
        font-size: 12px;
      }

      @media (max-width: 820px) {
        .filters { grid-template-columns: 1fr; }
        .span2 { grid-column: span 1; }
        .rowItem { flex-direction: column; }
        .right { width: 100%; text-align: left; display:flex; justify-content: space-between; align-items: baseline; }
        .modalGrid { grid-template-columns: 1fr; }
        .btn { min-width: 100%; }
      }
    `}</style>
  );
}
