"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../src/lib/supabase";
import { useRouter } from "next/navigation";

export default function AdminSabores() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [ok, setOk] = useState(null);

  const [campanhas, setCampanhas] = useState([]);
  const [campanhaId, setCampanhaId] = useState("");

  // [{ vinculo_id, item_id, nome, ordem, preco, ativo }]
  const [itens, setItens] = useState([]);

  // edição
  const [editando, setEditando] = useState(null); // { vinculo_id, item_id } | null
  const [form, setForm] = useState({
    nome: "",
    ordem: 0,
    preco: 0,
    ativo: true,
  });

  const campanhasMap = useMemo(() => {
    const m = new Map();
    campanhas.forEach((c) => m.set(c.id, c.nome));
    return m;
  }, [campanhas]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push("/login");
        return;
      }
      await carregarCampanhas();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function carregarCampanhas() {
    setLoading(true);
    setErro(null);
    setOk(null);

    const { data, error } = await supabase
      .from("campanhas")
      .select("id, nome, ativa, data_inicio")
      .order("ativa", { ascending: false })
      .order("data_inicio", { ascending: false });

    if (error) {
      console.error(error);
      setErro("Erro ao carregar campanhas.");
      setLoading(false);
      return;
    }

    setCampanhas(data || []);

    const ativa = data?.find((c) => c.ativa);
    const chosen = ativa?.id || data?.[0]?.id || "";
    setCampanhaId(chosen);

    if (chosen) await carregarItens(chosen);
    setLoading(false);
  }

  async function carregarItens(cId) {
    setErro(null);

    const { data, error } = await supabase
      .from("itens_campanha")
      .select(
        `
        id,
        item_id,
        ordem,
        preco,
        ativo,
        itens ( id, nome )
      `
      )
      .eq("campanha_id", cId)
      .order("ordem", { ascending: true });

    if (error) {
      console.error(error);
      setErro("Erro ao carregar itens da campanha.");
      return;
    }

    const normalizado =
      (data || []).map((r) => {
        const item = Array.isArray(r.itens) ? r.itens[0] : r.itens;
        return {
          vinculo_id: r.id,
          item_id: r.item_id,
          nome: item?.nome || "Item",
          ordem: r.ordem ?? 0,
          preco: Number(r.preco ?? 0),
          ativo: !!r.ativo,
        };
      });

    setItens(normalizado);
  }

  async function trocarCampanha(id) {
    setCampanhaId(id);
    novo();
    if (id) await carregarItens(id);
  }

  function novo() {
    setErro(null);
    setOk(null);
    setEditando(null);
    setForm({ nome: "", ordem: 0, preco: 0, ativo: true });
  }

  function editar(i) {
    setErro(null);
    setOk(null);
    setEditando({ vinculo_id: i.vinculo_id, item_id: i.item_id });
    setForm({
      nome: i.nome,
      ordem: i.ordem,
      preco: i.preco,
      ativo: i.ativo,
    });
  }

  function onChange(e) {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({
      ...p,
      [name]:
        type === "checkbox"
          ? checked
          : name === "ordem" || name === "preco"
          ? Number(value)
          : value,
    }));
  }

  async function salvar(e) {
    e.preventDefault();
    setErro(null);
    setOk(null);

    if (!campanhaId) {
      setErro("Selecione uma campanha.");
      return;
    }

    const nome = form.nome.trim();
    if (!nome) {
      setErro("Informe o nome do item.");
      return;
    }

    // CRIAR
    if (!editando) {
      const { data: itemCriado, error: errItem } = await supabase
        .from("itens")
        .insert({ nome })
        .select("id")
        .single();

      if (errItem) {
        console.error(errItem);
        setErro("Erro ao criar item.");
        return;
      }

      const { error: errVinc } = await supabase.from("itens_campanha").insert({
        campanha_id: campanhaId,
        item_id: itemCriado.id,
        ordem: form.ordem,
        preco: form.preco,
        ativo: form.ativo,
      });

      if (errVinc) {
        console.error(errVinc);
        setErro("Erro ao vincular item à campanha.");
        return;
      }

      setOk("Item criado e vinculado ✅");
      novo();
      await carregarItens(campanhaId);
      return;
    }

    // EDITAR
    await supabase.from("itens").update({ nome }).eq("id", editando.item_id);

    const { error: errUpd } = await supabase
      .from("itens_campanha")
      .update({
        ordem: form.ordem,
        preco: form.preco,
        ativo: form.ativo,
      })
      .eq("id", editando.vinculo_id);

    if (errUpd) {
      console.error(errUpd);
      setErro("Erro ao atualizar item.");
      return;
    }

    setOk("Item atualizado ✅");
    novo();
    await carregarItens(campanhaId);
  }

  async function desativar(i) {
    if (!confirm(`Desativar "${i.nome}" nesta campanha?`)) return;

    const { error } = await supabase
      .from("itens_campanha")
      .update({ ativo: false })
      .eq("id", i.vinculo_id);

    if (error) {
      console.error(error);
      setErro("Erro ao desativar item.");
      return;
    }

    setOk("Item desativado ✅");
    await carregarItens(campanhaId);
  }

  if (loading) {
    return <p style={{ padding: 20 }}>Carregando…</p>;
  }

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto" }}>
      <h2>Admin • Itens / Sabores</h2>

      {erro && <div style={alertErr}>{erro}</div>}
      {ok && <div style={alertOk}>{ok}</div>}

      <div style={grid}>
        <div style={card}>
          <div style={cardTitle}>Campanha</div>
          <select value={campanhaId} onChange={(e) => trocarCampanha(e.target.value)} style={select}>
            <option value="">Selecione…</option>
            {campanhas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome} {c.ativa ? "• ativa" : ""}
              </option>
            ))}
          </select>

          <div style={{ marginTop: 16 }}>
            <div style={cardTitle}>{editando ? "Editar item" : "Novo item"}</div>

            <form onSubmit={salvar} style={{ display: "grid", gap: 10 }}>
              <label style={lbl}>
                Nome
                <input name="nome" value={form.nome} onChange={onChange} style={input} />
              </label>

              <label style={lbl}>
                Ordem
                <input name="ordem" type="number" value={form.ordem} onChange={onChange} style={input} />
              </label>

              <label style={lbl}>
                Preço (R$)
                <input name="preco" type="number" step="0.01" value={form.preco} onChange={onChange} style={input} />
              </label>

              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="checkbox" name="ativo" checked={form.ativo} onChange={onChange} />
                Ativo na campanha
              </label>

              <button type="submit" style={btn}>
                {editando ? "Salvar alterações" : "Criar e vincular"}
              </button>
            </form>
          </div>
        </div>

        <div style={card}>
          <div style={cardTitle}>Itens da campanha</div>

          {itens.map((i) => (
            <div key={i.vinculo_id} style={row}>
              <div>
                <strong>{i.nome}</strong> {!i.ativo && "• inativo"}
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  Ordem: {i.ordem} • Preço: R$ {i.preco.toFixed(2)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => editar(i)} style={btnSec}>
                  Editar
                </button>
                {i.ativo && (
                  <button onClick={() => desativar(i)} style={btnDanger}>
                    Desativar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ===== estilos ===== */
const grid = { display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 14 };
const card = { border: "1px solid #ddd", borderRadius: 12, padding: 14, background: "#fff" };
const cardTitle = { fontWeight: 800, marginBottom: 10 };
const row = { border: "1px solid #eee", borderRadius: 10, padding: 10, display: "flex", justifyContent: "space-between" };
const lbl = { display: "grid", gap: 6 };
const input = { padding: 10, borderRadius: 8, border: "1px solid #ccc" };
const select = { width: "100%", padding: 10, borderRadius: 8 };
const btn = { padding: 10, background: "#000", color: "#fff", borderRadius: 8 };
const btnSec = { padding: 10, background: "#fff", borderRadius: 8, border: "1px solid #ccc" };
const btnDanger = { padding: 10, background: "#fff", borderRadius: 8, border: "1px solid #ccc", color: "#b91c1c" };
const alertErr = { background: "#fee2e2", padding: 10, borderRadius: 8 };
const alertOk = { background: "#dcfce7", padding: 10, borderRadius: 8 };
