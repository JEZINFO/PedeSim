"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { useRouter } from "next/navigation";


function safeLog(...args) {
  try {
    if (typeof console !== "undefined" && console && typeof console.error === "function") {
      console.error(...args);
    }
  } catch (_) {}
}


function normStatus(v) {
  return String(v ?? "").trim().toLowerCase();
}

/**
 * Dashboard / Relatório (Admin)
 * - Receita vs Custo vs Lucro por campanha
 * - Clique na campanha para detalhar por "nome_referencia" (desbravador) e lucro
 * - Filtros: organização, campanha, nome_referencia, nome_comprador
 * - Exportar CSV (resumo e detalhado)
 *
 * ⚠️ Ajustes possíveis conforme seu schema:
 * - Esta página assume que pedidos tem: campanha_id, organizacao_id, nome_comprador, nome_referencia, valor_total, status, criado_em
 * *   Se seu schema for diferente, me diga os nomes e eu ajusto.
 */

export default function AdminRelatorios() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  const [organizacoes, setOrganizacoes] = useState([]);
  const [campanhas, setCampanhas] = useState([]);

  // filtros
  const [fOrganizacao, setFOrganizacao] = useState("");
  const [fCampanha, setFCampanha] = useState("");
  const [fReferencia, setFReferencia] = useState("");
  const [fComprador, setFComprador] = useState("");
  const [somentePagos, setSomentePagos] = useState(false);

  // dados brutos e agregados
  const [pedidos, setPedidos] = useState([]);
  const [excluidosNoFetch, setExcluidosNoFetch] = useState(0);

  // detalhe
  const [campanhaSelecionada, setCampanhaSelecionada] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push("/login");
        return;
      }
      await carregarBase();
      await buscar();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarBase() {
    setLoading(true);
    setErro(null);

    // 1) organizações
    const { data: orgData, error: orgErr } = await supabase
      .from("organizacoes")
      .select("id, nome, ativo, criado_em")
      .order("criado_em", { ascending: false });

    if (orgErr) {
      safeLog(orgErr);
      setErro(`Erro ao carregar organizações: ${orgErr?.message || "desconhecido"} (verifique RLS/admin).`);
      setLoading(false);
      return;
    }
    setOrganizacoes(orgData || []);

    // 2) campanhas (com custo)
    const { data: campData, error: campErr } = await supabase
      .from("campanhas")
      .select("id, organizacao_id, nome, data_inicio, data_fim, preco_base, custo_pizza, identificador_centavos, ativa, criado_em")
      .order("criado_em", { ascending: false });

    if (campErr) {
      safeLog(campErr);
      setErro(`Erro ao carregar campanhas: ${campErr?.message || "desconhecido"}.`);
      setLoading(false);
      return;
    }
    setCampanhas(campData || []);

    // defaults de filtro (se tiver 1 org, facilita)
    if ((orgData || []).length === 1) setFOrganizacao(orgData[0].id);

    setLoading(false);
  }

  async function buscar() {
    setErro(null);
    setLoading(true);

    try {
      // Buscamos pedidos + campanha (para custo_pizza) + itens (para quantidade)
      // Ajuste o select caso seu schema use outros nomes.
      let q = supabase
        .from("pedidos")
        .select(`id,
          campanha_id,
          nome_comprador,
          nome_referencia,
          quantidade,
          valor_total,
          status,
          criado_em,
          campanhas:campanhas ( id, nome, organizacao_id, custo_pizza, preco_base ),
          pedido_itens ( quantidade )`)
        .order("criado_em", { ascending: false });

      // filtros
      if (fOrganizacao) q = q.eq("campanhas.organizacao_id", fOrganizacao);
      if (fCampanha) q = q.eq("campanha_id", fCampanha);
      if (String(fReferencia || "").trim()) q = q.ilike("nome_referencia", `%${String(fReferencia).trim()}%`);
      if (String(fComprador || "").trim()) q = q.ilike("nome_comprador", `%${String(fComprador).trim()}%`);

      // Filtrar somente pedidos pagos/confirmados (opcional)
      if (somentePagos) {
        // Ajuste os status conforme seu fluxo real
        q = q.in("status", ["pago", "confirmado", "aprovado", "concluido"]);
      }
      const { data, error } = await q;

      if (error) {
        safeLog(error);
        setErro(`Erro ao buscar pedidos: ${error?.message || "desconhecido"} (verifique RLS/colunas/relacionamentos)`);
        setPedidos([]);
        setLoading(false);
        return;
      }

      const listaBruta = data || [];
      const lista = listaBruta.filter((p) => normStatus(p?.status) !== "excluido");
      setPedidos(lista);
      setExcluidosNoFetch(Math.max(0, listaBruta.length - lista.length));
      setLoading(false);
    } catch (e) {
      safeLog(e);
      setErro("Erro inesperado ao buscar.");
      setPedidos([]);
      setLoading(false);
    }
  }

  // Helpers de cálculo
  function pedidoQtdPizzas(p) {
    // Regra híbrida (consistência):
    // - Se existir pedido_itens com quantidade, somamos os itens (fonte mais detalhada)
    // - Caso contrário, usamos pedidos.quantidade
    const itens = Array.isArray(p?.pedido_itens) ? p.pedido_itens : [];
    const somaItens = itens.reduce((acc, it) => acc + Number(it?.quantidade || 0), 0);
    if (somaItens > 0) return somaItens;
    return Number(p?.quantidade || 0);
  }

  const organizacoesMap = useMemo(() => {
    const m = new Map();
    (organizacoes || []).forEach((o) => m.set(o.id, o.nome));
    return m;
  }, [organizacoes]);

  const campanhasMap = useMemo(() => {
    const m = new Map();
    (campanhas || []).forEach((c) => m.set(c.id, c));
    return m;
  }, [campanhas]);

  const resumoPorCampanha = useMemo(() => {
    const by = new Map();

    for (const p of pedidos || []) {
      const cid = p.campanha_id || "—";
      const camp = campanhasMap.get(cid) || p.campanhas || {};
      const custoUnit = Number(camp?.custo_pizza || 0);

      const qtd = pedidoQtdPizzas(p);
      const receita = Number(p?.valor_total || 0);
      const custo = qtd * custoUnit;

      if (!by.has(cid)) {
        by.set(cid, {
          campanha_id: cid,
          campanha_nome: camp?.nome || (cid === "—" ? "(Sem campanha)" : "—"),
          organizacao_id: p?.campanhas?.organizacao_id || camp?.organizacao_id || "",
          qtd_pizzas: 0,
          receita: 0,
          custo_total: 0,
          lucro: 0,
        });
      }

      const row = by.get(cid);
      row.qtd_pizzas += qtd;
      row.receita += receita;
      row.custo_total += custo;
      row.lucro = row.receita - row.custo_total;
    }

    return Array.from(by.values()).sort((a, b) => (b.receita || 0) - (a.receita || 0));
  }, [pedidos, campanhasMap]);

  const totalGeral = useMemo(() => {
    const t = { qtd_pizzas: 0, receita: 0, custo_total: 0, lucro: 0 };
    for (const r of resumoPorCampanha) {
      t.qtd_pizzas += r.qtd_pizzas;
      t.receita += r.receita;
      t.custo_total += r.custo_total;
      t.lucro += r.lucro;
    }
    return t;
  }, [resumoPorCampanha]);

  const detalhePorReferencia = useMemo(() => {
    if (!campanhaSelecionada) return [];
    const cid = campanhaSelecionada.campanha_id;

    const by = new Map();

    for (const p of pedidos || []) {
      if (p.campanha_id !== cid) continue;

      const nome = String(p?.nome_referencia || "—").trim() || "—";
      const camp = campanhasMap.get(cid) || p.campanhas || {};
      const custoUnit = Number(camp?.custo_pizza || 0);

      const qtd = pedidoQtdPizzas(p);
      const receita = Number(p?.valor_total || 0);
      const custo = qtd * custoUnit;
      const lucro = receita - custo;

      if (!by.has(nome)) {
        by.set(nome, { nome_referencia: nome, qtd_pizzas: 0, receita: 0, custo_total: 0, lucro: 0 });
      }

      const row = by.get(nome);
      row.qtd_pizzas += qtd;
      row.receita += receita;
      row.custo_total += custo;
      row.lucro += lucro;
    }

    return (Array.from(by.values()).sort((a, b) => (b.lucro || 0) - (a.lucro || 0)) || []).slice().sort((a, b) =>
      String(a?.nome_referencia || "")
        .localeCompare(String(b?.nome_referencia || ""), "pt-BR", { sensitivity: "base" })
    );
  }, [campanhaSelecionada, pedidos, campanhasMap]);

  function money(v) {
    const n = Number(v || 0);
    return `R$ ${n.toFixed(2)}`;
  }

  function exportCsv(rows, filename = "relatorio.csv") {
    const esc = (v) => {
      const s = String(v ?? "");
      if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    if (!rows || rows.length === 0) {
      alert("Nada para exportar.");
      return;
    }

    const headers = Object.keys(rows[0]);
    const lines = [headers.map(esc).join(",")];

    for (const r of rows) {
      lines.push(headers.map((h) => esc(r[h])).join(","));
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const resumoExport = useMemo(() => {
    return (resumoPorCampanha || []).map((r) => ({
      organizacao: organizacoesMap.get(r.organizacao_id) || r.organizacao_id || "—",
      campanha: r.campanha_nome,
      qtd_pizzas: r.qtd_pizzas,
      receita: Number(r.receita || 0).toFixed(2),
      custo_total: Number(r.custo_total || 0).toFixed(2),
      lucro: Number(r.lucro || 0).toFixed(2),
      margem_percent: r.receita > 0 ? ((r.lucro / r.receita) * 100).toFixed(2) : "0.00",
    }));
  }, [resumoPorCampanha, organizacoesMap]);

  const detalheExport = useMemo(() => {
    if (!campanhaSelecionada) return [];
    return (detalhePorReferencia || []).map((d) => ({
      campanha: campanhaSelecionada.campanha_nome,
      referencia: d.nome_referencia,
      qtd_pizzas: d.qtd_pizzas,
      receita: Number(d.receita || 0).toFixed(2),
      custo_total: Number(d.custo_total || 0).toFixed(2),
      lucro: Number(d.lucro || 0).toFixed(2),
      margem_percent: d.receita > 0 ? ((d.lucro / d.receita) * 100).toFixed(2) : "0.00",
    }));
  }, [campanhaSelecionada, detalhePorReferencia]);

  if (loading) {
    return (
      <>
        <div className="bg">
          <div className="card">
            <h1>Relatórios</h1>
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
        <div className="topLeft">
          <h1>Relatórios</h1>
        </div>

        <div className="topRight">
          <button className="btnMini" onClick={() => router.back()}>
            Voltar
          </button>

          <button
            className="btnLight"
            onClick={() => exportCsv(resumoExport, "resumo_campanhas.csv")}
            disabled={resumoExport.length === 0}
          >
            Exportar resumo (CSV)
          </button>

          <button
            className="btnLight"
            onClick={() =>
              exportCsv(
                pedidos.map((p) => ({
                  id: p.id,
                  campanha: p?.campanhas?.nome || "",
                  nome_referencia: p?.nome_referencia || "",
                  nome_comprador: p?.nome_comprador || "",
                  quantidade: p.quantidade_calculada || p.quantidade || 0,
                  valor_total: p.valor_total,
                  status: p.status,
                  criado_em: p.criado_em,
                })),
                "pedidos_filtrados.csv"
              )
            }
            disabled={pedidos.length === 0}
          >
            Exportar pedidos (CSV)
          </button>

          {campanhaSelecionada && (
            <button
              className="btnLight"
              onClick={() =>
                exportCsv(
                  detalheExport,
                  `detalhe_${campanhaSelecionada.campanha_nome}.csv`
                )
              }
              disabled={detalheExport.length === 0}
            >
              Exportar detalhe (CSV)
            </button>
          )}
        </div>
      </div>


          {erro ? <div className="alert warn">{erro}</div> : null}

          <div className="panel">
            <div className="panelTitle">Filtros</div>

            <div className="filters">
              <div>
                <label>Organização</label>
                <select value={fOrganizacao} onChange={(e) => setFOrganizacao(e.target.value)}>
                  <option value="">Todas…</option>
                  {organizacoes.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome} {o.ativo ? "" : "(inativa)"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label>Campanha</label>
                <select value={fCampanha} onChange={(e) => setFCampanha(e.target.value)}>
                  <option value="">Todas…</option>
                  {campanhas
                    .filter((c) => (fOrganizacao ? c.organizacao_id === fOrganizacao : true))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label>Nome referência (desbravador)</label>
                <input value={fReferencia} onChange={(e) => setFReferencia(e.target.value)} placeholder="Ex: Maria" />
              </div>

              <div>
                <label>Nome comprador</label>
                <input value={fComprador} onChange={(e) => setFComprador(e.target.value)} placeholder="Ex: João" />
              </div>

              <div className="checkWrap">
                <label className="check">
                  <input type="checkbox" checked={somentePagos} onChange={(e) => setSomentePagos(e.target.checked)} />
                  Mostrar somente pagos/confirmados
                </label>
              </div>

              <div className="filtersBtns">
                <button className="btn" onClick={buscar}>
                  Buscar
                </button>

                <button
                  className="btnLight"
                  onClick={() => exportCsv(resumoExport, "resumo_campanhas.csv")}
                  disabled={resumoExport.length === 0}
                  title={resumoExport.length === 0 ? "Faça uma busca para gerar o resumo antes de exportar." : "Baixar resumo em CSV"}
                >
                  Baixar resumo (CSV)
                </button>

                <button
                  className="btnLight"
                  onClick={() =>
                    exportCsv(
                      (pedidos || []).map((p) => ({
                        id: p.id,
                        campanha_id: p.campanha_id,
                        campanha: p?.campanhas?.nome || "—",
                        organizacao_id: p?.campanhas?.organizacao_id || "—",
                        nome_referencia: p?.nome_referencia || "",
                        nome_comprador: p?.nome_comprador || "",
                        quantidade_pedido: Number(p?.quantidade || 0),
                        quantidade_itens: (Array.isArray(p?.pedido_itens) ? p.pedido_itens.reduce((a, it) => a + Number(it?.quantidade || 0), 0) : 0),
                        quantidade_calculada: (Array.isArray(p?.pedido_itens) ? (p.pedido_itens.reduce((a, it) => a + Number(it?.quantidade || 0), 0) || Number(p?.quantidade || 0)) : Number(p?.quantidade || 0)),
                        valor_total: Number(p?.valor_total || 0).toFixed(2),
                        status: p?.status || "",
                        criado_em: p?.criado_em || "",
                      })),
                      "pedidos_filtrados.csv"
                    )
                  }
                  disabled={pedidos.length === 0}
                  title={pedidos.length === 0 ? "Nenhum pedido carregado para exportar." : "Baixar pedidos filtrados em CSV"}
                >
                  Baixar pedidos (CSV)
                </button>
              </div>
            </div>

            <div className="cards">
              <Card title="Qtd pizzas" value={String(totalGeral.qtd_pizzas)} />
              <Card title="Receita" value={money(totalGeral.receita)} />
              <Card title="Custo" value={money(totalGeral.custo_total)} />
              <Card title="Lucro" value={money(totalGeral.lucro)} />
            </div>

            <div className="note">
              Clique em uma campanha para ver o detalhamento por <strong>referência (desbravador)</strong> e baixar o CSV detalhado.
            </div>

            <div className="note" style={{ marginTop: 10 }}>
              <strong>Pedidos carregados:</strong> {pedidos.length}{" "}
              {pedidos.length > 0 ? (
                <>
                  • <strong>Status encontrados:</strong>{" "}
                  {Object.entries(
                    (pedidos || []).reduce((acc, p) => {
                      const s = normStatus(p?.status) || "—";
                      acc[s] = (acc[s] || 0) + 1;
                      return acc;
                    }, {})
                  )
                    .sort((a, b) => b[1] - a[1])
                    .map(([s, n]) => `${s}(${n})`)
                    .join(", ")}
                </>
              ) : null}
            </div>
              <div className="note" style={{ marginTop: 10 }}>
                <strong>Diagnóstico:</strong>{" "}
                {(() => {
                  const semCampanha = (pedidos || []).filter((p) => !p?.campanha_id).length;
                  const campanhaNaoCarregou = (pedidos || []).filter((p) => p?.campanha_id && !p?.campanhas).length;
                  return (
                    <>
                      Pedidos sem campanha_id: <strong>{semCampanha}</strong> • Campanha não carregada (RLS/relacionamento):{" "}
                      <strong>{campanhaNaoCarregou}</strong>
                    </>
                  );
                })()}
              </div>
              <div className="note" style={{ marginTop: 10 }}>
                <strong>Diagnóstico de quantidade:</strong>{" "}
                {(() => {
                  const arr = pedidos || [];
                  let mismatch = 0;
                  let qtdPedidoTotal = 0;
                  let qtdItensTotal = 0;
                  for (const p of arr) {
                    const qp = Number(p?.quantidade || 0);
                    const itens = Array.isArray(p?.pedido_itens) ? p.pedido_itens : [];
                    const qi = itens.reduce((acc, it) => acc + Number(it?.quantidade || 0), 0);
                    qtdPedidoTotal += qp;
                    qtdItensTotal += qi;
                    if (qi > 0 && qp !== qi) mismatch += 1;
                  }
                  return (
                    <>
                      Soma pedidos.quantidade: <strong>{qtdPedidoTotal}</strong> • Soma pedido_itens.quantidade:{" "}
                      <strong>{qtdItensTotal}</strong> • Pedidos com divergência: <strong>{mismatch}</strong>
                    </>
                  );
                })()}
              </div>


          </div>

          <div className="grid">
            <div className="panel">
              <div className="panelTitle">Resumo por campanha</div>

              {resumoPorCampanha.length === 0 ? (
                <div className="empty">Nenhum dado retornado. (Os pedidos são carregados automaticamente; verifique filtros e permissões se zerado.)</div>
              ) : (
                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Organização</th>
                        <th>Campanha</th>
                        <th style={{ textAlign: "right" }}>Qtd</th>
                        <th style={{ textAlign: "right" }}>Receita</th>
                        <th style={{ textAlign: "right" }}>Custo</th>
                        <th style={{ textAlign: "right" }}>Lucro</th>
                        <th style={{ textAlign: "right" }}>Margem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumoPorCampanha.map((r) => {
                        const margem = r.receita > 0 ? (r.lucro / r.receita) * 100 : 0;
                        const isSel = campanhaSelecionada?.campanha_id === r.campanha_id;
                        return (
                          <tr
                            key={r.campanha_id}
                            className={isSel ? "rowSel" : ""}
                            onClick={() => setCampanhaSelecionada(r)}
                            role="button"
                            tabIndex={0}
                          >
                            <td data-label="Organização">{organizacoesMap.get(r.organizacao_id) || "—"}</td>
                            <td data-label="Campanha"><span className="link">{r.campanha_nome}</span></td>
                            <td data-label="Qtd" style={{ textAlign: "right" }}>{r.qtd_pizzas}</td>
                            <td data-label="Receita" style={{ textAlign: "right" }}>{money(r.receita)}</td>
                            <td data-label="Custo" style={{ textAlign: "right" }}>{money(r.custo_total)}</td>
                            <td data-label="Lucro" style={{ textAlign: "right" }}>{money(r.lucro)}</td>
                            <td style={{ textAlign: "right" }}>{margem.toFixed(2)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="panel">
              <div className="panelTitle">Detalhe por referência (desbravador)</div>

              {!campanhaSelecionada ? (
                <div className="empty">Selecione uma campanha no resumo ao lado.</div>
              ) : (
                <>
                  <div className="detailTop">
                    <div className="detailTitle">
                      <strong>{campanhaSelecionada.campanha_nome}</strong>
                      <span className="muted">
                        {" "}
                        • Qtd {campanhaSelecionada.qtd_pizzas} • Receita {money(campanhaSelecionada.receita)} • Lucro{" "}
                        {money(campanhaSelecionada.lucro)}
                      </span>
                    </div>
                    <div className="detailBtns">
                      <button
                        className="btnLight"
                        onClick={() => exportCsv(detalheExport, `detalhe_${slug(campanhaSelecionada.campanha_nome)}.csv`)}
                      >
                        Baixar detalhe por referência (CSV)
                      </button>
                      <button className="btnMini danger" onClick={() => setCampanhaSelecionada(null)}>
                        Fechar
                      </button>
                    </div>
                  </div>

                  {detalhePorReferencia.length === 0 ? (
                    <div className="empty">Sem dados para essa campanha (com os filtros atuais).</div>
                  ) : (
                    <div className="tableWrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Referência</th>
                            <th style={{ textAlign: "right" }}>Qtd</th>
                            <th style={{ textAlign: "right" }}>Receita</th>
                            <th style={{ textAlign: "right" }}>Custo</th>
                            <th style={{ textAlign: "right" }}>Lucro</th>
                            <th style={{ textAlign: "right" }}>Margem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detalhePorReferencia.map((d) => {
                            const margem = d.receita > 0 ? (d.lucro / d.receita) * 100 : 0;
                            return (
                              <tr key={d.nome_referencia}>
                                <td>{d.nome_referencia}</td>
                                <td style={{ textAlign: "right" }}>{d.qtd_pizzas}</td>
                                <td style={{ textAlign: "right" }}>{money(d.receita)}</td>
                                <td style={{ textAlign: "right" }}>{money(d.custo_total)}</td>
                                <td style={{ textAlign: "right" }}>{money(d.lucro)}</td>
                                <td style={{ textAlign: "right" }}>{margem.toFixed(2)}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="note" style={{ marginTop: 10 }}>
                    * O custo é calculado como <strong>qtd_pizzas × custo_pizza</strong> da campanha.
                    Se o seu fluxo tiver itens diferentes, me diga o schema que eu ajusto.
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

function slug(s) {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
}

  function getPrecoBaseCampanha(c) {
    const v = Number(c?.campanhas?.preco_base ?? c?.preco_base ?? 0);
    return Number.isFinite(v) ? v : 0;
  }


function Card({ title, value }) {
  return (
    <div className="kpi">
      <div className="kpiTitle">{title}</div>
      <div className="kpiValue">{value}</div>
    </div>
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
        padding: 18px 14px;
        display: grid;
        place-items: start center;
      }
      .card {
        width: 100%;
        max-width: 1200px;
        min-width: 0;
        background: var(--card);
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: 18px;
        box-shadow: 0 25px 60px rgba(0,0,0,0.35);
        padding: 18px;
        backdrop-filter: blur(10px);
      }
      .top { display:flex; align-items:flex-start; justify-content:space-between; gap: 12px; margin-bottom: 14px; }
      .topRight { display:flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; align-items: center; }
      h1 { margin: 0; font-size: 22px; }
      .muted { color: var(--muted); font-size: 13px; margin: 6px 0 0 0; }

      .panel {
        border: 1px solid rgba(15,23,42,0.12);
        background: rgba(255,255,255,0.78);
        border-radius: 16px;
        padding: 14px;
        min-width: 0;
      }
      .panelTitle { font-weight: 900; margin-bottom: 10px; }

      .filters {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 10px;
        align-items: end;
      }
      .filtersBtns { display:flex; gap: 10px; flex-wrap: wrap; justify-content: flex-start; align-items: center; }

      .cards {
        display:grid;
        grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
        gap: 10px;
        margin-top: 10px;
      }
      .kpi {
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.9);
        border-radius: 14px;
        padding: 12px;
        min-width: 0;
      }
      .kpiTitle { font-size: 12px; color: var(--muted); }
      .kpiValue { font-size: 18px; font-weight: 900; margin-top: 6px; }

      /* Importante: com sidebar, quebra antes */
      .grid { display:grid; grid-template-columns: 1.15fr 0.85fr; gap: 12px; margin-top: 12px; min-width: 0; }

      label { font-size: 12px; color: var(--muted); }
      input, select {
        width: 100%;
        border: 1px solid var(--line);
        background: rgba(255,255,255,0.95);
        border-radius: 12px;
        padding: 12px;
        font-size: 14px;
        outline: none;
        color: #0f172a;
        -webkit-text-fill-color: #0f172a;
        caret-color: #0f172a;
      }

      .btn {
        background: linear-gradient(180deg, var(--primary), var(--primary2));
        color: white;
        border: none;
        padding: 12px 14px;
        border-radius: 12px;
        font-weight: 900;
        cursor: pointer;
        white-space: nowrap;
      }
      .btnLight {
        background: rgba(255,255,255,0.95);
        color: #0f172a;
        border: 1px solid rgba(15,23,42,0.14);
        padding: 10px 12px;
        border-radius: 12px;
        font-weight: 900;
        cursor: pointer;
        white-space: nowrap;
      }
      .btnLight:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .btnMini {
        background: rgba(255,255,255,0.85);
        color: #0f172a;
        border: 1px solid rgba(15,23,42,0.12);
        padding: 8px 10px;
        border-radius: 12px;
        font-weight: 900;
        cursor: pointer;
        font-size: 12px;
        white-space: nowrap;
      }
      .btnMini.danger {
        border-color: rgba(239, 68, 68, 0.25);
        background: rgba(239, 68, 68, 0.10);
        color: #7f1d1d;
      }

      .checkWrap { display:flex; align-items:flex-end; }
      .check { display:flex; align-items:center; gap: 10px; user-select:none; font-size: 12px; color: var(--muted); }
      .check input { width: auto; }

      .alert {
        border-radius: 12px;
        padding: 10px 12px;
        border: 1px solid rgba(15,23,42,0.12);
        margin: 10px 0;
        font-size: 13px;
      }
      .alert.warn { background: rgba(245, 158, 11, 0.16); border-color: rgba(245,158,11,0.35); }
      .empty { color: var(--muted); font-size: 13px; padding: 10px 0; }

      .tableWrap {
        width: 100%;
        max-width: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        border-radius: 14px;
        border: 1px solid rgba(15,23,42,0.10);
        background: rgba(255,255,255,0.92);
      }
      .table {
        width: 100%;
        border-collapse: collapse;
        min-width: 760px;
      }
      .table th, .table td {
        padding: 10px 12px;
        border-bottom: 1px solid rgba(15,23,42,0.08);
        font-size: 13px;
        white-space: nowrap;
      }
      .table th { text-align: left; font-size: 12px; color: var(--muted); }
      .table tbody tr:hover { background: rgba(37, 99, 235, 0.06); cursor: pointer; }
      .rowSel { background: rgba(37, 99, 235, 0.10); }
      .link { font-weight: 900; text-decoration: underline; text-underline-offset: 2px; }

      .detailTop {
        display:flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
        flex-wrap: wrap;
      }
      .detailTitle { display:flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
      .detailBtns { display:flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }

      .note {
        margin-top: 10px;
        font-size: 12px;
        color: var(--muted);
        background: rgba(15,23,42,0.04);
        border: 1px solid rgba(15,23,42,0.08);
        padding: 10px 12px;
        border-radius: 12px;
      }

      /* Notebook com sidebar: stack mais cedo */
      @media (max-width: 1500px) {
        .grid { grid-template-columns: 1fr; }
        .table { min-width: 720px; }
      }
      @media (max-width: 900px) {
        .card { padding: 14px; }
        .top { flex-direction: column; }
        .topRight { width: 100%; justify-content: flex-start; }
      }
      @media (max-width: 520px) {
        .table { min-width: 560px; }
      }
    

      /* ✅ FIX: botões visíveis (evita ficar branco/transparente em layout glass) */
      .btn {
        color: #ffffff !important;
        box-shadow: 0 14px 30px rgba(37,99,235,0.18);
      }
      .btnLight {
        background: rgba(255,255,255,0.92) !important;
        color: #0f172a !important;
        border: 1px solid rgba(15,23,42,0.16) !important;
      }
      .btnLight:hover {
        background: rgba(255,255,255,0.98) !important;
      }

      .btn, .btnLight, .btnMini { align-items: center; }


      /* ✅ FIX: alinhar botões do meio — checkbox ocupa a linha inteira */
      .filtersBtns .check {
        flex: 1 1 100%;
        width: 100%;
      }

      .filtersBtns .btn,
      .filtersBtns .btnLight {
        min-height: 40px;
      }
`}</style>
  );
}
