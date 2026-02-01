"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { useRouter } from "next/navigation";

export default function AdminPedidos() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  const [clubes, setClubes] = useState([]);
  const [campanhas, setCampanhas] = useState([]);

  const [clubeId, setClubeId] = useState("");
  const [campanhaId, setCampanhaId] = useState("");

  const [busca, setBusca] = useState("");

  const [pedidos, setPedidos] = useState([]);
  const [itensPorPedido, setItensPorPedido] = useState({}); // { pedido_id: [{nome, quantidade}] }
  const [detalhe, setDetalhe] = useState(null);

  // =========================
  // Formatação de telefone (WhatsApp)
  // - no banco: somente dígitos
  // - no admin: exibir com máscara BR
  // =========================
  function sanitizePhoneDigits(v) {
    return String(v ?? "")
      .replace(/\D/g, "")
      .slice(0, 11);
  }

  function formatBRPhone(digits) {
    const d = sanitizePhoneDigits(digits);
    if (!d) return "";
    const ddd = d.slice(0, 2);
    const rest = d.slice(2);

    if (d.length < 3) return `(${ddd}`;
    if (rest.length <= 4) return `(${ddd}) ${rest}`;
    if (rest.length <= 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`;
  }

  useEffect(() => {
    (async () => {
      setErro(null);
      setOk(null);

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
    setDetalhe(null);

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
      await carregarPedidos(ativa.id);
    }
  }

  async function carregarPedidos(campanha_id) {
    setCarregandoLista(true);
    setErro(null);
    setOk(null);
    setDetalhe(null);

    const { data, error } = await supabase
      .from("pedidos")
      .select("id, codigo_pedido, nome_comprador, telefone, nome_desbravador, quantidade, valor_total, status, criado_em, campanha_id")
      .eq("campanha_id", campanha_id)
      .order("criado_em", { ascending: false })
      .limit(500);

    if (error) {
      console.error(error);
      setErro("Erro ao carregar pedidos.");
      setCarregandoLista(false);
      return;
    }

    const lista = data || [];
    setPedidos(lista);

    await carregarItens(lista.map((p) => p.id));
    setCarregandoLista(false);
  }

  async function carregarItens(pedidoIds) {
    if (!pedidoIds || pedidoIds.length === 0) {
      setItensPorPedido({});
      return;
    }

    // Join sabores (quando PostgREST reconhecer)
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

    // Fallback
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
    await carregarPedidos(id);
  }

  const pedidosFiltrados = useMemo(() => {
    const q = String(busca || "").trim().toLowerCase();
    if (!q) return pedidos;

    return pedidos.filter((p) => {
      const codigo = String(p.codigo_pedido || "").toLowerCase();
      const nome = String(p.nome_comprador || "").toLowerCase();
      const tel = String(p.telefone || "").toLowerCase();
      const desb = String(p.nome_desbravador || "").toLowerCase();
      return codigo.includes(q) || nome.includes(q) || tel.includes(q) || desb.includes(q);
    });
  }, [pedidos, busca]);

  const resumo = useMemo(() => {
    const total = pedidosFiltrados.length;
    const porStatus = (status) => pedidosFiltrados.filter((p) => p.status === status).length;
    const soma = pedidosFiltrados.reduce((acc, p) => acc + Number(p.valor_total || 0), 0);
    return {
      total,
      aguardando: porStatus("aguardando_pagamento"),
      emAnalise: porStatus("em_analise"),
      pago: porStatus("pago"),
      retirado: porStatus("retirado"),
      cancelado: porStatus("cancelado"),
      expirado: porStatus("expirado"),
      soma: Math.round(soma * 100) / 100,
    };
  }, [pedidosFiltrados]);

  async function atualizarStatus(pedido, novoStatus) {
    setErro(null);
    setOk(null);

    const confirmMsg = `Alterar status do pedido ${pedido.codigo_pedido || ""} para "${novoStatus}"?`;
    if (!confirm(confirmMsg)) return;

    const { error } = await supabase.from("pedidos").update({ status: novoStatus }).eq("id", pedido.id);

    if (error) {
      console.error(error);
      setErro(error.message);
      return;
    }

    setOk(`Status atualizado: ${pedido.codigo_pedido || "pedido"} → ${novoStatus} ✅`);
    setPedidos((prev) => prev.map((p) => (p.id === pedido.id ? { ...p, status: novoStatus } : p)));
    setDetalhe((prev) => (prev?.id === pedido.id ? { ...prev, status: novoStatus } : prev));
  }

  function exportarCSV() {
    const linhas = [];
    linhas.push([
      "codigo_pedido",
      "nome_comprador",
      "telefone",
      "nome_desbravador",
      "quantidade",
      "valor_total",
      "status",
      "criado_em",
      "sabores",
    ]);

    for (const p of pedidosFiltrados) {
      const itens = itensPorPedido[p.id] || [];
      const saboresTxt = itens.map((i) => `${i.nome} x${i.quantidade}`).join(" | ");
      linhas.push([
        p.codigo_pedido || "",
        p.nome_comprador || "",
        p.telefone || "",
        p.nome_desbravador || "",
        String(p.quantidade ?? ""),
        String(Number(p.valor_total || 0).toFixed(2)),
        p.status || "",
        p.criado_em || "",
        saboresTxt,
      ]);
    }

    const csv = linhas.map((row) => row.map(csvEscape).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos_${campanhaId || "campanha"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <>
        <div className="bg">
          <div className="card">
            <h1>Pedidos</h1>
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
              <h1>Pedidos / Financeiro</h1>
              <p className="muted">Listar, buscar, exportar e mudar status</p>
            </div>

            <div className="topRight">
              <button className="btnLight" onClick={() => router.push("/admin")}>
                Voltar
              </button>
              <button className="btnLight" onClick={() => router.push("/admin/pagamentos")}>
                Conciliação PIX
              </button>
              <button className="btnLight" onClick={() => router.push("/admin/pagamentos/historico")}>
                Histórico PIX
              </button>
              <button className="btnLight" onClick={exportarCSV} disabled={pedidosFiltrados.length === 0}>
                Exportar CSV
              </button>
              <button className="btn" onClick={() => carregarPedidos(campanhaId)} disabled={!campanhaId}>
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
                    {c.ativa ? "⭐ " : ""}{c.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="span2">
              <label>Buscar</label>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Código (DP-000123), nome, telefone, desbravador…"
              />
            </div>
          </div>

          <div className="kpis">
            <div className="kpi">
              <div className="kTitle">Pedidos</div>
              <div className="kValue">{resumo.total}</div>
            </div>
            <div className="kpi">
              <div className="kTitle">Aguardando</div>
              <div className="kValue">{resumo.aguardando}</div>
            </div>
            <div className="kpi">
              <div className="kTitle">Em análise</div>
              <div className="kValue">{resumo.emAnalise}</div>
            </div>
            <div className="kpi">
              <div className="kTitle">Pago</div>
              <div className="kValue">{resumo.pago}</div>
            </div>
            <div className="kpi">
              <div className="kTitle">Soma (lista)</div>
              <div className="kValue">R$ {Number(resumo.soma).toFixed(2)}</div>
            </div>
          </div>

          <div className="panel">
            <div className="panelTitle">
              Lista
              {carregandoLista ? <span className="miniMuted"> • carregando…</span> : null}
            </div>

            {pedidosFiltrados.length === 0 ? (
              <div className="empty">Nenhum pedido encontrado.</div>
            ) : (
              <div className="list">
                {pedidosFiltrados.map((p) => {
                  const itens = itensPorPedido[p.id] || [];
                  return (
                    <button key={p.id} className="rowItem" onClick={() => setDetalhe(p)} type="button">
                      <div className="left">
                        <div className="rowTitle">
                          <span className="mono">{p.codigo_pedido || "—"}</span>
                          <StatusPill status={p.status} />
                        </div>
                        <div className="rowSub">
                          <strong>{sanitizeOnlyLetters(p.nome_comprador)}</strong> • {formatBRPhone(p.telefone) || "—"} • Desbravador: {sanitizeOnlyLetters(p.nome_desbravador)}
                        </div>
                        <div className="rowSub">
                          {itens.length > 0 ? (
                            <span className="muted2">{itens.map((i) => `${i.nome} x${i.quantidade}`).join(" • ")}</span>
                          ) : (
                            <span className="muted2">Sabores: —</span>
                          )}
                        </div>
                      </div>

                      <div className="right">
                        <div className="price">R$ {Number(p.valor_total || 0).toFixed(2)}</div>
                        <div className="small muted2">{fmtDateTime(p.criado_em)}</div>
                        <div className="small muted2">Qtd: {p.quantidade}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {detalhe ? (
            <div className="modalBackdrop" onClick={() => setDetalhe(null)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modalTop">
                  <div>
                    <div className="modalTitle">
                      Pedido <span className="mono">{detalhe.codigo_pedido || "—"}</span>
                      <StatusPill status={detalhe.status} />
                    </div>
                    <div className="modalSub">
                      {sanitizeOnlyLetters(detalhe.nome_comprador)} • {formatBRPhone(detalhe.telefone) || "—"} • Desbravador: {sanitizeOnlyLetters(detalhe.nome_desbravador)}
                    </div>
                  </div>
                  <button className="btnMini" onClick={() => setDetalhe(null)} type="button">
                    Fechar
                  </button>
                </div>

                <div className="modalGrid">
                  <div className="box">
                    <div className="boxTitle">Total</div>
                    <div className="boxValue">R$ {Number(detalhe.valor_total || 0).toFixed(2)}</div>
                    <div className="boxSmall">Criado em {fmtDateTime(detalhe.criado_em)}</div>
                    <div className="boxSmall">Quantidade: {detalhe.quantidade}</div>
                  </div>

                  <div className="box">
                    <div className="boxTitle">Sabores</div>
                    <div className="chips">
                      {(itensPorPedido[detalhe.id] || []).length ? (
                        (itensPorPedido[detalhe.id] || []).map((i, idx) => (
                          <span key={idx} className="chip">
                            {i.nome} x{i.quantidade}
                          </span>
                        ))
                      ) : (
                        <span className="muted2">—</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="actions">
                  <button className="btn" type="button" onClick={() => atualizarStatus(detalhe, "pago")}>
                    Marcar como PAGO
                  </button>
                  <button className="btnLight" type="button" onClick={() => atualizarStatus(detalhe, "retirado")}>
                    Marcar como RETIRADO
                  </button>
                  <button className="btnLight" type="button" onClick={() => atualizarStatus(detalhe, "em_analise")}>
                    Em ANÁLISE
                  </button>
                  <button className="btnDanger" type="button" onClick={() => atualizarStatus(detalhe, "cancelado")}>
                    CANCELAR
                  </button>
                </div>

                <div className="note">
                  Dica: para pagar via extrato, use <strong>Conciliação PIX</strong> ou consulte o <strong>Histórico PIX</strong>.
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

function sanitizeOnlyLetters(v) {
  const raw = String(v ?? "").normalize("NFKC");
  return raw
    .replace(/[^\p{L} ]+/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function StatusPill({ status }) {
  const s = String(status || "");
  let cls = "pill";
  if (s === "pago") cls += " ok";
  else if (s === "retirado") cls += " info";
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

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes(";") || s.includes("\n") || s.includes('"')) return `"${s.replaceAll('"', '""')}"`;
  return s;
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
        max-width: 1180px;
        background: var(--card);
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: 18px;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35);
        padding: 22px;
        backdrop-filter: blur(10px);
      }

      .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
      .topRight { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }

      h1 { margin: 0; font-size: 22px; }
      .muted { color: var(--muted); font-size: 13px; margin: 6px 0 0 0; }
      .muted2 { color: var(--muted); }
      .miniMuted { color: var(--muted); font-size: 12px; font-weight: 600; }

      label { display: block; font-size: 12px; color: var(--muted); margin: 6px 0; }
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
      input:focus, select:focus {
        border-color: rgba(37,99,235,0.55);
        box-shadow: 0 0 0 4px rgba(37,99,235,0.12);
      }

      .filters {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        padding: 12px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.78);
        border-radius: 16px;
      }
      .span2 { grid-column: span 2; }

      .kpis { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-top: 12px; }
      .kpi {
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.80);
        border-radius: 16px;
        padding: 12px;
      }
      .kTitle { font-size: 12px; color: var(--muted); font-weight: 700; }
      .kValue { font-size: 18px; font-weight: 900; margin-top: 4px; }

      .panel { margin-top: 12px; border: 1px solid rgba(15,23,42,0.10); background: rgba(255,255,255,0.78); border-radius: 16px; padding: 14px; }
      .panelTitle { font-weight: 900; margin-bottom: 10px; }

      .list { display: flex; flex-direction: column; gap: 10px; }
      .rowItem {
        text-align: left;
        width: 100%;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.92);
        border-radius: 14px;
        padding: 12px;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        cursor: pointer;
        transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
      }
      .rowItem:hover {
        transform: translateY(-1px);
        border-color: rgba(37,99,235,0.22);
        box-shadow: 0 12px 24px rgba(15,23,42,0.10);
      }

      .left { flex: 1; min-width: 0; }
      .right { width: 220px; text-align: right; }
      .rowTitle { font-weight: 900; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
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
      .pill.info { border-color: rgba(16,185,129,0.22); background: rgba(16,185,129,0.10); color: #064e3b; }
      .pill.bad { border-color: rgba(239,68,68,0.22); background: rgba(239,68,68,0.10); color: #7f1d1d; }

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
      .btnDanger {
        background: rgba(239, 68, 68, 0.12);
        color: #7f1d1d;
        border: 1px solid rgba(239, 68, 68, 0.22);
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

      .alert { border-radius: 12px; padding: 10px 12px; border: 1px solid rgba(15,23,42,0.12); margin: 10px 0; font-size: 13px; }
      .alert.warn { background: rgba(245, 158, 11, 0.16); border-color: rgba(245,158,11,0.35); }
      .alert.ok { background: rgba(34,197,94,0.12); border-color: rgba(34,197,94,0.22); }

      .empty { color: var(--muted); font-size: 13px; padding: 8px 0; }

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
      .modalTop { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
      .modalTitle { font-weight: 900; font-size: 16px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
      .modalSub { margin-top: 6px; color: var(--muted); font-size: 12px; }

      .modalGrid { margin-top: 12px; display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 12px; }
      .box { border: 1px solid rgba(15,23,42,0.10); background: rgba(255,255,255,0.85); border-radius: 16px; padding: 12px; }
      .boxTitle { font-weight: 900; color: var(--muted); font-size: 12px; }
      .boxValue { font-weight: 900; font-size: 22px; margin-top: 6px; }
      .boxSmall { margin-top: 6px; font-size: 12px; color: var(--muted); }

      .chips { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; }
      .chip { font-size: 12px; border-radius: 999px; padding: 6px 10px; border: 1px solid rgba(15,23,42,0.12); background: rgba(15,23,42,0.05); font-weight: 800; }

      .actions { margin-top: 12px; display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
      .note { margin-top: 12px; font-size: 12px; color: var(--muted); background: rgba(15,23,42,0.04); border: 1px solid rgba(15,23,42,0.08); padding: 10px 12px; border-radius: 12px; }

      @media (max-width: 980px) {
        .kpis { grid-template-columns: repeat(2, 1fr); }
        .right { width: 180px; }
      }
      @media (max-width: 720px) {
        .filters { grid-template-columns: 1fr; }
        .span2 { grid-column: span 1; }
        .rowItem { flex-direction: column; }
        .right { width: 100%; text-align: left; display: flex; justify-content: space-between; align-items: baseline; }
        .modalGrid { grid-template-columns: 1fr; }
        .actions { justify-content: stretch; }
        .btn { min-width: 100%; }
      }
    `}</style>
  );
}
