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

const perfilAtivo = () => Boolean(perfilAtual?.ativo);
const podeOperar = () => perfilAtivo() && ["operador", "administrador"].includes(perfilAtual?.perfil);

const $ = (id) => document.getElementById(id);
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const normalizar = (value = "") => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

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
  $("tabConvenios").hidden = !operacao;
  $("perfilLogado").hidden = false;
  $("perfilLogado").textContent = perfilAtual.perfil === "administrador" ? "Administrador" : perfilAtual.perfil === "operador" ? "Operador" : "Consulta";
}

async function carregarFavoritos() {
  if (!sessao?.user?.id) return;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/favoritos_exames?select=exame_id&usuario_id=eq.${encodeURIComponent(sessao.user.id)}`, {headers:apiHeaders()});
  if (!response.ok) return;
  favoritosIds = new Set((await response.json()).map(item => String(item.exame_id)));
}

async function carregarExames() {
  const camposNovos = "id,tipo,sigla,nome,codigo,autorizacao,anexo,termos,tempo_jejum,link_termo,observacao,valor_cartao_biofast,valor_sem_cartao";
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
    const statusAutorizacao = normalizar(e.autorizacao);
    const classeAlerta = statusAutorizacao.includes("com anexo") ? "needs-attachment" : statusAutorizacao.startsWith("precisa autorizar") ? "needs-auth" : "";
    return `<article class="exam-row ${particular ? "particular" : ""} ${classeAlerta}" data-id="${escapeHtml(e.id)}">
      <div><span class="cell-label">SIGLA</span><button class="favorite-btn ${favoritosIds.has(String(e.id)) ? "active" : ""}" data-favorite="${escapeHtml(e.id)}" title="Favoritar">${favoritosIds.has(String(e.id)) ? "★" : "☆"}</button><span class="sigla ${String(e.sigla || "").length > 12 ? "longa" : ""}" title="${escapeHtml(e.sigla)}">${escapeHtml(e.sigla)}</span></div>
      <div class="exam-name"><strong>${escapeHtml(e.nome)}</strong><small>Código ${escapeHtml(e.codigo || "—")}</small>${particular ? '<span class="particular-label">PARTICULAR</span>' : ""}</div>
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
    <div class="action-row">${e.link_termo ? `<a class="action" href="${escapeHtml(e.link_termo)}" target="_blank" rel="noopener">▤ Abrir termo PDF</a>` : ""}<button class="action" onclick="copiarResumo('${escapeHtml(e.id)}')">Copiar orientação</button>${podeOperar() ? '<button class="action" id="verHistorico">↺ Histórico</button><button class="action admin-action" id="editarExame">✎ Editar exame</button>' : ""}</div>
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
  $("cancelarEdicaoExame").addEventListener("click", () => { $("formExame").hidden = true; });
  $("formExame").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const linhasLivres = String(form.get("observacao") || "").split(/\r?\n/).filter(linha => !/^\s*(COM|SEM)\s+CART[AÃ]O\s+BIO(?:FAST)?/i.test(linha));
    const linhasPreco = [];
    if (String(form.get("valor_biofast") || "").trim()) linhasPreco.push(`COM CARTÃO BIO ${String(form.get("valor_biofast")).trim()}`);
    if (String(form.get("valor_sem_cartao") || "").trim()) linhasPreco.push(`SEM CARTAO BIO ${String(form.get("valor_sem_cartao")).trim()}`);
    const moedaParaNumero = valor => { const limpo = String(valor || "").trim(); return limpo ? Number(limpo.replace(/\./g, "").replace(",", ".")) : null; };
    const dados = { tipo:form.get("tipo"), sigla:String(form.get("sigla") || "").trim().toUpperCase(), nome:String(form.get("nome") || "").trim(), codigo:String(form.get("codigo") || "").trim(), tempo_jejum:String(form.get("tempo_jejum") || "").trim(), autorizacao:form.get("autorizacao"), anexo:form.get("anexo"), termos:form.get("termos"), link_termo:String(form.get("link_termo") || "").trim(), observacao:[...linhasPreco,...linhasLivres].filter(Boolean).join("\n"), valor_cartao_biofast:moedaParaNumero(form.get("valor_biofast")), valor_sem_cartao:moedaParaNumero(form.get("valor_sem_cartao")) };
    const response = await fetch(`${SUPABASE_URL}/rest/v1/exames?id=eq.${encodeURIComponent(e.id)}`, {method:"PATCH",headers:{...apiHeaders(),"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify(dados)});
    if (!response.ok) { console.error(await response.text()); mostrarToast("O banco bloqueou a edição"); return; }
    const atualizados = await response.json();
    const index = exames.findIndex(item => String(item.id) === String(e.id));
    exames[index] = atualizados[0] || {...e,...dados};
    renderExames(); abrirExame(e.id); mostrarToast("Exame atualizado");
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
  $("listaConvenios").innerHTML = filtrados.map(c => `<button class="convenio-item ${String(c.id) === String(convenioSelecionado) ? "active" : ""}" data-id="${escapeHtml(c.id)}"><strong>${escapeHtml(c.nome)}</strong><small>${escapeHtml(c.categoria || "Convênio")}</small></button>`).join("");
  document.querySelectorAll(".convenio-item").forEach(button => button.addEventListener("click", () => abrirConvenio(button.dataset.id)));
}

function abrirConvenio(id) {
  convenioSelecionado = id;
  const c = convenios.find(item => String(item.id) === String(id));
  renderConvenios();
  const links = parseLinks(c.links_extras);
  const extras = links.map((link, index) => {
    const url = typeof link === "string" ? link : (link.url || link.link || link.site || "");
    const nome = typeof link === "string" ? `Portal adicional ${index + 1}` : (link.nome || link.titulo || link.label || `Portal adicional ${index + 1}`);
    return url ? `<div class="extra-link"><strong>${escapeHtml(nome)}</strong><a href="${escapeHtml(url)}" target="_blank" rel="noopener">Abrir portal ↗</a></div>` : "";
  }).join("");
  $("detalheConvenio").innerHTML = `<div class="convenio-title"><div><span class="eyebrow blue">CONVÊNIO</span><h2>${escapeHtml(c.nome)}</h2><p>${escapeHtml(c.categoria || "")}</p></div><div class="title-actions"><span class="badge ${String(c.ativo) === "true" ? "green" : "red"}">${String(c.ativo) === "true" ? "Ativo" : "Inativo"}</span><button class="action" id="editarConvenio">Editar informações</button></div></div>
    <div class="portal-box"><h3>Portal principal</h3><p>Acesse diretamente o ambiente do convênio.</p>${c.site ? `<a href="${escapeHtml(c.site)}" target="_blank" rel="noopener">Abrir portal ↗</a>` : "Sem portal cadastrado"}</div>
    <div class="credential"><div><small>USUÁRIO</small><strong>${escapeHtml(c.usuario || "Não informado")}</strong></div><button data-copy="${escapeHtml(c.usuario || "")}">Copiar</button></div>
    <div class="credential"><div><small>SENHA</small><strong id="senhaConvenio">••••••••</strong></div><div><button id="mostrarSenha">Mostrar</button> <button data-copy="${escapeHtml(c.senha || "")}">Copiar</button></div></div>
    <div class="credential"><div><small>TELEFONE</small><strong>${escapeHtml(c.telefone || "Não informado")}</strong></div><button data-copy="${escapeHtml(c.telefone || "")}">Copiar</button></div>
    ${c.observacao ? `<div class="credential"><div><small>OBSERVAÇÕES</small><strong>${escapeHtml(c.observacao)}</strong></div></div>` : ""}
    <div class="extra-links"><h3>Outros portais</h3>${extras || "<p>Nenhum link adicional cadastrado.</p>"}</div>
    <form class="edit-form" id="formConvenio" hidden>
      <h3>Editar convênio</h3><div class="form-grid">
        <label class="field"><span>NOME</span><input name="nome" value="${escapeHtml(c.nome || "")}" required></label>
        <label class="field"><span>CATEGORIA</span><input name="categoria" value="${escapeHtml(c.categoria || "")}"></label>
        <label class="field wide"><span>PORTAL PRINCIPAL</span><input name="site" value="${escapeHtml(c.site || "")}" placeholder="https://..."></label>
        <label class="field"><span>USUÁRIO</span><input name="usuario" value="${escapeHtml(c.usuario || "")}"></label>
        <label class="field"><span>SENHA</span><input name="senha" value="${escapeHtml(c.senha || "")}"></label>
        <label class="field"><span>TELEFONE</span><input name="telefone" value="${escapeHtml(c.telefone || "")}"></label>
        <label class="field wide"><span>OBSERVAÇÕES</span><textarea name="observacao">${escapeHtml(c.observacao || "")}</textarea></label>
        <label class="field wide"><span>LINKS EXTRAS (JSON)</span><textarea name="links_extras">${escapeHtml(typeof c.links_extras === "string" ? c.links_extras : JSON.stringify(c.links_extras || []))}</textarea></label>
      </div><div class="form-actions"><button class="primary" type="submit">Salvar alterações</button><button class="action" type="button" id="cancelarEdicaoConvenio">Cancelar</button></div>
    </form>`;
  $("mostrarSenha").addEventListener("click", (event) => { const visible = $("senhaConvenio").textContent !== "••••••••"; $("senhaConvenio").textContent = visible ? "••••••••" : (c.senha || "Não informada"); event.currentTarget.textContent = visible ? "Mostrar" : "Ocultar"; });
  document.querySelectorAll("[data-copy]").forEach(button => button.addEventListener("click", async () => { await navigator.clipboard.writeText(button.dataset.copy); mostrarToast("Copiado"); }));
  $("editarConvenio").addEventListener("click", () => { $("formConvenio").hidden = false; $("formConvenio").scrollIntoView({behavior:"smooth", block:"start"}); });
  $("cancelarEdicaoConvenio").addEventListener("click", () => { $("formConvenio").hidden = true; });
  $("formConvenio").addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let linksExtras;
    try { linksExtras = JSON.parse(form.get("links_extras") || "[]"); } catch { mostrarToast("Links extras precisam estar em formato válido"); return; }
    const dados = { nome:form.get("nome"), categoria:form.get("categoria"), site:form.get("site"), usuario:form.get("usuario"), senha:form.get("senha"), telefone:form.get("telefone"), observacao:form.get("observacao"), links_extras:linksExtras };
    const response = await fetch(`${SUPABASE_URL}/rest/v1/convenios?id=eq.${encodeURIComponent(c.id)}`, {method:"PATCH", headers:{...apiHeaders(),"Content-Type":"application/json","Prefer":"return=representation"}, body:JSON.stringify(dados)});
    if (!response.ok) { console.error(await response.text()); mostrarToast("O banco bloqueou a edição"); return; }
    const atualizados = await response.json();
    const index = convenios.findIndex(item => String(item.id) === String(c.id));
    convenios[index] = atualizados[0] || {...c,...dados};
    renderConvenios(); abrirConvenio(c.id); mostrarToast("Convênio atualizado");
  });
}

function mostrarToast(texto) { $("toast").textContent = texto; $("toast").classList.add("show"); setTimeout(() => $("toast").classList.remove("show"), 1800); }

document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => {
  document.querySelectorAll(".tab,.view").forEach(el => el.classList.remove("active"));
  tab.classList.add("active"); $("view-" + tab.dataset.view).classList.add("active");
}));
$("buscaExame").addEventListener("input", renderExames);
$("filtroAutorizacao").addEventListener("change", renderExames);
$("filtroTipo").addEventListener("change", renderExames);
$("filtroFavoritos").addEventListener("click", () => { somenteFavoritos = !somenteFavoritos; $("filtroFavoritos").classList.toggle("active", somenteFavoritos); $("filtroFavoritos").textContent = somenteFavoritos ? "★ Meus favoritos" : "☆ Meus favoritos"; renderExames(); });
$("buscaConvenio").addEventListener("input", renderConvenios);
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

$("formLogin").addEventListener("submit", async event => {
  event.preventDefault();
  const email = $("loginEmail").value.trim();
  const password = $("loginSenha").value;
  $("btnEntrar").disabled = true;
  $("btnEntrar").textContent = "Entrando...";
  $("loginErro").hidden = true;
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
      podeOperar() ? buscarTabela("convenios", "id,nome,categoria,site,usuario,senha,telefone,observacao,ativo,links_extras") : Promise.resolve([])
    ]);
    await carregarFavoritos();
    exames.sort((a,b) => String(a.sigla).localeCompare(String(b.sigla), "pt-BR"));
    convenios.sort((a,b) => String(a.nome).localeCompare(String(b.nome), "pt-BR"));
    $("loadingExames").textContent = `${exames.length} registros`;
    renderExames(); renderConvenios();
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
