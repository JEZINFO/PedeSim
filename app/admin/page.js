"use client";

import { useRouter } from "next/navigation";

const CARDS = [
  {
    titulo: "Começar por aqui",
    itens: [
      { label: "Pedidos", desc: "Acompanhar pedidos e status", href: "/admin/pedidos" },
      { label: "Conciliação PIX", desc: "Marcar pedidos pagos", href: "/admin/pagamentos" },
    ],
  },
  {
    titulo: "Cadastro",
    itens: [
      { label: "Clubes", desc: "Chaves PIX e dados do clube", href: "/admin/clubes" },
      { label: "Campanhas", desc: "Ativar campanha, período e identificador", href: "/admin/campanhas" },
      { label: "Itens (Catálogo)", desc: "Cadastrar itens globais (nome/ativo)", href: "/admin/itens" },
      { label: "Campanhas • Itens", desc: "Vincular itens na campanha (preço/ordem/ativo)", href: "/admin/campanhas-itens" },
    ],
  },
  {
    titulo: "Relatórios",
    itens: [
      { label: "Produção por Item", desc: "Totais para produção/fornecedor", href: "/admin/relatorios/producao" },
      { label: "Histórico PIX", desc: "Auditoria e exportação", href: "/admin/pagamentos/historico" },
    ],
  },
];

export default function AdminHome() {
  const router = useRouter();

  return (
    <div className="homeWrap">
      {CARDS.map((sec) => (
        <section key={sec.titulo} className="sec">
          <div className="secTitle">{sec.titulo}</div>
          <div className="grid">
            {sec.itens.map((it) => (
              <button key={it.href} className="card" onClick={() => router.push(it.href)}>
                <div className="cardTitle">{it.label}</div>
                <div className="cardDesc">{it.desc}</div>
              </button>
            ))}
          </div>
        </section>
      ))}

      <style jsx>{`
        .homeWrap {
          display: grid;
          gap: 18px;
        }
        .sec {
          background: rgba(255, 255, 255, 0.85);
          border: 1px solid rgba(15, 23, 42, 0.08);
          border-radius: 16px;
          padding: 14px;
        }
        .secTitle {
          font-weight: 950;
          margin-bottom: 12px;
          letter-spacing: -0.2px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .card {
          text-align: left;
          border: 1px solid rgba(15, 23, 42, 0.12);
          background: #fff;
          border-radius: 14px;
          padding: 14px;
          cursor: pointer;
          transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
        }
        .card:hover {
          transform: translateY(-2px);
          border-color: rgba(37, 99, 235, 0.28);
          box-shadow: 0 14px 26px rgba(15, 23, 42, 0.12);
        }
        .cardTitle {
          font-weight: 900;
        }
        .cardDesc {
          margin-top: 6px;
          font-size: 12px;
          color: #475569;
        }
        @media (max-width: 980px) {
          .grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
