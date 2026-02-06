"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../src/lib/supabase";

function onlyDigits(v) {
  return String(v ?? "").replace(/\D+/g, "");
}

function money(v) {
  const n = Number(v || 0);
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// CSV pt-BR: delimitador ; e decimal com vírgula
function exportCsv(rows, filename = "delivery.csv") {
  const delimiter = ";";

  const formatNumberPtBR = (n) => {
    if (!Number.isFinite(n)) return "";
    return n.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const shouldFormatAsNumber = (key, v) => {
    if (typeof v === "number" && Number.isFinite(v)) return true;
    const k = String(key || "").toLowerCase();
    const looksNumeric =
      typeof v === "string" && /^[+-]?\d+(?:[.,]\d+)?$/.test(v.trim());
    if (!looksNumeric) return false;

    return (
      k.includes("valor") ||
      k.includes("receita") ||
      k.includes("custo") ||
      k.includes("lucro") ||
      k.includes("margem") ||
      k.includes("preco") ||
      k.includes("ajuste") ||
      k.includes("centav") ||
      k.includes("taxa") ||
      k.includes("qtd")
    );
  };

  const normalizeToNumber = (v) => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const s = String(v ?? "").trim();
    if (!s) return NaN;
    const ptbr = s.replace(/\./g, "").replace(",", ".");
    const n = Number(ptbr);
    return Number.isFinite(n) ? n : NaN;
  };

  const esc = (v, key) => {
    let out = "";
    if (shouldFormatAsNumber(key, v)) {
      const n = normalizeToNumber(v);
      out = Number.isFinite(n) ? formatNumberPtBR(n) : String(v ?? "");
    } else {
      out = String(v ?? "");
    }
    if (
      out.includes('"') ||
      out.includes(delimiter) ||
      out.includes("\n") ||
      out.includes("\r")
    ) {
      return `"${out.replace(/"/g, '""')}"`;
    }
    return out;
  };

  if (!rows || rows.length === 0) {
    alert("Nada para exportar.");
    return;
  }

  const headers = Object.keys(rows[0]);
  const lines = [headers.map((h) => esc(h)).join(delimiter)];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h], h)).join(delimiter));

  const csv = "\ufeff" + lines.join("\n"); // BOM p/ Excel
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function AdminDelivery() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  const [organizacoes, setOrganizacoes] = useState([]);
  const [campanhas, setCampanhas] = useState([]);

  const [fOrganizacaoId, setFOrganizacaoId] = useState("");
  const [fCampanhaId, setFCampanhaId] = useState("");
  const [fReferencia, setFReferencia] = useState("");
  const [fComprador, setFComprador] = useState("");
  const [fCodigo, setFCodigo] = useState("");
  const [fWhatsapp, setFWhatsapp] = useState("");
  const [mostrarApenasPendentes, setMostrarApenasPendentes] = useState(true);

  const [pedidos, setPedidos] = useState([]);
  const [retiradasMap, setRetiradasMap] = useState({}); // pedido_item_id -> retirado

  const [pedidoSel, setPedidoSel] = useState(null);
  const [nomeRetirante, setNomeRetirante] = useState("");
  const [retirarAgora, setRetirarAgora] = useState({}); // pedido_item_id -> qtd

  useEffect(() => {
    bootstrap();
  }, []);

  async function bootstrap() {
    setLoading(true);
    setErro(null);

    const { data: orgs, error: eOrgs } = await supabase
      .from("organizacoes")
      .select("id, nome, ativo")
      .eq("ativo", true)
      .order("nome", { ascending: true });

    if (eOrgs) {
      setErro("Erro ao carregar organizações");
      setLoading(false);
      return;
    }

    setOrganizacoes(orgs || []);
    if (orgs?.[0]?.id) setFOrganizacaoId(orgs[0].id);

    const { data: camps, error: eCamps } = await supabase
      .from("campanhas")
      .select("id, nome, organizacao_id, ativa, data_inicio, data_fim")
      .order("data_inicio", { ascending: false });

    if (eCamps) {
      setErro("Erro ao carregar campanhas");
      setLoading(false);
      return;
    }

    setCampanhas(camps || []);
    setLoading(false);
  }

  async function buscar() {
    setLoading(true);
    setErro(null);
    setOk(null);
    setPedidoSel(null);
    setRetirarAgora({});
    setNomeRetirante("");

    try {
      let q = supabase
        .from("pedidos")
        .select(
          `
          id,
          campanha_id,
          codigo_pedido,
          nome_comprador,
          whatsapp,
          nome_referencia,
          valor_total,
          status,
          criado_em,
          campanhas (
            id, nome, organizacao_id,
            organizacoes ( id, nome )
          ),
          pedido_itens (
            id, item_id, quantidade,
            itens ( id, nome )
          )
        `
        )
        .neq("status", "excluido")
        .neq("status", "cancelado")
        .order("criado_em", { ascending: false });

      if (fOrganizacaoId) q = q.eq("campanhas.organizacao_id", fOrganizacaoId);
      if (fCampanhaId) q = q.eq("campanha_id", fCampanhaId);
      if (fReferencia.trim()) q = q.ilike("nome_referencia", `%${fReferencia.trim()}%`);
      if (fComprador.trim()) q = q.ilike("nome_comprador", `%${fComprador.trim()}%`);
      if (fCodigo.trim()) q = q.ilike("codigo_pedido", `%${fCodigo.trim()}%`);
      if (fWhatsapp.trim()) q = q.ilike("whatsapp", `%${onlyDigits(fWhatsapp.trim())}%`);

      const { data: pedidosData, error: ePedidos } = await q;
      if (ePedidos) throw ePedidos;

      const pedidosNorm = (pedidosData || []).map((p) => ({
        ...p,
        pedido_itens: Array.isArray(p.pedido_itens) ? p.pedido_itens : [],
      }));

      const pedidoIds = pedidosNorm.map((p) => p.id);

      // carrega retiradas -> ids
      let retiradaIds = [];
      if (pedidoIds.length > 0) {
        const { data: rets, error: eRets } = await supabase
          .from("retiradas")
          .select("id, pedido_id")
          .in("pedido_id", pedidoIds);

        if (eRets) throw eRets;
        retiradaIds = (rets || []).map((r) => r.id);
      }

      if (retiradaIds.length > 0) {
        const { data: ritens, error: eRItens } = await supabase
          .from("retiradas_itens")
          .select("pedido_item_id, quantidade, retirada_id")
          .in("retirada_id", retiradaIds);

        if (eRItens) throw eRItens;

        const m = {};
        for (const ri of ritens || []) {
          const k = ri.pedido_item_id;
          m[k] = (m[k] || 0) + Number(ri.quantidade || 0);
        }
        setRetiradasMap(m);
      } else {
        setRetiradasMap({});
      }

      setPedidos(pedidosNorm);
      setOk(`Pedidos carregados: ${pedidosNorm.length}`);
    } catch (err) {
      console.error(err);
      setErro(`Erro ao buscar pedidos: ${err?.message || "desconhecido"}`);
      setPedidos([]);
      setRetiradasMap({});
    } finally {
      setLoading(false);
    }
  }

  const pedidosCalc = useMemo(() => {
    const list = pedidos.map((p) => {
      let pendenteTotal = 0;
      let pedidasTotal = 0;
      let retiradasTotal = 0;

      const itensCalc = (p.pedido_itens || []).map((it) => {
        const pedida = Number(it.quantidade || 0);
        const retirada = Number(retiradasMap[it.id] || 0);
        const pendente = Math.max(pedida - retirada, 0);
        pedidasTotal += pedida;
        retiradasTotal += retirada;
        pendenteTotal += pendente;
        return { ...it, pedida, retirada, pendente };
      });

      return {
        ...p,
        _itensCalc: itensCalc,
        _pendenteTotal: pendenteTotal,
        _pedidasTotal: pedidasTotal,
        _retiradasTotal: retiradasTotal,
      };
    });

    return mostrarApenasPendentes ? list.filter((p) => p._pendenteTotal > 0) : list;
  }, [pedidos, retiradasMap, mostrarApenasPendentes]);

  const kpis = useMemo(() => {
    let pedidosCount = pedidosCalc.length;
    let qtdPedida = 0;
    let qtdRetirada = 0;
    let qtdPendente = 0;
    let valorTotal = 0;

    for (const p of pedidosCalc) {
      qtdPedida += Number(p._pedidasTotal || 0);
      qtdRetirada += Number(p._retiradasTotal || 0);
      qtdPendente += Number(p._pendenteTotal || 0);
      valorTotal += Number(p.valor_total || 0);
    }

    return { pedidosCount, qtdPedida, qtdRetirada, qtdPendente, valorTotal };
  }, [pedidosCalc]);

  function selecionarPedido(p) {
    setPedidoSel(p);
    setNomeRetirante(p?.nome_comprador || "");
    const init = {};
    for (const it of p._itensCalc || []) init[it.id] = 0;
    setRetirarAgora(init);
  }

  function baixaTotal() {
    if (!pedidoSel) return;
    const nxt = { ...retirarAgora };
    for (const it of pedidoSel._itensCalc || []) nxt[it.id] = it.pendente;
    setRetirarAgora(nxt);
  }

  async function registrarRetirada() {
    if (!pedidoSel) return;

    setLoading(true);
    setErro(null);
    setOk(null);

    try {
      const nome = String(nomeRetirante || "").trim();
      if (!nome) throw new Error("Informe o nome de quem está retirando.");

      const itensParaRetirar = (pedidoSel._itensCalc || [])
        .map((it) => ({
          ...it,
          retirar: Math.max(0, parseInt(retirarAgora[it.id] || 0, 10) || 0),
        }))
        .filter((it) => it.retirar > 0);

      if (itensParaRetirar.length === 0)
        throw new Error("Informe ao menos 1 item para retirar agora.");

      const invalido = itensParaRetirar.find((it) => it.retirar > it.pendente);
      if (invalido)
        throw new Error(
          `Quantidade inválida para "${invalido?.itens?.nome || "item"}". Pendente: ${invalido.pendente}`
        );

      const { data: ret, error: eRet } = await supabase
        .from("retiradas")
        .insert({
          pedido_id: pedidoSel.id,
          campanha_id: pedidoSel.campanha_id,
          nome_retirante: nome,
        })
        .select("id")
        .single();
      if (eRet) throw eRet;

      const payload = itensParaRetirar.map((it) => ({
        retirada_id: ret.id,
        pedido_item_id: it.id,
        quantidade: it.retirar,
      }));
      const { error: eItens } = await supabase.from("retiradas_itens").insert(payload);
      if (eItens) throw eItens;

      await supabase.rpc("atualizar_status_pedido_retirada", { p_pedido_id: pedidoSel.id });

      setOk("Retirada registrada com sucesso.");
      await buscar();
    } catch (err) {
      console.error(err);
      setErro(`Erro ao registrar retirada: ${err?.message || "desconhecido"}`);
    } finally {
      setLoading(false);
    }
  }

  const exportRows = useMemo(() => {
    return pedidosCalc.map((p) => ({
      codigo_pedido: p.codigo_pedido,
      comprador: p.nome_comprador,
      referencia: p.nome_referencia,
      whatsapp: p.whatsapp,
      campanha: p?.campanhas?.nome || "",
      organizacao: p?.campanhas?.organizacoes?.nome || "",
      status: p.status,
      qtd_pedida: p._pedidasTotal,
      qtd_retirada: p._retiradasTotal,
      qtd_pendente: p._pendenteTotal,
      valor_total: Number(p.valor_total || 0),
      criado_em: p.criado_em,
    }));
  }, [pedidosCalc]);

  const exportPedidoRows = useMemo(() => {
    if (!pedidoSel) return [];
    return (pedidoSel._itensCalc || []).map((it) => ({
      codigo_pedido: pedidoSel.codigo_pedido,
      comprador: pedidoSel.nome_comprador,
      referencia: pedidoSel.nome_referencia,
      item: it?.itens?.nome || "",
      qtd_pedida: it.pedida,
      qtd_retirada: it.retirada,
      qtd_pendente: it.pendente,
      retirar_agora: Number(retirarAgora[it.id] || 0),
    }));
  }, [pedidoSel, retirarAgora]);

  return (
    <>
      <div className="wrap">
        <div className="top">
          <div className="titleBlock">
            <h1>Delivery / Retirada</h1>
            <p className="sub">
              Mostra todos os status, exceto <b>cancelado</b> e <b>excluido</b>. Retirada parcial por sabor.
            </p>
          </div>

          <div className="topBtns">
            <button className="btnMini" onClick={() => router.back()}>
              Voltar
            </button>
            <button
              className="btnLight"
              onClick={() => exportCsv(exportRows, "delivery_pedidos.csv")}
              disabled={exportRows.length === 0}
            >
              Exportar lista (CSV)
            </button>
            {pedidoSel ? (
              <button
                className="btnLight"
                onClick={() =>
                  exportCsv(exportPedidoRows, `delivery_${pedidoSel.codigo_pedido || "pedido"}.csv`)
                }
                disabled={exportPedidoRows.length === 0}
              >
                Exportar pedido (CSV)
              </button>
            ) : null}
          </div>
        </div>

        <div className="panel">
          <div className="filters">
            <div className="field">
              <label>Organização</label>
              <select value={fOrganizacaoId} onChange={(e) => setFOrganizacaoId(e.target.value)}>
                {organizacoes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Campanha</label>
              <select value={fCampanhaId} onChange={(e) => setFCampanhaId(e.target.value)}>
                <option value="">Todas...</option>
                {campanhas
                  .filter((c) => (!fOrganizacaoId ? true : c.organizacao_id === fOrganizacaoId))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
              </select>
            </div>

            <div className="field">
              <label>Referência</label>
              <input
                value={fReferencia}
                onChange={(e) => setFReferencia(e.target.value)}
                placeholder="Ex: Maria"
              />
            </div>

            <div className="field">
              <label>Comprador</label>
              <input
                value={fComprador}
                onChange={(e) => setFComprador(e.target.value)}
                placeholder="Ex: João"
              />
            </div>

            <div className="field">
              <label>Código</label>
              <input
                value={fCodigo}
                onChange={(e) => setFCodigo(e.target.value)}
                placeholder="Ex: A123"
              />
            </div>

            <div className="field">
              <label>WhatsApp</label>
              <input
                value={fWhatsapp}
                onChange={(e) => setFWhatsapp(e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </div>

            <div className="actions">
              <label className="check">
                <input
                  type="checkbox"
                  checked={mostrarApenasPendentes}
                  onChange={(e) => setMostrarApenasPendentes(e.target.checked)}
                />
                <span>Mostrar apenas com pendência</span>
              </label>
              <button className="btn" onClick={buscar} disabled={loading}>
                Buscar
              </button>
            </div>

            {erro ? <div className="msg err">{erro}</div> : null}
            {ok ? <div className="msg ok">{ok}</div> : null}
          </div>

          {/* Dashboard contadores */}
          <div className="kpiGrid">
            <div className="kpiCard">
              <div className="kpiLabel">Pedidos (filtrados)</div>
              <div className="kpiValue">{kpis.pedidosCount}</div>
            </div>
            <div className="kpiCard">
              <div className="kpiLabel">Pizzas pedidas</div>
              <div className="kpiValue">{kpis.qtdPedida}</div>
            </div>
            <div className="kpiCard">
              <div className="kpiLabel">Pizzas retiradas</div>
              <div className="kpiValue">{kpis.qtdRetirada}</div>
            </div>
            <div className="kpiCard">
              <div className="kpiLabel">Faltam retirar</div>
              <div className="kpiValue warn">{kpis.qtdPendente}</div>
            </div>
            <div className="kpiCard">
              <div className="kpiLabel">Valor (filtrado)</div>
              <div className="kpiValue">{money(kpis.valorTotal)}</div>
            </div>
          </div>
        </div>

        <div className="grid">
          <div className="card">
            <div className="cardHead">
              <h2>Pedidos</h2>
              <div className="hint">{pedidosCalc.length} resultado(s)</div>
            </div>

            <div className="tableWrap desktopOnly">
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Comprador</th>
                    <th>Referência</th>
                    <th>Status</th>
                    <th className="num">Pendente</th>
                    <th className="num">Retirado</th>
                    <th className="num">Pedido</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidosCalc.map((p) => (
                    <tr
                      key={p.id}
                      className={pedidoSel?.id === p.id ? "active" : ""}
                      onClick={() => selecionarPedido(p)}
                      role="button"
                      tabIndex={0}
                    >
                      <td className="mono">{p.codigo_pedido}</td>
                      <td>{p.nome_comprador}</td>
                      <td>{p.nome_referencia}</td>
                      <td>{p.status}</td>
                      <td className="num">{p._pendenteTotal}</td>
                      <td className="num">{p._retiradasTotal}</td>
                      <td className="num">{p._pedidasTotal}</td>
                    </tr>
                  ))}
                  {pedidosCalc.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty">
                        Nenhum pedido. Ajuste filtros e clique em Buscar.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="mobileOnly">
              <div className="cardsList">
                {pedidosCalc.map((p) => (
                  <button
                    key={p.id}
                    className={`pedidoCard ${pedidoSel?.id === p.id ? "active" : ""}`}
                    onClick={() => selecionarPedido(p)}
                  >
                    <div className="pcTop">
                      <div className="mono pcCode">{p.codigo_pedido}</div>
                      <div className="pcStatus">{p.status}</div>
                    </div>
                    <div className="pcNames">
                      <div className="pcLine">
                        <span className="pcLabel">Comprador:</span> {p.nome_comprador}
                      </div>
                      <div className="pcLine">
                        <span className="pcLabel">Referência:</span> {p.nome_referencia}
                      </div>
                    </div>
                    <div className="pcKpis">
                      <div className="pcKpi">
                        <span className="pcLabel">Pendente</span>
                        <b>{p._pendenteTotal}</b>
                      </div>
                      <div className="pcKpi">
                        <span className="pcLabel">Retirado</span>
                        <b>{p._retiradasTotal}</b>
                      </div>
                      <div className="pcKpi">
                        <span className="pcLabel">Pedido</span>
                        <b>{p._pedidasTotal}</b>
                      </div>
                    </div>
                  </button>
                ))}
                {pedidosCalc.length === 0 ? (
                  <div className="emptyBox">Nenhum pedido. Ajuste filtros e clique em Buscar.</div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="card retiradaCard">
            <div className="cardHead">
              <div>
                <h2>Retirada</h2>
                <div className="hint">Selecione um pedido</div>
              </div>
              {pedidoSel ? (
                <button className="btnMini" onClick={() => setPedidoSel(null)}>
                  Fechar
                </button>
              ) : null}
            </div>

            {!pedidoSel ? (
              <div className="emptyBox">Selecione um pedido para registrar retirada.</div>
            ) : (
              <div className="retiradaBody">
                <div className="selHead">
                  <div>
                    <div className="mono">{pedidoSel.codigo_pedido}</div>
                    <div className="small">
                      {pedidoSel.nome_comprador} • {pedidoSel.nome_referencia}
                    </div>
                  </div>
                  <div className="kpisMini">
                    <div className="kpiMini">
                      <div className="kLabel">Valor</div>
                      <div className="kValue">{money(pedidoSel.valor_total)}</div>
                    </div>
                    <div className="kpiMini">
                      <div className="kLabel">Pendente</div>
                      <div className="kValue">{pedidoSel._pendenteTotal}</div>
                    </div>
                  </div>
                </div>

                <div className="row">
                  <div className="field grow">
                    <label>Quem está retirando?</label>
                    <input
                      value={nomeRetirante}
                      onChange={(e) => setNomeRetirante(e.target.value)}
                      placeholder="Nome de quem retira"
                    />
                  </div>

                  <div className="rowBtns">
                    <button className="btnLight" onClick={baixaTotal} disabled={loading}>
                      Dar baixa total
                    </button>
                    <button className="btn" onClick={registrarRetirada} disabled={loading}>
                      Registrar retirada
                    </button>
                  </div>
                </div>

                <div className="tableWrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Sabor</th>
                        <th className="num">Pedido</th>
                        <th className="num">Retirado</th>
                        <th className="num">Pendente</th>
                        <th className="num">Retirar agora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pedidoSel._itensCalc.map((it) => (
                        <tr key={it.id}>
                          <td>{it?.itens?.nome || "-"}</td>
                          <td className="num">{it.pedida}</td>
                          <td className="num">{it.retirada}</td>
                          <td className="num">
                            <span className={it.pendente === 0 ? "okTxt" : "warnTxt"}>{it.pendente}</span>
                          </td>
                          <td className="num">
                            {it.pendente === 0 ? (
                              <span className="muted">-</span>
                            ) : (
                              <input
                                className="qtyInput"
                                inputMode="numeric"
                                value={String(retirarAgora[it.id] ?? 0)}
                                onChange={(e) => {
                                  const v = Math.max(0, parseInt(e.target.value || "0", 10) || 0);
                                  setRetirarAgora((prev) => ({ ...prev, [it.id]: v }));
                                }}
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="note">
                  * Status do pedido é atualizado automaticamente para <b>retirado</b> ou <b>retirado_parcial</b> (exceto cancelado/excluido).
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        .wrap {
          padding: 14px;
          width: 100%;
          max-width: 100%;
          overflow-x: hidden;
        }

        .top {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 12px;
          align-items: flex-start;
        }
        .titleBlock { min-width: 240px; }
        h1 { margin: 0; font-size: 26px; }
        .sub { margin: 6px 0 0 0; color: #64748b; font-size: 13px; }
        .topBtns { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: flex-end; }

        .panel {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 14px;
          box-shadow: 0 1px 10px rgba(0,0,0,0.04);
          margin-bottom: 14px;
        }

        .filters { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
        .field label { display: block; font-size: 12px; color: #475569; margin-bottom: 6px; }
        .field input, .field select { width: 100%; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; outline: none; }

        .actions {
          grid-column: 1 / -1;
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: space-between;
          margin-top: 2px;
        }

        .check { display: flex; gap: 10px; align-items: center; user-select: none; color: #334155; font-size: 13px; }
        .check input { width: 16px; height: 16px; }

        /* Dashboard (contadores) */
        .kpiGrid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 10px;
        }
        .kpiCard {
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 10px 12px;
          background: #fff;
          box-shadow: 0 1px 10px rgba(0,0,0,0.03);
          min-width: 0;
        }
        .kpiLabel { font-size: 12px; color: #64748b; }
        .kpiValue { font-size: 18px; font-weight: 900; margin-top: 2px; color: #0f172a; }
        .kpiValue.warn { color: #b45309; }

        .grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 360px);
          gap: 14px;
          align-items: start;
          width: 100%;
          max-width: 100%;
        }
        .card {
          background: #fff;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 14px;
          box-shadow: 0 1px 10px rgba(0,0,0,0.04);
          min-width: 0;
        }

        .cardHead { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
        .cardHead h2 { margin: 0; font-size: 18px; }
        .hint { color: #64748b; font-size: 12px; }

        .tableWrap {
          width: 100%;
          overflow: auto;
          border: 1px solid #eef2f7;
          border-radius: 12px;
          min-width: 0;
        }

        .table {
          width: 100%;
          border-collapse: collapse;
          min-width: 680px;
          font-size: 13px;
        }
        .table th, .table td { padding: 10px 12px; border-bottom: 1px solid #eef2f7; white-space: nowrap; }
        .table th { text-align: left; color: #475569; font-weight: 600; background: #f8fafc; position: sticky; top: 0; z-index: 1; }
        .table tr:hover td { background: #f8fafc; }
        .table tr.active td { background: #eef2ff; }
        .num { text-align: right; }
        .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }

        /* Fix botões "transparentes" (força estilo) */
        .btn {
          background: #2563eb !important;
          color: #fff !important;
          border: 1px solid #1d4ed8 !important;
          border-radius: 12px !important;
          padding: 10px 14px !important;
          cursor: pointer !important;
          font-weight: 800 !important;
        }
        .btn:disabled { opacity: 0.5 !important; cursor: not-allowed !important; }
        .btnLight {
          background: #fff !important;
          color: #111827 !important;
          border: 1px solid #e5e7eb !important;
          border-radius: 12px !important;
          padding: 10px 14px !important;
          cursor: pointer !important;
          font-weight: 800 !important;
        }
        .btnMini {
          background: #fff !important;
          color: #111827 !important;
          border: 1px solid #e5e7eb !important;
          border-radius: 999px !important;
          padding: 8px 12px !important;
          cursor: pointer !important;
          font-weight: 800 !important;
        }

        .msg { grid-column: 1 / -1; padding: 10px 12px; border-radius: 12px; font-size: 13px; }
        .msg.err { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
        .msg.ok { background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; }

        .empty { text-align: center; color: #64748b; }
        .emptyBox { padding: 14px; border: 1px dashed #e5e7eb; border-radius: 12px; color: #64748b; background: #fafafa; }

        .retiradaBody {
          max-height: calc(100vh - 300px);
          overflow: auto;
          padding-right: 6px;
        }

        .selHead { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; margin-bottom: 10px; flex-wrap: wrap; }
        .small { color: #64748b; font-size: 12px; margin-top: 3px; }

        .kpisMini { display: flex; gap: 10px; flex-wrap: wrap; }
        .kpiMini { border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px 12px; min-width: 120px; background: #fff; }
        .kLabel { font-size: 12px; color: #64748b; }
        .kValue { font-size: 16px; font-weight: 900; margin-top: 2px; }

        .row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; margin: 10px 0; }
        .grow { flex: 1 1 220px; }
        .rowBtns { display: flex; gap: 10px; flex-wrap: wrap; width: 100%; justify-content: flex-end; }

        .qtyInput { width: 90px; text-align: right; border: 1px solid #e5e7eb; border-radius: 10px; padding: 8px 10px; }
        .okTxt { color: #166534; font-weight: 900; }
        .warnTxt { color: #b45309; font-weight: 900; }
        .muted { color: #94a3b8; }
        .note { margin-top: 10px; font-size: 12px; color: #64748b; padding: 10px 12px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 12px; }

        .desktopOnly { display: block; }
        .mobileOnly { display: none; }
        .cardsList { display: grid; gap: 10px; }
        .pedidoCard {
          width: 100%;
          text-align: left;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 12px;
          background: #fff;
          cursor: pointer;
        }
        .pedidoCard.active { background: #eef2ff; border-color: #c7d2fe; }
        .pcTop { display: flex; justify-content: space-between; gap: 10px; align-items: baseline; }
        .pcCode { font-size: 14px; font-weight: 900; }
        .pcStatus { font-size: 12px; color: #475569; }
        .pcNames { margin-top: 8px; color: #0f172a; font-size: 13px; }
        .pcLine { margin: 2px 0; }
        .pcLabel { color: #64748b; font-weight: 700; }
        .pcKpis { margin-top: 10px; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
        .pcKpi { border: 1px solid #e5e7eb; border-radius: 12px; padding: 8px 10px; background: #fff; }
        .pcKpi b { display: block; font-size: 16px; margin-top: 2px; }

        /* força 1 coluna em notebook/viewport comum com sidebar */
        @media (max-width: 1500px) {
          .grid { grid-template-columns: 1fr; }
          .retiradaBody { max-height: none; overflow: visible; }
        }

        @media (max-width: 1100px) {
          .kpiGrid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .filters { grid-template-columns: repeat(3, minmax(0, 1fr)); }
        }

        @media (max-width: 720px) {
          .kpiGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .actions { justify-content: flex-start; }
          .desktopOnly { display: none; }
          .mobileOnly { display: block; }
          .table { min-width: 640px; }
          h1 { font-size: 22px; }
          .topBtns { width: 100%; justify-content: flex-start; }
        }

        @media (max-width: 420px) {
          .wrap { padding: 10px; }
          .pcKpis { grid-template-columns: 1fr; }
          .rowBtns { justify-content: stretch; }
          .rowBtns button { width: 100%; }
        }
      `}</style>
    </>
  );
}
