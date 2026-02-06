"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { useRouter } from "next/navigation";

export default function AdminCampanhasItens() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  const [campanhas, setCampanhas] = useState([]);
  const [campanhaId, setCampanhaId] = useState("");

  const [catalogo, setCatalogo] = useState([]); // itens globais
  const [itensCampanha, setItensCampanha] = useState([]); // vínculos

  // adicionar vínculo
  const [novoItemId, setNovoItemId] = useState("");
  const [novoForm, setNovoForm] = useState({ ordem: 0, preco: 0, ativo: true });

  // editar vínculo (inline)
  const [editandoId, setEditandoId] = useState(null); // vinculo_id
  const [form, setForm] = useState({ ordem: 0, preco: 0, ativo: true });

  const campanhasMap = useMemo(() => {
    const m = new Map();
    campanhas.forEach((c) => m.set(c.id, c.nome));
    return m;
  }, [campanhas]);

  const catalogoOrdenado = useMemo(() => {
    const arr = [...(catalogo || [])];
    arr.sort((a, b) => {
      const aa = a.ativo ? 0 : 1;
      const bb = b.ativo ? 0 : 1;
      if (aa !== bb) return aa - bb;
      return String(a.nome || "").localeCompare(String(b.nome || ""));
    });
    return arr;
  }, [catalogo]);

  const idsVinculados = useMemo(() => new Set(itensCampanha.map((x) => x.item_id)), [itensCampanha]);

  const opcoesParaVincular = useMemo(() => {
    return catalogoOrdenado.filter((i) => !idsVinculados.has(i.id));
  }, [catalogoOrdenado, idsVinculados]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push("/login");
        return;
      }
      await bootstrap();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bootstrap() {
    setLoading(true);
    setErro(null);
    setOk(null);

    const [{ data: campData, error: campErr }, { data: itensData, error: itensErr }] = await Promise.all([
      supabase
        .from("campanhas")
        .select("id, nome, ativa, data_inicio")
        .order("ativa", { ascending: false })
        .order("data_inicio", { ascending: false }),
      supabase.from("itens").select("id, nome, ativo, criado_em").order("criado_em", { ascending: false }),
    ]);

    if (campErr) {
      console.error(campErr);
      setErro(`Erro ao carregar campanhas. (${campErr.code}) ${campErr.message}`);
      setLoading(false);
      return;
    }
    if (itensErr) {
      console.error(itensErr);
      setErro(`Erro ao carregar itens. (${itensErr.code}) ${itensErr.message}`);
      setLoading(false);
      return;
    }

    setCampanhas(campData || []);
    setCatalogo(itensData || []);

    const ativa = (campData || []).find((c) => c.ativa);
    const chosen = ativa?.id || campData?.[0]?.id || "";
    setCampanhaId(chosen);

    if (chosen) await carregarVinculos(chosen);

    setLoading(false);
  }

  async function carregarVinculos(cId) {
    setErro(null);

    const { data, error } = await supabase
      .from("itens_campanha")
      .select(
        `
        id,
        campanha_id,
        item_id,
        ordem,
        preco,
        ativo,
        itens ( id, nome, ativo )
      `
      )
      .eq("campanha_id", cId)
      .order("ordem", { ascending: true });

    if (error) {
      console.error(error);
      setErro(`Erro ao carregar itens da campanha. (${error.code}) ${error.message}`);
      return;
    }

    const normalizado = (data || []).map((r) => {
      const item = Array.isArray(r.itens) ? r.itens[0] : r.itens;
      return {
        vinculo_id: r.id,
        campanha_id: r.campanha_id,
        item_id: r.item_id,
        nome: item?.nome || "Item",
        item_ativo: item?.ativo ?? true,
        ordem: Number(r.ordem ?? 0),
        preco: Number(r.preco ?? 0),
        ativo: !!r.ativo,
      };
    });

    setItensCampanha(normalizado);

    // reset forms (evita “inputs em branco”)
    setEditandoId(null);
    setForm({ ordem: 0, preco: 0, ativo: true });
    setNovoItemId("");
    setNovoForm({ ordem: 0, preco: 0, ativo: true });
  }

  async function trocarCampanha(id) {
    setCampanhaId(id);
    setErro(null);
    setOk(null);
    setEditandoId(null);
    if (id) await carregarVinculos(id);
  }

  function onChangeNovo(e) {
    const { name, value, type, checked } = e.target;
    setNovoForm((p) => ({
      ...p,
      [name]: type === "checkbox" ? checked : name === "ordem" || name === "preco" ? Number(value) : value,
    }));
  }

  async function vincularNovo(e) {
    e.preventDefault();
    setErro(null);
    setOk(null);

    if (!campanhaId) return setErro("Selecione uma campanha.");
    if (!novoItemId) return setErro("Selecione um item do catálogo.");

    const ordem =
      Number(novoForm.ordem || 0) > 0 ? Number(novoForm.ordem) : (itensCampanha[itensCampanha.length - 1]?.ordem ?? 0) + 1;

    const preco = Number(novoForm.preco ?? 0);
    if (!Number.isFinite(preco) || preco < 0) return setErro("Preço inválido.");

    const { error } = await supabase.from("itens_campanha").insert({
      campanha_id: campanhaId,
      item_id: novoItemId,
      ordem,
      preco,
      ativo: !!novoForm.ativo,
    });

    if (error) {
      console.error(error);
      setErro(`Erro ao vincular. (${error.code}) ${error.message}`);
      return;
    }

    setOk("Item vinculado ✅");
    await carregarVinculos(campanhaId);
  }

  function editar(v) {
    setErro(null);
    setOk(null);
    setEditandoId(v.vinculo_id);
    setForm({ ordem: Number(v.ordem ?? 0), preco: Number(v.preco ?? 0), ativo: !!v.ativo });
  }

  function cancelarEdicao() {
    setEditandoId(null);
    setForm({ ordem: 0, preco: 0, ativo: true });
  }

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({
      ...p,
      [name]: type === "checkbox" ? checked : name === "ordem" || name === "preco" ? Number(value) : value,
    }));
  }

  async function salvarEdicao(e) {
    e.preventDefault();
    setErro(null);
    setOk(null);

    const ordem = Number(form.ordem ?? 0);
    const preco = Number(form.preco ?? 0);

    if (!Number.isFinite(ordem)) return setErro("Ordem inválida.");
    if (!Number.isFinite(preco) || preco < 0) return setErro("Preço inválido.");

    const { error } = await supabase
      .from("itens_campanha")
      .update({ ordem, preco, ativo: !!form.ativo })
      .eq("id", editandoId);

    if (error) {
      console.error(error);
      setErro(`Erro ao salvar. (${error.code}) ${error.message}`);
      return;
    }

    setOk("Vínculo atualizado ✅");
    await carregarVinculos(campanhaId);
  }

  async function alternarAtivo(v) {
    setErro(null);
    setOk(null);

    const { error } = await supabase.from("itens_campanha").update({ ativo: !v.ativo }).eq("id", v.vinculo_id);

    if (error) {
      console.error(error);
      setErro(`Erro ao alterar status. (${error.code}) ${error.message}`);
      return;
    }

    setOk(!v.ativo ? "Ativado na campanha ✅" : "Inativado na campanha ✅");
    await carregarVinculos(campanhaId);
  }

  async function desvincular(v) {
    setErro(null);
    setOk(null);

    const confirmado = confirm(`Remover vínculo do item "${v.nome}" desta campanha?`);
    if (!confirmado) return;

    const { error } = await supabase.from("itens_campanha").delete().eq("id", v.vinculo_id);

    if (error) {
      console.error(error);
      setErro(`Erro ao remover vínculo. (${error.code}) ${error.message}`);
      return;
    }

    setOk("Vínculo removido ✅");
    await carregarVinculos(campanhaId);
  }

  if (loading) {
    return (
      <div style={wrap}>
        <h2 style={{ margin: 0 }}>Admin • Campanhas • Itens</h2>
        <p style={{ color: "#475569" }}>Carregando…</p>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={topbar}>
        <div>
          <div style={crumbs}>
            <button style={linkBtn} onClick={() => router.push("/admin")}>
              Admin
            </button>
            <span style={{ opacity: 0.55 }}> / </span>
            <span style={{ fontWeight: 900 }}>Campanhas • Itens</span>
          </div>

          <h1 style={h1}>Campanhas • Itens</h1>
          <p style={sub}>
            Relacione itens do catálogo a uma campanha e defina <b>ordem</b>, <b>preço</b> e <b>ativo</b>.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/admin")} style={btnGhost}>
            ← Voltar
          </button>
          <button onClick={bootstrap} style={btnGhost}>
            ↻ Recarregar
          </button>
        </div>
      </div>

      {erro ? (
        <div style={alertErr}>
          <strong>Erro:</strong> {erro}
        </div>
      ) : null}
      {ok ? (
        <div style={alertOk}>
          <strong>OK:</strong> {ok}
        </div>
      ) : null}

      <div style={grid}>
        {/* Coluna 1 */}
        <div style={card}>
          <div style={cardTitle}>Campanha</div>

          <select value={campanhaId} onChange={(e) => trocarCampanha(e.target.value)} style={selectLight}>
            <option value="">Selecione…</option>
            {campanhas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} {c.ativa ? "• ativa" : ""}
              </option>
            ))}
          </select>

          <div style={{ marginTop: 16, borderTop: "1px solid rgba(15,23,42,0.10)", paddingTop: 16 }}>
            <div style={cardTitle}>Vincular item do catálogo</div>

            <form onSubmit={vincularNovo} style={{ display: "grid", gap: 12 }}>
              <label style={lbl}>Item</label>
              <select value={novoItemId} onChange={(e) => setNovoItemId(e.target.value)} style={selectLight}>
                <option value="">Selecione…</option>
                {opcoesParaVincular.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nome} {!i.ativo ? " • (catálogo inativo)" : ""}
                  </option>
                ))}
              </select>

              <label style={lbl}>Ordem (opcional)</label>
              <input name="ordem" type="number" value={novoForm.ordem} onChange={onChangeNovo} style={inputLight} />

              <label style={lbl}>Preço (R$)</label>
              <input
                name="preco"
                type="number"
                step="0.01"
                value={novoForm.preco}
                onChange={onChangeNovo}
                style={inputLight}
                placeholder="Ex.: 70.00"
              />

              <label style={checkRow}>
                <input name="ativo" type="checkbox" checked={novoForm.ativo} onChange={onChangeNovo} />
                <span>Ativo na campanha</span>
              </label>

              <button type="submit" style={btnPrimary} disabled={!campanhaId || !novoItemId}>
                Vincular
              </button>

              <div style={hint}>Dica: se deixar “Ordem” em 0, entra automaticamente no final.</div>
            </form>
          </div>
        </div>

        {/* Coluna 2 */}
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <div style={cardTitle}>Itens da campanha</div>
            <div style={{ fontSize: 13, color: "#475569" }}>
              Campanha: <b>{campanhasMap.get(campanhaId) || "—"}</b>
            </div>
          </div>

          {itensCampanha.length === 0 ? (
            <div style={{ padding: 12, color: "#475569" }}>Nenhum item vinculado nesta campanha.</div>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {itensCampanha.map((v) => {
                const emEdicao = editandoId === v.vinculo_id;

                return (
                  <div key={v.vinculo_id} style={row}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div style={{ fontWeight: 950, color: "#0f172a" }}>{v.nome}</div>
                        {!v.item_ativo ? <span style={badgeOff}>catálogo inativo</span> : null}
                        <span style={v.ativo ? badgeOk : badgeMuted}>{v.ativo ? "ATIVO" : "INATIVO"}</span>
                      </div>

                      <div style={{ marginTop: 6, color: "#334155", fontSize: 13 }}>
                        Ordem: <b>{v.ordem}</b> • Preço: <b>R$ {Number(v.preco).toFixed(2)}</b>
                      </div>

                      <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>
                        item_id: <span style={mono}>{v.item_id}</span>
                      </div>

                      {/* editor só aparece quando clicou Editar (evita “campos em branco”) */}
                      {emEdicao ? (
                        <form onSubmit={salvarEdicao} style={editBox}>
                          <div style={editGrid}>
                            <div>
                              <div style={lblSmall}>Ordem</div>
                              <input name="ordem" type="number" value={form.ordem} onChange={onChange} style={inputLight} />
                            </div>

                            <div>
                              <div style={lblSmall}>Preço (R$)</div>
                              <input
                                name="preco"
                                type="number"
                                step="0.01"
                                value={form.preco}
                                onChange={onChange}
                                style={inputLight}
                              />
                            </div>

                            <label style={{ ...checkRow, marginTop: 18 }}>
                              <input name="ativo" type="checkbox" checked={form.ativo} onChange={onChange} />
                              <span>Ativo</span>
                            </label>
                          </div>

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button type="submit" style={btnPrimary}>
                              Salvar
                            </button>
                            <button type="button" onClick={cancelarEdicao} style={btnGhost}>
                              Cancelar
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button onClick={() => editar(v)} style={btnGhostSmall} title="Editar vínculo">
                        Editar
                      </button>

                      {/* ✓ ativa/inativa */}
                      <button
                        onClick={() => alternarAtivo(v)}
                        style={v.ativo ? iconBtnOk : iconBtnOff}
                        title={v.ativo ? "Inativar na campanha" : "Ativar na campanha"}
                      >
                        ✓
                      </button>

                      {/* × remove vínculo */}
                      <button onClick={() => desvincular(v)} style={iconBtnDanger} title="Remover vínculo">
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* placeholder cinza claro (padrão) */}
      <style jsx global>{`
        input::placeholder {
          color: rgba(100, 116, 139, 0.8);
        }
      `}</style>

      <style jsx>{`
        @media (max-width: 980px) {
          div[style*="grid-template-columns: 420px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ===== estilos ===== */
const wrap = { padding: 20, maxWidth: 1200, margin: "0 auto" };

const topbar = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 14,
};

const crumbs = { fontSize: 13, color: "#475569", display: "flex", gap: 6, alignItems: "center" };
const linkBtn = { border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "#2563eb", fontWeight: 900 };

const h1 = { margin: "6px 0 0", fontSize: 24, fontWeight: 980, letterSpacing: "-0.02em", color: "#0f172a" };
const sub = { margin: "6px 0 0", color: "#475569", fontSize: 13, maxWidth: 760 };

const grid = { display: "grid", gridTemplateColumns: "420px 1fr", gap: 14, marginTop: 12 };

const card = {
  border: "1px solid rgba(15, 23, 42, 0.12)",
  borderRadius: 16,
  padding: 14,
  background: "white",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
};

const cardTitle = { fontWeight: 980, color: "#0f172a", marginBottom: 10 };

const lbl = { fontSize: 13, color: "#334155", fontWeight: 900 };
const lblSmall = { fontSize: 12, color: "#475569", fontWeight: 900, marginBottom: 6 };

const inputLight = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(15, 23, 42, 0.14)",
  outline: "none",
  fontSize: 14,
  background: "#ffffff",
  color: "#0f172a",
  WebkitTextFillColor: "#0f172a",
  caretColor: "#0f172a",
};

const selectLight = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(15, 23, 42, 0.14)",
  outline: "none",
  fontSize: 14,
  background: "#ffffff",
  color: "#0f172a",
};

const checkRow = { display: "flex", gap: 10, alignItems: "center", color: "#0f172a", fontWeight: 900 };

const hint = {
  marginTop: 2,
  fontSize: 12,
  color: "#64748b",
  background: "rgba(15, 23, 42, 0.04)",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 12,
  padding: "10px 12px",
};

const row = {
  border: "1px solid rgba(15, 23, 42, 0.10)",
  borderRadius: 14,
  padding: 12,
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  justifyContent: "space-between",
  flexWrap: "wrap",
};

const editBox = {
  marginTop: 12,
  borderTop: "1px dashed rgba(15,23,42,0.18)",
  paddingTop: 12,
};

const editGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginBottom: 10,
};

const mono = {
  fontFamily:
    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
  fontSize: 12,
};

const btnPrimary = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(15, 23, 42, 0.22)",
  background: "#0f172a",
  color: "white",
  cursor: "pointer",
  fontWeight: 950,
};

const btnGhost = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(15, 23, 42, 0.18)",
  background: "white",
  color: "#0f172a",
  cursor: "pointer",
  fontWeight: 950,
};

const btnGhostSmall = {
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(15, 23, 42, 0.18)",
  background: "white",
  color: "#0f172a",
  cursor: "pointer",
  fontWeight: 950,
  fontSize: 13,
};

const iconBtnDanger = {
  width: 40,
  height: 36,
  borderRadius: 12,
  border: "1px solid rgba(185, 28, 28, 0.25)",
  background: "rgba(185, 28, 28, 0.06)",
  color: "#b91c1c",
  cursor: "pointer",
  fontWeight: 950,
  fontSize: 22,
  lineHeight: "0",
};

const iconBtnOk = {
  width: 40,
  height: 36,
  borderRadius: 12,
  border: "1px solid rgba(22, 101, 52, 0.25)",
  background: "rgba(22, 101, 52, 0.06)",
  color: "#166534",
  cursor: "pointer",
  fontWeight: 950,
  fontSize: 18,
  lineHeight: "0",
};

const iconBtnOff = {
  width: 40,
  height: 36,
  borderRadius: 12,
  border: "1px solid rgba(15, 23, 42, 0.14)",
  background: "rgba(15, 23, 42, 0.04)",
  color: "#0f172a",
  cursor: "pointer",
  fontWeight: 950,
  fontSize: 18,
  lineHeight: "0",
};

const badgeOk = {
  fontSize: 11,
  fontWeight: 950,
  padding: "4px 10px",
  borderRadius: 999,
  background: "rgba(22, 101, 52, 0.10)",
  color: "#166534",
  border: "1px solid rgba(22, 101, 52, 0.18)",
};

const badgeMuted = {
  fontSize: 11,
  fontWeight: 950,
  padding: "4px 10px",
  borderRadius: 999,
  background: "rgba(15, 23, 42, 0.06)",
  color: "#475569",
  border: "1px solid rgba(15, 23, 42, 0.12)",
};

const badgeOff = {
  fontSize: 11,
  fontWeight: 950,
  padding: "4px 10px",
  borderRadius: 999,
  background: "rgba(245, 158, 11, 0.12)",
  color: "#92400e",
  border: "1px solid rgba(245, 158, 11, 0.22)",
};

const alertErr = {
  marginTop: 10,
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(220, 38, 38, 0.25)",
  background: "rgba(220, 38, 38, 0.06)",
  color: "#7f1d1d",
};

const alertOk = {
  marginTop: 10,
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(22, 163, 74, 0.22)",
  background: "rgba(22, 163, 74, 0.08)",
  color: "#14532d",
};
