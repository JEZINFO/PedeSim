"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { useRouter } from "next/navigation";

export default function AdminItensCatalogo() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  const [busca, setBusca] = useState("");
  const [itens, setItens] = useState([]);

  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({ nome: "", ativo: true });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push("/login");
        return;
      }
      await carregarItens();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarItens() {
    setLoading(true);
    setErro(null);
    setOk(null);

    const { data, error } = await supabase
      .from("itens")
      .select("id, nome, ativo, criado_em")
      .order("criado_em", { ascending: false });

    if (error) {
      console.error(error);
      setErro(`Erro ao carregar itens. (${error.code || "RLS"}) ${error.message || ""}`);
      setLoading(false);
      return;
    }

    setItens(data || []);
    setLoading(false);
  }

  const itensFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return itens;
    return itens.filter((i) => String(i.nome || "").toLowerCase().includes(q));
  }, [itens, busca]);

  function novo() {
    setEditandoId(null);
    setForm({ nome: "", ativo: true });
    setErro(null);
    setOk(null);
  }

  function editar(i) {
    setEditandoId(i.id);
    setForm({ nome: i.nome || "", ativo: !!i.ativo });
    setErro(null);
    setOk(null);
  }

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
  }

  async function salvar(e) {
    e.preventDefault();
    setErro(null);
    setOk(null);

    const nome = String(form.nome || "").trim();
    if (!nome) {
      setErro("Informe o nome do item.");
      return;
    }

    if (!editandoId) {
      const { error } = await supabase.from("itens").insert({ nome, ativo: !!form.ativo });

      if (error) {
        console.error(error);
        setErro(`Não consegui criar. (${error.code}) ${error.message}`);
        return;
      }

      setOk("Item criado ✅");
      novo();
      await carregarItens();
      return;
    }

    const { error } = await supabase
      .from("itens")
      .update({ nome, ativo: !!form.ativo })
      .eq("id", editandoId);

    if (error) {
      console.error(error);
      setErro(`Não consegui salvar. (${error.code}) ${error.message}`);
      return;
    }

    setOk("Item atualizado ✅");
    novo();
    await carregarItens();
  }

  async function alternarAtivo(i) {
    setErro(null);
    setOk(null);

    const { error } = await supabase.from("itens").update({ ativo: !i.ativo }).eq("id", i.id);

    if (error) {
      console.error(error);
      setErro(`Não consegui alterar status. (${error.code}) ${error.message}`);
      return;
    }

    setOk(!i.ativo ? "Item ativado ✅" : "Item inativado ✅");
    await carregarItens();
  }

  async function excluir(i) {
    setErro(null);
    setOk(null);

    const confirmado = confirm(
      `Excluir "${i.nome}" do catálogo?\n\nATENÇÃO: se o item estiver vinculado a campanhas/pedidos, pode falhar por FK.`
    );
    if (!confirmado) return;

    const { error } = await supabase.from("itens").delete().eq("id", i.id);

    if (error) {
      console.error(error);
      setErro(`Não consegui excluir. (${error.code}) ${error.message}`);
      return;
    }

    setOk("Item excluído ✅");
    if (editandoId === i.id) novo();
    await carregarItens();
  }

  const totalAtivos = useMemo(() => itens.filter((i) => i.ativo).length, [itens]);

  return (
    <div style={wrap}>
      <div style={header}>
        <div>
          <div style={crumbs}>
            <button style={linkBtn} onClick={() => router.push("/admin")}>
              Admin
            </button>
            <span style={{ opacity: 0.55 }}> / </span>
            <span style={{ fontWeight: 900 }}>Itens</span>
          </div>

          <h1 style={h1}>Itens (Catálogo)</h1>
          <p style={sub}>
            Cadastre itens globais aqui. Depois, em <b>Campanhas • Itens</b>, você define preço/ordem/ativo por campanha.
          </p>

          <div style={kpis}>
            <div style={kpi}>
              <div style={kpiLabel}>Total</div>
              <div style={kpiValue}>{itens.length}</div>
            </div>
            <div style={kpi}>
              <div style={kpiLabel}>Ativos</div>
              <div style={kpiValue}>{totalAtivos}</div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
          <button onClick={carregarItens} style={btnGhost}>
            ↻ Recarregar
          </button>
          <button onClick={novo} style={btnPrimary}>
            + Novo item
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
        {/* Form */}
        <div style={card}>
          <div style={cardTop}>
            <div style={cardTitle}>{editandoId ? "Editar item" : "Novo item"}</div>
            {editandoId ? (
              <button onClick={novo} style={btnGhostSmall}>
                Cancelar
              </button>
            ) : null}
          </div>

          <form onSubmit={salvar} style={{ display: "grid", gap: 12 }}>
            <label style={lbl}>Nome do item</label>
            <input
              name="nome"
              value={form.nome}
              onChange={onChange}
              style={inputLight} // ✅ fundo branco + texto preto + placeholder cinza
              placeholder="Ex.: Pizza - Mussarela"
            />

            <label style={checkRow}>
              <input name="ativo" type="checkbox" checked={form.ativo} onChange={onChange} />
              <span>Ativo no catálogo</span>
            </label>

            <button type="submit" style={btnPrimary} disabled={loading}>
              {editandoId ? "Salvar alterações" : "Criar item"}
            </button>

            <div style={hint}>
              O catálogo controla só <b>nome</b> e <b>ativo</b>. Preço/ordem ficam no vínculo da campanha.
            </div>
          </form>
        </div>

        {/* List */}
        <div style={card}>
          <div style={tableHeader}>
            <div style={{ fontWeight: 950 }}>Lista</div>

            <div style={searchWrap}>
              <span style={searchIcon}>⌕</span>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                style={searchInputLight}
                placeholder="Buscar item…"
              />
            </div>
          </div>

          {loading ? (
            <div style={{ padding: 12, color: "#475569" }}>Carregando…</div>
          ) : itensFiltrados.length === 0 ? (
            <div style={{ padding: 12, color: "#475569" }}>Nenhum item encontrado.</div>
          ) : (
            <div style={table}>
              <div style={thead}>
                <div>Nome</div>
                <div>Status</div>
                <div style={{ textAlign: "right" }}>Ações</div>
              </div>

              {itensFiltrados.map((i) => (
                <div key={i.id} style={trow}>
                  <div style={{ minWidth: 220 }}>
                    <div style={{ fontWeight: 900, color: "#0f172a" }}>{i.nome}</div>
                    <div style={idLine}>
                      ID: <span style={mono}>{i.id}</span>
                    </div>
                  </div>

                  <div>
                    <span style={i.ativo ? badgeOk : badgeOff}>{i.ativo ? "ATIVO" : "INATIVO"}</span>
                  </div>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button onClick={() => editar(i)} style={btnGhostSmall} title="Editar">
                      Editar
                    </button>

                    {/* ✅ Check (ativar/inativar) */}
                    <button
                      onClick={() => alternarAtivo(i)}
                      style={i.ativo ? iconBtnOk : iconBtnOff}
                      title={i.ativo ? "Inativar" : "Ativar"}
                    >
                      ✓
                    </button>

                    {/* ✅ X (excluir) */}
                    <button onClick={() => excluir(i)} style={iconBtnDanger} title="Excluir">
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* placeholder cinza claro */}
      <style jsx global>{`
        input::placeholder {
          color: rgba(100, 116, 139, 0.8); /* cinza claro */
        }
      `}</style>

      <style jsx>{`
        @media (max-width: 980px) {
          div[style*="grid-template-columns: 360px"] {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </div>
  );
}

/* ===== layout ===== */
const wrap = { padding: 20, maxWidth: 1200, margin: "0 auto" };

const header = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 14,
};

const crumbs = { fontSize: 13, color: "#475569", display: "flex", gap: 6, alignItems: "center" };
const linkBtn = {
  border: "none",
  background: "transparent",
  padding: 0,
  cursor: "pointer",
  color: "#2563eb",
  fontWeight: 900,
};

const h1 = { margin: "6px 0 0", fontSize: 24, fontWeight: 980, letterSpacing: "-0.02em", color: "#0f172a" };
const sub = { margin: "6px 0 0", color: "#475569", fontSize: 13, maxWidth: 760 };

const kpis = { display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" };
const kpi = {
  border: "1px solid rgba(15, 23, 42, 0.10)",
  background: "rgba(255,255,255,0.9)",
  borderRadius: 14,
  padding: "10px 12px",
  minWidth: 120,
};
const kpiLabel = { fontSize: 12, color: "#64748b", fontWeight: 800 };
const kpiValue = { fontSize: 18, color: "#0f172a", fontWeight: 980, marginTop: 2 };

const grid = { display: "grid", gridTemplateColumns: "360px 1fr", gap: 14, marginTop: 12 };

const card = {
  border: "1px solid rgba(15, 23, 42, 0.12)",
  borderRadius: 16,
  padding: 14,
  background: "white",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.06)",
};

const cardTop = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8 };
const cardTitle = { fontWeight: 980, color: "#0f172a" };

const lbl = { fontSize: 13, color: "#334155", fontWeight: 900 };

const inputLight = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(15, 23, 42, 0.14)",
  outline: "none",
  fontSize: 16,
  background: "#ffffff",
  color: "#0f172a",
  WebkitTextFillColor: "#0f172a",
  caretColor: "#0f172a",
};

const checkRow = { display: "flex", gap: 10, alignItems: "center", color: "#0f172a", fontWeight: 800 };

const hint = {
  marginTop: 2,
  fontSize: 12,
  color: "#64748b",
  background: "rgba(15, 23, 42, 0.04)",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  borderRadius: 12,
  padding: "10px 12px",
};

const tableHeader = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 10 };

const searchWrap = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid rgba(15, 23, 42, 0.14)",
  borderRadius: 999,
  padding: "8px 12px",
  minWidth: 260,
  background: "#fff",
};

const searchIcon = { opacity: 0.6, fontWeight: 900 };

const searchInputLight = {
  border: "none",
  outline: "none",
  width: "100%",
  fontSize: 13,
  background: "transparent",
  color: "#0f172a",
  WebkitTextFillColor: "#0f172a",
};

const table = { display: "grid", gap: 8 };
const thead = {
  display: "grid",
  gridTemplateColumns: "1fr 110px 240px",
  gap: 10,
  padding: "10px 12px",
  color: "#475569",
  fontSize: 12,
  fontWeight: 950,
  borderBottom: "1px solid rgba(15, 23, 42, 0.10)",
};

const trow = {
  display: "grid",
  gridTemplateColumns: "1fr 110px 240px",
  gap: 10,
  padding: "12px",
  border: "1px solid rgba(15, 23, 42, 0.10)",
  borderRadius: 14,
  alignItems: "center",
};

const idLine = { marginTop: 6, fontSize: 12, color: "#64748b" };
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

/* ✅ icon buttons */
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

const btnOk = {
  padding: 12,
  borderRadius: 12,
  border: "1px solid rgba(22, 163, 74, 0.22)",
  background: "rgba(22, 163, 74, 0.08)",
  color: "#14532d",
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

const badgeOk = {
  fontSize: 11,
  fontWeight: 950,
  padding: "4px 10px",
  borderRadius: 999,
  background: "rgba(22, 101, 52, 0.10)",
  color: "#166534",
  border: "1px solid rgba(22, 101, 52, 0.18)",
};

const badgeOff = {
  fontSize: 11,
  fontWeight: 950,
  padding: "4px 10px",
  borderRadius: 999,
  background: "rgba(15, 23, 42, 0.06)",
  color: "#475569",
  border: "1px solid rgba(15, 23, 42, 0.12)",
};
