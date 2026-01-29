"use client";

import { useEffect, useState } from "react";
import { supabase } from "../src/lib/supabase";

export default function Page() {
  const [campanha, setCampanha] = useState(null);
  const [sabores, setSabores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [enviado, setEnviado] = useState(false);

  const [form, setForm] = useState({
    nome_comprador: "",
    telefone: "",
    nome_desbravador: "",
    quantidade: 1,
  });

  const [saboresSelecionados, setSaboresSelecionados] = useState({});

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    setLoading(true);

    const { data: campanhaData } = await supabase
      .from("campanhas")
      .select("id, nome, valor_pizza")
      .eq("ativa", true)
      .limit(1)
      .single();

    if (!campanhaData) {
      setErro("Nenhuma campanha ativa encontrada");
      setLoading(false);
      return;
    }

    setCampanha(campanhaData);

    const { data: saboresData } = await supabase
      .from("sabores")
      .select("id, nome")
      .eq("campanha_id", campanhaData.id)
      .eq("ativo", true)
      .order("ordem");

    setSabores(saboresData || []);
    setLoading(false);
  }

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  function alterarSabor(id, quantidade) {
    setSaboresSelecionados({
      ...saboresSelecionados,
      [id]: Number(quantidade),
    });
  }

  function totalSabores() {
    return Object.values(saboresSelecionados).reduce(
      (total, q) => total + q,
      0
    );
  }

  async function enviarPedido(e) {
    e.preventDefault();

    if (totalSabores() !== Number(form.quantidade)) {
      alert("A soma dos sabores deve ser igual à quantidade de pizzas.");
      return;
    }

    const valorTotal =
      Number(form.quantidade) * Number(campanha.valor_pizza);

    // 1️⃣ Criar pedido
const { data: pedido, error } = await supabase
  .from("pedidos")
  .insert({
    campanha_id: campanha.id,
    nome_comprador,
    telefone,
    nome_desbravador,
    quantidade,
    valor_total,
    status: "aguardando_pagamento"
  })
  .select()
  .single();


    if (pedidoError) {
      console.error(pedidoError);
      alert("Erro ao criar pedido");
      return;
    }

    // 2️⃣ Criar pedido_sabores
    const inserts = Object.entries(saboresSelecionados).map(
      ([sabor_id, quantidade]) => ({
        pedido_id: pedido.id,
        sabor_id,
        quantidade,
      })
    );

    const { error: saboresError } = await supabase
      .from("pedido_sabores")
      .insert(inserts);

    if (saboresError) {
      console.error(saboresError);
      alert("Erro ao salvar sabores");
      return;
    }

    setEnviado(true);
  }

  if (loading) return <p>Carregando...</p>;
  if (erro) return <p>{erro}</p>;

  if (enviado) {
    return (
      <main style={{ padding: 20 }}>
        <h2>Pedido registrado com sucesso 🍕</h2>
        <p>Pedido pronto para pagamento.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 20 }}>
      <h1>🍕 Desbrava Pizza</h1>
      <h2>{campanha.nome}</h2>

      <p>
        Valor da pizza: R$ {Number(campanha.valor_pizza).toFixed(2)}
      </p>

      <hr />

      <h3>Dados do pedido</h3>

      <form onSubmit={enviarPedido}>
        <input
          name="nome_comprador"
          placeholder="Nome do comprador"
          required
          onChange={handleChange}
        />
        <br /><br />

        <input
          name="telefone"
          placeholder="Telefone"
          required
          onChange={handleChange}
        />
        <br /><br />

        <input
          name="nome_desbravador"
          placeholder="Nome do desbravador"
          required
          onChange={handleChange}
        />
        <br /><br />

        <input
          type="number"
          name="quantidade"
          min="1"
          value={form.quantidade}
          onChange={handleChange}
        />
        <br /><br />

        <h3>Escolha os sabores</h3>

        {sabores.map((sabor) => (
          <div key={sabor.id}>
            {sabor.nome}:
            <input
              type="number"
              min="0"
              value={saboresSelecionados[sabor.id] || 0}
              onChange={(e) =>
                alterarSabor(sabor.id, e.target.value)
              }
            />
          </div>
        ))}

        <p>
          Total selecionado: {totalSabores()} / {form.quantidade}
        </p>

        <br />

        <button type="submit">Confirmar pedido</button>
      </form>
    </main>
  );
}
