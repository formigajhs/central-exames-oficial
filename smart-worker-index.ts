import { createClient } from "npm:@supabase/supabase-js@2";

const origensPermitidas = new Set([
  "https://central-exames-oficial.vercel.app",
  "http://127.0.0.1:8765",
  "http://localhost:8765",
]);

const cors = (req: Request) => {
  const origem = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": origensPermitidas.has(origem)
      ? origem
      : "https://central-exames-oficial.vercel.app",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
};

const responder = (req: Request, body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return responder(req, { error: "METODO_NAO_PERMITIDO" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const codigoRecuperacao = Deno.env.get("PASSWORD_RESET_CODE") ?? "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return responder(req, { error: "CONFIGURACAO_INVALIDA" }, 500);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return responder(req, { error: "DADOS_INVALIDOS" }, 400);
  }

  const clienteAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (payload.acao === "recuperar_senha") {
    const email = String(payload.email ?? "").trim().toLowerCase();
    const codigoInformado = String(payload.codigo_recuperacao ?? "");
    const novaSenha = String(payload.nova_senha ?? "");
    if (!codigoRecuperacao || codigoInformado !== codigoRecuperacao || !email || novaSenha.length < 8) {
      return responder(req, { error: "RECUPERACAO_INVALIDA" }, 403);
    }

    const { data, error } = await clienteAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const usuario = data?.users.find((item) => item.email?.toLowerCase() === email);
    if (error || !usuario) return responder(req, { error: "RECUPERACAO_INVALIDA" }, 403);

    const { error: erroAtualizacao } = await clienteAdmin.auth.admin.updateUserById(usuario.id, {
      password: novaSenha,
    });
    if (erroAtualizacao) return responder(req, { error: "FALHA_AO_ATUALIZAR" }, 400);
    return responder(req, { ok: true });
  }

  // Compatibilidade com a redefinição administrativa antiga.
  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return responder(req, { error: "NAO_AUTENTICADO" }, 401);
  const clienteUsuario = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data: dadosUsuario, error: erroUsuario } = await clienteUsuario.auth.getUser(
    authorization.replace("Bearer ", ""),
  );
  if (erroUsuario || !dadosUsuario.user) return responder(req, { error: "NAO_AUTENTICADO" }, 401);

  const { data: perfil } = await clienteAdmin
    .from("perfis_usuarios")
    .select("perfil,ativo")
    .eq("usuario_id", dadosUsuario.user.id)
    .maybeSingle();
  if (!perfil?.ativo || perfil.perfil !== "administrador") {
    return responder(req, { error: "ACESSO_NEGADO" }, 403);
  }

  const usuarioId = String(payload.usuario_id ?? "");
  const novaSenha = String(payload.nova_senha ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(usuarioId) || novaSenha.length < 8 || usuarioId === dadosUsuario.user.id) {
    return responder(req, { error: "DADOS_INVALIDOS" }, 400);
  }
  const { error: erroAtualizacao } = await clienteAdmin.auth.admin.updateUserById(usuarioId, {
    password: novaSenha,
  });
  if (erroAtualizacao) return responder(req, { error: "FALHA_AO_ATUALIZAR" }, 400);
  return responder(req, { ok: true });
});
