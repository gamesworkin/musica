// ==========================================
// CONFIGURAÇÕES GERAIS E KEYS
// ==========================================
const YOUTUBE_API_KEY = "AIzaSyATXiihPhDZohvy8mJKsAk8vjZ4WkPekmQ"; // Substitua pela sua chave da API do YouTube
const FIREBASE_URL = "https://workin--music-default-rtdb.firebaseio.com/musicas.json"; // Substitua pela URL do seu Realtime Database (com o .json no final nas requisições)

// Autenticação simples em memória
const AUTH_USER = "diegosilvaeo";
const AUTH_PASS = "arcnet2154";

// Estado Global da Aplicação
let bancoMidias = [];
let canaisDinamicos = {};
let categoriaAtual = "";
let subcategoriaAtual = "";
let ytPlayerInstance = null;
let canalSelecionadoProvisorio = null;

// ==========================================
// INICIALIZAÇÃO E CONTROLE DE TELAS
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    configurarEventosLogin();
    configurarEventosInterface();
    configurarEventosAbasAdmin();
    configurarEventosAdmin();
    configurarEventosBuscaCanal();
});

function configurarEventosLogin() {
    const btnLogin = document.getElementById("btn-login");
    const inputUser = document.getElementById("login-user");
    const inputPass = document.getElementById("login-pass");

    btnLogin.addEventListener("click", () => {
        if (inputUser.value === AUTH_USER && inputPass.value === AUTH_PASS) {
            document.getElementById("login-screen").classList.add("hidden");
            document.getElementById("app-container").classList.remove("hidden");
            inicializarSistema();
        } else {
            alert("Usuário ou senha incorretos!");
        }
    });

    inputPass.addEventListener("keypress", (e) => {
        if (e.key === "Enter") btnLogin.click();
    });
}

async function inicializarSistema() {
    await carregarCanaisDinamicos();
    await carregarDadosFirebase();
    renderizarMenuLateral();
    exibirMosaicoInicial();
}

// ==========================================
// INTEGRAÇÃO COM FIREBASE (CARGA E SALVAMENTO)
// ==========================================
async function carregarDadosFirebase() {
    try {
        const response = await fetch(`${FIREBASE_URL}/midias.json`);
        const dados = await response.json();
        bancoMidias = [];
        if (dados) {
            // Converte o objeto do Firebase em array mantendo a chave idêntica do Firebase (ID)
            Object.keys(dados).forEach(key => {
                if (dados[key]) {
                    bancoMidias.push({ idFirebase: key, ...dados[key] });
                }
            });
        }
    } catch (error) {
        console.error("Erro ao carregar dados do Firebase:", error);
    }
}

async function carregarCanaisDinamicos() {
    try {
        const response = await fetch(`${FIREBASE_URL}/canais_dinamicos.json`);
        const dados = await response.json();
        canaisDinamicos = dados || {};
    } catch (error) {
        console.error("Erro ao carregar canais dinâmicos:", error);
    }
}

async function salvarMidiaNoFirebase(novaMidia) {
    try {
        await fetch(`${FIREBASE_URL}/midias.json`, {
            method: "POST",
            body: JSON.stringify(novaMidia),
            headers: { "Content-Type": "application/json" }
        });
        await inicializarSistema();
    } catch (error) {
        alert("Erro ao salvar mídia no Firebase.");
    }
}

// ==========================================
// MECANISMO DE CANAIS DINÂMICOS (YOUTUBE API)
// ==========================================
function configurarEventosBuscaCanal() {
    const btnSearchChannel = document.getElementById("btn-search-channel");
    const searchChannelInput = document.getElementById("search-channel-input");
    const btnSaveChannelLink = document.getElementById("btn-save-channel-link");

    btnSearchChannel.addEventListener("click", async () => {
        const termo = searchChannelInput.value.trim();
        if (!termo) return alert("Digite o nome de um canal para pesquisar.");

        try {
            // Busca o canal por nome textualmente usando a API do YouTube
            const urlSearch = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(termo)}&key=${YOUTUBE_API_KEY}`;
            const res = await fetch(urlSearch);
            const data = await res.json();

            if (!data.items || data.items.length === 0) {
                alert("Nenhum canal correspondente encontrado no YouTube.");
                return;
            }

            const item = data.items[0];
            canalSelecionadoProvisorio = {
                channelId: item.snippet.channelId,
                title: item.snippet.title,
                thumb: item.snippet.thumbnails.default.url,
                description: item.snippet.description
            };

            // Atualiza a pré-visualização na interface
            document.getElementById("chan-thumb").src = canalSelecionadoProvisorio.thumb;
            document.getElementById("chan-title-text").innerText = canalSelecionadoProvisorio.title;
            document.getElementById("chan-desc-text").innerText = canalSelecionadoProvisorio.description || "Sem descrição disponível.";
            document.getElementById("channel-preview").style.display = "flex";

        } catch (err) {
            console.error(err);
            alert("Erro ao consultar a API do YouTube.");
        }
    });

    btnSaveChannelLink.addEventListener("click", async () => {
        const categoriaDestino = document.getElementById("channel-target-category").value.trim();
        if (!canalSelecionadoProvisorio) return alert("Busque e selecione um canal primeiro.");
        if (!categoriaDestino) return alert("Especifique a categoria em que o canal será inserido.");

        try {
            // Captura o ID da playlist contendo todos os uploads do canal de forma otimizada
            const urlDetails = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${canalSelecionadoProvisorio.channelId}&key=${YOUTUBE_API_KEY}`;
            const resDetails = await fetch(urlDetails);
            const dataDetails = await resDetails.json();
            
            let uploadsListId = canalSelecionadoProvisorio.channelId.replace(/^UC/, "UU"); 
            if (dataDetails.items && dataDetails.items[0].contentDetails.relatedPlaylists.uploads) {
                uploadsListId = dataDetails.items[0].contentDetails.relatedPlaylists.uploads;
            }

            const payload = {
                channelId: canalSelecionadoProvisorio.channelId,
                uploadsPlaylistId: uploadsListId,
                title: canalSelecionadoProvisorio.title,
                thumb: canalSelecionadoProvisorio.thumb
            };

            // Salva a amarração do canal associado à categoria desejada
            // Sanitiza o nome da categoria para evitar problemas de nós no Firebase
            const nodeName = btoa(unescape(encodeURIComponent(categoriaDestino))).replace(/=/g, "");
            await fetch(`${FIREBASE_URL}/canais_dinamicos/${nodeName}.json`, {
                method: "SET",
                body: JSON.stringify(payload)
            });

            alert(`Canal "${canalSelecionadoProvisorio.title}" vinculado com sucesso à categoria "${categoriaDestino}"!`);
            
            // Reseta campos da aba
            document.getElementById("channel-preview").style.display = "none";
            document.getElementById("search-channel-input").value = "";
            document.getElementById("channel-target-category").value = "";
            canalSelecionadoProvisorio = null;

            await inicializarSistema();

        } catch (err) {
            console.error(err);
            alert("Erro ao salvar vínculo dinâmico no Firebase.");
        }
    });
}

// Captura os 15 vídeos mais novos de uma playlist de uploads diretamente da API do YouTube
async function buscarVideosRecentesDoCanal(playlistId) {
    try {
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=15&playlistId=${playlistId}&key=${YOUTUBE_API_KEY}`;
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.items) return [];
        return data.items.map(item => ({
            título: item.snippet.title,
            link: `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
            capa: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : (item.snippet.thumbnails.high ? item.snippet.thumbnails.high.url : item.snippet.thumbnails.default.url),
            categoria: "", 
            subcategoria: "Vídeos Recentes",
            isDinâmico: true
        }));
    } catch (e) {
        console.error("Erro ao buscar vídeos dinâmicos:", e);
        return [];
    }
}

// ==========================================
// RENDERIZAÇÃO DA INTERFACE (MENU LATERAL E MOSAICO)
// ==========================================
function renderizarMenuLateral() {
    const sidebarTree = document.getElementById("sidebar-tree");
    sidebarTree.innerHTML = "";

    // Agrupa categorias e subcategorias estáticas do Firebase
    const estrutura = {};
    bancoMidias.forEach(midia => {
        if (!estrutura[midia.categoria]) estrutura[midia.categoria] = new Set();
        if (midia.subcategoria) estrutura[midia.categoria].add(midia.subcategoria);
    });

    // Mescla as categorias que possuem canais dinâmicos acoplados
    Object.keys(canaisDinamicos).forEach(encodedKey => {
        try {
            const catNome = decodeURIComponent(escape(atob(encodedKey)));
            if (!estrutura[catNome]) estrutura[catNome] = new Set();
            estrutura[catNome].add("Vídeos Recentes"); // Injeta visualmente a subcategoria automatizada
        } catch(e){}
    });

    // Monta o menu em árvore (Accordion)
    Object.keys(estrutura).sort().forEach(cat => {
        const liCat = document.createElement("li");
        
        const toggleSpan = document.createElement("span");
        toggleSpan.className = "category-toggle";
        toggleSpan.innerHTML = `<i class="fas fa-folder"></i> ${cat}`;
        toggleSpan.addEventListener("click", () => selecionarCategoria(cat));
        liCat.appendChild(toggleSpan);

        const ulSub = document.createElement("ul");
        ulSub.className = "tree-sub";

        const subs = Array.from(estrutura[cat]).sort();
        subs.forEach(sub => {
            const liSub = document.createElement("li");
            liSub.innerHTML = sub === "Vídeos Recentes" ? `<i class="fas fa-sync text-red"></i> <b>${sub}</b>` : `<i class="fas fa-folder-open"></i> ${sub}`;
            liSub.addEventListener("click", (e) => {
                e.stopPropagation();
                selecionarSubcategoria(cat, sub);
            });
            ulSub.appendChild(liSub);
        });

        liCat.appendChild(ulSub);
        sidebarTree.appendChild(liCat);
    });
}

async function selecionarCategoria(cat) {
    categoriaAtual = cat;
    subcategoriaAtual = "";
    atualizarBreadcrumb();

    let listagemExibicao = bancoMidias.filter(m => m.categoria === cat);

    // Se a categoria possuir um canal dinâmico vinculado, busca os vídeos via API para mesclar na exibição
    const nodeName = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "");
    if (canaisDinamicos[nodeName]) {
        const videosDinamicos = await buscarVideosRecentesDoCanal(canaisDinamicos[nodeName].uploadsPlaylistId);
        listagemExibicao = [...videosDinamicos, ...listagemExibicao];
    }

    renderizarMosaico(listagemExibicao);
}

async function selecionarSubcategoria(cat, sub) {
    categoriaAtual = cat;
    subcategoriaAtual = sub;
    atualizarBreadcrumb();

    if (sub === "Vídeos Recentes") {
        const nodeName = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "");
        if (canaisDinamicos[nodeName]) {
            const videosDinamicos = await buscarVideosRecentesDoCanal(canaisDinamicos[nodeName].uploadsPlaylistId);
            renderizarMosaico(videosDinamicos);
        } else {
            renderizarMosaico([]);
        }
    } else {
        const filtradas = bancoMidias.filter(m => m.categoria === cat && m.subcategoria === sub);
        renderizarMosaico(filtradas);
    }
}

function renderizarMosaico(lista) {
    const grid = document.getElementById("mosaic-grid");
    grid.innerHTML = "";

    if (lista.length === 0) {
        grid.innerHTML = `<p style="padding:1rem; color:var(--text-muted);">Nenhuma mídia cadastrada nesta seção.</p>`;
        return;
    }

    lista.forEach(midia => {
        const card = document.createElement("div");
        card.className = "card";
        
        // Define o tipo de selo no mosaico
        let badgeText = "LINK";
        if (midia.isDinâmico) badgeText = "BÚSSOLA";
        else if (midia.link.includes("youtube.com") || midia.link.includes("youtu.be")) badgeText = "YOUTUBE";
        else if (midia.link.includes("archive.org")) badgeText = "ARCHIVE";
        else if (midia.link.match(/\.(mp4|mkv|webm|ogg)$/i)) badgeText = "DIRETO";

        card.innerHTML = `
            <span class="media-type-badge">${badgeText}</span>
            <img src="${midia.capa || 'https://placehold.co/160x90?text=Sem+Capa'}" alt="Capa" onerror="this.src='https://placehold.co/160x90?text=Erro+Capa'">
            <h4>${midia.título}</h4>
        `;

        // Botão de Edição Rápida (Apenas para mídias estáticas salvas no Firebase)
        if (!midia.isDinâmico) {
            const editBtn = document.createElement("div");
            editBtn.className = "quick-edit-badge";
            editBtn.innerHTML = `<i class="fas fa-pencil-alt"></i>`;
            editBtn.title = "Editar esta mídia";
            editBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                abrirModalEdicaoAvancada(midia);
            });
            card.appendChild(editBtn);
        }

        card.addEventListener("click", () => iniciarReproducao(midia));
        grid.appendChild(card);
    });
}

function exibirMosaicoInicial() {
    // Exibe as últimas 24 mídias adicionadas no Firebase por padrão na home
    const ultimas = [...bancoMidias].reverse().slice(0, 24);
    renderizarMosaico(ultimas);
}

// ==========================================
// REPRODUTOR MULTI-ENGINE TRIPO INTEGRADO
// ==========================================
function iniciarReproducao(midia) {
    const container = document.getElementById("player-container");
    const ytIframe = document.getElementById("yt-player");
    const universalPlayer = document.getElementById("universal-player");
    const rawPlayer = document.getElementById("raw-player");
    const titleTrack = document.getElementById("current-track-title");

    // Reseta todos os players antes da carga
    container.classList.remove("hidden");
    ytIframe.classList.add("hidden");
    universalPlayer.classList.add("hidden");
    rawPlayer.classList.add("hidden");
    
    // Para vídeos em HTML5 brutos tocando de fundo
    rawPlayer.pause();
    rawPlayer.src = "";

    titleTrack.innerText = midia.título;

    const url = midia.link.trim();
    const ytId = extrairIdYouTube(url);

    if (ytId) {
        // Engine 1: Player de Iframe Oficial do YouTube (permite controle programático futuro)
        ytIframe.classList.remove("hidden");
        if (ytPlayerInstance) {
            ytPlayerInstance.loadVideoById(ytId);
        } else {
            ytPlayerInstance = new YT.Player('yt-player', {
                videoId: ytId,
                playerVars: { 'autoplay': 1, 'playsinline': 1 }
            });
        }
    } else if (url.match(/\.(mp4|mkv|webm|ogg)$/i)) {
        // Engine 3: Player Nativo HTML5 para links brutos (.mp4, .mkv, etc)
        rawPlayer.classList.remove("hidden");
        rawPlayer.src = url;
        rawPlayer.play();
    } else {
        // Engine 2: Player Universal Embed Tradicional (Archive.org, embeds externos, etc)
        universalPlayer.classList.remove("hidden");
        let finalEmbed = url;
        if (url.includes("archive.org/details/")) {
            finalEmbed = url.replace("archive.org/details/", "archive.org/embed/");
        }
        universalPlayer.src = finalEmbed;
    }
    
    container.scrollIntoView({ behavior: 'smooth' });
}

function extrairIdYouTube(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// ==========================================
// CAPTURA AUTOMÁTICA DE DADOS DE VÍDEO
// ==========================================
async function capturarDadosPorUrl(url) {
    const ytId = extrairIdYouTube(url);
    if (ytId) {
        try {
            const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ytId}&key=${YOUTUBE_API_KEY}`);
            const data = await res.json();
            if (data.items && data.items.length > 0) {
                const snippet = data.items[0].snippet;
                return {
                    título: snippet.title,
                    capa: snippet.thumbnails.medium ? snippet.thumbnails.medium.url : snippet.thumbnails.default.url
                };
            }
        } catch (e) { console.error("Falha ao capturar metadados do YouTube:", e); }
    }
    
    if (url.includes("archive.org/details/")) {
        const itemID = url.split("/details/")[1].split("/")[0];
        return {
            título: itemID.replace(/-/g, " "),
            capa: `https://archive.org/services/img/${itemID}`
        };
    }

    if (url.match(/\.(mp4|mkv|webm|ogg)$/i)) {
        const nomeArquivo = url.substring(url.lastIndexOf('/') + 1);
        return {
            título: decodeURIComponent(nomeArquivo).replace(/\.[^/.]+$/, ""),
            capa: "https://placehold.co/120x90/111/fff?text=Video+Link"
        };
    }

    return { título: "", capa: "" };
}

// ==========================================
// SISTEMA DE EDIÇÃO AVANÇADA (MODAL INTERNO)
// ==========================================
let midiaEmEdicaoGlobal = null;
function abrirModalEdicaoAvancada(midia) {
    midiaEmEdicaoGlobal = midia;
    document.getElementById("edit-field-title").value = midia.título || "";
    document.getElementById("edit-field-link").value = midia.link || "";
    document.getElementById("edit-field-capa").value = midia.capa || "";
    document.getElementById("edit-field-category").value = midia.categoria || "";
    document.getElementById("edit-field-subcategory").value = midia.subcategoria || "";
    document.getElementById("edit-media-modal").classList.remove("hidden");
}

function fecharModalEdicaoAvancada() {
    midiaEmEdicaoGlobal = null;
    document.getElementById("edit-media-modal").classList.add("hidden");
}

// ==========================================
// EVENTOS DOS COMPONENTES E MENUS
// ==========================================
function configurarEventosInterface() {
    // Menu Responsivo Lateral
    const toggleSidebar = document.getElementById("toggle-sidebar");
    const sidebar = document.getElementById("sidebar");
    
    toggleSidebar.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        sidebar.classList.toggle("collapsed");
    });

    // Fechar Reprodutor
    document.getElementById("btn-close-player").addEventListener("click", () => {
        document.getElementById("player-container").classList.add("hidden");
        if(ytPlayerInstance) ytPlayerInstance.stopVideo();
        document.getElementById("raw-player").pause();
        document.getElementById("universal-player").src = "";
    });

    // Breadcrumb Home
    document.getElementById("bc-root").addEventListener("click", () => {
        categoriaAtual = ""; subcategoriaAtual = "";
        atualizarBreadcrumb();
        exibirMosaicoInicial();
    });

    // Busca interna em tempo real
    document.getElementById("search-internal-input").addEventListener("input", (e) => {
        const termo = e.target.value.toLowerCase();
        if(!termo) { exibirMosaicoInicial(); return; }
        const filtradas = bancoMidias.filter(m => 
            m.título.toLowerCase().includes(termo) || 
            m.categoria.toLowerCase().includes(termo) || 
            m.subcategoria.toLowerCase().includes(termo)
        );
        renderizarMosaico(filtradas);
    });

    // Pesquisa Direta no Global do YouTube
    document.getElementById("search-yt-input").addEventListener("keypress", async (e) => {
        if (e.key === "Enter") {
            const query = e.target.value.trim();
            if (!query) return;
            
            categoriaAtual = ""; subcategoriaAtual = "";
            document.getElementById("bc-category").classList.add("hidden");
            document.getElementById("bc-subcategory").classList.add("hidden");
            const bcSearch = document.getElementById("bc-search");
            bcSearch.classList.remove("hidden");
            bcSearch.querySelector(".txt").innerText = `"${query}" no YouTube`;

            try {
                const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(query)}&type=video&key=${YOUTUBE_API_KEY}`;
                const res = await fetch(url);
                const data = await res.json();
                
                const resultados = data.items.map(item => ({
                    título: item.snippet.title,
                    link: `https://www.youtube.com/watch?v=${item.id.videoId}`,
                    capa: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : item.snippet.thumbnails.default.url,
                    categoria: "Resultados de Busca",
                    subcategoria: ""
                }));
                renderizarMosaico(resultados);
            } catch (err) { alert("Erro ao pesquisar no YouTube."); }
        }
    });

    // Botão Sair (Logout)
    document.getElementById("btn-logout").addEventListener("click", () => {
        document.getElementById("app-container").classList.add("hidden");
        document.getElementById("login-screen").classList.remove("hidden");
        document.getElementById("login-user").value = "";
        document.getElementById("login-pass").value = "";
    });

    // Eventos do Modal Avançado de Edição
    document.getElementById("btn-cancel-edit-media").addEventListener("click", fecharModalEdicaoAvancada);
    document.getElementById("btn-submit-edit-media").addEventListener("click", async () => {
        if (!midiaEmEdicaoGlobal || !midiaEmEdicaoGlobal.idFirebase) return;
        
        const payloadAtualizado = {
            título: document.getElementById("edit-field-title").value.trim(),
            link: document.getElementById("edit-field-link").value.trim(),
            capa: document.getElementById("edit-field-capa").value.trim(),
            categoria: document.getElementById("edit-field-category").value.trim(),
            subcategoria: document.getElementById("edit-field-subcategory").value.trim()
        };

        if(!payloadAtualizado.título || !payloadAtualizado.link || !payloadAtualizado.categoria) {
            return alert("Título, Link e Categoria são obrigatórios.");
        }

        try {
            await fetch(`${FIREBASE_URL}/midias/${midiaEmEdicaoGlobal.idFirebase}.json`, {
                method: "PUT",
                body: JSON.stringify(payloadAtualizado)
            });
            alert("Mídia atualizada com sucesso!");
            fecharModalEdicaoAvancada();
            await inicializarSistema();
            if(categoriaAtual) selecionarCategoria(categoriaAtual);
        } catch (err) { alert("Erro ao salvar alterações no Firebase."); }
    });
}

function configurarEventosAbasAdmin() {
    const tabs = document.querySelectorAll(".tab-btn");
    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            tab.classList.add("active");
            
            document.querySelectorAll(".tab-content").forEach(content => content.classList.add("hidden"));
            const target = tab.getAttribute("data-tab");
            document.getElementById(target).classList.remove("hidden");

            if (target === "manage-tab") renderizarArvoreCrudGerencial();
        });
    });
}

function configurarEventosAdmin() {
    const adminModal = document.getElementById("admin-modal");
    document.getElementById("btn-open-admin").addEventListener("click", () => adminModal.classList.remove("hidden"));
    document.getElementById("btn-close-admin").addEventListener("click", () => adminModal.classList.add("hidden"));

    // Capturar dados manualmente na inserção
    const manualMediaUrl = document.getElementById("manual-media-url");
    document.getElementById("btn-fetch-manual").addEventListener("click", async () => {
        const url = manualMediaUrl.value.trim();
        if(!url) return alert("Cole uma URL primeiro!");
        const dados = await capturarDadosPorUrl(url);
        document.getElementById("prev-title").value = dados.título;
        document.getElementById("prev-thumb").src = dados.capa || "https://placehold.co/120x90?text=Sem+Capa";
    });

    // Salvar nova mídia manual
    document.getElementById("btn-save-media").addEventListener("click", async () => {
        const url = manualMediaUrl.value.trim();
        const titulo = document.getElementById("prev-title").value.trim();
        const capa = document.getElementById("prev-thumb").src;
        const categoria = document.getElementById("media-category").value.trim();
        const subcategoria = document.getElementById("media-subcategory").value.trim();

        if(!url || !titulo || !categoria) return alert("Por favor preencha todos os campos obrigatórios (Link, Título e Categoria).");

        const novaMidia = { título, link: url, capa, categoria, subcategoria };
        await salvarMidiaNoFirebase(novaMidia);
        
        alert("Mídia cadastrada com sucesso!");
        manualMediaUrl.value = "";
        document.getElementById("prev-title").value = "";
        document.getElementById("prev-thumb").src = "https://placehold.co/120x90?text=Sem+Capa";
    });

    // Exportação Completa de Backup JSON
    document.getElementById("btn-export-json").addEventListener("click", () => {
        // Remove ids temporários do Firebase para exportação limpa
        const dadosLimpos = bancoMidias.map(({ idFirebase, ...rest }) => rest);
        const blob = new Blob([JSON.stringify(dadosLimpos, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `backup_streamhub_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
    });

    // Processamento de Código JSON colado via caixa de texto
    document.getElementById("btn-process-code").addEventListener("click", async () => {
        const campoTexto = document.getElementById("import-json-code");
        const stringCodigo = campoTexto.value.trim();
        if (!stringCodigo) return alert("Cole um código JSON válido na caixa primeiro.");

        try {
            const objetoInjetado = JSON.parse(stringCodigo);
            const arrayImportar = Array.isArray(objetoInjetado) ? objetoInjetado : [objetoInjetado];

            if (confirm(`Deseja processar e importar ${arrayImportar.length} mídias inseridas em lote via código?`)) {
                for (const midia of arrayImportar) {
                    if (midia.título && midia.link && midia.categoria) {
                        const payload = {
                            título: midia.título,
                            link: midia.link,
                            capa: midia.capa || midia.thumbnail || "https://placehold.co/120x90?text=Import",
                            categoria: midia.categoria,
                            subcategoria: midia.subcategoria || ""
                        };
                        await fetch(`${FIREBASE_URL}/midias.json`, {
                            method: "POST",
                            body: JSON.stringify(payload),
                            headers: { "Content-Type": "application/json" }
                        });
                    }
                }
                alert("Código JSON processado e mídias integradas com sucesso!");
                campoTexto.value = "";
                await inicializarSistema();
            }
        } catch (e) {
            alert("Erro de sintaxe no JSON colado. Verifique as aspas e chaves do código.");
        }
    });

    // Importação via arquivo físico .json
    const fileInput = document.getElementById("import-json-file");
    document.getElementById("btn-trigger-import").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const lista = JSON.parse(evt.target.result);
                if (Array.isArray(lista)) {
                    if(confirm(`Deseja importar em lote ${lista.length} mídias deste arquivo de backup?`)) {
                        for (const item of lista) {
                            if(item.título && item.link && item.categoria) {
                                await fetch(`${FIREBASE_URL}/midias.json`, {
                                    method: "POST",
                                    body: JSON.stringify(item),
                                    headers: { "Content-Type": "application/json" }
                                });
                            }
                        }
                        alert("Carga em lote importada com sucesso!");
                        await inicializarSistema();
                    }
                } else { alert("O arquivo JSON de backup deve ser uma lista de mídias estruturada."); }
            } catch(err) { alert("Erro ao decodificar arquivo JSON."); }
        };
        reader.readAsText(file);
    });
}

function atualizarBreadcrumb() {
    const bcCat = document.getElementById("bc-category");
    const bcSub = document.getElementById("bc-subcategory");
    document.getElementById("bc-search").classList.add("hidden");

    if (categoriaAtual) {
        bcCat.classList.remove("hidden");
        bcCat.querySelector(".txt").innerText = categoriaAtual;
    } else {
        bcCat.classList.add("hidden");
    }

    if (subcategoriaAtual) {
        bcSub.classList.remove("hidden");
        bcSub.querySelector(".txt").innerText = subcategoriaAtual;
    } else {
        bcSub.classList.add("hidden");
    }
}

// ==========================================
// MONITORAMENTO E CRUD GERENCIAL NA ABA 3
// ==========================================
function renderizarArvoreCrudGerencial() {
    const container = document.getElementById("crud-tree-list");
    container.innerHTML = "";

    // Agrupa hierarquicamente em memória
    const organizacao = {};
    bancoMidias.forEach(midia => {
        if (!organizacao[midia.categoria]) organizacao[midia.categoria] = {};
        const subKey = midia.subcategoria || "_sem_sub";
        if (!organizacao[midia.categoria][subKey]) organizacao[midia.categoria][subKey] = [];
        organizacao[midia.categoria][subKey].push(midia);
    });

    const catsOrdenadas = Object.keys(organizacao).sort();

    if (catsOrdenadas.length === 0 && Object.keys(canaisDinamicos).length === 0) {
        container.innerHTML = `<p style="font-size:0.85rem; color:var(--text-muted);">Nenhum dado salvo no Firebase atualmente.</p>`;
        return;
    }

    // Renderiza mídias e ramos cadastrados
    catsOrdenadas.forEach(cat => {
        const itemCat = document.createElement("div");
        itemCat.className = "crud-item";
        itemCat.innerHTML = `<span><i class="fas fa-folder text-red"></i> <b>CATEGORIA: ${cat}</b></span>`;
        
        const actionsCat = document.createElement("div");
        actionsCat.className = "crud-actions";
        
        const btnDelCat = document.createElement("button");
        btnDelCat.className = "crud-btn btn-del";
        btnDelCat.innerHTML = `<i class="fas fa-trash"></i> Excluir Categoria`;
        btnDelCat.addEventListener("click", () => deletarBlocoDoFirebase("categoria", cat));
        
        actionsCat.appendChild(btnDelCat);
        itemCat.appendChild(actionsCat);
        container.appendChild(itemCat);

        // Exibe se há um canal dinâmico mapeado a esta categoria
        const nodeName = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "");
        if (canaisDinamicos[nodeName]) {
            const itemCanalVinculado = document.createElement("div");
            itemCanalVinculado.className = "crud-item sub-level";
            itemCanalVinculado.style.borderLeft = "3px solid #8e44ad";
            itemCanalVinculado.innerHTML = `<span><i class="fas fa-sync text-red"></i> Subcategoria Conectada: <b>Vídeos Recentes (Canal: ${canaisDinamicos[nodeName].title})</b></span>`;
            
            const actionChan = document.createElement("div");
            actionChan.className = "crud-actions";
            const btnDelChan = document.createElement("button");
            btnDelChan.className = "crud-btn btn-del";
            btnDelChan.style.background = "#8e44ad";
            btnDelChan.innerHTML = `<i class="fas fa-unlink"></i> Desconectar Canal`;
            btnDelChan.addEventListener("click", () => deletarBlocoDoFirebase("canal_dinamico", nodeName, canaisDinamicos[nodeName].title));
            
            actionChan.appendChild(btnDelChan);
            itemCanalVinculado.appendChild(actionChan);
            container.appendChild(itemCanalVinculado);
        }

        // Subcategorias e faixas
        Object.keys(organizacao[cat]).sort().forEach(sub => {
            if (sub !== "_sem_sub") {
                const itemSub = document.createElement("div");
                itemSub.className = "crud-item sub-level";
                itemSub.innerHTML = `<span><i class="fas fa-folder-open" style="color:var(--accent);"></i> Subcategoria: ${sub}</span>`;
                
                const actionsSub = document.createElement("div");
                actionsSub.className = "crud-actions";
                
                const btnDelSub = document.createElement("button");
                btnDelSub.className = "crud-btn btn-del";
                btnDelSub.innerHTML = `<i class="fas fa-folder-minus"></i> Limpar Sub`;
                btnDelSub.addEventListener("click", () => deletarBlocoDoFirebase("subcategoria", { cat, sub }));
                
                actionsSub.appendChild(btnDelSub);
                itemSub.appendChild(actionsSub);
                container.appendChild(itemSub);
            }

            organizacao[cat][sub].forEach(midia => {
                const itemTrack = document.createElement("div");
                itemTrack.className = "crud-item track-level";
                itemTrack.innerHTML = `<span><i class="fab fa-youtube text-muted"></i> ${midia.título}</span>`;
                
                const actionsTrack = document.createElement("div");
                actionsTrack.className = "crud-actions";
                
                const btnEditT = document.createElement("button");
                btnEditT.className = "crud-btn btn-edit";
                btnEditT.innerHTML = `<i class="fas fa-edit"></i>`;
                btnEditT.addEventListener("click", () => abrirModalEdicaoAvancada(midia));

                const btnDelT = document.createElement("button");
                btnDelT.className = "crud-btn btn-del";
                btnDelT.innerHTML = `<i class="fas fa-times"></i>`;
                btnDelT.addEventListener("click", () => deletarBlocoDoFirebase("midia_unica", midia.idFirebase));
                
                actionsTrack.appendChild(btnEditT);
                actionsTrack.appendChild(btnDelT);
                itemTrack.appendChild(actionsTrack);
                container.appendChild(itemTrack);
            });
        });
    });

    // Exibe canais dinâmicos órfãos (que estão cadastrados mas a categoria estática ainda não tem vídeos manuais salvos no Firebase)
    Object.keys(canaisDinamicos).forEach(encodedKey => {
        try {
            const catNome = decodeURIComponent(escape(atob(encodedKey)));
            if (!organizacao[catNome]) {
                const itemOrfao = document.createElement("div");
                itemOrfao.className = "crud-item";
                itemOrfao.innerHTML = `<span><i class="fas fa-folder text-red"></i> <b>CATEGORIA (DINÂMICA): ${catNome}</b></span>`;
                container.appendChild(itemOrfao);

                const itemChan = document.createElement("div");
                itemChan.className = "crud-item sub-level";
                itemChan.style.borderLeft = "3px solid #8e44ad";
                itemChan.innerHTML = `<span><i class="fas fa-sync text-red"></i> Subcategoria Conectada: <b>Vídeos Recentes (Canal: ${canaisDinamicos[encodedKey].title})</b></span>`;
                
                const actionChan = document.createElement("div");
                actionChan.className = "crud-actions";
                const btnDelChan = document.createElement("button");
                btnDelChan.className = "crud-btn btn-del";
                btnDelChan.style.background = "#8e44ad";
                btnDelChan.innerHTML = `<i class="fas fa-unlink"></i> Desconectar Canal`;
                btnDelChan.addEventListener("click", () => deletarBlocoDoFirebase("canal_dinamico", encodedKey, canaisDinamicos[encodedKey].title));
                
                actionChan.appendChild(btnDelChan);
                itemChan.appendChild(actionChan);
                container.appendChild(itemChan);
            }
        } catch(e){}
    });
}

async function deletarBlocoDoFirebase(tipo, payload, detalheAdicional = "") {
    let confirmacao = false;
    let targetsParaApagar = [];

    if (tipo === "midia_unica") {
        if (confirm("Tem certeza de que deseja remover esta mídia específica do Firebase?")) {
            targetsParaApagar.push(`${FIREBASE_URL}/midias/${payload}.json`);
        }
    } 
    else if (tipo === "canal_dinamico") {
        if (confirm(`Deseja desconectar a sincronização automática do canal "${detalheAdicional}" desta categoria?`)) {
            targetsParaApagar.push(`${FIREBASE_URL}/canais_dinamicos/${payload}.json`);
        }
    }
    else if (tipo === "subcategoria") {
        if (confirm(`Deseja deletar TODAS as mídias salvas sob a subcategoria "${payload.sub}?"`)) {
            bancoMidias.forEach(m => {
                if (m.categoria === payload.cat && m.subcategoria === payload.sub) {
                    targetsParaApagar.push(`${FIREBASE_URL}/midias/${m.idFirebase}.json`);
                }
            });
        }
    } 
    else if (tipo === "categoria") {
        if (confirm(`ATENÇÃO: Deseja apagar a Categoria completa "${payload}" (Isso removerá todas as mídias físicas dela e desconectará canais dinâmicos acoplados)?`)) {
            // Varre mídias estáticas
            bancoMidias.forEach(m => {
                if (m.categoria === payload) {
                    targetsParaApagar.push(`${FIREBASE_URL}/midias/${m.idFirebase}.json`);
                }
            });
            // Varre canais dinâmicos associados
            const nodeName = btoa(unescape(encodeURIComponent(payload))).replace(/=/g, "");
            if (canaisDinamicos[nodeName]) {
                targetsParaApagar.push(`${FIREBASE_URL}/canais_dinamicos/${nodeName}.json`);
            }
        }
    }

    if (targetsParaApagar.length > 0) {
        try {
            // Executa as deleções sequencialmente de forma limpa no endpoint
            for (const url of targetsParaApagar) {
                await fetch(url, { method: "DELETE" });
            }
            alert("Operação de remoção concluída com sucesso!");
            
            // Força reset de visões
            categoriaAtual = ""; subcategoriaAtual = "";
            atualizarBreadcrumb();
            
            await inicializarSistema();
            renderujaAbasEstaticasNaInterfaceAtiva();
        } catch (e) {
            alert("Ocorreu um erro ao processar a exclusão.");
        }
    }
}

function renderujaAbasEstaticasNaInterfaceAtiva() {
    const painelManage = document.getElementById("manage-tab");
    if (painelManage && !painelManage.classList.contains("hidden")) {
        renderizarArvoreCrudGerencial();
    }
}
