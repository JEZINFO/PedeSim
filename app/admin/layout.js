"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "../../src/lib/supabase";

const MENU = [
  {
    grupo: "Cadastro",
    itens: [
      { label: "Clubes", href: "/admin/clubes" },
      { label: "Campanhas", href: "/admin/campanhas" },
      { label: "Catálogo", href: "/admin/itens" },
      { label: "Campanhas • Itens", href: "/admin/campanhas-itens" },
    ],
  },
  {
    grupo: "Consulta",
    itens: [
      { label: "Pedidos", href: "/admin/pedidos" },
      { label: "Conciliação PIX", href: "/admin/pagamentos" },
      { label: "Histórico PIX", href: "/admin/pagamentos/historico" },
    ],
  },
  {
    grupo: "Relatórios",
    itens: [{ label: "Produção por Item", href: "/admin/relatorios/producao" }],
  },
  {
    grupo: "Atalhos",
    itens: [{ label: "Página Pública", href: "/" }],
  },
];


function findActive(pathname) {
  // pega o match mais específico (href mais longo) para rotas aninhadas
  let best = null;
  for (const g of MENU) {
    for (const it of g.itens) {
      if (pathname === it.href || pathname.startsWith(it.href + "/")) {
        if (!best || it.href.length > best.item.href.length) {
          best = { group: g, item: it };
        }
      }
    }
  }
  // /admin raiz
  if (!best && pathname === "/admin") {
    return { group: { grupo: "Início" }, item: { label: "Painel", href: "/admin" } };
  }
  return best;
}

function buildBreadcrumb(pathname) {
  // Remove query/hash (por segurança) e explode
  const clean = pathname.split("?")[0].split("#")[0];
  const parts = clean.split("/").filter(Boolean); // ex: ["admin","pagamentos","historico"]

  // Sempre começa com Admin
  const crumbs = [{ label: "Admin", href: "/admin" }];

  // Se for /admin apenas
  if (parts.length <= 1) return crumbs;

  // Monta links progressivos
  let acc = "";
  for (let i = 1; i < parts.length; i++) {
    acc += "/" + parts[i];
    const href = "/admin" + acc;

    const label =
      parts[i]
        .replaceAll("-", " ")
        .replace(/\b\w/g, (m) => m.toUpperCase());

    crumbs.push({ label, href });
  }
  return crumbs;
}

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [me, setMe] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const active = useMemo(() => findActive(pathname), [pathname]);
  const crumbs = useMemo(() => buildBreadcrumb(pathname), [pathname]);

  useEffect(() => {
    (async () => {
      setErro(null);
      setLoading(true);

      const { data } = await supabase.auth.getSession();
      if (!data?.session) {
        router.push("/login");
        return;
      }

      const userId = data.session.user.id;
      const { data: u, error } = await supabase
        .from("usuarios")
        .select("nome, email, perfil")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (error || !u || u.perfil !== "admin") {
        setErro("Acesso não autorizado (admin apenas). Verifique tabela usuarios.");
        setLoading(false);
        return;
      }

      setMe(u);
      setLoading(false);
    })();
  }, [router]);

  async function sair() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading) {
    return (
      <div className="adminBg">
        <div className="adminCard">
          <div className="muted">Carregando Admin…</div>
        </div>
        <Style />
      </div>
    );
  }

  if (erro) {
    return (
      <div className="adminBg">
        <div className="adminCard">
          <h1 style={{ margin: 0 }}>Admin</h1>
          <div className="alert">{erro}</div>
          <button className="btn" onClick={sair}>
            Sair
          </button>
        </div>
        <Style />
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className={`side ${collapsed ? "collapsed" : ""}`}>
        <div className="brand" onClick={() => router.push("/admin")} role="button">
          <div className="logo">🍕</div>
          {!collapsed && (
            <div className="brandText">
              <div className="brandTitle">PedeSim</div>
              <div className="brandSub">Painel Admin</div>
            </div>
          )}
        </div>

        <button className="collapseBtn" onClick={() => setCollapsed((v) => !v)}>
          {collapsed ? "›" : "‹"}
        </button>

        <nav className="nav">
          {MENU.map((g) => (
            <div key={g.grupo} className="navGroup">
              {!collapsed && <div className="navTitle">{g.grupo}</div>}
              {g.itens.map((it) => {
                const isActive =
                  pathname === it.href || pathname.startsWith(it.href + "/");
                return (
                  <button
                    key={it.href}
                    className={`navItem ${isActive ? "active" : ""}`}
                    onClick={() => router.push(it.href)}
                    title={it.label}
                  >
                    <span className="dot" />
                    {!collapsed && <span>{it.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="user">
          {!collapsed && (
            <div className="userMeta">
              <div className="userName">{me?.nome || me?.email}</div>
              <div className="userRole">admin</div>
            </div>
          )}
          <button className="btnLight" onClick={sair} title="Sair">
            {!collapsed ? "Sair" : "↩"}
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="crumbs">
            {crumbs.map((c, idx) => (
              <span key={c.href} className="crumb">
                <a
                  onClick={(e) => {
                    e.preventDefault();
                    router.push(c.href);
                  }}
                  href={c.href}
                >
                  {c.label}
                </a>
                {idx < crumbs.length - 1 && <span className="sep">›</span>}
              </span>
            ))}
          </div>

          <div className="context">
            <div className="ctxTitle">
              {active?.item?.label || "Admin"}
            </div>
            <div className="ctxSub muted">
              {active?.group?.grupo ? `Seção: ${active.group.grupo}` : ""}
            </div>
          </div>
        </header>

        <main className="page">{children}</main>
      </div>

      <Style />
    </div>
  );
}

function Style() {
  return (
    <style jsx global>{`
      :root {
        --bg: #0b1220;
        --panel: rgba(255, 255, 255, 0.92);
        --text: #0f172a;
        --muted: #475569;
        --line: rgba(15, 23, 42, 0.12);
        --blue: #2563eb;
        --blue2: #1d4ed8;
        --side: #020617;
      }
      * { box-sizing: border-box; }
      body { margin: 0; color: var(--text); }

      /* estados de loading/erro */
      .adminBg{
        min-height:100vh;
        display:grid;
        place-items:center;
        padding:24px;
        background: radial-gradient(1200px 600px at 20% 10%, rgba(37,99,235,.45), transparent 60%),
                    radial-gradient(1000px 500px at 90% 30%, rgba(245,158,11,.35), transparent 60%),
                    linear-gradient(180deg, #0b1220, #0f172a 60%, #0b1220);
      }
      .adminCard{
        width:100%;
        max-width:720px;
        background: var(--panel);
        border: 1px solid rgba(255,255,255,.35);
        border-radius:18px;
        box-shadow: 0 25px 60px rgba(0,0,0,.35);
        padding:18px;
        backdrop-filter: blur(10px);
      }
      .alert{
        border-radius: 12px;
        padding: 10px 12px;
        border: 1px solid rgba(245, 158, 11, 0.35);
        background: rgba(245, 158, 11, 0.16);
        margin: 12px 0;
        font-size: 13px;
      }
      .btn{
        background: linear-gradient(180deg, var(--blue), var(--blue2));
        color: white;
        border: none;
        padding: 12px 14px;
        border-radius: 12px;
        font-weight: 800;
        cursor: pointer;
      }
      .btnLight{
        background: rgba(255,255,255,.08);
        color: #fff;
        border: 1px solid rgba(255,255,255,.12);
        padding: 10px 12px;
        border-radius: 12px;
        font-weight: 800;
        cursor: pointer;
      }
      .muted{ color: var(--muted); font-size: 13px; }

      /* shell */
      .shell{
        min-height:100vh;
        display:flex;
        background: #f8fafc;
      }
      .side{
        width: 280px;
        background: var(--side);
        color: #fff;
        padding: 14px;
        display:flex;
        flex-direction:column;
        gap: 12px;
        position: sticky;
        top: 0;
        height: 100vh;
      }
      .side.collapsed{ width: 82px; }

      .brand{
        display:flex;
        align-items:center;
        gap: 10px;
        padding: 10px;
        border-radius: 14px;
        cursor:pointer;
        user-select:none;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.08);
      }
      .logo{
        width: 36px;
        height: 36px;
        display:grid;
        place-items:center;
        border-radius: 12px;
        background: rgba(37,99,235,.18);
        border: 1px solid rgba(37,99,235,.35);
      }
      .brandTitle{ font-weight: 950; letter-spacing: -.2px; }
      .brandSub{ font-size: 12px; opacity: .7; margin-top: 2px; }

      .collapseBtn{
        align-self:flex-end;
        background: rgba(255,255,255,.04);
        color: #fff;
        border: 1px solid rgba(255,255,255,.10);
        border-radius: 12px;
        padding: 8px 10px;
        cursor:pointer;
        font-weight: 900;
      }

      .nav{ display:flex; flex-direction:column; gap: 10px; overflow:auto; padding-right: 2px; }
      .navGroup{ display:flex; flex-direction:column; gap: 6px; }
      .navTitle{ font-size: 11px; opacity: .65; margin: 10px 8px 2px; text-transform: uppercase; letter-spacing: .08em; }
      .navItem{
        display:flex;
        align-items:center;
        gap: 10px;
        text-align:left;
        background: transparent;
        border: 1px solid transparent;
        color: #fff;
        padding: 10px 10px;
        border-radius: 12px;
        cursor:pointer;
        font-weight: 800;
      }
      .navItem:hover{
        background: rgba(255,255,255,.06);
        border-color: rgba(255,255,255,.08);
      }
      .navItem.active{
        background: rgba(37,99,235,.22);
        border-color: rgba(37,99,235,.35);
      }
      .dot{
        width: 10px; height: 10px;
        border-radius: 999px;
        background: rgba(255,255,255,.35);
      }
      .navItem.active .dot{
        background: rgba(37,99,235,1);
      }

      .user{
        margin-top:auto;
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap: 10px;
        padding: 10px;
        border-radius: 14px;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.08);
      }
      .userName{ font-weight: 900; font-size: 13px; }
      .userRole{ font-size: 12px; opacity: .7; margin-top: 2px; }

      .main{ flex: 1; display:flex; flex-direction:column; min-width: 0; }
      .topbar{
        background: #fff;
        border-bottom: 1px solid rgba(15,23,42,.08);
        padding: 14px 18px;
      }
      .crumbs{
        display:flex;
        flex-wrap:wrap;
        gap: 6px;
        font-size: 12px;
        color: #64748b;
      }
      .crumb a{
        color: #334155;
        text-decoration: none;
        font-weight: 800;
        cursor:pointer;
      }
      .sep{ margin: 0 6px; opacity: .6; }
      .context{ margin-top: 10px; }
      .ctxTitle{ font-size: 18px; font-weight: 950; letter-spacing: -.2px; }
      .ctxSub{ margin-top: 2px; }

      .page{
        padding: 18px;
        min-width: 0;
      }

      @media (max-width: 860px){
        .side{ position: relative; height: auto; width: 100%; }
        .side.collapsed{ width: 100%; }
        .shell{ flex-direction: column; }
        .user{ justify-content:flex-start; }
      }
    `}</style>
  );
}
