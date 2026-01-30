"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { useRouter } from "next/navigation";

export default function AdminPagamentos() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [carregando, setCarregando] = useState(false);

  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  const [clubes, setClubes] = useState([]);
  const [campanhas, setCampanhas] = useState([]);

  const [clubeId, setClubeId] = useState("");
  const [campanhaId, setCampanhaId] = useState("");

  const [pedidos, setPedidos] = useState([]);
  const [itensPorPedido, setItensPorPedido] = useState({});

  // conciliação
  const [valorExtrato, setValorExtrato] = useState(""); // ex: "70,01"
  const [codigoBusca, setCodigoBusca] = useState(""); // ex: "DP-000123"
  const [txid, setTxid] = useState(""); // opcional
  const [observacao, setObservacao] = useState(""); // vai no payload

  const [selecionado, setSelecionado] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push("/login");
        return;
      }

      // exige admin
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
    setPedidos([]);
    setItensPorPedido({});
    setSelecionado(null);

    const { data, error } = await supabase
      .from("campanhas")
      .select("id, clube_id, nome, ativa, data_inicio, data_fim, valor_pizza, identificador_centavos, criado_em")
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
      await carregarPedidosPendentes(ativa.id);
    }
  }

  async function carregarPedidosPendentes(campanha_id) {
    setCarregando(true);
    setErro(null);
    setOk(null);
    setSelecionado(null);

    const { data, error } = await supabase
      .from("pedidos")
      .select(
        "id, codigo_pedido, nome_comprador, telefone, nome_desbravador, quantidade, valor_total, status, criado_em, campanha_id"
      )
      .eq("campanha_id", campanha_id)
      .in("status", ["aguardando_pagamento", "em_analise"])
      .order("criado_em", { ascending: false })
      .limit(600);

    if (error) {
      console.error(error);
      setErro("Erro ao carregar pedidos pendentes.");
      setCarregando(false);
      return;
    }

    const lista = data || [];
    setPedidos(lista);

    await carregarItens(lista.map((p) => p.id));
    setCarregando(false);
  }

  async function carregarItens(pedidoIds) {
    if (!pedidoIds?.length) {
      setItensPorPedido({});
      return;
    }

    const tentativa = await supabase
      .from("pedido_sabores")
      .select("pedido_id, quantidade, sabores ( nome )")
      .in("pedido_id", pedidoIds);

    if (!tentativa.error && tentativa.data) {
      const mapa = {};
      for (const row of tentativa.data) {
        const nome = row?.sabores?.nome || "Sabor";
        if (!mapa[row.pedido_id]) mapa[row.pedido_id] = [];
        mapa[row.pedido_id].push({ nome, quantidade: Number(row.quantidade || 0) });
      }
      setItensPorPedido(mapa);
      return;
    }

    const { data: ps, error: psErr } = await supabase
      .from("pedido_sabores")
      .select("pedido_id, sabor_id, quantidade")
      .in("pedido_id", pedidoIds);

    if (psErr) {
      console.error(psErr);
      setItensPorPedido({});
      return;
    }

    const saborIds = Array.from(new Set((ps || []).map((r) => r.sabor_id).filter(Boolean)));
    const { data: sab, error: sErr } = await supabase.from("sabores").select("id, nome").in("id", saborIds);
    if (sErr) {
      console.error(sErr);
      setItensPorPedido({});
      return;
    }

    const sabMap = new Map((sab || []).map((s) => [s.id, s.nome]));
    const mapa = {};
    for (const row of ps || []) {
      const nome = sabMap.get(row.sabor_id) || "Sabor";
      if (!mapa[row.pedido_id]) mapa[row.pedido_id] = [];
      mapa[row.pedido_id].push({ nome, quantidade: Number(row.quantidade || 0) });
    }
    setItensPorPedido(mapa);
  }

  async function trocarClube(id) {
    setClubeId(id);
    await carregarCampanhas(id);
  }

  async function trocarCampanha(id) {
    setCampanhaId(id);
    await carregarPedidosPendentes(id);
  }

  const valorExtratoNum = useMemo(() => parseMoney(valorExtrato), [valorExtrato]);

  const sugestoes = useMemo(() => {
    const code = String(codigoBusca || "").trim().toUpperCase();
    const v = valorExtratoNum;

    let lista = pedidos;

    if (code) {
      lista = lista.filter((p) => String(p.codigo_pedido || "").toUpperCase().includes(code));
    }

    if (Number.isFinite(v) && v > 0) {
      const exatos = lista.filter((p) => moneyEq(p.valor_total, v));
      if (exatos.length) return exatos;

      const proximos = lista
        .map((p) => ({ p, diff: Math.abs(Number(p.valor_total || 0) - v) }))
        .sort((a, b) => a.diff - b.diff)
        .slice(0, 12)
        .map((x) => x.p);

      return proximos;
    }

    return lista.slice(0, 40);
  }, [pedidos, codigoBusca, valorExtratoNum]);

  const resumo = useMemo(() => {
    const total = pedidos.length;
    const aguardando = pedidos.filter((p) => p.status === "aguardando_pagamento").length;
    const analise = pedidos.filter((p) => p.status === "em_analise").length;
    const soma = pedidos.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
    return { total, aguardando, analise, soma: Math.round(soma * 100) / 100 };
  }, [pedidos]);

  async function marcarComoPago() {
    setErro(null);
    setOk(null);

    if (!selecionado) return setErro("Selecione um pedido para conciliar.");
    const v = valorExtratoNum;
    if (!Number.isFinite(v) || v <= 0) return setErro("Informe um valor válido do extrato (ex: 70,01).");

    const tx = String(txid || "").trim();
    if (!tx) {
      const continuar = confirm("Você não informou TXID. Quer continuar mesmo assim?");
      if (!continuar) return;
    }

    const confirmar = confirm(
      `Confirmar pagamento?\n\nPedido: ${selecionado.codigo_pedido}\nValor do extrato: R$ ${v.toFixed(
        2
      )}\nValor do pedido: R$ ${Number(selecionado.valor_total || 0).toFixed(2)}`
    );
    if (!confirmar) return;

    setCarregando(true);

    const payload = {
      origem: "conferencia_manual",
      observacao: String(observacao || "").trim() || null,
      valor_extrato: v,
    };

    const { error: pagErr } = await supabase.from("pagamentos").insert({
      pedido_id: selecionado.id,
      txid: tx || `MANUAL-${Date.now()}`,
      valor: v,
      status: "confirmado",
      confirmado_em: new Date().toISOString(),
      payload,
    });

    if (pagErr) {
      console.error(pagErr);
      setErro(pagErr.message || "Erro ao inserir pagamento.");
      setCarregando(false);
      return;
    }

    const { error: pedErr } = await supabase.from("pedidos").update({ status: "pago" }).eq("id", selecionado.id);

    if (pedErr) {
      console.error(pedErr);
      setErro(pedErr.message || "Pagamento criado, mas erro ao marcar pedido como pago.");
      setCarregando(false);
      return;
    }

    setOk(`Conciliação feita ✅ Pedido ${selecionado.codigo_pedido} marcado como PAGO.`);
    setSelecionado(null);
    setTxid("");
    setObservacao("");
    setValorExtrato("");
    setCodigoBusca("");

    await carregarPedidosPendentes(campanhaId);
    setCarregando(false);
  }

  async function marcarEmAnalise() {
    setErro(null);
    setOk(null);
    if (!selecionado) return setErro("Selecione um pedido.");

    const { error } = await supabase.from("pedidos").update({ status: "em_analise" }).eq("id", selecionado.id);
    if (error) return setErro(error.message);

    setOk(`Pedido ${selecionado.codigo_pedido} marcado como EM ANÁLISE.`);
    await carregarPedidosPendentes(campanhaId);
  }

  if (loading) {
    return (
      <>
        <div className="bg">
          <div className="card">
            <h1>Conciliação PIX</h1>
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
              <h1>Conciliação PIX</h1>
              <p className="muted">Conferência por valor do extrato + marcação de pago</p>
            </div>

            <div className="topRight">
              <button className="btnLight" onClick={() => router.push("/admin")}>
                Voltar
              </button>

              <button className="btnLight" onClick={() => router.push("/admin/pedidos")}>
                Pedidos
              </button>

              <button className="btnLight" onClick={() => router.push("/admin/pagamentos/historico")}>
                Histórico
              </button>

              <button className="btn" onClick={() => carregarPedidosPendentes(campanhaId)} disabled={!campanhaId}>
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
              <label>Valor do extrato (ex: 70,01)</label>
              <input value={valorExtrato} onChange={(e) => setValorExtrato(e.target.value)} placeholder="70,01" />
            </div>

            <div>
              <label>Buscar por código (opcional)</label>
              <input value={codigoBusca} onChange={(e) => setCodigoBusca(e.target.value)} placeholder="DP-000123" />
            </div>

            <div>
              <label>TXID (opcional)</label>
              <input value={txid} onChange={(e) => setTxid(e.target.value)} placeholder="se o banco mostrar" />
            </div>

            <div className="span2">
              <label>Observação (opcional)</label>
              <input
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex: identificado no extrato da igreja"
              />
            </div>
          </div>

          <div className="kpis">
            <div className="kpi">
              <div className="kTitle">Pendentes</div>
              <div className="kValue">{resumo.total}</div>
            </div>
            <div className="kpi">
              <div className="kTitle">Aguardando</div>
              <div className="kValue">{resumo.aguardando}</div>
            </div>
            <div className="kpi">
              <div className="kTitle">Em análise</div>
              <div className="kValue">{resumo.analise}</div>
            </div>
            <div className="kpi">
              <div className="kTitle">Soma (pendentes)</div>
              <div className="kValue">R$ {Number(resumo.soma).toFixed(2)}</div>
            </div>
          </div>

          <div className="grid">
            <div className="panel">
              <div className="panelTitle">
                Sugestões
                {carregando ? <span className="miniMuted"> • carregando…</span> : null}
              </div>

              {sugestoes.length === 0 ? (
                <div className="empty">Nenhum pedido para conciliar.</div>
              ) : (
                <div className="list">
                  {sugestoes.map((p) => {
                    const itens = itensPorPedido[p.id] || [];
                    const ativo = selecionado?.id === p.id;

                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`rowItem ${ativo ? "active" : ""}`}
                        onClick={() => setSelecionado(p)}
                      >
                        <div className="left">
                          <div className="rowTitle">
                            <span className="mono">{p.codigo_pedido}</span>
                            <StatusPill status={p.status} />
                            {Number.isFinite(valorExtratoNum) && valorExtratoNum > 0 ? (
                              <span className="pill mid">Δ R$ {Math.abs(Number(p.valor_total || 0) - valorExtratoNum).toFixed(2)}</span>
                            ) : null}
                          </div>
                          <div className="rowSub">
                            <strong>{p.nome_comprador}</strong> • {p.telefone} • Desbravador: {p.nome_desbravador}
                          </div>
                          <div className="rowSub muted2">
                            {itens.length ? itens.map((i) => `${i.nome} x${i.quantidade}`).join(" • ") : "Sabores: —"}
                          </div>
                        </div>

                        <div className="right">
                          <div className="price">R$ {Number(p.valor_total || 0).toFixed(2)}</div>
                          <div className="small muted2">{fmtDateTime(p.criado_em)}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="panel">
              <div className="panelTitle">Confirmar conciliação</div>

              {!selecionado ? (
                <div className="empty">Selecione um pedido na lista ao lado.</div>
              ) : (
                <>
                  <div className="box">
                    <div className="boxTitle">Pedido</div>
                    <div className="boxValue">
                      <span className="mono">{selecionado.codigo_pedido}</span> <StatusPill status={selecionado.status} />
                    </div>
                    <div className="boxSmall">
                      Total do pedido: <strong>R$ {Number(selecionado.valor_total || 0).toFixed(2)}</strong>
                    </div>
                    <div className="boxSmall">
                      Comprador: <strong>{selecionado.nome_comprador}</strong> • {selecionado.telefone}
                    </div>
                    <div className="boxSmall">Desbravador: {selecionado.nome_desbravador}</div>
                  </div>

                  <div className="box">
                    <div className="boxTitle">Valor do extrato</div>
                    <div className="boxValue">
                      {Number.isFinite(valorExtratoNum) && valorExtratoNum > 0 ? `R$ ${valorExtratoNum.toFixed(2)}` : "—"}
                    </div>
                    <div className="boxSmall muted2">Dica: por causa do identificador em centavos, geralmente bate certinho.</div>
                  </div>

                  <div className="actions">
                    <button className="btn" type="button" onClick={marcarComoPago} disabled={carregando}>
                      Marcar como PAGO
                    </button>
                    <button className="btnLight" type="button" onClick={marcarEmAnalise} disabled={carregando}>
                      Marcar EM ANÁLISE
                    </button>
                  </div>

                  <div className="note">
                    Isso cria um registro em <strong>pagamentos</strong> e marca o pedido como <strong>pago</strong>. Veja tudo em{" "}
                    <button className="linkBtn" onClick={() => router.push("/admin/pagamentos/historico")} type="button">
                      Histórico
                    </button>
                    .
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <Style />
    </>
  );
}

/* ===== helpers ===== */

function StatusPill({ status }) {
  const s = String(status || "");
  let cls = "pill";
  if (s === "pago") cls += " ok";
  else if (s === "aguardando_pagamento") cls += " warn";
  else if (s === "em_analise") cls += " mid";
  else if (s === "cancelado" || s === "expirado") cls += " bad";
  return <span className={cls}>{labelStatus(s)}</span>;
}

function labelStatus(s) {
  if (s === "aguardando_pagamento") return "AGUARDANDO";
  if (s === "em_analise") return "EM ANÁLISE";
  if (s === "pago") return "PAGO";
  if (s === "retirado") return "RETIRADO";
  if (s === "expirado") return "EXPIRADO";
  if (s === "cancelado") return "CANCELADO";
  return s || "—";
}

function fmtDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function parseMoney(input) {
  const s = String(input || "").trim();
  if (!s) return NaN;
  const norm = s.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(norm);
  return Number.isFinite(n) ? n : NaN;
}

function moneyEq(a, b) {
  const x = Math.round(Number(a || 0) * 100);
  const y = Math.round(Number(b || 0) * 100);
  return x === y;
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
        grid-template-columns: repeat(4, 1fr);
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

      .grid {
        margin-top: 12px;
        display:grid;
        grid-template-columns: 1.2fr 0.8fr;
        gap: 12px;
      }

      .panel {
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
      .rowItem.active {
        border-color: rgba(37,99,235,0.30);
        box-shadow: 0 12px 24px rgba(15,23,42,0.10);
      }

      .left { flex: 1; min-width: 0; }
      .right { width: 220px; text-align: right; }
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
      .pill.warn { border-color: rgba(245,158,11,0.35); background: rgba(245,158,11,0.16); color: #7c2d12; }
      .pill.mid { border-color: rgba(59,130,246,0.22); background: rgba(59,130,246,0.10); color: #1e3a8a; }
      .pill.bad { border-color: rgba(239,68,68,0.22); background: rgba(239,68,68,0.10); color: #7f1d1d; }

      .btn {
        background: linear-gradient(180deg, var(--primary), var(--primary2));
        color: white;
        border: none;
        padding: 12px 14px;
        border-radius: 12px;
        font-weight: 900;
        cursor: pointer;
        min-width: 170px;
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
      .btn:disabled, .btnLight:disabled { opacity: 0.6; cursor: not-allowed; }

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

      .box {
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.85);
        border-radius: 16px;
        padding: 12px;
        margin-bottom: 10px;
      }
      .boxTitle { font-weight: 900; color: var(--muted); font-size: 12px; }
      .boxValue { font-weight: 900; font-size: 18px; margin-top: 6px; }
      .boxSmall { margin-top: 6px; font-size: 12px; color: var(--muted); }

      .actions { display:flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; margin-top: 10px; }
      .note {
        margin-top: 12px;
        font-size: 12px;
        color: var(--muted);
        background: rgba(15,23,42,0.04);
        border: 1px solid rgba(15,23,42,0.08);
        padding: 10px 12px;
        border-radius: 12px;
      }
      .linkBtn{
        background: transparent;
        border: none;
        color: #1d4ed8;
        font-weight: 900;
        cursor: pointer;
        padding: 0;
      }
      .linkBtn:hover { text-decoration: underline; }

      @media (max-width: 980px) {
        .grid { grid-template-columns: 1fr; }
        .kpis { grid-template-columns: repeat(2, 1fr); }
        .right { width: 180px; }
      }
      @media (max-width: 720px) {
        .filters { grid-template-columns: 1fr; }
        .span2 { grid-column: span 1; }
        .rowItem { flex-direction: column; }
        .right { width: 100%; text-align: left; display:flex; justify-content: space-between; align-items: baseline; }
        .btn { min-width: 100%; }
      }
    `}</style>
  );
}
