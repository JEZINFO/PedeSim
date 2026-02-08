"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { useRouter } from "next/navigation";

function sanitizeCampaignCode(v) {
  // mantém letras/números/_/- e remove espaços (máx 32)
  return String(v ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 32);
}

function makeCodeFromName(nome) {
  const base = String(nome || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 10);

  const suf = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
  return sanitizeCampaignCode(`${base || "CAMP"}${suf}`);
}

export default function AdminCampanhas() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  const [organizacoes, setOrganizacoes] = useState([]);
  const [campanhas, setCampanhas] = useState([]);

  const [editando, setEditando] = useState(null); // id da campanha ou null
  const [form, setForm] = useState({
    organizacao_id: "",
    nome: "",
    data_inicio: "",
    data_fim: "",
    preco_base: 0,
    custo_pizza: 0, // ✅ custo de produção unitário
    identificador_centavos: 0.01,
    // ✅ NOVO: acesso por código
    codigo_acesso: "",
    publica: true,
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

    // organizacoes
    const { data: organizacoesData, error: organizacoesError } = await supabase
      .from("organizacoes")
      .select("id, nome, ativo, criado_em")
      .order("criado_em", { ascending: false });

    if (organizacoesError) {
      console.error(organizacoesError);
      setErro("Erro ao carregar organizacoes (verifique RLS/admin).");
      setLoading(false);
      return;
    }

    setOrganizacoes(organizacoesData || []);

    // campanhas
    const { data: campData, error: campError } = await supabase
      .from("campanhas")
      .select(
        "id, organizacao_id, nome, data_inicio, data_fim, preco_base, custo_pizza, identificador_centavos, codigo_acesso, publica, ativa, criado_em"
      )
      .order("criado_em", { ascending: false });

    if (campError) {
      console.error(campError);
      setErro("Erro ao carregar campanhas.");
      setLoading(false);
      return;
    }

    setCampanhas(campData || []);
    setLoading(false);

    // se tiver 1 organização e nenhum selecionado, setar default
    if ((organizacoesData || []).length === 1 && !form.organizacao_id) {
      setForm((p) => ({ ...p, organizacao_id: organizacoesData[0].id }));
    }
  }

  const organizacoesMap = useMemo(() => {
    const m = new Map();
    (organizacoes || []).forEach((c) => m.set(c.id, c.nome));
    return m;
  }, [organizacoes]);

  function onChange(e) {
    const { name, value, type, checked } = e.target;

    if (name === "codigo_acesso") {
      setForm((p) => ({ ...p, codigo_acesso: sanitizeCampaignCode(value) }));
      return;
    }

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
      organizacao_id: organizacoes?.[0]?.id || "",
      nome: "",
      data_inicio: "",
      data_fim: "",
      preco_base: 0,
      custo_pizza: 0,
      identificador_centavos: 0.01,
      codigo_acesso: "",
      publica: true,
      ativa: false,
    });
  }

  function editar(c) {
    setErro(null);
    setOk(null);
    setEditando(c.id);
    setForm({
      organizacao_id: c.organizacao_id || "",
      nome: c.nome || "",
      data_inicio: c.data_inicio || "",
      data_fim: c.data_fim || "",
      preco_base: Number(c.preco_base || 0),
      custo_pizza: Number(c.custo_pizza || 0),
      identificador_centavos: Number(c.identificador_centavos ?? 0.01),
      codigo_acesso: sanitizeCampaignCode(c.codigo_acesso || ""),
      publica: c.publica !== false, // default true
      ativa: !!c.ativa,
    });
  }

  async function salvar(e) {
    e.preventDefault();
    setErro(null);
    setOk(null);

    if (!form.organizacao_id) return setErro("Selecione um organização.");
    if (!String(form.nome || "").trim()) return setErro("Informe o nome da campanha.");
    if (!form.data_inicio) return setErro("Informe a data de início.");
    if (!form.data_fim) return setErro("Informe a data de fim.");

    const valorPizza = Number(form.preco_base);
    if (!Number.isFinite(valorPizza) || valorPizza <= 0) return setErro("Valor da pizza deve ser maior que zero.");

    const custoPizza = Number(form.custo_pizza);
    if (!Number.isFinite(custoPizza) || custoPizza < 0) return setErro("Custo da pizza deve ser zero ou maior.");

    const identificador = Number(form.identificador_centavos);
    if (!Number.isFinite(identificador) || identificador < 0 || identificador >= 1)
      return setErro("Identificador (centavos) deve ser entre 0,00 e 0,99.");

    // ✅ NOVO: valida código
    const codigo = sanitizeCampaignCode(form.codigo_acesso);
    if (!codigo || codigo.length < 3) return setErro("Informe um código de acesso (mín. 3 caracteres).");

    const payload = {
      organizacao_id: form.organizacao_id,
      nome: String(form.nome).trim(),
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      preco_base: Math.round(valorPizza * 100) / 100,
      custo_pizza: Math.round(custoPizza * 100) / 100,
      identificador_centavos: Math.round(identificador * 100) / 100,
      // ✅ NOVO
      codigo_acesso: codigo,
      publica: !!form.publica,
      ativa: !!form.ativa,
    };

    // Se marcar como ativa, desativa as outras antes (para manter só 1 ativa por organização)
    if (payload.ativa) {
      const { error: offError } = await supabase
        .from("campanhas")
        .update({ ativa: false })
        .eq("organizacao_id", payload.organizacao_id);

      if (offError) {
        console.error(offError);
        return setErro("Erro ao desativar outras campanhas.");
      }
    }

    if (!editando) {
      const { error } = await supabase.from("campanhas").insert(payload);
      if (error) {
        console.error(error);
        // dica amigável para conflito de código único
        if ((error.message || "").toLowerCase().includes("duplicate")) {
          return setErro("Esse código de acesso já existe. Escolha outro.");
        }
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
      if ((error.message || "").toLowerCase().includes("duplicate")) {
        return setErro("Esse código de acesso já existe. Escolha outro.");
      }
      return setErro(error.message);
    }

    setOk("Campanha atualizada ✅");
    await carregarTudo();
  }

  async function ativarRapido(c) {
    setErro(null);
    setOk(null);

    // desativa outras do mesmo organização e ativa a escolhida
    const { error: offError } = await supabase
      .from("campanhas")
      .update({ ativa: false })
      .eq("organizacao_id", c.organizacao_id);

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

  async function copiarLinkPublico(c) {
    try {
      const base = window.location.origin;
      const cod = sanitizeCampaignCode(c.codigo_acesso || "");
      if (!cod) {
        alert("Campanha sem código. Edite e salve um código primeiro.");
        return;
      }
      const url = `${base}/?c=${cod}`;
      await navigator.clipboard.writeText(url);
      setOk("Link copiado ✅");
      setTimeout(() => setOk(null), 1800);
    } catch {
      alert("Não consegui copiar automaticamente.");
    }
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
              <p className="muted">Criar e manter campanhas do PedeSim</p>
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
                          {c.nome}{" "}
                          {c.ativa ? <span className="pill ok">ATIVA</span> : <span className="pill">inativa</span>}
                          {c.publica !== false ? <span className="pill pub">PÚBLICA</span> : <span className="pill">privada</span>}
                        </div>
                        <div className="rowSub">
                          Organização: <strong>{organizacoesMap.get(c.organizacao_id) || "—"}</strong> •{" "}
                          {fmtData(c.data_inicio)} → {fmtData(c.data_fim)} • Venda: R$ {Number(c.preco_base).toFixed(2)} •
                          Custo: R$ {Number(c.custo_pizza || 0).toFixed(2)} • Margem: R${" "}
                          {(Number(c.preco_base || 0) - Number(c.custo_pizza || 0)).toFixed(2)} • ID:{" "}
                          {Number(c.identificador_centavos ?? 0.01).toFixed(2)}
                          <br />
                          Código: <strong className="mono">{c.codigo_acesso || "—"}</strong>
                        </div>
                      </div>
                      <div className="rowBtns">
                        <button className="btnMini" onClick={() => copiarLinkPublico(c)}>
                          Copiar link
                        </button>
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
                <label>Organização</label>
                <select name="organizacao_id" value={form.organizacao_id} onChange={onChange}>
                  <option value="">Selecione…</option>
                  {organizacoes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} {c.ativo ? "" : "(inativo)"}
                    </option>
                  ))}
                </select>

                <label>Nome</label>
                <input name="nome" value={form.nome} onChange={onChange} placeholder="PedeSim Fevereiro" />

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
                    <input type="number" step="0.01" name="preco_base" value={form.preco_base} onChange={onChange} />
                  </div>
                  <div>
                    <label>Custo da pizza (R$)</label>
                    <input type="number" step="0.01" name="custo_pizza" value={form.custo_pizza} onChange={onChange} />
                  </div>
                </div>

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

                {/* ✅ NOVO: Código da campanha */}
                <div className="codeRow">
                  <div>
                    <label>Código de acesso</label>
                    <input
                      name="codigo_acesso"
                      value={form.codigo_acesso}
                      onChange={onChange}
                      placeholder="Ex: AMIGOS2026"
                      autoCapitalize="characters"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <div className="help">
                      Esse código será usado na home: <strong className="mono">/?c=SEUCODIGO</strong>
                    </div>
                  </div>
                  <div className="codeActions">
                    <label>&nbsp;</label>
                    <button
                      type="button"
                      className="btnMini"
                      onClick={() => setForm((p) => ({ ...p, codigo_acesso: makeCodeFromName(p.nome) }))}
                    >
                      Gerar
                    </button>
                  </div>
                </div>

                <label className="check">
                  <input type="checkbox" name="publica" checked={form.publica} onChange={onChange} />
                  Campanha pública (pode acessar via código)
                </label>

                <label className="check">
                  <input type="checkbox" name="ativa" checked={form.ativa} onChange={onChange} />
                  Marcar como ativa (desativa as outras do mesmo organização)
                </label>

                <button className="btn" type="submit">
                  Salvar
                </button>

                <div className="note">
                  Dica: com o novo fluxo por código, você pode manter várias campanhas e distribuir apenas o link/código de cada uma.
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
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        color: var(--text);
      }
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
        box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35);
        padding: 22px;
        backdrop-filter: blur(10px);
      }
      .top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
      }
      .topRight {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }
      h1 {
        margin: 0;
        font-size: 22px;
      }
      .muted {
        color: var(--muted);
        font-size: 13px;
        margin: 6px 0 0 0;
      }

      .grid {
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 12px;
        margin-top: 12px;
      }
      .panel {
        border: 1px solid rgba(15, 23, 42, 0.12);
        background: rgba(255, 255, 255, 0.78);
        border-radius: 16px;
        padding: 14px;
      }
      .panelTitle {
        font-weight: 900;
        margin-bottom: 10px;
      }

      .list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .rowItem {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        border: 1px solid rgba(15, 23, 42, 0.1);
        background: rgba(255, 255, 255, 0.9);
        border-radius: 14px;
        padding: 12px;
      }
      .rowTitle {
        font-weight: 900;
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .rowSub {
        margin-top: 6px;
        color: var(--muted);
        font-size: 12px;
        line-height: 1.35;
      }
      .rowBtns {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .pill {
        font-size: 11px;
        border-radius: 999px;
        padding: 4px 8px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        background: rgba(15, 23, 42, 0.05);
        white-space: nowrap;
      }
      .pill.ok {
        border-color: rgba(34, 197, 94, 0.22);
        background: rgba(34, 197, 94, 0.12);
        color: #14532d;
      }
      .pill.pub {
        border-color: rgba(37, 99, 235, 0.22);
        background: rgba(37, 99, 235, 0.12);
        color: #0b2a6f;
      }

      .form {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      label {
        font-size: 12px;
        color: var(--muted);
      }
      input,
      select {
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
      .grid2 {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }

      .check {
        display: flex;
        align-items: center;
        gap: 10px;
        user-select: none;
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
        background: rgba(15, 23, 42, 0.06);
        color: #0f172a;
        border: 1px solid rgba(15, 23, 42, 0.12);
        padding: 10px 12px;
        border-radius: 12px;
        font-weight: 900;
        cursor: pointer;
      }
      .btnMini {
        background: rgba(15, 23, 42, 0.06);
        color: #0f172a;
        border: 1px solid rgba(15, 23, 42, 0.12);
        padding: 8px 10px;
        border-radius: 12px;
        font-weight: 900;
        cursor: pointer;
        font-size: 12px;
        white-space: nowrap;
      }
      .btnMini.danger {
        border-color: rgba(239, 68, 68, 0.25);
        background: rgba(239, 68, 68, 0.1);
        color: #7f1d1d;
      }

      .alert {
        border-radius: 12px;
        padding: 10px 12px;
        border: 1px solid rgba(15, 23, 42, 0.12);
        margin: 10px 0;
        font-size: 13px;
      }
      .alert.warn {
        background: rgba(245, 158, 11, 0.16);
        border-color: rgba(245, 158, 11, 0.35);
      }
      .alert.ok {
        background: rgba(34, 197, 94, 0.12);
        border-color: rgba(34, 197, 94, 0.22);
      }

      .note {
        margin-top: 8px;
        font-size: 12px;
        color: var(--muted);
        background: rgba(15, 23, 42, 0.04);
        border: 1px solid rgba(15, 23, 42, 0.08);
        padding: 10px 12px;
        border-radius: 12px;
      }
      .empty {
        color: var(--muted);
        font-size: 13px;
        padding: 10px 0;
      }

      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      }

      .codeRow {
        display: grid;
        grid-template-columns: 1fr 120px;
        gap: 10px;
        align-items: end;
      }
      .codeActions {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .help {
        margin-top: 6px;
        font-size: 12px;
        color: var(--muted);
      }

      @media (max-width: 920px) {
        .grid {
          grid-template-columns: 1fr;
        }
      }
      @media (max-width: 520px) {
        .grid2 {
          grid-template-columns: 1fr;
        }
        .codeRow {
          grid-template-columns: 1fr;
        }
      }
    `}</style>
  );
}
