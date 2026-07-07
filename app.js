const SUPABASE_URL = "https://kgznlatjntdwnzsrcmqp.supabase.co";
const SUPABASE_KEY = "sb_publishable__ODBzBpNarobgI45tj5cGQ_A7AM4Qq3";
const lerSessao = () => { try { return JSON.parse(globalThis.localStorage?.getItem("central_operacional_sessao") || "null"); } catch { return null; } };
const guardarSessao = valor => { try { globalThis.localStorage?.setItem("central_operacional_sessao", JSON.stringify(valor)); } catch (_) {} };
const apagarSessao = () => { try { globalThis.localStorage?.removeItem("central_operacional_sessao"); } catch (_) {} };
let sessao = lerSessao();
const apiHeaders = () => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${sessao?.access_token || SUPABASE_KEY}` });

let exames = [];
let convenios = [];
let convenioSelecionado = null;
let itensOrcamento = [];
let favoritosIds = new Set();
let somenteFavoritos = false;
let perfilAtual = null;
let usuarios = [];
let acessosCredenciais = [];
const credenciaisConvenios = new Map();
let avisosInternos = [];
let avisoAtual = 0;
let temporizadorAvisos = null;
let avisosUsamBanco = false;
const AVISOS_STORAGE_KEY = "central_operacional_avisos_preview";

const perfilAtivo = () => Boolean(perfilAtual?.ativo);
const podeOperar = () => perfilAtivo() && ["operador", "administrador"].includes(perfilAtual?.perfil);
const podeConsultarConvenios = () => perfilAtivo() && ["consulta", "operador", "administrador"].includes(perfilAtual?.perfil);
const ehAdministrador = () => perfilAtivo() && perfilAtual?.perfil === "administrador";

const $ = (id) => document.getElementById(id);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const normalizar = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const normalizarUrl = (value = "") => {
  const url = String(value).trim();
  if (!url) return "";
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
};

async function buscarTabela(tabela, select = "*") {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?select=${encodeURIComponent(select)}`, { headers: apiHeaders() });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function carregarPerfil() {
  if (!sessao?.user?.id) throw new Error("Sessão inválida. Entre novamente.");
  const url = `${SUPABASE_URL}/rest/v1/perfis_usuarios?select=usuario_id,nome,perfil,ativo&usuario_id=eq.${encodeURIComponent(sessao.user.id)}&limit=1`;
  const response = await fetch(url, { headers: apiHeaders() });
  if (!response.ok) throw new Error("Não foi possível verificar seu perfil de acesso.");
  const registros = await response.json();
  perfilAtual = registros[0] || null;
  if (!perfilAtual) throw new Error("Seu usuário ainda não possui um perfil de acesso.");
  if (!perfilAtual.ativo) throw new Error("Seu cadastro aguarda liberação do administrador.");
  return perfilAtual;
}

function aplicarPerfilNaTela() {
  const operacao = podeOperar();
  document.querySelectorAll(".operation-only").forEach(elemento => { elemento.hidden = !operacao; });
  document.querySelectorAll(".admin-only").forEach(elemento => { elemento.hidden = !ehAdministrador(); });
  $("tabConvenios").hidden = !podeConsultarConvenios();
  $("perfilLogado").hidden = false;
  $("perfilLogado").textContent = perfilAtual.perfil === "administrador" ? "Administrador" : perfilAtual.perfil === "operador" ? "Operador" : "Consulta";
  renderAvisos();
}

function carregarAvisosLocais() {
  try {
    const salvos = JSON.parse(globalThis.localStorage?.getItem(AVISOS_STORAGE_KEY) || "null");
    if (Array.isArray(salvos)) {
      avisosInternos = salvos;
      return;
    }
  } catch (_) {}
  avisosInternos = [];
}

function salvarAvisosLocais() {
  try { globalThis.localStorage?.setItem(AVISOS_STORAGE_KEY, JSON.stringify(avisosInternos)); } catch (_) {}
}

async function carregarAvisosDoBanco() {
  const select = "id,titulo,mensagem,tipo,ativo,prioridade,criado_em,atualizado_em";
  const response = await fetch(`${SUPABASE_URL}/rest/v1/avisos_internos?select=${encodeURIComponent(select)}&order=prioridade.desc,criado_em.desc`, { headers: apiHeaders() });
  if (!response.ok) throw new Error(await response.text());
  avisosInternos = await response.json();
  avisosUsamBanco = true;
  avisoAtual = 0;
  renderAvisos();
}

async function salvarAvisoOficial(aviso) {
  if (!avisosUsamBanco) {
    const existe = avisosInternos.some(item => String(item.id) === String(aviso.id));
    avisosInternos = existe ? avisosInternos.map(item => String(item.id) === String(aviso.id) ? aviso : item) : [aviso, ...avisosInternos];
    salvarAvisosLocais();
    return aviso;
  }
  const editando = avisosInternos.some(item => String(item.id) === String(aviso.id));
  const corpo = { titulo: aviso.titulo, mensagem: aviso.mensagem, tipo: aviso.tipo, ativo: aviso.ativo, prioridade: aviso.prioridade || 0 };
  const url = editando
    ? `${SUPABASE_URL}/rest/v1/avisos_internos?id=eq.${encodeURIComponent(aviso.id)}`
    : `${SUPABASE_URL}/rest/v1/avisos_internos`;
  const response = await fetch(url, {
    method: editando ? "PATCH" : "POST",
    headers: {...apiHeaders(), "Content-Type":"application/json", "Prefer":"return=representation"},
    body: JSON.stringify(corpo)
  });
  if (!response.ok) throw new Error(await response.text());
  return (await response.json())[0];
}

async function excluirAvisoOficial(id) {
  if (!avisosUsamBanco) {
    avisosInternos = avisosInternos.filter(item => String(item.id) !== String(id));
    salvarAvisosLocais();
    return;
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/avisos_internos?id=eq.${encodeURIComponent(id)}`, { method:"DELETE", headers:apiHeaders() });
  if (!response.ok) throw new Error(await response.text());
}

function avisosAtivos() {
  return avisosInternos.filter(aviso => aviso.ativo);
}

function renderAvisos() {
  const container = $("centralAvisos");
  if (!container) return;
  const ativos = avisosAtivos();
  container.hidden = ativos.length === 0 && !ehAdministrador();
  if (ativos.length === 0) {
    $("faixaAvisos").innerHTML = `<article class="notice-item info"><strong>Nenhum aviso ativo</strong><p>Use Gerenciar para cadastrar um comunicado interno.</p></article>`;
  } else {
    if (avisoAtual >= ativos.length) avisoAtual = 0;
    const aviso = ativos[avisoAtual];
    $("faixaAvisos").innerHTML = `<button class="notice-item ${escapeHtml(aviso.tipo || "info")}" type="button" data-open-aviso="${escapeHtml(aviso.id)}"><strong>${escapeHtml(aviso.titulo)}</strong><p>${escapeHtml(aviso.mensagem)}</p><span>Ler tudo · ${avisoAtual + 1}/${ativos.length}</span></button>`;
    document.querySelectorAll("[data-open-aviso]").forEach(button => button.addEventListener("click", () => abrirDetalheAviso(button.dataset.openAviso)));
  }
  $("avisoAnterior").disabled = ativos.length <= 1;
  $("avisoProximo").disabled = ativos.length <= 1;
  renderAvisosAdmin();
  clearInterval(temporizadorAvisos);
  if (ativos.length > 1) {
    temporizadorAvisos = setInterval(() => mudarAviso(1), 6500);
  }
}

function mudarAviso(direcao) {
  const ativos = avisosAtivos();
  if (ativos.length <= 1) return;
  avisoAtual = (avisoAtual + direcao + ativos.length) % ativos.length;
  renderAvisos();
}

function abrirGerenciadorAvisos() {
  if (!ehAdministrador()) return;
  $("avisosBackdrop").hidden = false;
  $("avisosModal").hidden = false;
  limparFormularioAviso();
  renderAvisosAdmin();
}

function fecharGerenciadorAvisos() {
  $("avisosBackdrop").hidden = true;
  $("avisosModal").hidden = true;
}

function abrirDetalheAviso(id) {
  const aviso = avisosInternos.find(item => String(item.id) === String(id));
  if (!aviso) return;
  $("avisoDetalheTipo").className = `notice-pill ${escapeHtml(aviso.tipo || "info")}`;
  $("avisoDetalheTipo").textContent = aviso.tipo === "urgente" ? "URGENTE" : aviso.tipo === "alerta" ? "ATENÇÃO" : aviso.tipo === "sucesso" ? "RESOLVIDO" : "INFORMATIVO";
  $("avisoDetalheTitulo").textContent = aviso.titulo || "Aviso";
  $("avisoDetalheMensagem").textContent = aviso.mensagem || "";
  $("avisoDetalheBackdrop").hidden = false;
  $("avisoDetalheModal").hidden = false;
}

function fecharDetalheAviso() {
  $("avisoDetalheBackdrop").hidden = true;
  $("avisoDetalheModal").hidden = true;
}

function limparFormularioAviso() {
  $("avisoId").value = "";
  $("avisoTitulo").value = "";
  $("avisoMensagem").value = "";
  $("avisoTipo").value = "info";
  $("avisoAtivo").value = "true";
  $("salvarAviso").textContent = "Salvar aviso";
}

function editarAviso(id) {
  const aviso = avisosInternos.find(item => String(item.id) === String(id));
  if (!aviso) return;
  $("avisoId").value = aviso.id;
  $("avisoTitulo").value = aviso.titulo || "";
  $("avisoMensagem").value = aviso.mensagem || "";
  $("avisoTipo").value = aviso.tipo || "info";
  $("avisoAtivo").value = aviso.ativo ? "true" : "false";
  $("salvarAviso").textContent = "Atualizar aviso";
  $("avisoTitulo").focus();
}

async function excluirAviso(id) {
  const aviso = avisosInternos.find(item => String(item.id) === String(id));
  if (!aviso || !confirm(`Excluir o aviso "${aviso.titulo}"?`)) return;
  try {
    await excluirAvisoOficial(id);
    avisosInternos = avisosInternos.filter(item => String(item.id) !== String(id));
  } catch (error) {
    console.error(error);
    mostrarToast("NÃ£o foi possÃ­vel excluir o aviso");
    return;
  }
  avisoAtual = 0;
  renderAvisos();
  mostrarToast("Aviso excluído");
}

function renderAvisosAdmin() {
  const lista = $("listaAvisosAdmin");
  if (!lista) return;
  lista.innerHTML = avisosInternos.length ? avisosInternos.map(aviso => `<article class="notice-admin-row ${aviso.ativo ? "" : "inactive-record"}">
    <div><span class="notice-pill ${escapeHtml(aviso.tipo || "info")}">${escapeHtml(aviso.tipo || "info")}</span><strong>${escapeHtml(aviso.titulo)}</strong><p>${escapeHtml(aviso.mensagem)}</p></div>
    <div class="notice-admin-actions"><button class="action" type="button" data-edit-aviso="${escapeHtml(aviso.id)}">Editar</button><button class="action danger-action" type="button" data-delete-aviso="${escapeHtml(aviso.id)}">Excluir</button></div>
  </article>`).join("") : '<div class="empty">Nenhum aviso cadastrado ainda.</div>';
  document.querySelectorAll("[data-edit-aviso]").forEach(button => button.addEventListener("click", () => editarAviso(button.dataset.editAviso)));
  document.querySelectorAll("[data-delete-aviso]").forEach(button => button.addEventListener("click", () => excluirAviso(button.dataset.deleteAviso)));
}

async function carregarUsuarios() {
  if (!ehAdministrador()) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/perfis_usuarios?select=usuario_id,nome,email,perfil,ativo,criado_em&order=criado_em.asc`, { headers: apiHeaders() });
  if (!response.ok) {
    $("listaUsuarios").innerHTML = '<div class="empty">Execute a migração do painel de usuários no Supabase.</div>';
    $("totalUsuarios").textContent = "Configuração pendente";
    return;
  }
  usuarios = await response.json();
  renderUsuarios();
}

function renderUsuarios() {
  $("totalUsuarios").textContent = `${usuarios.length} usuário(s)`;
  $("listaUsuarios").innerHTML = usuarios.map(usuario => {
    const proprio = String(usuario.usuario_id) === String(sessao?.user?.id);
    const status = usuario.ativo ? "Ativo" : "Aguardando liberação";
    return `<article class="user-row" data-user-row="${escapeHtml(usuario.usuario_id)}">
      <div class="user-avatar">${escapeHtml((usuario.nome || usuario.email || "U").charAt(0).toUpperCase())}</div>
      <div class="user-identity"><strong>${escapeHtml(usuario.nome || "Sem nome")}${proprio ? ' <span class="you-label">VOCÊ</span>' : ""}</strong><small>${escapeHtml(usuario.email || "E-mail não informado")}</small></div>
      <label class="user-field"><span>PERFIL</span><select data-user-role ${proprio ? "disabled" : ""}><option value="consulta" ${usuario.perfil === "consulta" ? "selected" : ""}>Consulta</option><option value="operador" ${usuario.perfil === "operador" ? "selected" : ""}>Operador</option><option value="administrador" ${usuario.perfil === "administrador" ? "selected" : ""}>Administrador</option></select></label>
      <label class="access-switch"><input type="checkbox" data-user-active ${usuario.ativo ? "checked" : ""} ${proprio ? "disabled" : ""}><span></span><b>${status}</b></label>
      <div class="user-actions"><button class="primary save-user" data-save-user="${escapeHtml(usuario.usuario_id)}" ${proprio ? "disabled" : ""}>Salvar acesso</button></div>
    </article>`;
  }).join("") || '<div class="empty">Nenhum usuário cadastrado.</div>';
  document.querySelectorAll("[data-save-user]").forEach(button => button.addEventListener("click", () => salvarUsuario(button.dataset.saveUser)));
}

async function salvarUsuario(usuarioId) {
  if (!ehAdministrador() || String(usuarioId) === String(sessao?.user?.id)) return;
  const linha = document.querySelector(`[data-user-row="${CSS.escape(String(usuarioId))}"]`);
  const perfil = linha.querySelector("[data-user-role]").value;
  const ativo = linha.querySelector("[data-user-active]").checked;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/perfis_usuarios?usuario_id=eq.${encodeURIComponent(usuarioId)}`, {method:"PATCH",headers:{...apiHeaders(),"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({perfil,ativo,atualizado_em:new Date().toISOString()})});
  if (!response.ok) { mostrarToast("Não foi possível atualizar o usuário"); return; }
  const atualizado = (await response.json())[0];
  usuarios = usuarios.map(usuario => String(usuario.usuario_id) === String(usuarioId) ? {...usuario,...atualizado} : usuario);
  renderUsuarios();
  mostrarToast(ativo ? "Usuário liberado" : "Usuário bloqueado");
}

async function carregarAuditoria() {
  if (!ehAdministrador()) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/acessos_credenciais_convenios?select=id,convenio_id,convenio_nome,usuario_email,acao,acessado_em&order=acessado_em.desc&limit=100`, {headers:apiHeaders()});
  if (!response.ok) { $("listaAuditoria").innerHTML = '<div class="empty">Não foi possível carregar a auditoria.</div>'; return; }
  acessosCredenciais = await response.json();
  const nomes = new Map(convenios.map(item => [String(item.id), item.nome]));
  const rotulos = {consultar:"Visualizou",atualizar:"Atualizou",criar:"Cadastrou",desativar:"Desativou",reativar:"Reativou",excluir:"Excluiu"};
  $("listaAuditoria").innerHTML = acessosCredenciais.length ? acessosCredenciais.map(item => `<article class="audit-row"><span class="audit-action ${escapeHtml(item.acao)}">${escapeHtml(rotulos[item.acao] || item.acao)}</span><div><strong>${escapeHtml(nomes.get(String(item.convenio_id)) || item.convenio_nome || "Convênio removido")}</strong><small>${escapeHtml(item.usuario_email || "Usuário não identificado")}</small></div><time>${new Date(item.acessado_em).toLocaleString("pt-BR")}</time></article>`).join("") : '<div class="empty">Nenhum acesso registrado ainda.</div>';
}

async function carregarFavoritos() {
  if (!sessao?.user?.id) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/favoritos_exames?select=exame_id&usuario_id=eq.${encodeURIComponent(sessao.user.id)}`, {headers:apiHeaders()});
  if (!response.ok) return;
  favoritosIds = new Set((await response.json()).map(item => String(item.exame_id)));
}

async function carregarExames() {
  const camposNovos = "id,tipo,sigla,nome,codigo,autorizacao,anexo,termos,tempo_jejum,link_termo,observacao,valor_cartao_biofast,valor_sem_cartao,ativo";
  try {
    return await buscarTabela("exames", camposNovos);
  } catch (error) {
    console.info("Colunas de valor ainda não criadas; usando compatibilidade antiga.");
    return buscarTabela("exames", "id,tipo,sigla,nome,codigo,autorizacao,anexo,termos,tempo_jejum,link_termo,observacao");
  }
}

function obterValores(exame) {
  const formatarBanco = valor => valor === null || valor === undefined || valor === "" ? "" : Number(valor).toLocaleString("pt-BR", {minimumFractionDigits:2,maximumFractionDigits:2});
  const valorBancoBiofast = formatarBanco(exame.valor_cartao_biofast);
  const valorBancoSemCartao = formatarBanco(exame.valor_sem_cartao);
  const texto = String(exame.observacao || "").replace(/ÃƒO/g, "ÃO").replace(/Ãƒ/g, "Ã");
  const biofast = texto.match(/COM CART[AÃ]O BIO(?:FAST)?\s*(?:R\$)?\s*([\d.,]+)/i)?.[1] || "";
  const semCartao = texto.match(/SEM CART[AÃ]O BIO(?:FAST)?\s*(?:R\$)?\s*([\d.,]+)/i)?.[1] || (exame.tipo === "Particular" ? exame.codigo : "");
  return { biofast: valorBancoBiofast || biofast, semCartao: valorBancoSemCartao || semCartao };
}

function statusClass(value) {
  const v = normalizar(value);
  if (v.includes("com anexo")) return "red";
  if (v.includes("precisa autorizar")) return "orange";
  return "green";
}

function renderExames() {
  const termo = normalizar($("buscaExame").value);
  const autorizacao = $("filtroAutorizacao").value;
  const tipo = $("filtroTipo").value;
  const filtrados = exames.filter(e => {
    const texto = normalizar(`${e.sigla} ${e.nome} ${e.codigo}`);
    return texto.includes(termo) && (!autorizacao || e.autorizacao === autorizacao) && (!tipo || (e.tipo || "Normal") === tipo) && (!somenteFavoritos || favoritosIds.has(String(e.id)));
  });
  $("statTotal").textContent = exames.length;
  $("statResultados").textContent = filtrados.length;
  $("statJejum").textContent = exames.filter(e => e.tempo_jejum && !normalizar(e.tempo_jejum).includes("sem")).length;
  $("statAutorizacao").textContent = exames.filter(e => normalizar(e.autorizacao).startsWith("precisa autorizar")).length;
  $("vazioExames").hidden = filtrados.length > 0;
  $("listaExames").innerHTML = filtrados.map(e => {
    const particular = (e.tipo || "Normal") === "Particular";
    const inativo = e.ativo === false;
    const statusAutorizacao = normalizar(e.autorizacao);
    const classeAlerta = statusAutorizacao.includes("com anexo") ? "needs-attachment" : statusAutorizacao.startsWith("precisa autorizar") ? "needs-auth" : "";
    return `<article class="exam-row ${particular ? "particular" : ""} ${inativo ? "inactive-record" : ""} ${classeAlerta}" data-id="${escapeHtml(e.id)}">
      <div><span class="cell-label">SIGLA</span><button class="favorite-btn ${favoritosIds.has(String(e.id)) ? "active" : ""}" data-favorite="${escapeHtml(e.id)}" title="Favoritar">${favoritosIds.has(String(e.id)) ? "★" : "☆"}</button><span class="sigla ${String(e.sigla || "").length > 12 ? "longa" : ""}" title="${escapeHtml(e.sigla)}">${escapeHtml(e.sigla)}</span></div>
      <div class="exam-name"><strong>${escapeHtml(e.nome)}</strong><small>Código ${escapeHtml(e.codigo || "—")}</small>${particular ? '<span class="particular-label">PARTICULAR</span>' : ""}${inativo ? '<span class="inactive-label">INATIVO</span>' : ""}</div>
      <div><span class="cell-label">◷ JEJUM</span><strong>${escapeHtml(e.tempo_jejum || "Sem informação")}</strong></div>
      <div><span class="cell-label">◆ AUTORIZAÇÃO</span><span class="badge ${statusClass(e.autorizacao)}">${escapeHtml(e.autorizacao || "—")}</span></div>
      <div><span class="cell-label">▤ TERMOS / PDF</span><span class="badge ${e.link_termo ? "pdf" : ""}">${e.link_termo ? "PDF disponível" : escapeHtml(e.termos || "Sem termo")}</span></div>
      <div class="quick-actions"><button class="mini-action" data-copy-code="${escapeHtml(e.codigo || "")}" title="Copiar código">⧉ Código</button><button class="mini-action" data-copy-all="${escapeHtml(e.id)}" title="Copiar todas as informações">⧉ Resumo</button></div>
    </article>`;
  }).join("");
  document.querySelectorAll(".exam-row").forEach(row => row.addEventListener("click", event => {
    if (!event.target.closest("button")) abrirExame(row.dataset.id);
  }));
  document.querySelectorAll("[data-copy-code]").forEach(button => button.addEventListener("click", async () => { await navigator.clipboard.writeText(button.dataset.copyCode); mostrarToast("Código copiado"); }));
  document.querySelectorAll("[data-copy-all]").forEach(button => button.addEventListener("click", () => window.copiarResumo(button.dataset.copyAll)));
  document.querySelectorAll("[data-favorite]").forEach(button => button.addEventListener("click", () => alternarFavorito(button.dataset.favorite)));
}

async function alternarFavorito(exameId) {
  const ativo = favoritosIds.has(String(exameId));
  const url = `${SUPABASE_URL}/rest/v1/favoritos_exames?usuario_id=eq.${encodeURIComponent(sessao.user.id)}&exame_id=eq.${encodeURIComponent(exameId)}`;
  const response = await fetch(ativo ? url : `${SUPABASE_URL}/rest/v1/favoritos_exames`, ativo ? {method:"DELETE",headers:apiHeaders()} : {method:"POST",headers:{...apiHeaders(),"Content-Type":"application/json"},body:JSON.stringify({usuario_id:sessao.user.id,exame_id:exameId})});
  if (!response.ok) { mostrarToast("Não foi possível alterar o favorito"); return; }
  ativo ? favoritosIds.delete(String(exameId)) : favoritosIds.add(String(exameId));
  renderExames(); mostrarToast(ativo ? "Removido dos favoritos" : "Adicionado aos favoritos");
}

function abrirExame(id) {
  const e = exames.find(item => String(item.id) === String(id));
  if (!e) return;
  const valores = obterValores(e);
  $("drawerContent").innerHTML = `<span class="detail-kicker">${escapeHtml(e.sigla)}</span><h2>${escapeHtml(e.nome)}</h2><p>Código ${escapeHtml(e.codigo || "não informado")}</p>
    <div class="detail-grid">
      <div class="detail-card price-box"><small>VALOR COM CARTÃO BIOFAST</small><strong>${valores.biofast ? `R$ ${escapeHtml(valores.biofast)}` : "Não cadastrado"}</strong></div>
      <div class="detail-card price-box"><small>VALOR SEM CARTÃO</small><strong>${valores.semCartao ? `R$ ${escapeHtml(valores.semCartao)}` : "Não cadastrado"}</strong></div>
      <div class="detail-card"><small>JEJUM</small><strong>${escapeHtml(e.tempo_jejum || "Sem informação")}</strong></div>
      <div class="detail-card"><small>AUTORIZAÇÃO</small><strong>${escapeHtml(e.autorizacao || "—")}</strong></div>
      <div class="detail-card"><small>ANEXO</small><strong>${escapeHtml(e.anexo || "—")}</strong></div>
      <div class="detail-card"><small>TERMOS</small><strong>${escapeHtml(e.termos || "Não definido")}</strong></div>
      <div class="detail-card wide"><small>OBSERVAÇÕES</small><strong>${escapeHtml(e.observacao || "Sem observações")}</strong></div>
    </div>
    <div class="action-row">${e.link_termo ? `<a class="action pdf-action" href="${escapeHtml(e.link_termo)}" target="_blank" rel="noopener">▤ Abrir termo PDF</a>` : ""}<button class="action" onclick="copiarResumo('${escapeHtml(e.id)}')">Copiar orientação</button>${podeOperar() ? '<button class="action" id="verHistorico">↺ Histórico</button><button class="action admin-action" id="editarExame">✎ Editar exame</button>' : ""}${ehAdministrador() ? `<button class="action status-action" id="statusExame">${e.ativo === false ? "Reativar exame" : "Desativar exame"}</button><button class="action danger-action" id="excluirExame">Excluir exame</button>` : ""}</div>
    <section class="history-panel" id="historicoExame" hidden><h3>Histórico de alterações</h3><div id="listaHistorico">Carregando...</div></section>
    <form class="edit-form exam-edit-form" id="formExame" hidden>
      <h3>Editar exame</h3><div class="form-grid">
        <label class="field"><span>TIPO</span><select name="tipo"><option ${e.tipo !== "Particular" ? "selected" : ""}>Normal</option><option ${e.tipo === "Particular" ? "selected" : ""}>Particular</option></select></label>
        <label class="field"><span>SIGLA</span><input name="sigla" value="${escapeHtml(e.sigla || "")}" required></label>
        <label class="field wide"><span>NOME DO EXAME</span><input name="nome" value="${escapeHtml(e.nome || "")}" required></label>
        <label class="field"><span>CÓDIGO</span><input name="codigo" value="${escapeHtml(e.codigo || "")}"></label>
        <label class="field"><span>JEJUM / PREPARO</span><input name="tempo_jejum" value="${escapeHtml(e.tempo_jejum || "")}"></label>
        <label class="field"><span>AUTORIZAÇÃO</span><select name="autorizacao"><option ${e.autorizacao === "Não precisa" ? "selected" : ""}>Não precisa</option><option ${e.autorizacao === "Precisa autorizar" ? "selected" : ""}>Precisa autorizar</option><option ${e.autorizacao === "Precisa autorizar com anexo" ? "selected" : ""}>Precisa autorizar com anexo</option></select></label>
        <label class="field"><span>ANEXO</span><select name="anexo"><option ${e.anexo !== "Sim" ? "selected" : ""}>Não</option><option ${e.anexo === "Sim" ? "selected" : ""}>Sim</option></select></label>
        <label class="field"><span>TERMOS</span><select name="termos"><option value="" ${!e.termos ? "selected" : ""}>Não definido</option><option ${e.termos === "Não" ? "selected" : ""}>Não</option><option ${e.termos === "Sim" ? "selected" : ""}>Sim</option></select></label>
        <label class="field wide"><span>LINK DO TERMO PDF</span><input name="link_termo" value="${escapeHtml(e.link_termo || "")}" placeholder="https://..."></label>
        <label class="field price-field"><span>VALOR COM CARTÃO BIOFAST</span><input name="valor_biofast" value="${escapeHtml(valores.biofast || "")}" placeholder="0,00"></label>
        <label class="field price-field"><span>VALOR SEM CARTÃO</span><input name="valor_sem_cartao" value="${escapeHtml(valores.semCartao || "")}" placeholder="0,00"></label>
        <label class="field wide"><span>OBSERVAÇÕES</span><textarea name="observacao">${escapeHtml(e.observacao || "")}</textarea></label>
      </div><div class="form-actions"><button class="primary" type="submit">Salvar exame</button><button class="action" type="button" id="cancelarEdicaoExame">Cancelar</button></div>
    </form>`;
  $("drawerBackdrop").hidden = false;
  $("drawer").classList.add("open");
  $("drawer").setAttribute("aria-hidden", "false");
  if (podeOperar()) {
    $("editarExame").addEventListener("click", () => { $("formExame").hidden = false; $("formExame").scrollIntoView({behavior:"smooth",block:"start"}); });
    $("verHistorico").addEventListener("click", () => carregarHistorico(e.id));
  }
  if (ehAdministrador()) {
    $("statusExame").addEventListener("click", () => alterarStatusExame(e.id, e.ativo === false));
    $("excluirExame").addEventListener("click", () => excluirExame(e.id));
  }
  $("cancelarEdicaoExame").addEventListener("click", () => { $("formExame").hidden = true; });
  $("formExame").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const moedaParaNumero = valor => { const limpo = String(valor || "").trim(); return limpo ? Number(limpo.replace(/\./g, "").replace(",", ".")) : null; };
    const dados = { tipo:form.get("tipo"), sigla:String(form.get("sigla") || "").trim().toUpperCase(), nome:String(form.get("nome") || "").trim(), codigo:String(form.get("codigo") || "").trim(), tempo_jejum:String(form.get("tempo_jejum") || "").trim(), autorizacao:form.get("autorizacao"), anexo:form.get("anexo"), termos:form.get("termos"), link_termo:normalizarUrl(form.get("link_termo")), observacao:String(form.get("observacao") || "").trim(), valor_cartao_biofast:moedaParaNumero(form.get("valor_biofast")), valor_sem_cartao:moedaParaNumero(form.get("valor_sem_cartao")) };
    const response = await fetch(`${SUPABASE_URL}/rest/v1/exames?id=eq.${encodeURIComponent(e.id)}`, {method:"PATCH",headers:{...apiHeaders(),"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(dados)});
    if (!response.ok) { console.error(await response.text()); mostrarToast("O banco bloqueou a edição"); return; }
    await response.json();
    const confirmacao = await fetch(`${SUPABASE_URL}/rest/v1/exames?id=eq.${encodeURIComponent(e.id)}&select=id,tipo,sigla,nome,codigo,autorizacao,anexo,termos,tempo_jejum,link_termo,observacao,valor_cartao_biofast,valor_sem_cartao,ativo`, {headers:apiHeaders()});
    if (!confirmacao.ok) { mostrarToast("O exame foi salvo, mas não foi possível conferir"); return; }
    const atualizados = await confirmacao.json();
    if (!atualizados[0] || String(atualizados[0].observacao || "") !== dados.observacao) { mostrarToast("A observação não foi confirmada pelo banco"); return; }
    const index = exames.findIndex(item => String(item.id) === String(e.id));
    exames[index] = atualizados[0] || {...e,...dados};
    renderExames(); abrirExame(e.id); mostrarToast("Exame atualizado");
  });
}

async function alterarStatusExame(id, ativo) {
  const exame = exames.find(item => String(item.id) === String(id));
  if (!ehAdministrador() || !exame) return;
  if (!confirm(`${ativo ? "Reativar" : "Desativar"} o exame ${exame.sigla} — ${exame.nome}?`)) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/exames?id=eq.${encodeURIComponent(id)}`, {method:"PATCH",headers:{...apiHeaders(),"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({ativo})});
  if (!response.ok) { mostrarToast("Não foi possível alterar o status"); return; }
  exame.ativo = ativo;
  renderExames(); abrirExame(id); mostrarToast(ativo ? "Exame reativado" : "Exame desativado");
}

async function excluirExame(id) {
  const exame = exames.find(item => String(item.id) === String(id));
  if (!ehAdministrador() || !exame) return;
  if (!confirm(`Excluir definitivamente ${exame.sigla} — ${exame.nome}? Esta ação não pode ser desfeita.`)) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/exames?id=eq.${encodeURIComponent(id)}`, {method:"DELETE",headers:apiHeaders()});
  if (!response.ok) { mostrarToast("Não foi possível excluir o exame"); return; }
  exames = exames.filter(item => String(item.id) !== String(id));
  fecharDrawer(); renderExames(); mostrarToast("Exame excluído");
}

function abrirNovoExame() {
  $("drawerContent").innerHTML = `<span class="detail-kicker">NOVO CADASTRO</span><h2>Novo exame</h2><p>Preencha as informações operacionais do exame.</p>
    <form class="edit-form exam-edit-form" id="formNovoExame">
      <div class="form-grid">
        <label class="field"><span>TIPO</span><select name="tipo"><option>Normal</option><option>Particular</option></select></label>
        <label class="field"><span>SIGLA</span><input name="sigla" required></label>
        <label class="field wide"><span>NOME DO EXAME</span><input name="nome" required></label>
        <label class="field"><span>CÓDIGO</span><input name="codigo"></label>
        <label class="field"><span>JEJUM / PREPARO</span><input name="tempo_jejum"></label>
        <label class="field"><span>AUTORIZAÇÃO</span><select name="autorizacao"><option>Não precisa</option><option>Precisa autorizar</option><option>Precisa autorizar com anexo</option></select></label>
        <label class="field"><span>ANEXO</span><select name="anexo"><option>Não</option><option>Sim</option></select></label>
        <label class="field"><span>TERMOS</span><select name="termos"><option value="">Não definido</option><option>Não</option><option>Sim</option></select></label>
        <label class="field wide"><span>LINK DO TERMO PDF</span><input name="link_termo" placeholder="site.com/termo.pdf"></label>
        <label class="field price-field"><span>VALOR COM CARTÃO BIOFAST</span><input name="valor_biofast" placeholder="0,00"></label>
        <label class="field price-field"><span>VALOR SEM CARTÃO</span><input name="valor_sem_cartao" placeholder="0,00"></label>
        <label class="field wide"><span>OBSERVAÇÕES</span><textarea name="observacao"></textarea></label>
      </div>
      <div class="form-actions"><button class="primary" id="salvarNovoExame" type="submit">Cadastrar exame</button><button class="action" id="cancelarNovoExame" type="button">Cancelar</button></div>
    </form>`;
  $("drawerBackdrop").hidden = false;
  $("drawer").classList.add("open");
  $("drawer").setAttribute("aria-hidden", "false");
  $("cancelarNovoExame").addEventListener("click", fecharDrawer);
  $("formNovoExame").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const moeda = valor => { const texto=String(valor||"").trim(); return texto ? Number(texto.replace(/\./g,"").replace(",",".")) : null; };
    const dados = {tipo:form.get("tipo"),sigla:String(form.get("sigla")||"").trim().toUpperCase(),nome:String(form.get("nome")||"").trim(),codigo:String(form.get("codigo")||"").trim(),tempo_jejum:String(form.get("tempo_jejum")||"").trim(),autorizacao:form.get("autorizacao"),anexo:form.get("anexo"),termos:form.get("termos"),link_termo:normalizarUrl(form.get("link_termo")),observacao:String(form.get("observacao")||"").trim(),valor_cartao_biofast:moeda(form.get("valor_biofast")),valor_sem_cartao:moeda(form.get("valor_sem_cartao")),ativo:true};
    const botao = $("salvarNovoExame"); botao.disabled=true; botao.textContent="Cadastrando...";
    const response = await fetch(`${SUPABASE_URL}/rest/v1/exames`, {method:"POST",headers:{...apiHeaders(),"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(dados)});
    if (!response.ok) { console.error(await response.text()); mostrarToast("Não foi possível cadastrar o exame"); botao.disabled=false; botao.textContent="Cadastrar exame"; return; }
    const criado = (await response.json())[0];
    exames.push(criado); exames.sort((a,b)=>String(a.sigla).localeCompare(String(b.sigla),"pt-BR"));
    renderExames(); fecharDrawer(); mostrarToast("Exame cadastrado");
  });
}

async function carregarHistorico(exameId) {
  $("historicoExame").hidden = false;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/exame_alteracoes?select=usuario_email,dados_anteriores,dados_novos,alterado_em&exame_id=eq.${encodeURIComponent(exameId)}&order=alterado_em.desc&limit=20`, {headers:apiHeaders()});
  if (!response.ok) { $("listaHistorico").innerHTML = '<div class="history-empty">Não foi possível carregar o histórico.</div>'; return; }
  const itens = await response.json();
  const labels = {nome:"Nome",sigla:"Sigla",codigo:"Código",tempo_jejum:"Jejum",autorizacao:"Autorização",anexo:"Anexo",termos:"Termos",link_termo:"PDF",observacao:"Observação",valor_cartao_biofast:"Valor Biofast",valor_sem_cartao:"Valor sem cartão",tipo:"Tipo"};
  $("listaHistorico").innerHTML = itens.length ? itens.map(item => {
    const mudancas = Object.keys(labels).filter(campo => JSON.stringify(item.dados_anteriores?.[campo]) !== JSON.stringify(item.dados_novos?.[campo])).map(campo => `<div class="history-change"><b>${labels[campo]}:</b> ${escapeHtml(item.dados_anteriores?.[campo] ?? "vazio")} → ${escapeHtml(item.dados_novos?.[campo] ?? "vazio")}</div>`).join("");
    return `<article class="history-item"><header><strong>${escapeHtml(item.usuario_email || "Sistema")}</strong><time>${new Date(item.alterado_em).toLocaleString("pt-BR")}</time></header>${mudancas || '<div class="history-change">Registro atualizado.</div>'}</article>`;
  }).join("") : '<div class="history-empty">Nenhuma alteração registrada ainda.</div>';
  $("historicoExame").scrollIntoView({behavior:"smooth",block:"nearest"});
}

function fecharDrawer() {
  $("drawer").classList.remove("open");
  $("drawer").setAttribute("aria-hidden", "true");
  setTimeout(() => $("drawerBackdrop").hidden = true, 220);
  credenciaisConvenios.clear();
}

window.copiarResumo = async (id) => {
  const e = exames.find(item => String(item.id) === String(id));
  const v = obterValores(e);
  const texto = `${e.sigla} — ${e.nome}\nCódigo: ${e.codigo || "—"}\nJejum: ${e.tempo_jejum || "—"}\nAutorização: ${e.autorizacao || "—"}\nCartão Biofast: ${v.biofast ? `R$ ${v.biofast}` : "—"}\nSem cartão: ${v.semCartao ? `R$ ${v.semCartao}` : "—"}\nObservações: ${e.observacao || "—"}`;
  await navigator.clipboard.writeText(texto); mostrarToast("Orientação copiada");
};

function parseLinks(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value || "[]"); } catch { return []; }
}

function renderConvenios() {
  const termo = normalizar($("buscaConvenio").value);
  const filtrados = convenios.filter(c => normalizar(`${c.nome} ${c.categoria}`).includes(termo));
  $("listaConvenios").innerHTML = filtrados.map(c => `<button class="convenio-item ${c.ativo === false ? "inactive-record" : ""} ${String(c.id) === String(convenioSelecionado) ? "active" : ""}" data-id="${escapeHtml(c.id)}"><strong>${escapeHtml(c.nome)}</strong><small>${escapeHtml(c.categoria || "Convênio")}${c.ativo === false ? " · INATIVO" : ""}</small></button>`).join("");
  document.querySelectorAll(".convenio-item").forEach(button => button.addEventListener("click", () => abrirConvenio(button.dataset.id)));
}

function abrirNovoConvenio() {
  convenioSelecionado = null;
  credenciaisConvenios.clear();
  renderConvenios();
  $("detalheConvenio").innerHTML = `<div class="convenio-title"><div><span class="eyebrow blue">NOVO CADASTRO</span><h2>Novo convênio</h2><p>As credenciais serão enviadas diretamente para o cofre criptografado.</p></div><span class="badge green">Cadastro seguro</span></div>
    <form class="edit-form new-convenio-form" id="formNovoConvenio">
      <div class="form-grid">
        <label class="field"><span>NOME</span><input name="nome" required placeholder="Nome do convênio"></label>
        <label class="field"><span>CATEGORIA</span><input name="categoria" value="Convênio médico"></label>
        <label class="field wide"><span>PORTAL PRINCIPAL</span><input name="site" type="text" inputmode="url" placeholder="site.com.br ou https://site.com.br"></label>
        <label class="field secure-field"><span>USUÁRIO DO PORTAL</span><input name="usuario" autocomplete="off"></label>
        <label class="field secure-field"><span>SENHA DO PORTAL</span><input name="senha" type="password" autocomplete="new-password"></label>
        <label class="field"><span>TELEFONE</span><input name="telefone"></label>
        <label class="field wide"><span>OBSERVAÇÕES</span><textarea name="observacao"></textarea></label>
        <label class="field wide"><span>OUTROS PORTAIS (JSON, OPCIONAL)</span><textarea name="links_extras" placeholder='[{"nome":"Outro portal","url":"https://..."}]'></textarea></label>
      </div>
      <div class="secure-form-message">◆ Usuário e senha não serão gravados na tabela comum.</div>
      <div class="form-actions"><button class="primary blue-btn" id="salvarNovoConvenio" type="submit">Criar convênio seguro</button><button class="action" id="cancelarNovoConvenio" type="button">Cancelar</button></div>
    </form>`;
  $("cancelarNovoConvenio").addEventListener("click", () => { $("detalheConvenio").innerHTML = '<div class="empty-state">Selecione um convênio para consultar.</div>'; });
  $("formNovoConvenio").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let linksExtras = [];
    try {
      const textoLinks = String(form.get("links_extras") || "").trim();
      linksExtras = textoLinks ? JSON.parse(textoLinks) : [];
      if (!Array.isArray(linksExtras)) throw new Error();
    } catch {
      mostrarToast("Outros portais precisam estar em formato válido");
      return;
    }
    const botao = $("salvarNovoConvenio");
    botao.disabled = true;
    botao.textContent = "Protegendo e salvando...";
    const payload = {
      p_nome:String(form.get("nome") || "").trim(),
      p_categoria:String(form.get("categoria") || "").trim(),
      p_site:normalizarUrl(form.get("site")),
      p_usuario:String(form.get("usuario") || ""),
      p_senha:String(form.get("senha") || ""),
      p_telefone:String(form.get("telefone") || "").trim(),
      p_observacao:String(form.get("observacao") || "").trim(),
      p_links_extras:linksExtras
    };
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/criar_convenio_seguro`, {method:"POST",headers:{...apiHeaders(),"Content-Type":"application/json"},body:JSON.stringify(payload)});
    if (!response.ok) {
      console.error(await response.text());
      mostrarToast("Não foi possível criar o convênio");
      botao.disabled = false;
      botao.textContent = "Criar convênio seguro";
      return;
    }
    const novoId = await response.json();
    convenios = await buscarTabela("convenios", "id,nome,categoria,site,telefone,observacao,ativo,links_extras");
    convenios.sort((a,b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    renderConvenios();
    abrirConvenio(novoId);
    mostrarToast("Convênio criado com credenciais protegidas");
  });
}

async function carregarCredencialConvenio(id) {
  const botao = $("carregarCredencial");
  if (botao) { botao.disabled = true; botao.textContent = "Verificando acesso..."; }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/obter_credencial_convenio`, {
    method:"POST",
    headers:{...apiHeaders(),"Content-Type":"application/json"},
    body:JSON.stringify({p_convenio_id:id})
  });
  if (!response.ok) { mostrarToast("Não foi possível liberar a credencial"); abrirConvenio(id); return; }
  const dados = await response.json();
  if (!dados[0]) { mostrarToast("Credencial não encontrada no cofre"); abrirConvenio(id); return; }
  credenciaisConvenios.set(String(id), dados[0]);
  abrirConvenio(id);
  mostrarToast("Credencial liberada com segurança");
}

function abrirConvenio(id) {
  if (convenioSelecionado && String(convenioSelecionado) !== String(id)) credenciaisConvenios.clear();
  convenioSelecionado = id;
  const c = convenios.find(item => String(item.id) === String(id));
  const credencial = credenciaisConvenios.get(String(id));
  renderConvenios();
  const links = parseLinks(c.links_extras);
  const extras = links.map((link, index) => {
    const url = typeof link === "string" ? link : (link.url || link.link || link.site || "");
    const nome = typeof link === "string" ? `Portal adicional ${index + 1}` : (link.nome || link.titulo || link.label || `Portal adicional ${index + 1}`);
    return url ? `<div class="extra-link"><strong>${escapeHtml(nome)}</strong><a href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir portal ↗</a></div>` : "";
  }).join("");
  const credenciaisHtml = credencial ? `
    <div class="credential protected"><div><small>USUÁRIO PROTEGIDO</small><strong>${escapeHtml(credencial.usuario || "Não informado")}</strong></div><button id="copiarUsuarioSeguro">Copiar</button></div>
    <div class="credential protected"><div><small>SENHA PROTEGIDA</small><strong id="senhaConvenio">••••••••</strong></div><div><button id="mostrarSenha">Mostrar</button> <button id="copiarSenhaSegura">Copiar</button></div></div>` : `
    <div class="credential-lock"><div><span class="lock-icon">◆</span><div><strong>Credenciais protegidas</strong><p>Usuário e senha permanecem criptografados até você solicitar.</p></div></div><button class="primary" id="carregarCredencial">Desbloquear credenciais</button></div>`;
  const camposCredenciais = credencial ? `
        <label class="field"><span>USUÁRIO PROTEGIDO</span><input name="usuario_seguro" value="${escapeHtml(credencial.usuario || "")}"></label>
        <label class="field"><span>SENHA PROTEGIDA</span><input name="senha_segura" value="${escapeHtml(credencial.senha || "")}"></label>` : '<div class="secure-edit-note wide">Desbloqueie as credenciais antes de alterar usuário ou senha.</div>';
  $("detalheConvenio").innerHTML = `<div class="convenio-title"><div><span class="eyebrow blue">CONVÊNIO</span><h2>${escapeHtml(c.nome)}</h2><p>${escapeHtml(c.categoria || "")}</p></div><div class="title-actions"><span class="badge ${String(c.ativo) === "true" ? "green" : "red"}">${String(c.ativo) === "true" ? "Ativo" : "Inativo"}</span>${podeOperar() ? '<button class="action" id="editarConvenio">Editar informações</button>' : ""}${ehAdministrador() ? `<button class="action status-action" id="statusConvenio">${c.ativo === false ? "Reativar" : "Desativar"}</button><button class="action danger-action" id="excluirConvenio">Excluir</button>` : ""}</div></div>
    <div class="portal-box"><h3>Portal principal</h3><p>Acesse diretamente o ambiente do convênio.</p>${c.site ? `<a href="${escapeHtml(c.site)}" target="_blank" rel="noopener">Abrir portal ↗</a>` : "Sem portal cadastrado"}</div>
    ${credenciaisHtml}
    <div class="credential"><div><small>TELEFONE</small><strong>${escapeHtml(c.telefone || "Não informado")}</strong></div><button data-copy="${escapeHtml(c.telefone || "")}">Copiar</button></div>
    ${c.observacao ? `<div class="credential"><div><small>OBSERVAÇÕES</small><strong>${escapeHtml(c.observacao)}</strong></div></div>` : ""}
    <div class="extra-links"><h3>Outros portais</h3>${extras || "<p>Nenhum link adicional cadastrado.</p>"}</div>
    <form class="edit-form" id="formConvenio" hidden>
      <h3>Editar convênio</h3><div class="form-grid">
        <label class="field"><span>NOME</span><input name="nome" value="${escapeHtml(c.nome || "")}" required></label>
        <label class="field"><span>CATEGORIA</span><input name="categoria" value="${escapeHtml(c.categoria || "")}"></label>
        <label class="field wide"><span>PORTAL PRINCIPAL</span><input name="site" value="${escapeHtml(c.site || "")}" placeholder="https://..."></label>
        ${camposCredenciais}
        <label class="field"><span>TELEFONE</span><input name="telefone" value="${escapeHtml(c.telefone || "")}"></label>
        <label class="field wide"><span>OBSERVAÇÕES</span><textarea name="observacao">${escapeHtml(c.observacao || "")}</textarea></label>
        <label class="field wide"><span>LINKS EXTRAS (JSON)</span><textarea name="links_extras">${escapeHtml(typeof c.links_extras === "string" ? c.links_extras : JSON.stringify(c.links_extras || []))}</textarea></label>
      </div><div class="form-actions"><button class="primary" type="submit">Salvar alterações</button><button class="action" type="button" id="cancelarEdicaoConvenio">Cancelar</button></div>
    </form>`;
  if (credencial) {
    $("mostrarSenha").addEventListener("click", (event) => { const visible = $("senhaConvenio").textContent !== "••••••••"; $("senhaConvenio").textContent = visible ? "••••••••" : (credencial.senha || "Não informada"); event.currentTarget.textContent = visible ? "Mostrar" : "Ocultar"; });
    $("copiarUsuarioSeguro").addEventListener("click", async () => { await navigator.clipboard.writeText(credencial.usuario || ""); mostrarToast("Usuário copiado"); });
    $("copiarSenhaSegura").addEventListener("click", async () => { await navigator.clipboard.writeText(credencial.senha || ""); mostrarToast("Senha copiada"); });
  } else {
    $("carregarCredencial").addEventListener("click", () => carregarCredencialConvenio(c.id));
  }
  document.querySelectorAll("[data-copy]").forEach(button => button.addEventListener("click", async () => { await navigator.clipboard.writeText(button.dataset.copy); mostrarToast("Copiado"); }));
  if (podeOperar()) {
  $("editarConvenio").addEventListener("click", () => { $("formConvenio").hidden = false; $("formConvenio").scrollIntoView({behavior:"smooth", block:"start"}); });
  if (ehAdministrador()) {
    $("statusConvenio").addEventListener("click", () => alterarStatusConvenio(c.id, c.ativo === false));
    $("excluirConvenio").addEventListener("click", () => excluirConvenio(c.id));
  }
  $("cancelarEdicaoConvenio").addEventListener("click", () => { $("formConvenio").hidden = true; });
  $("formConvenio").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let linksExtras;
    try { linksExtras = JSON.parse(form.get("links_extras") || "[]"); } catch { mostrarToast("Links extras precisam estar em formato válido"); return; }
    const dados = { nome:form.get("nome"), categoria:form.get("categoria"), site:normalizarUrl(form.get("site")), telefone:form.get("telefone"), observacao:form.get("observacao"), links_extras:linksExtras };
    const response = await fetch(`${SUPABASE_URL}/rest/v1/convenios?id=eq.${encodeURIComponent(c.id)}`, {method:"PATCH", headers:{...apiHeaders(),"Content-Type":"application/json","Prefer":"return=representation"}, body:JSON.stringify(dados)});
    if (!response.ok) { console.error(await response.text()); mostrarToast("O banco bloqueou a edição"); return; }
    if (credencial) {
      const respostaCredencial = await fetch(`${SUPABASE_URL}/rest/v1/rpc/salvar_credencial_convenio`, {method:"POST",headers:{...apiHeaders(),"Content-Type":"application/json"},body:JSON.stringify({p_convenio_id:c.id,p_usuario:form.get("usuario_seguro") || "",p_senha:form.get("senha_segura") || ""})});
      if (!respostaCredencial.ok) { mostrarToast("Dados salvos, mas a credencial não foi atualizada"); return; }
      credenciaisConvenios.set(String(c.id), {usuario:form.get("usuario_seguro") || "",senha:form.get("senha_segura") || ""});
    }
    const atualizados = await response.json();
    const index = convenios.findIndex(item => String(item.id) === String(c.id));
    convenios[index] = atualizados[0] || {...c,...dados};
    renderConvenios(); abrirConvenio(c.id); mostrarToast("Convênio atualizado");
  });
  }
}

async function alterarStatusConvenio(id, ativo) {
  const convenio = convenios.find(item => String(item.id) === String(id));
  if (!ehAdministrador() || !convenio) return;
  if (!confirm(`${ativo ? "Reativar" : "Desativar"} o convênio ${convenio.nome}?`)) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/convenios?id=eq.${encodeURIComponent(id)}`, {method:"PATCH",headers:{...apiHeaders(),"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({ativo})});
  if (!response.ok) { mostrarToast("Não foi possível alterar o status"); return; }
  convenio.ativo = ativo;
  renderConvenios(); abrirConvenio(id); await carregarAuditoria();
  mostrarToast(ativo ? "Convênio reativado" : "Convênio desativado");
}

async function excluirConvenio(id) {
  const convenio = convenios.find(item => String(item.id) === String(id));
  if (!ehAdministrador() || !convenio) return;
  if (!confirm(`Excluir definitivamente o convênio ${convenio.nome} e suas credenciais criptografadas?`)) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/excluir_convenio_seguro`, {method:"POST",headers:{...apiHeaders(),"Content-Type":"application/json"},body:JSON.stringify({p_convenio_id:id})});
  if (!response.ok) { mostrarToast("Não foi possível excluir o convênio"); return; }
  convenios = convenios.filter(item => String(item.id) !== String(id));
  convenioSelecionado = null; credenciaisConvenios.clear(); renderConvenios();
  $("detalheConvenio").innerHTML = '<div class="empty-state">Convênio excluído. Selecione outro cadastro.</div>';
  await carregarAuditoria(); mostrarToast("Convênio e credenciais excluídos");
}

function mostrarToast(texto) { $("toast").textContent = texto; $("toast").classList.add("show"); setTimeout(() => $("toast").classList.remove("show"), 1800); }

carregarAvisosLocais();
$("avisoAnterior").addEventListener("click", () => mudarAviso(-1));
$("avisoProximo").addEventListener("click", () => mudarAviso(1));
$("gerenciarAvisos").addEventListener("click", abrirGerenciadorAvisos);
$("fecharAvisos").addEventListener("click", fecharGerenciadorAvisos);
$("avisosBackdrop").addEventListener("click", fecharGerenciadorAvisos);
$("fecharDetalheAviso").addEventListener("click", fecharDetalheAviso);
$("avisoDetalheBackdrop").addEventListener("click", fecharDetalheAviso);
$("limparAviso").addEventListener("click", limparFormularioAviso);
$("formAviso").addEventListener("submit", async event => {
  event.preventDefault();
  if (!ehAdministrador()) return;
  const id = $("avisoId").value || (crypto.randomUUID?.() || String(Date.now()));
  const existe = avisosInternos.some(item => String(item.id) === String(id));
  const aviso = {
    id,
    titulo: $("avisoTitulo").value.trim(),
    mensagem: $("avisoMensagem").value.trim(),
    tipo: $("avisoTipo").value,
    ativo: $("avisoAtivo").value === "true",
    prioridade: $("avisoTipo").value === "urgente" ? 3 : $("avisoTipo").value === "alerta" ? 2 : $("avisoTipo").value === "sucesso" ? 1 : 0
  };
  if (!aviso.titulo || !aviso.mensagem) return;
  $("salvarAviso").disabled = true;
  try {
    const salvo = await salvarAvisoOficial(aviso);
    avisosInternos = existe ? avisosInternos.map(item => String(item.id) === String(id) ? salvo : item) : [salvo, ...avisosInternos];
    avisoAtual = 0;
    limparFormularioAviso();
    renderAvisos();
    mostrarToast(existe ? "Aviso atualizado" : "Aviso cadastrado");
  } catch (error) {
    console.error(error);
    mostrarToast("NÃ£o foi possÃ­vel salvar o aviso");
  } finally {
    $("salvarAviso").disabled = false;
  }
});

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab,.view").forEach(el => el.classList.remove("active"));
  tab.classList.add("active"); $("view-" + tab.dataset.view).classList.add("active");
}));
$("buscaExame").addEventListener("input", renderExames);
$("novoExame").addEventListener("click", abrirNovoExame);
$("filtroAutorizacao").addEventListener("change", renderExames);
$("filtroTipo").addEventListener("change", renderExames);
$("filtroFavoritos").addEventListener("click", () => { somenteFavoritos = !somenteFavoritos; $("filtroFavoritos").classList.toggle("active", somenteFavoritos); $("filtroFavoritos").textContent = somenteFavoritos ? "★ Meus favoritos" : "☆ Meus favoritos"; renderExames(); });
$("buscaConvenio").addEventListener("input", renderConvenios);
$("novoConvenio").addEventListener("click", abrirNovoConvenio);
$("atualizarAuditoria").addEventListener("click", async () => { await carregarAuditoria(); mostrarToast("Auditoria atualizada"); });
$("fecharDrawer").addEventListener("click", fecharDrawer);
$("drawerBackdrop").addEventListener("click", fecharDrawer);
$("voltarTopo").addEventListener("click", () => window.scrollTo({ top:0, behavior:"smooth" }));
window.addEventListener("scroll", () => $("voltarTopo").classList.toggle("show", window.scrollY > 420), { passive:true });

const moedaNumero = valor => Number(String(valor || "0").replace(/\./g, "").replace(",", ".")) || 0;
const moedaTexto = valor => Number(valor || 0).toLocaleString("pt-BR", {style:"currency",currency:"BRL"});

function renderBuscaOrcamento() {
  const termo = normalizar($("buscaOrcamento").value);
  if (!termo) { $("resultadosOrcamento").innerHTML = ""; return; }
  const resultados = exames.filter(e => normalizar(`${e.sigla} ${e.nome} ${e.codigo}`).includes(termo)).slice(0, 12);
  $("resultadosOrcamento").innerHTML = resultados.map(e => {
    const adicionado = itensOrcamento.some(item => String(item.id) === String(e.id));
    return `<div class="budget-result"><div><strong>${escapeHtml(e.sigla)} — ${escapeHtml(e.nome)}</strong><small>Código ${escapeHtml(e.codigo || "—")}</small></div><button data-add-budget="${escapeHtml(e.id)}" ${adicionado ? "disabled" : ""} title="Adicionar">${adicionado ? "✓" : "+"}</button></div>`;
  }).join("") || '<p class="subtexto">Nenhum exame encontrado.</p>';
  document.querySelectorAll("[data-add-budget]").forEach(button => button.addEventListener("click", () => adicionarOrcamento(button.dataset.addBudget)));
}

function adicionarOrcamento(id) {
  const exame = exames.find(e => String(e.id) === String(id));
  if (!exame || itensOrcamento.some(e => String(e.id) === String(id))) return;
  itensOrcamento.push(exame); renderOrcamento(); renderBuscaOrcamento();
}

function removerOrcamento(id) {
  itensOrcamento = itensOrcamento.filter(e => String(e.id) !== String(id)); renderOrcamento(); renderBuscaOrcamento();
}

function renderOrcamento() {
  $("orcamentoVazio").hidden = itensOrcamento.length > 0;
  const semBiofast = itensOrcamento.filter(e => !obterValores(e).biofast).length;
  const semNormal = itensOrcamento.filter(e => !obterValores(e).semCartao).length;
  let totalBiofast = 0, totalNormal = 0;
  $("itensOrcamento").innerHTML = itensOrcamento.length ? `<div class="budget-row header"><span>SIGLA</span><span>EXAME</span><span>CARTÃO BIOFAST</span><span>SEM CARTÃO</span><span></span></div>` + itensOrcamento.map(e => {
    const valores = obterValores(e); totalBiofast += moedaNumero(valores.biofast); totalNormal += moedaNumero(valores.semCartao);
    return `<div class="budget-row"><strong class="sigla">${escapeHtml(e.sigla)}</strong><div class="exam-budget-name"><strong>${escapeHtml(e.nome)}</strong><small>Código ${escapeHtml(e.codigo || "—")}</small></div><span class="budget-value">${valores.biofast ? `R$ ${escapeHtml(valores.biofast)}` : "Não cadastrado"}</span><span class="budget-value">${valores.semCartao ? `R$ ${escapeHtml(valores.semCartao)}` : "Não cadastrado"}</span><button class="remove-budget no-print" data-remove-budget="${escapeHtml(e.id)}" title="Remover">×</button></div>`;
  }).join("") : "";
  $("totalBiofast").textContent = moedaTexto(totalBiofast); $("totalSemCartao").textContent = moedaTexto(totalNormal);
  $("avisoOrcamento").textContent = (semBiofast || semNormal) ? `Atenção: ${semBiofast} item(ns) sem valor Biofast e ${semNormal} sem valor normal. Itens sem preço não entram no total.` : "Valores sujeitos a atualização. Confirme as informações antes do atendimento.";
  document.querySelectorAll("[data-remove-budget]").forEach(button => button.addEventListener("click", () => removerOrcamento(button.dataset.removeBudget)));
}

$("buscaOrcamento").addEventListener("input", renderBuscaOrcamento);
$("imprimirOrcamento").addEventListener("click", () => { if (!itensOrcamento.length) { mostrarToast("Adicione pelo menos um exame"); return; } window.print(); });
$("dataOrcamento").value = new Date().toISOString().slice(0,10);

function sessaoValida() {
  if (!sessao?.access_token) return false;
  if (!sessao.expires_at) return true;
  return Number(sessao.expires_at) > Math.floor(Date.now() / 1000) + 30;
}

function mostrarSistema() {
  $("loginGate").classList.add("hidden");
  $("usuarioLogado").textContent = sessao?.user?.email || "Usuário autenticado";
  aplicarPerfilNaTela();
}

function mostrarLogin(mensagem = "") {
  $("loginGate").classList.remove("hidden");
  $("loginErro").hidden = !mensagem;
  $("loginErro").textContent = mensagem;
}

function alternarTelaAcesso(cadastro) {
  $("formLogin").hidden = cadastro;
  $("formCadastro").hidden = !cadastro;
  $("formRecuperar").hidden = true;
  $("loginErro").hidden = true;
  $("cadastroErro").hidden = true;
  document.querySelector(".login-card h1").textContent = cadastro ? "Crie seu acesso." : "Entre para continuar.";
  document.querySelector(".login-card > p").textContent = cadastro ? "O novo acesso começa com o perfil Consulta." : "Use o e-mail e a senha cadastrados no Supabase.";
}

function mostrarRecuperacaoSenha() {
  $("formLogin").hidden = true;
  $("formCadastro").hidden = true;
  $("formRecuperar").hidden = false;
  $("recuperarErro").hidden = true;
  document.querySelector(".login-card h1").textContent = "Recupere sua senha.";
  document.querySelector(".login-card > p").textContent = "Informe seu e-mail, o código especial da empresa e escolha sua nova senha.";
}

$("mostrarCadastro").addEventListener("click", () => alternarTelaAcesso(true));
$("voltarLogin").addEventListener("click", () => alternarTelaAcesso(false));
$("mostrarRecuperacao").addEventListener("click", mostrarRecuperacaoSenha);
document.querySelectorAll(".voltar-login").forEach(button => button.addEventListener("click", () => alternarTelaAcesso(false)));

$("formRecuperar").addEventListener("submit", async event => {
  event.preventDefault();
  const email = $("recuperarEmail").value.trim();
  const codigo = $("recuperarCodigo").value.trim();
  const novaSenha = $("recuperarNovaSenha").value;
  const confirmacao = $("recuperarConfirmarSenha").value;
  if (novaSenha !== confirmacao) { $("recuperarErro").hidden = false; $("recuperarErro").textContent = "As duas senhas precisam ser iguais."; return; }
  $("btnRecuperar").disabled = true;
  $("btnRecuperar").textContent = "Trocando...";
  $("recuperarErro").hidden = true;
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/smart-worker`, {method:"POST",headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Content-Type":"application/json"},body:JSON.stringify({acao:"recuperar_senha",email,codigo_recuperacao:codigo,nova_senha:novaSenha})});
    if (!response.ok) throw new Error("E-mail ou código especial inválido. Confira e tente novamente.");
    alternarTelaAcesso(false);
    $("loginErro").hidden = false;
    $("loginErro").classList.add("success-message");
    $("loginErro").textContent = "Senha alterada. Agora você já pode entrar com a nova senha.";
    event.currentTarget.reset();
  } catch (error) {
    $("recuperarErro").hidden = false;
    $("recuperarErro").textContent = error.message;
  } finally {
    $("btnRecuperar").disabled = false;
    $("btnRecuperar").textContent = "Trocar minha senha";
  }
});

$("formCadastro").addEventListener("submit", async event => {
  event.preventDefault();
  const nome = $("cadastroNome").value.trim();
  const email = $("cadastroEmail").value.trim();
  const password = $("cadastroSenha").value;
  const codigoAcesso = $("cadastroCodigo").value.trim();
  $("btnCadastrar").disabled = true;
  $("btnCadastrar").textContent = "Criando acesso...";
  $("cadastroErro").hidden = true;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method:"POST",
      headers:{apikey:SUPABASE_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({email,password,data:{nome,codigo_acesso:codigoAcesso}})
    });
    const data = await response.json();
    if (!response.ok) {
      const detalhe = data.msg || data.error_description || "";
      const mensagem = /already registered|already been registered|user already exists/i.test(detalhe)
        ? "Este e-mail já possui cadastro. Volte e faça o login."
        : /password/i.test(detalhe)
          ? "A senha precisa ter pelo menos 8 caracteres."
          : "Código interno inválido ou cadastro não permitido.";
      throw new Error(mensagem);
    }
    if (data.access_token) {
      sessao = {...data,expires_at:Math.floor(Date.now()/1000)+Number(data.expires_in||3600)};
      guardarSessao(sessao);
      await carregarPerfil();
      mostrarSistema();
      await iniciar();
      return;
    }
    alternarTelaAcesso(false);
    $("loginErro").hidden = false;
    $("loginErro").classList.add("success-message");
    $("loginErro").textContent = "Cadastro criado. Confirme o e-mail recebido e depois entre no sistema.";
  } catch (error) {
    $("cadastroErro").hidden = false;
    $("cadastroErro").textContent = error.message;
  } finally {
    $("btnCadastrar").disabled = false;
    $("btnCadastrar").textContent = "Criar acesso de consulta";
  }
});

$("formLogin").addEventListener("submit", async event => {
  event.preventDefault();
  const email = $("loginEmail").value.trim();
  const password = $("loginSenha").value;
  $("btnEntrar").disabled = true;
  $("btnEntrar").textContent = "Entrando...";
  $("loginErro").hidden = true;
  $("loginErro").classList.remove("success-message");
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) {
      const detalhe = data.error_description || data.msg || "";
      const mensagem = /invalid login credentials/i.test(detalhe)
        ? "E-mail ou senha incorretos. Confira o usuário criado no Supabase."
        : /email not confirmed/i.test(detalhe)
          ? "O e-mail ainda não foi confirmado no Supabase."
          : (detalhe || "Não foi possível entrar.");
      throw new Error(mensagem);
    }
    sessao = { ...data, expires_at: Math.floor(Date.now() / 1000) + Number(data.expires_in || 3600) };
    guardarSessao(sessao);
    await carregarPerfil();
    mostrarSistema();
    await iniciar();
  } catch (error) {
    sessao = null;
    perfilAtual = null;
    apagarSessao();
    mostrarLogin(error.message);
  } finally {
    $("btnEntrar").disabled = false;
    $("btnEntrar").textContent = "Entrar no sistema";
  }
});

$("btnSair").addEventListener("click", async () => {
  try {
    if (sessao?.access_token) await fetch(`${SUPABASE_URL}/auth/v1/logout`, { method:"POST", headers:apiHeaders() });
  } catch (_) {}
  sessao = null;
  perfilAtual = null;
  apagarSessao();
  exames = []; convenios = [];
  mostrarLogin();
});

async function iniciar() {
  try {
    [exames, convenios] = await Promise.all([
      carregarExames(),
      podeConsultarConvenios() ? buscarTabela("convenios", "id,nome,categoria,site,telefone,observacao,ativo,links_extras") : Promise.resolve([])
    ]);
    await carregarFavoritos();
    exames.sort((a,b) => String(a.sigla).localeCompare(String(b.sigla), "pt-BR"));
    convenios.sort((a,b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    $("loadingExames").textContent = `${exames.length} registros`;
    renderExames(); renderConvenios();
    try {
      await carregarAvisosDoBanco();
    } catch (error) {
      console.info("Avisos oficiais ainda nÃ£o configurados; usando prÃ©via local.", error);
      avisosUsamBanco = false;
      renderAvisos();
    }
    await carregarUsuarios();
    await carregarAuditoria();
  } catch (error) {
    console.error(error); $("loadingExames").textContent = "Falha ao conectar"; mostrarToast("Não foi possível carregar o banco");
  }
}

(async function iniciarAplicacao() {
  if (!sessaoValida()) {
    sessao = null;
    apagarSessao();
    mostrarLogin();
    return;
  }
  try {
    await carregarPerfil();
    mostrarSistema();
    await iniciar();
  } catch (error) {
    sessao = null;
    perfilAtual = null;
    apagarSessao();
    mostrarLogin(error.message);
  }
})();
