"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../src/lib/supabase";
import { useRouter } from "next/navigation";

export default function RelatorioProducao() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [carregando, setCarregando] = useState(false);

  const [erro, setErro] = useState(null);
  const [info, setInfo] = useState(null);

  const [organizaçãos, setOrganizacoes] = useState([]);
  const [campanhas, setCampanhas] = useState([]);

  const [organizacaoId, setOrganizacaoId] = useState("");
  const [campanhaId, setCampanhaId] = useState("");

  const [incluirPendentes, setIncluirPendentes] = useState(true);

  const [linhas, setLinhas] = useState([]); // { quantidade, pedido:{...}, sabor:{...} }
  const [campanhaAtual, setCampanhaAtual] = useState(null);

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

      if (uErr || !u || u.perfil !== "admin") {
        setErro("Sem permissão (RLS). Verifique se você está cadastrado em usuarios como admin.");
        setLoading(false);
        return;
      }

      await carregarOrganizacoes();
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarOrganizacoes() {
    setErro(null);
    setInfo(null);

    const { data, error } = await supabase
      .from("organizacoes")
      .select("id, nome, ativo, criado_em")
      .order("criado_em", { ascending: false });

    if (error) {
      console.error(error);
      setErro("Erro ao carregar organizaçãos.");
      return;
    }

    const lista = data || [];
    setOrganizacoes(lista);

    const ativo = lista.find((c) => c.ativo) || lista[0];
    if (ativo?.id) {
      setOrganizacaoId(ativo.id);
      await carregarCampanhas(ativo.id);
    }
  }

  async function carregarCampanhas(organizacao_id) {
    setErro(null);
    setInfo(null);

    setCampanhas([]);
    setCampanhaId("");
    setLinhas([]);
    setCampanhaAtual(null);

    const { data, error } = await supabase
      .from("campanhas")
      .select("id, organizacao_id, nome, ativa, data_inicio, data_fim, preco_base, criado_em")
      .eq("organizacao_id", organizacao_id)
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
      setCampanhaAtual(ativa);
      await carregarRelatorio(ativa.id, incluirPendentes);
    }
  }

  async function carregarRelatorio(campanha_id, incluir_pendentes) {
    setCarregando(true);
    setErro(null);
    setInfo(null);
    setLinhas([]);

    // Status para produção:
    const statusOk = incluir_pendentes
      ? ["aguardando_pagamento", "em_analise", "pago", "retirado"]
      : ["pago", "retirado"];

    // 1) Buscar pedidos da campanha com status permitido
    const { data: pedidos, error: pErr } = await supabase
      .from("pedidos")
      .select("id, status, codigo_pedido, nome_comprador, whatsapp, criado_em, campanha_id")
      .eq("campanha_id", campanha_id)
      .in("status", statusOk)
      .limit(5000);

    if (pErr) {
      console.error(pErr);
      setErro("Erro ao buscar pedidos para produção.");
      setCarregando(false);
      return;
    }

    const listaPedidos = pedidos || [];
    if (listaPedidos.length === 0) {
      setInfo(
        incluir_pendentes
          ? "Não há pedidos para esta campanha (aguardando/em análise/pago/retirado)."
          : "Não há pedidos PAGO/RETIRADO para esta campanha."
      );
      setCarregando(false);
      return;
    }

    const pedidoIds = listaPedidos.map((p) => p.id);

    // 2) Buscar pedido_itens desses pedidos + nome do sabor
    const { data: ps, error: psErr } = await supabase
      .from("pedido_itens")
      .select("pedido_id, item_id, quantidade, itens ( id, nome )")
      .in("pedido_id", pedidoIds)
      .limit(20000);

    if (psErr) {
      console.error(psErr);
      setErro("Erro ao buscar itens (pedido_itens).");
      setCarregando(false);
      return;
    }

    const listaPS = ps || [];
    if (listaPS.length === 0) {
      setInfo("Há pedidos, mas nenhum item de sabor foi encontrado (pedido_itens vazio).");
      setCarregando(false);
      return;
    }

    // 3) Montar linhas enriquecidas: item + pedido
    const mapPedido = new Map(listaPedidos.map((p) => [p.id, p]));
    const linhasFinal = listaPS
      .map((row) => {
        const pedido = mapPedido.get(row.pedido_id);
        if (!pedido) return null;
        return {
          quantidade: Number(row.quantidade || 0),
          pedido,
          sabor: row.itens || { id: row.item_id, nome: "Item" },
        };
      })
      .filter(Boolean);

    setLinhas(linhasFinal);
    setCarregando(false);
  }

  async function trocarOrganizacao(id) {
    setOrganizacaoId(id);
    await carregarCampanhas(id);
  }

  async function trocarCampanha(id) {
    setCampanhaId(id);
    const c = campanhas.find((x) => x.id === id) || null;
    setCampanhaAtual(c);
    await carregarRelatorio(id, incluirPendentes);
  }

  async function togglePendentes(v) {
    setIncluirPendentes(v);
    if (campanhaId) await carregarRelatorio(campanhaId, v);
  }

  const agregados = useMemo(() => {
    const porItem = new Map();
    const porStatus = new Map();
    let total = 0;

    for (const row of linhas) {
      const qtd = Number(row.quantidade || 0);
      const saborNome = row?.sabor?.nome || "Item";
      const status = row?.pedido?.status || "—";

      total += qtd;
      porItem.set(saborNome, (porItem.get(saborNome) || 0) + qtd);
      porStatus.set(status, (porStatus.get(status) || 0) + qtd);
    }

    const itensOrdenados = Array.from(porItem.entries())
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd);

    const statusOrdenados = Array.from(porStatus.entries())
      .map(([status, qtd]) => ({ status, qtd }))
      .sort((a, b) => b.qtd - a.qtd);

    return { total, itensOrdenados, statusOrdenados };
  }, [linhas]);

  function exportarCSV() {
    const linhasCsv = [];
    linhasCsv.push(["sabor", "quantidade"]);

    for (const s of agregados.itensOrdenados) {
      linhasCsv.push([s.nome, String(s.qtd)]);
    }

    linhasCsv.push([]);
    linhasCsv.push(["TOTAL", String(agregados.total)]);
    linhasCsv.push([]);
    linhasCsv.push(["Emitido em", new Date().toLocaleString("pt-BR")]);
    linhasCsv.push(["Campanha", campanhaAtual?.nome || "—"]);
    linhasCsv.push(["Pendentes", incluirPendentes ? "SIM" : "NÃO"]);

    const csv = linhasCsv.map((r) => r.map(csvEscape).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `producao_${campanhaId || "campanha"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function imprimir() {
    window.print();
  }

  if (loading) {
    return (
      <>
        <div className="bg">
          <div className="card">
            <h1>Relatório de Produção</h1>
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
          <div className="top noPrint">
            <div>
              <h1>Relatório de Produção</h1>
              <p className="muted">Totais por sabor para enviar ao fornecedor</p>
            </div>
            <div className="topRight">
              <button className="btnLight" onClick={() => router.push("/admin")}>
                Voltar
              </button>
              <button className="btnLight" onClick={exportarCSV} disabled={agregados.itensOrdenados.length === 0}>
                Exportar CSV
              </button>
              <button className="btn" onClick={imprimir}>
                Imprimir
              </button>
            </div>
          </div>

          {erro ? <div className="alert warn">{erro}</div> : null}
          {info ? <div className="alert info">{info}</div> : null}

          <div className="filters noPrint">
            <div>
              <label>Organização</label>
              <select value={organizacaoId} onChange={(e) => trocarOrganizacao(e.target.value)}>
                {organizaçãos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} {c.ativo ? "" : "(inativo)"}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label>Campanha</label>
              <select value={campanhaId} onChange={(e) => trocarCampanha(e.target.value)} disabled={!organizacaoId}>
                {campanhas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.ativa ? "⭐ " : ""}
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="span2">
              <label>Produção considera pendentes?</label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={incluirPendentes}
                  onChange={(e) => togglePendentes(e.target.checked)}
                />
                Incluir aguardando/em análise (recomendado enquanto ainda está vendendo)
              </label>
            </div>
          </div>

          {/* Cabeçalho para impressão */}
          <div className="headerPrint">
            <div className="hTitle">🍕 Produção — {campanhaAtual?.nome || "Campanha"}</div>
            <div className="hSub">
              Emissão: <strong>{new Date().toLocaleString("pt-BR")}</strong> • Pendentes:{" "}
              <strong>{incluirPendentes ? "SIM" : "NÃO"}</strong>
            </div>
          </div>

          <div className="kpis">
            <div className="kpi">
              <div className="kTitle">Total de pizzas</div>
              <div className="kValue">{agregados.total}</div>
              <div className="kSmall">{carregando ? "carregando…" : " "}</div>
            </div>

            <div className="kpi">
              <div className="kTitle">Itemes diferentes</div>
              <div className="kValue">{agregados.itensOrdenados.length}</div>
              <div className="kSmall">Ordenado por quantidade</div>
            </div>

            <div className="kpi">
              <div className="kTitle">Resumo por status</div>
              <div className="kSmall">
                {agregados.statusOrdenados.length
                  ? agregados.statusOrdenados
                      .slice(0, 6)
                      .map((s) => `${labelStatus(s.status)}: ${s.qtd}`)
                      .join(" • ")
                  : "—"}
              </div>
              <div className="kSmall muted2">(a soma por status equivale ao total)</div>
            </div>
          </div>

          <div className="panel">
            <div className="panelTitle">
              Totais por sabor
              {carregando ? <span className="miniMuted"> • carregando…</span> : null}
            </div>

            {agregados.itensOrdenados.length === 0 ? (
              <div className="empty">Nenhum dado encontrado para esta campanha.</div>
            ) : (
              <div className="table">
                <div className="thead">
                  <div>Item</div>
                  <div className="right">Qtd</div>
                </div>

                {agregados.itensOrdenados.map((s) => (
                  <div key={s.nome} className="trow">
                    <div className="name">{s.nome}</div>
                    <div className="right strong">{s.qtd}</div>
                  </div>
                ))}

                <div className="tfoot">
                  <div className="strong">TOTAL</div>
                  <div className="right strong">{agregados.total}</div>
                </div>
              </div>
            )}
          </div>

          <div className="note noPrint">
            Se aparecer “Há pedidos mas nenhum item”, significa que existem pedidos sem registros em{" "}
            <strong>pedido_itens</strong> (ou algum pedido foi criado e não gravou os itens).
          </div>
        </div>
      </div>

      <Style />
    </>
  );
}

/* ===== helpers ===== */

function labelStatus(s) {
  if (s === "aguardando_pagamento") return "AGUARDANDO";
  if (s === "em_analise") return "EM ANÁLISE";
  if (s === "pago") return "PAGO";
  if (s === "retirado") return "RETIRADO";
  if (s === "expirado") return "EXPIRADO";
  if (s === "cancelado") return "CANCELADO";
  return s || "—";
}

function csvEscape(v) {
  const s = String(v ?? "");
  if (s.includes(";") || s.includes("\n") || s.includes('"')) {
    return `"${s.replaceAll('"', '""')}"`;
  }
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
      .check { display:flex; gap: 8px; align-items:center; font-size: 13px; color: #0f172a; font-weight: 800; }

      .kpis {
        display:grid;
        grid-template-columns: 0.6fr 0.6fr 1.2fr;
        gap: 10px;
        margin-top: 12px;
      }
      .kpi {
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.80);
        border-radius: 16px;
        padding: 12px;
      }
      .kTitle { font-size: 12px; color: var(--muted); font-weight: 900; }
      .kValue { font-size: 22px; font-weight: 900; margin-top: 4px; }
      .kSmall { font-size: 12px; color: var(--muted); margin-top: 6px; }

      .panel {
        margin-top: 12px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.78);
        border-radius: 16px;
        padding: 14px;
      }
      .panelTitle { font-weight: 900; margin-bottom: 10px; }

      .table {
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.92);
        border-radius: 14px;
        overflow: hidden;
      }
      .thead, .trow, .tfoot {
        display:grid;
        grid-template-columns: 1fr 120px;
        gap: 12px;
        padding: 10px 12px;
      }
      .thead {
        font-weight: 900;
        background: rgba(15,23,42,0.04);
        border-bottom: 1px solid rgba(15,23,42,0.10);
      }
      .trow { border-bottom: 1px solid rgba(15,23,42,0.08); }
      .trow:last-child { border-bottom: none; }
      .tfoot {
        font-weight: 900;
        background: rgba(37,99,235,0.08);
        border-top: 1px solid rgba(37,99,235,0.18);
      }
      .right { text-align: right; }
      .strong { font-weight: 900; }
      .name { font-weight: 800; }

      .btn {
        background: linear-gradient(180deg, var(--primary), var(--primary2));
        color: white;
        border: none;
        padding: 12px 14px;
        border-radius: 12px;
        font-weight: 900;
        cursor: pointer;
        min-width: 140px;
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
      .alert.info { background: rgba(59,130,246,0.10); border-color: rgba(59,130,246,0.22); }

      .empty { color: var(--muted); font-size: 13px; padding: 8px 0; }

      .note {
        margin-top: 14px;
        font-size: 12px;
        color: var(--muted);
        background: rgba(15,23,42,0.04);
        border: 1px solid rgba(15,23,42,0.08);
        padding: 10px 12px;
        border-radius: 12px;
      }

      .headerPrint { display:none; margin-top: 6px; }
      .hTitle { font-weight: 900; font-size: 18px; }
      .hSub { margin-top: 6px; font-size: 12px; color: var(--muted); }

      @media print {
        body { background: white !important; }
        .bg { background: white !important; padding: 0 !important; }
        .card {
          box-shadow: none !important;
          border: none !important;
          background: white !important;
          padding: 0 !important;
          max-width: 100% !important;
        }
        .noPrint { display: none !important; }
        .headerPrint { display: block !important; }
        .panel, .kpi, .table { break-inside: avoid; }
      }

      @media (max-width: 900px) {
        .filters { grid-template-columns: 1fr; }
        .span2 { grid-column: span 1; }
        .kpis { grid-template-columns: 1fr; }
        .thead, .trow, .tfoot { grid-template-columns: 1fr 90px; }
      }
    `}</style>
  );
}
