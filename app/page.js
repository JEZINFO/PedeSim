"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../src/lib/supabase";

// --- Helpers: validação/mascara (BR) ---
function sanitizeNameAlpha(v) {
  // Mantém apenas letras (inclui acentos) e espaços
  const raw = String(v ?? "").normalize("NFKC");
  return raw
    .replace(/[^À-ɏḀ-ỿA-Za-z ]+/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s+/g, "");
}

function sanitizePhoneDigits(v) {
  // Mantém apenas números (DDD + número). Máx: 11 dígitos.
  return String(v ?? "").replace(/\D/g, "").slice(0, 11);
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

function sanitizeCampaignCode(v) {
  // mantém letras/números/_/- e remove espaços
  return String(v ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 32);
}

export default function Page() {
  const [campanha, setCampanha] = useState(null);
  const [organizacao, setOrganizacao] = useState(null);
  const [itens, setItens] = useState([]);

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);

  // 🔑 NOVO: código de acesso da campanha
  const [codigoCampanha, setCodigoCampanha] = useState("");
  const [codigoConfirmado, setCodigoConfirmado] = useState(false);

  const [enviando, setEnviando] = useState(false);
  const [pedidoCriado, setPedidoCriado] = useState(null);

  const [form, setForm] = useState({
    nome_comprador: "",
    whatsapp: "",
    nome_referencia: "",
    quantidade: 1,
  });

  const [itensSelecionados, setItensSelecionados] = useState({});

  useEffect(() => {
    // ✅ Suporta deep link: ?c=SEUCODIGO
    try {
      const params = new URLSearchParams(window.location.search);
      const c = params.get("c") || params.get("codigo") || params.get("campanha");
      const cod = sanitizeCampaignCode(c);
      if (cod) {
        setCodigoCampanha(cod);
        // carrega direto
        carregarDadosPorCodigo(cod);
      } else {
        // sem código → mostra tela de acesso
        setLoading(false);
        setCodigoConfirmado(false);
      }
    } catch {
      setLoading(false);
      setCodigoConfirmado(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarDadosPorCodigo(codigo) {
    const cod = sanitizeCampaignCode(codigo);
    setLoading(true);
    setErro(null);

    if (!cod) {
      setErro("Informe o código da campanha.");
      setLoading(false);
      setCodigoConfirmado(false);
      return;
    }

    // 1️⃣ Buscar campanha por código
    const { data: campanhaData, error: campanhaError } = await supabase
      .from("campanhas")
      .select(
        `
        id,
        organizacao_id,
        nome,
        preco_base,
        data_inicio,
        data_fim,
        identificador_centavos,
        codigo_acesso,
        publica,
        ativa,
        organizacoes (
          id,
          nome,
          tipo_chave_pix,
          chave_pix,
          banco_pix,
          identificador_pix
        )
      `
      )
      .eq("ativa", true)
      .eq("publica", true)
      .ilike("codigo_acesso", cod)
      .limit(1)
      .maybeSingle();

    console.log("codigoCampanha:", cod);
    console.log("campanhaData:", campanhaData);
    console.log("campanhaError:", campanhaError);

    if (campanhaError) {
      console.error(campanhaError);
      setErro("Erro ao carregar campanha. Verifique o código.");
      setLoading(false);
      setCodigoConfirmado(false);
      return;
    }

    if (!campanhaData) {
      setErro("Código inválido ou campanha indisponível.");
      setLoading(false);
      setCodigoConfirmado(false);
      return;
    }

    setCodigoConfirmado(true);
    setCampanha(campanhaData);

    // ✅ garante organizacao como objeto (às vezes vem array)
    const org = Array.isArray(campanhaData.organizacoes)
      ? campanhaData.organizacoes[0]
      : campanhaData.organizacoes;

    setOrganizacao(org || null);

    // 2️⃣ carregar itens via itens_campanha + join itens + preco
    const { data: itensData, error: itensError } = await supabase
      .from("itens_campanha")
      .select(
        `
        ordem,
        item_id,
        preco,
        itens ( id, nome )
      `
      )
      .eq("campanha_id", campanhaData.id)
      .eq("ativo", true)
      .order("ordem", { ascending: true });

    console.log("campanha id:", campanhaData.id);
    console.log("itensData (raw):", itensData);
    console.log("itensError:", itensError);

    if (itensError) {
      console.error(itensError);
      setErro("Erro ao carregar itens.");
      setLoading(false);
      return;
    }

    // ✅ Normaliza para o formato esperado no frontend: {id, nome, ordem, preco}
    const itensNormalizados = (itensData || [])
      .map((r) => {
        const item = Array.isArray(r.itens) ? r.itens[0] : r.itens; // segurança
        return {
          id: item?.id ?? r.item_id,
          nome: item?.nome ?? "",
          ordem: r.ordem ?? 999,
          preco: Number(r.preco ?? 0),
        };
      })
      .filter((x) => x.id && x.nome); // remove inválidos

    console.log("itensNormalizados:", itensNormalizados);

    setItens(itensNormalizados);
    setItensSelecionados({});
    setPedidoCriado(null);

    // reset parcial do form (mantém limpo ao trocar de campanha)
    setForm({
      nome_comprador: "",
      whatsapp: "",
      nome_referencia: "",
      quantidade: 1,
    });

    setLoading(false);
  }

  function handleChange(e) {
    const { name, value, type } = e.target;

    if (name === "whatsapp") {
      setForm((prev) => ({ ...prev, [name]: sanitizePhoneDigits(value) }));
      return;
    }

    if (name === "nome_comprador" || name === "nome_referencia") {
      setForm((prev) => ({ ...prev, [name]: sanitizeNameAlpha(value) }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      [name]: type === "number" ? Number(value) : value,
    }));
  }

  function incItem(id) {
    setItensSelecionados((prev) => ({
      ...prev,
      [id]: (prev[id] || 0) + 1,
    }));
  }

  function decItem(id) {
    setItensSelecionados((prev) => {
      const atual = prev[id] || 0;
      const novo = Math.max(0, atual - 1);
      return { ...prev, [id]: novo };
    });
  }

  const totalItens = useMemo(() => {
    return Object.values(itensSelecionados).reduce((t, q) => t + q, 0);
  }, [itensSelecionados]);

  const identificadorCentavos = useMemo(() => {
    if (!campanha) return 0;
    const v = Number(campanha.identificador_centavos || 0);
    return Number.isFinite(v) ? v : 0;
  }, [campanha]);

  // ✅ base = soma(qtd * preco do item)
  const valorBase = useMemo(() => {
    if (!campanha) return 0;

    const mapaPreco = new Map(itens.map((i) => [i.id, Number(i.preco ?? 0)]));

    const soma = Object.entries(itensSelecionados).reduce((t, [itemId, qtd]) => {
      const p = mapaPreco.get(itemId) ?? 0;
      return t + Number(qtd || 0) * Number(p || 0);
    }, 0);

    return Number(soma.toFixed(2));
  }, [campanha, itens, itensSelecionados]);

  // ✅ total final = base + identificador (ex.: +0,01)
  const valorTotal = useMemo(() => {
    return Number((valorBase + identificadorCentavos).toFixed(2));
  }, [valorBase, identificadorCentavos]);

  const resumoItens = useMemo(() => {
    const mapaNome = new Map(itens.map((s) => [s.id, s.nome]));
    const mapaPreco = new Map(itens.map((s) => [s.id, Number(s.preco ?? 0)]));

    return Object.entries(itensSelecionados)
      .filter(([_, qtd]) => Number(qtd) > 0)
      .map(([itemId, qtd]) => ({
        item_id: itemId,
        nome: mapaNome.get(itemId) || "Item",
        quantidade: Number(qtd),
        preco: mapaPreco.get(itemId) ?? 0,
      }));
  }, [itens, itensSelecionados]);

  const progresso = useMemo(() => {
    const q = Math.max(1, Number(form.quantidade) || 1);
    return Math.min(100, Math.round((totalItens / q) * 100));
  }, [totalItens, form.quantidade]);

  async function enviarPedido(e) {
    e.preventDefault();
    setErro(null);

    if (!campanha) return;

    if (!form.nome_comprador || !form.whatsapp || !form.nome_referencia) {
      alert("Preencha nome, WhatsApp e nome de referência.");
      return;
    }

    if (Number(form.quantidade) < 1) {
      alert("Quantidade deve ser no mínimo 1.");
      return;
    }

    if (totalItens !== Number(form.quantidade)) {
      alert("A soma dos itens deve ser igual à quantidade informada.");
      return;
    }

    if (resumoItens.length === 0) {
      alert("Selecione pelo menos um item.");
      return;
    }

    setEnviando(true);

    const { data: pedido, error: pedidoError } = await supabase
      .from("pedidos")
      .insert({
        campanha_id: campanha.id,
        nome_comprador: form.nome_comprador.trim(),
        whatsapp: form.whatsapp.trim(),
        nome_referencia: form.nome_referencia.trim(),
        quantidade: Number(form.quantidade),
        valor_total: valorTotal, // ✅ com identificador
        status: "aguardando_pagamento",
      })
      .select("id, codigo_pedido, valor_total, status, criado_em")
      .single();

    if (pedidoError) {
      console.log("pedidoError:", pedidoError);
      alert(`Erro ao criar pedido: ${pedidoError.code} - ${pedidoError.message}`);
      setEnviando(false);
      return;
    }

    const inserts = resumoItens.map((i) => ({
      pedido_id: pedido.id,
      item_id: i.item_id,
      quantidade: i.quantidade,
    }));

    const { error: itensError } = await supabase.from("pedido_itens").insert(inserts);

    if (itensError) {
      console.error(itensError);
      setEnviando(false);
      alert("Pedido criado, mas deu erro ao salvar itens (RLS).");
      return;
    }

    setPedidoCriado({
      pedido,
      itens: resumoItens,
      valorBase,
      identificadorCentavos,
    });
    setEnviando(false);
  }

  function resetar() {
    setPedidoCriado(null);
    setItensSelecionados({});
    setForm({
      nome_comprador: "",
      whatsapp: "",
      nome_referencia: "",
      quantidade: 1,
    });
  }

  function voltarAoCodigo() {
    setPedidoCriado(null);
    setItensSelecionados({});
    setItens([]);
    setCampanha(null);
    setOrganizacao(null);
    setErro(null);
    setCodigoConfirmado(false);
    setLoading(false);

    // limpa querystring (opcional)
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("c");
      url.searchParams.delete("codigo");
      url.searchParams.delete("campanha");
      window.history.replaceState({}, "", url.toString());
    } catch {}
  }

  // =========================
  // PIX (copia e cola + QR) - IGUAL AO MODELO QUE FUNCIONOU
  // 59=N, 60=C, sem 010211, GUI BR.GOV.BCB.PIX
  // TXID agora vem do organizacao.identificador_pix (sem espaço)
  // =========================
  const txidExibicao = useMemo(() => {
    const txidRaw = String(organizacao?.identificador_pix || "").trim();
    const txidSemEspaco = txidRaw.replace(/\s+/g, "");
    return txidSemEspaco || "PedeSim";
  }, [organizacao]);

  const pixCopiaECola = useMemo(() => {
    if (!pedidoCriado?.pedido) return "";

    const chave = (organizacao?.chave_pix || "").trim();
    if (!chave) return "";

    const merchantName = "N";
    const merchantCity = "C";

    return buildPixPayloadLikeWorkingExample({
      pixKey: chave,
      merchantName,
      merchantCity,
      amount: Number(pedidoCriado.pedido.valor_total || 0),
      txid: txidExibicao,
    });
  }, [pedidoCriado, organizacao, txidExibicao]);

  const qrUrl = useMemo(() => {
    if (!pixCopiaECola) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(
      pixCopiaECola
    )}`;
  }, [pixCopiaECola]);

  async function copiarPix() {
    try {
      await navigator.clipboard.writeText(pixCopiaECola);
      alert("PIX copiado ✅");
    } catch {
      alert("Não consegui copiar automaticamente. Selecione e copie manualmente.");
    }
  }

  // ==========
  // TELAS
  // ==========

  if (loading) {
    return (
      <>
        <div className="bg">
          <div className="shell">
            <div className="card">
              <div className="brand">
                <div className="logo">🍕</div>
                <div>
                  <h1>PedeSim</h1>
                  <p>Carregando campanha…</p>
                </div>
              </div>
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          </div>
        </div>
        <Style />
      </>
    );
  }

  // ✅ NOVO: Tela de acesso por código (quando ainda não carregou campanha)
  if (!campanha && !codigoConfirmado) {
    return (
      <>
        <div className="bg">
          <div className="shell">
            <div className="card">
              <div className="brand">
                <div className="logo">🔑</div>
                <div>
                  <h1>Acessar campanha</h1>
                  <p className="sub">Digite o código informado pelo organizador.</p>
                </div>
                <div className="tag">PedeSim</div>
              </div>

              {erro ? (
                <div className="alert">
                  <strong>Ops!</strong> {erro}
                </div>
              ) : null}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setErro(null);
                  const cod = sanitizeCampaignCode(codigoCampanha);
                  setCodigoCampanha(cod);
                  carregarDadosPorCodigo(cod);

                  // grava na URL (opcional)
                  try {
                    const url = new URL(window.location.href);
                    url.searchParams.set("c", cod);
                    window.history.replaceState({}, "", url.toString());
                  } catch {}
                }}
              >
                <label>Código da campanha</label>
                <input
                  value={codigoCampanha}
                  onChange={(e) => setCodigoCampanha(sanitizeCampaignCode(e.target.value))}
                  placeholder="Ex: AMIGOS2026"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  required
                />

                <div className="footer">
                  <div className="summary">
                    <div className="small">Dica</div>
                    <div className="small muted">Você também pode abrir um link com: ?c=SEUCODIGO</div>
                  </div>

                  <button className="btn" type="submit">
                    Acessar
                  </button>
                </div>
              </form>

              <div className="note">
                Se você não tem o código, solicite ao responsável pela campanha.
              </div>
            </div>
          </div>
        </div>
        <Style />
      </>
    );
  }

  if (erro) {
    return (
      <>
        <div className="bg">
          <div className="shell">
            <div className="card">
              <div className="alert">
                <strong>Ops!</strong> {erro}
              </div>
              <div className="footer">
                <button className="btnLight" onClick={voltarAoCodigo}>
                  Trocar código
                </button>
                <button
                  className="btn"
                  onClick={() => carregarDadosPorCodigo(codigoCampanha)}
                >
                  Tentar novamente
                </button>
              </div>
            </div>
          </div>
        </div>
        <Style />
      </>
    );
  }

  if (pedidoCriado) {
    return (
      <>
        <div className="bg">
          <div className="shell">
            <div className="card">
              <div className="brand">
                <div className="logo ok">✅</div>
                <div>
                  <h1>Pedido confirmado</h1>
                  <p>Guarde este código para localizar seu pedido.</p>
                </div>
              </div>

              <div className="codeBox">
                <div className="codeLabel">NÚMERO DO PEDIDO</div>
                <div className="codeValue">{pedidoCriado.pedido.codigo_pedido || "DP-—"}</div>
              </div>

              <div className="row">
                <div className="pill warn">Aguardando pagamento</div>
                <div className="price">
                  Total: <strong>R$ {Number(pedidoCriado.pedido.valor_total).toFixed(2)}</strong>
                </div>
              </div>

              <div className="miniBreakdown">
                <div className="miniRow">
                  <span>Base (itens x preço)</span>
                  <strong>R$ {Number(pedidoCriado.valorBase).toFixed(2)}</strong>
                </div>
                <div className="miniRow">
                  <span>Identificador (centavos)</span>
                  <strong>+ R$ {Number(pedidoCriado.identificadorCentavos).toFixed(2)}</strong>
                </div>
              </div>

              <div className="sectionTitle">Resumo</div>
              <div className="list">
                {pedidoCriado.itens.map((i) => (
                  <div key={i.item_id} className="item">
                    <span className="itemName">{i.nome}</span>
                    <span className="itemQty">x{i.quantidade}</span>
                  </div>
                ))}
              </div>

              <div className="sectionTitle">Pagamento via PIX</div>

              {!organizacao?.chave_pix ? (
                <div className="alert">
                  <strong>Chave PIX da organização não encontrada.</strong> Cadastre em{" "}
                  <code>organizacoes.chave_pix</code>.
                </div>
              ) : !pixCopiaECola ? (
                <div className="alert">Não foi possível gerar o PIX. Verifique a chave da organização.</div>
              ) : (
                <div className="pixBox">
                  <div className="pixGrid">
                    <div className="qrWrap">
                      <img className="qr" src={qrUrl} alt="QR Code PIX" />
                      <div className="pixHint">Aponte a câmera/PIX do banco para pagar.</div>
                    </div>

                    <div>
                      <div className="pixTitle">PIX Copia e Cola</div>
                      <textarea className="pixText" readOnly value={pixCopiaECola} />
                      <div className="pixActions">
                        <button type="button" className="btnLight" onClick={copiarPix}>
                          Copiar
                        </button>
                        <div className="pixSmall">
                          Pagamento será identificado pelo valor com centavos.
                          <br />
                          TXID (Identificador PIX): <strong className="mono">{txidExibicao}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="hint">
                Se precisar localizar depois, informe o código{" "}
                <strong>{pedidoCriado.pedido.codigo_pedido}</strong>.
              </div>

              <div className="footer">
                <button className="btnLight" onClick={voltarAoCodigo}>
                  Trocar código
                </button>
                <button className="btn" onClick={resetar}>
                  Fazer novo pedido
                </button>
              </div>
            </div>
          </div>
        </div>
        <Style />
      </>
    );
  }

  return (
    <>
      <div className="bg">
        <div className="shell">
          <div className="card">
            <div className="brand">
              <div className="logo">🍕</div>
              <div>
                <h1>PedeSim</h1>
                <p className="sub">{campanha?.nome || "Campanha"} • preço por item</p>
              </div>
              <div className="tag">
                <button type="button" className="linkTag" onClick={voltarAoCodigo}>
                  Trocar código
                </button>
              </div>
            </div>

            <form onSubmit={enviarPedido}>
              <div className="grid2">
                <div>
                  <label>Nome do comprador</label>
                  <input
                    name="nome_comprador"
                    value={form.nome_comprador}
                    onChange={handleChange}
                    placeholder="Ex: João Silva"
                    required
                  />
                </div>

                <div>
                  <label>WhatsApp</label>
                  <input
                    type="tel"
                    name="whatsapp"
                    value={formatBRPhone(form.whatsapp)}
                    onChange={handleChange}
                    placeholder="(11) 99999-9999"
                    inputMode="numeric"
                    autoComplete="tel"
                    required
                  />
                </div>

                <div className="span2">
                  <label>Nome do desbravador</label>
                  <input
                    name="nome_referencia"
                    value={form.nome_referencia}
                    onChange={handleChange}
                    placeholder="Ex: João Silva"
                    required
                  />
                </div>

                <div className="span2">
                  <label>Quantidade de pizzas</label>
                  <div className="qtyRow">
                    <input
                      type="number"
                      name="quantidade"
                      min="1"
                      value={form.quantidade}
                      onChange={handleChange}
                    />
                    <div className="totals">
                      <div className="small">
                        Selecionado: <strong>{totalItens}</strong> / {form.quantidade}
                      </div>
                      <div className="bar">
                        <div
                          className={`barFill ${progresso === 100 ? "done" : ""}`}
                          style={{ width: `${progresso}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="sectionTitle">Escolha os itens</div>
              <div className="flavors">
                {itens.map((s) => {
                  const id = s.id;
                  const qtd = itensSelecionados[id] || 0;

                  return (
                    <div key={id} className="flavorCard">
                      <div>
                        <div className="flavorName">{s.nome}</div>
                        <div className="small muted">R$ {Number(s.preco || 0).toFixed(2)}</div>
                      </div>
                      <div className="stepper">
                        <button type="button" className="iconBtn" onClick={() => decItem(id)}>
                          –
                        </button>
                        <div className="qtd">{qtd}</div>
                        <button type="button" className="iconBtn" onClick={() => incItem(id)}>
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="footer">
                <div className="summary">
                  <div className="small">Total a pagar</div>
                  <div className="big">R$ {Number(valorTotal).toFixed(2)}</div>
                  <div className="small muted">
                    Base: R$ {Number(valorBase).toFixed(2)}
                    {identificadorCentavos
                      ? ` + Identificador: R$ ${Number(identificadorCentavos).toFixed(2)}`
                      : ""}
                  </div>
                </div>

                <button className="btn" type="submit" disabled={enviando}>
                  {enviando ? "Enviando..." : "Confirmar pedido"}
                </button>
              </div>
            </form>

            <div className="note">
              Ao confirmar, seu pedido será registrado e você receberá as instruções de pagamento PIX.
            </div>
          </div>
        </div>
      </div>
      <Style />
    </>
  );
}

/* =========================================================
   PIX payload (IGUAL AO EXEMPLO QUE FUNCIONOU)
   ========================================================= */

function buildPixPayloadLikeWorkingExample({ pixKey, merchantName, merchantCity, amount, txid }) {
  const key = String(pixKey || "").trim();
  if (!key) return "";

  const mai = emv("00", "BR.GOV.BCB.PIX") + emv("01", key);

  const payload =
    emv("00", "01") +
    emv("26", mai) +
    emv("52", "0000") +
    emv("53", "986") +
    emv("54", formatAmount(amount)) +
    emv("58", "BR") +
    emv("59", String(merchantName || "N").slice(0, 25)) +
    emv("60", String(merchantCity || "C").slice(0, 15)) +
    emv("62", emv("05", String(txid || "PizzaAmigosParaiso").replace(/\s+/g, "").slice(0, 25))) +
    "6304";

  const crc = crc16_ccitt_false(payload);
  return payload + crc;
}

function emv(id, value) {
  const v = String(value ?? "");
  const len = v.length.toString().padStart(2, "0");
  return `${id}${len}${v}`;
}

function formatAmount(n) {
  const v = Number(n || 0);
  return v.toFixed(2);
}

function crc16_ccitt_false(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/* =========================================================
   Styles
   ========================================================= */

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
        --warn: #f59e0b;
        --ok: #16a34a;
        --ok2: #22c55e;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        color: var(--text);
      }

      .bg {
        min-height: 100vh;
        background: radial-gradient(
            1200px 600px at 20% 10%,
            rgba(37, 99, 235, 0.45),
            transparent 60%
          ),
          radial-gradient(
            1000px 500px at 90% 30%,
            rgba(245, 158, 11, 0.35),
            transparent 60%
          ),
          linear-gradient(180deg, #0b1220, #0f172a 60%, #0b1220);
        padding: 28px 16px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .shell {
        width: 100%;
        max-width: 920px;
      }
      .card {
        width: 100%;
        background: var(--card);
        border: 1px solid rgba(255, 255, 255, 0.35);
        border-radius: 18px;
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35);
        padding: 22px;
        backdrop-filter: blur(10px);
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 18px;
      }
      .logo {
        width: 44px;
        height: 44px;
        border-radius: 14px;
        background: rgba(37, 99, 235, 0.14);
        display: grid;
        place-items: center;
        font-size: 22px;
      }
      .logo.ok {
        background: rgba(34, 197, 94, 0.16);
      }

      h1 {
        margin: 0;
        font-size: 22px;
      }
      .sub {
        margin: 2px 0 0 0;
        color: var(--muted);
        font-size: 14px;
      }
      .tag {
        margin-left: auto;
        font-size: 12px;
        color: #0f172a;
        background: rgba(245, 158, 11, 0.18);
        border: 1px solid rgba(245, 158, 11, 0.35);
        padding: 6px 10px;
        border-radius: 999px;
        white-space: nowrap;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .linkTag {
        border: none;
        background: transparent;
        cursor: pointer;
        font-weight: 900;
        color: #0f172a;
      }

      label {
        display: block;
        font-size: 12px;
        color: var(--muted);
        margin: 6px 0;
      }
      input,
      textarea {
        width: 100%;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.9);
        border-radius: 12px;
        padding: 12px;
        font-size: 14px;
        outline: none;
        color: #0f172a;
        -webkit-text-fill-color: #0f172a;
        caret-color: #0f172a;
      }
      input:focus,
      textarea:focus {
        border-color: rgba(37, 99, 235, 0.55);
        box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
      }

      .grid2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .span2 {
        grid-column: span 2;
      }

      .qtyRow {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 12px;
        align-items: center;
      }
      .totals .small {
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 6px;
      }
      .bar {
        height: 10px;
        background: rgba(15, 23, 42, 0.08);
        border-radius: 999px;
        overflow: hidden;
      }
      .barFill {
        height: 100%;
        background: linear-gradient(90deg, var(--primary), #60a5fa);
        border-radius: 999px;
      }
      .barFill.done {
        background: linear-gradient(90deg, var(--ok), var(--ok2));
      }

      .sectionTitle {
        margin-top: 18px;
        margin-bottom: 10px;
        font-weight: 900;
        font-size: 14px;
      }

      .flavors {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
      }
      .flavorCard {
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.8);
        border-radius: 14px;
        padding: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }
      .flavorName {
        font-size: 13px;
        font-weight: 800;
      }
      .stepper {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .iconBtn {
        width: 32px;
        height: 32px;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: white;
        cursor: pointer;
        font-size: 18px;
        line-height: 0;
        color: #0f172a;
        -webkit-text-fill-color: #0f172a;
      }
      .qtd {
        width: 24px;
        text-align: center;
        font-weight: 900;
      }

      .footer {
        margin-top: 16px;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        border-top: 1px dashed rgba(15, 23, 42, 0.18);
        padding-top: 14px;
      }
      .summary .small {
        font-size: 12px;
        color: var(--muted);
      }
      .summary .big {
        font-size: 20px;
        font-weight: 900;
      }
      .muted {
        color: var(--muted);
      }

      .btn {
        background: linear-gradient(180deg, var(--primary), var(--primary2));
        color: white;
        border: none;
        padding: 12px 14px;
        border-radius: 12px;
        font-weight: 900;
        cursor: pointer;
        min-width: 220px;
      }
      .btn:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }
      .btnLight {
        background: rgba(15, 23, 42, 0.06);
        color: #0f172a;
        border: 1px solid rgba(15, 23, 42, 0.12);
        padding: 10px 12px;
        border-radius: 12px;
        font-weight: 900;
        cursor: pointer;
      }

      .note {
        margin-top: 14px;
        font-size: 12px;
        color: var(--muted);
        background: rgba(15, 23, 42, 0.04);
        border: 1px solid rgba(15, 23, 42, 0.08);
        padding: 10px 12px;
        border-radius: 12px;
      }

      .alert {
        background: rgba(245, 158, 11, 0.16);
        border: 1px solid rgba(245, 158, 11, 0.35);
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 12px;
        font-size: 13px;
      }

      .codeBox {
        background: rgba(37, 99, 235, 0.1);
        border: 1px solid rgba(37, 99, 235, 0.22);
        border-radius: 14px;
        padding: 12px;
        margin: 14px 0;
      }
      .codeLabel {
        font-size: 11px;
        letter-spacing: 0.12em;
        color: var(--muted);
      }
      .codeValue {
        font-size: 26px;
        font-weight: 900;
        margin-top: 4px;
      }

      .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 8px;
      }
      .pill {
        font-size: 12px;
        border-radius: 999px;
        padding: 6px 10px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        background: rgba(15, 23, 42, 0.05);
      }
      .pill.warn {
        border-color: rgba(245, 158, 11, 0.35);
        background: rgba(245, 158, 11, 0.16);
      }
      .price {
        font-size: 13px;
        color: var(--muted);
      }

      .miniBreakdown {
        margin: 8px 0 12px 0;
        border: 1px solid rgba(15, 23, 42, 0.1);
        background: rgba(255, 255, 255, 0.7);
        border-radius: 12px;
        padding: 10px 12px;
      }
      .miniRow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        font-size: 12px;
        color: var(--muted);
        padding: 6px 0;
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
      }
      .miniRow:last-child {
        border-bottom: none;
      }

      .list {
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.75);
        border-radius: 14px;
        padding: 10px;
      }
      .item {
        display: flex;
        justify-content: space-between;
        padding: 8px 6px;
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
      }
      .item:last-child {
        border-bottom: none;
      }
      .itemName {
        font-weight: 800;
      }
      .itemQty {
        color: var(--muted);
        font-weight: 900;
      }

      .hint {
        margin-top: 12px;
        font-size: 12px;
        color: var(--muted);
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.22);
        padding: 10px 12px;
        border-radius: 12px;
      }

      /* PIX */
      .pixBox {
        border: 1px solid rgba(15, 23, 42, 0.1);
        background: rgba(255, 255, 255, 0.72);
        border-radius: 16px;
        padding: 12px;
      }
      .pixGrid {
        display: grid;
        grid-template-columns: 280px 1fr;
        gap: 12px;
        align-items: start;
      }
      .qrWrap {
        border: 1px solid rgba(15, 23, 42, 0.1);
        border-radius: 14px;
        background: white;
        padding: 10px;
        display: grid;
        place-items: center;
      }
      .qr {
        width: 260px;
        height: 260px;
      }
      .pixHint {
        margin-top: 8px;
        font-size: 12px;
        color: var(--muted);
        text-align: center;
      }
      .pixTitle {
        font-weight: 900;
        margin-bottom: 8px;
      }
      .pixText {
        min-height: 120px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
          "Courier New", monospace;
        font-size: 12px;
      }
      .pixActions {
        margin-top: 10px;
        display: flex;
        gap: 10px;
        align-items: center;
        justify-content: space-between;
      }
      .pixSmall {
        font-size: 12px;
        color: var(--muted);
      }

      .skeleton {
        height: 14px;
        border-radius: 10px;
        background: linear-gradient(
          90deg,
          rgba(15, 23, 42, 0.08),
          rgba(15, 23, 42, 0.14),
          rgba(15, 23, 42, 0.08)
        );
        background-size: 200% 100%;
        animation: shimmer 1.2s infinite;
        margin-top: 10px;
      }
      @keyframes shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }

      @media (max-width: 820px) {
        .flavors {
          grid-template-columns: repeat(2, 1fr);
        }
        .pixGrid {
          grid-template-columns: 1fr;
        }
        .qr {
          width: 240px;
          height: 240px;
        }
      }
      @media (max-width: 520px) {
        .grid2 {
          grid-template-columns: 1fr;
        }
        .span2 {
          grid-column: span 1;
        }
        .qtyRow {
          grid-template-columns: 1fr;
        }
        .btn {
          min-width: 100%;
        }
        .flavors {
          grid-template-columns: 1fr;
        }
        .tag {
          display: none;
        }
      }
    `}</style>
  );
}
