// ==========================================
// CONFIGURAÇÕES GERAIS E KEYS
// ==========================================
const CONFIG = {
    YT_API_KEY: "AIzaSyATXiihPhDZohvy8mJKsAk8vjZ4WkPekmQ", 
    FIREBASE_URL: "https://workin--music-default-rtdb.firebaseio.com/midias.json" 
};

// Configuração Multi-utilizador com cores padrão nativas
const USERS_DATABASE = {
    "admin": { password: "123", defaultColor: "#3498db" },
    "admin2": { password: "456", defaultColor: "#e74c3c" }
};

// Estado Global da Aplicação
let currentUser = "";
let database = [];
let canaisDinamicos = {};
let currentView = 'categories'; 
let selectedCategory = '';
let selectedSubcategory = '';
let currentPlaylist = [];
let currentTrackIndex = 0;
let ytPlayer = null;
let lastYtSearchResults = []; 
let activeEditingIndex = null;
let canalSelecionadoProvisorio = null;

let expandedCrudCats = {};
let expandedCrudSubs = {};

// Funções utilitárias para rotas dinâmicas do Firebase
function obterUrlNodoItem(idItem = null) {
    let urlSemJson = CONFIG.FIREBASE_URL.replace(".json", "");
    return idItem ? `${urlSemJson}/${idItem}.json` : CONFIG.FIREBASE_URL;
}

function obterUrlBaseCanais() {
    let urlObjeto = new URL(CONFIG.FIREBASE_URL);
    return `${urlObjeto.origin}/canais_dinamicos.json`;
}

function obterUrlCanalIndividual(nodeName) {
    let urlObjeto = new URL(CONFIG.FIREBASE_URL);
    return `${urlObjeto.origin}/canais_dinamicos/${nodeName}.json`;
}

// ==========================================
// MOTOR DE CORES DO TEMA DO UTILIZADOR
// ==========================================
function aplicarCorTema(hexColor) {
    document.documentElement.style.setProperty('--theme-color', hexColor);
    
    let num = parseInt(hexColor.replace("#",""), 16);
    let r = (num >> 16) - 20;
    let g = ((num >> 8) & 0x00FF) - 20;
    let b = (num & 0x0000FF) - 20;
    r = r < 0 ? 0 : r; g = g < 0 ? 0 : g; b = b < 0 ? 0 : b;
    let hexHover = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    
    document.documentElement.style.setProperty('--theme-color-hover', hexHover);
    
    const txtHex = document.getElementById('theme-color-hex');
    if(txtHex) txtHex.innerText = hexColor.toUpperCase();
}

function carregarTemaDoUsuarioLogado(usuario) {
    let corSalva = localStorage.getItem(`streamhub_theme_${usuario}`);
    if(corSalva) {
        aplicarCorTema(corSalva);
        posicionarSetaPelaCor(corSalva);
    } else {
        let corPadrao = USERS_DATABASE[usuario] ? USERS_DATABASE[usuario].defaultColor : "#3498db";
        aplicarCorTema(corPadrao);
        posicionarSetaPelaCor(corPadrao);
    }
}

// ==========================================
// 1. AUTENTICAÇÃO COM SESSÃO E ENTER
// ==========================================
function checkSession() {
    const loginData = localStorage.getItem('streamhub_session');
    if (loginData) {
        const session = JSON.parse(loginData);
        if (Date.now() - session.timestamp < 2 * 60 * 60 * 1000) {
            currentUser = session.user;
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            carregarTemaDoUsuarioLogado(currentUser);
            initApp();
            return;
        }
    }
    handleLogoutActions();
}

function configurarEventosLogin() {
    const inputUser = document.getElementById('login-user');
    const inputPass = document.getElementById('login-pass');
    const btnLogin = document.getElementById('btn-login');

    if (inputUser) {
        const cloneUser = inputUser.cloneNode(true);
        inputUser.parentNode.replaceChild(cloneUser, inputUser);
        document.getElementById('login-user').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); document.getElementById('login-pass').focus(); }
        });
    }

    if (inputPass) {
        const clonePass = inputPass.cloneNode(true);
        inputPass.parentNode.replaceChild(clonePass, inputPass);
        document.getElementById('login-pass').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleLogin(); }
        });
    }

    if (btnLogin) {
        const cloneBtn = btnLogin.cloneNode(true);
        btnLogin.parentNode.replaceChild(cloneBtn, btnLogin);
        document.getElementById('btn-login').addEventListener('click', (e) => { e.preventDefault(); handleLogin(); });
    }
}

function handleLogin() {
    const inputUser = document.getElementById('login-user').value.trim().toLowerCase();
    const inputPass = document.getElementById('login-pass').value.trim();
    
    if (USERS_DATABASE[inputUser] && USERS_DATABASE[inputUser].password === inputPass) {
        currentUser = inputUser;
        localStorage.setItem('streamhub_session', JSON.stringify({ user: inputUser, timestamp: Date.now() }));
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        carregarTemaDoUsuarioLogado(currentUser);
        initApp();
    } else { alert("Usuário ou senha incorretos!"); }
}

function handleLogoutActions() {
    localStorage.removeItem('streamhub_session');
    currentUser = "";
    if (ytPlayer) { try { ytPlayer.stopVideo(); } catch(e){} }
    if (document.getElementById('universal-player')) document.getElementById('universal-player').src = "";
    if (document.getElementById('raw-player')) { document.getElementById('raw-player').pause(); document.getElementById('raw-player').src = ""; }
    if (document.getElementById('login-user')) document.getElementById('login-user').value = "";
    if (document.getElementById('login-pass')) document.getElementById('login-pass').value = "";
    if (document.getElementById('app-container')) document.getElementById('app-container').classList.add('hidden');
    if (document.getElementById('login-screen')) document.getElementById('login-screen').classList.remove('hidden');
}

// ==========================================
// 2. INICIALIZAÇÃO E CARGA MISTA DO BANCO
// ==========================================
async function initApp() {
    await carregarCanaisDinamicos();
    await recarregarDadosDoBanco();
}

async function recarregarDadosDoBanco() {
    try {
        const res = await fetch(CONFIG.FIREBASE_URL);
        const data = await res.json();
        database = [];
        if (data) {
            if (Array.isArray(data)) { 
                database = data.filter(item => item !== null); 
            } else { 
                Object.keys(data).forEach(key => { 
                    if (data[key]) database.push({ idFirebase: key, ...data[key] }); 
                }); 
            }
        }
    } catch (e) { console.log("Erro ao carregar mídias.", e); }
    finally { renderSidebar(); renderMosaic(); setupEventListeners(); alimentarSeletorCategoriasCanais(); }
}

async function carregarCanaisDinamicos() {
    try {
        const res = await fetch(obterUrlBaseCanais());
        const data = await res.json();
        canaisDinamicos = data || {};
    } catch (e) { console.error("Erro canais:", e); }
}

function alimentarSeletorCategoriasCanais() {
    const select = document.getElementById("channel-target-category");
    if (!select) return;
    select.innerHTML = "";
    const categories = [...new Set(database.map(item => item.categoria))];
    Object.keys(canaisDinamicos).forEach(key => {
        try { const catNome = decodeURIComponent(escape(atob(key))); if(!categories.includes(catNome)) categories.push(catNome); } catch(e){}
    });
    categories.sort();
    if(categories.length === 0) {
        select.innerHTML = `<option value="">Nenhuma categoria encontrada.</option>`;
        return;
    }
    categories.forEach(cat => {
        const opt = document.createElement("option"); opt.value = cat; opt.innerText = cat; select.appendChild(opt);
    });
}

// ==========================================
// 3. RENDERIZAÇÃO DO MOSAICO
// ==========================================
function renderMosaic() {
    const grid = document.getElementById('mosaic-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const bcCat = document.getElementById('bc-category');
    const bcSub = document.getElementById('bc-subcategory');
    const bcSrc = document.getElementById('bc-search');

    if (bcCat) bcCat.classList.add('hidden');
    if (bcSub) bcSub.classList.add('hidden');
    if (bcSrc) bcSrc.classList.add('hidden');

    if (currentView === 'categories') {
        const categories = [...new Set(database.map(item => item.categoria))];
        Object.keys(canaisDinamicos).forEach(key => {
            try { const c = decodeURIComponent(escape(atob(key))); if(!categories.includes(c)) categories.push(c); } catch(e){}
        });
        categories.sort().forEach(cat => {
            if(!cat) return;
            const match = database.find(item => item.categoria === cat);
            const nodeName = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "");
            const thumbCapa = match ? match.capa : (canaisDinamicos[nodeName] ? canaisDinamicos[nodeName].thumb : '');
            grid.appendChild(createCard(cat, thumbCapa, false, false, () => { selectedCategory = cat; currentView = 'subcategories'; renderMosaic(); }, -1));
        });
    } 
    else if (currentView === 'subcategories') {
        if (bcCat) { bcCat.classList.remove('hidden'); bcCat.querySelector('.txt').innerText = selectedCategory; }
        const subcategories = [...new Set(database.filter(item => item.categoria === selectedCategory).map(item => item.subcategoria))];
        const nodeName = btoa(unescape(encodeURIComponent(selectedCategory))).replace(/=/g, "");
        if (canaisDinamicos[nodeName] && !subcategories.includes("Vídeos Recentes")) subcategories.push("Vídeos Recentes");
        
        subcategories.sort().forEach(sub => {
            const match = database.find(item => item.categoria === selectedCategory && item.subcategoria === sub);
            grid.appendChild(createCard(sub, match ? match.capa : (canaisDinamicos[nodeName] ? canaisDinamicos[nodeName].thumb : ''), false, false, () => { selectedSubcategory = sub; currentView = 'tracks'; renderMosaic(); }, -1));
        });
    } 
    else if (currentView === 'tracks') {
        if (bcCat) { bcCat.classList.remove('hidden'); bcCat.querySelector('.txt').innerText = selectedCategory; }
        if (bcSub) { bcSub.classList.remove('hidden'); bcSub.querySelector('.txt').innerText = selectedSubcategory; }

        if (selectedSubcategory === "Vídeos Recentes") {
            const nodeName = btoa(unescape(encodeURIComponent(selectedCategory))).replace(/=/g, "");
            if (canaisDinamicos[nodeName]) buscarVideosRecentesDoCanal(canaisDinamicos[nodeName].uploadsPlaylistId);
        } else {
            currentPlaylist = database.filter(item => item.categoria === selectedCategory && item.subcategoria === selectedSubcategory);
            currentPlaylist.forEach((track, index) => {
                const realIndex = database.findIndex(dbItem => dbItem.link === track.link && dbItem.título === track.título);
                grid.appendChild(createCard(track.título, track.capa, false, false, () => { playTrack(index); }, realIndex));
            });
        }
    }
    else if (currentView === 'search_results') {
        if (bcSrc) bcSrc.classList.remove('hidden');
        lastYtSearchResults.forEach(item => {
            const isPlaylist = item.type === 'playlist';
            const card = createCard(item.title, item.thumb, true, isPlaylist, null, -1);
            if (card.querySelector('.add-music-badge')) {
                card.querySelector('.add-music-badge').onclick = (e) => { e.preventDefault(); e.stopPropagation(); openAdminWithTrack(item); };
            }
            const btnGroup = document.createElement('div'); btnGroup.className = 'search-btn-group';
            const btnPlay = document.createElement('button'); btnPlay.style.background = '#2980b9'; btnPlay.innerHTML = `<i class="fas fa-play"></i> Assistir`;
            btnPlay.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                currentPlaylist = [{ título: item.title, link: isPlaylist ? `https://www.youtube.com/playlist?list=${item.youtubeId}` : `https://www.youtube.com/embed/${item.youtubeId}` }];
                playTrack(0);
            };
            btnGroup.appendChild(btnPlay);
            if(isPlaylist) {
                const btnList = document.createElement('button'); btnList.style.background = '#8e44ad'; btnList.innerHTML = `<i class="fas fa-list"></i> Ver Mídias`;
                btnList.onclick = (e) => { e.preventDefault(); e.stopPropagation(); peekPlaylistContents(item.youtubeId); };
                btnGroup.appendChild(btnList);
            }
            card.appendChild(btnGroup); grid.appendChild(card);
        });
    }
}

function createCard(title, imgSrc, showAddButton = false, isPlaylist = false, clickCallback, realIndex = -1) {
    const card = document.createElement('div'); card.className = 'card';
    let htmlContent = `<img src="${imgSrc || 'https://placehold.co/160x90?text=Sem+Capa'}"><h4>${title}</h4>`;
    if(isPlaylist) htmlContent += `<span class="media-type-badge"><i class="fas fa-photo-film"></i> Playlist</span>`;
    if(showAddButton) htmlContent += `<button class="add-music-badge"><i class="fas fa-plus"></i> ${isPlaylist ? "Add Playlist" : "Adicionar"}</button>`;
    if(realIndex >= 0) htmlContent += `<div class="quick-edit-badge" title="Editar"><i class="fas fa-cog"></i></div>`;
    card.innerHTML = htmlContent;
    if(clickCallback) card.addEventListener('click', clickCallback);
    if(realIndex >= 0 && card.querySelector('.quick-edit-badge')) {
        card.querySelector('.quick-edit-badge').addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openAdvancedEditModal(realIndex); });
    }
    return card;
}

// ==========================================
// 4. API DE CANAIS DINÂMICOS
// ==========================================
async function buscarVideosRecentesDoCanal(playlistId) {
    const grid = document.getElementById('mosaic-grid');
    if (grid) grid.innerHTML = '<h3>Atualizando vídeos recentes do canal via API...</h3>';
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=15&playlistId=${playlistId}&key=${CONFIG.YT_API_KEY}`;
    try {
        const res = await fetch(url); const data = await res.json();
        if(data.items) {
            currentPlaylist = data.items.map(item => ({
                título: item.snippet.title, link: `https://www.youtube.com/embed/${item.snippet.resourceId.videoId}`,
                capa: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : item.snippet.thumbnails.default.url,
                categoria: selectedCategory, subcategoria: "Vídeos Recentes", isDinâmico: true
            }));
            if (grid) {
                grid.innerHTML = '';
                currentPlaylist.forEach((track, index) => { grid.appendChild(createCard(track.título, track.capa, false, false, () => { playTrack(index); }, -1)); });
            }
        }
    } catch (e) { if (grid) grid.innerHTML = '<h3>Erro ao carregar feeds do canal.</h3>'; }
}

function configurarEventosBuscaCanal() {
    const btnSearchChan = document.getElementById("btn-search-channel");
    const btnSaveChanLink = document.getElementById("btn-save-channel-link");

    if (btnSearchChan) {
        btnSearchChan.onclick = async (e) => {
            e.preventDefault(); const termo = document.getElementById("search-channel-input").value.trim(); if(!termo) return alert("Digite o nome.");
            try {
                const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(termo)}&key=${CONFIG.YT_API_KEY}`);
                const data = await res.json(); if(!data.items || data.items.length === 0) return alert("Não localizado.");
                const item = data.items[0];
                canalSelecionadoProvisorio = { channelId: item.snippet.channelId, title: item.snippet.title, thumb: item.snippet.thumbnails.default.url, description: item.snippet.description };
                document.getElementById("chan-thumb").src = canalSelecionadoProvisorio.thumb;
                document.getElementById("chan-title-text").innerText = canalSelecionadoProvisorio.title;
                document.getElementById("chan-desc-text").innerText = canalSelecionadoProvisorio.description;
                document.getElementById("channel-preview").style.display = "flex";
            } catch(err) { alert("Erro API."); }
        };
    }

    if (btnSaveChanLink) {
        btnSaveChanLink.onclick = async (e) => {
            e.preventDefault(); const catDestino = document.getElementById("channel-target-category").value; if(!canalSelecionadoProvisorio || !catDestino) return alert("Selecione os dados.");
            try {
                const payload = { channelId: canalSelecionadoProvisorio.channelId, uploadsPlaylistId: canalSelecionadoProvisorio.channelId.replace(/^UC/, "UU"), title: canalSelecionadoProvisorio.title, thumb: canalSelecionadoProvisorio.thumb };
                const nodeName = btoa(unescape(encodeURIComponent(catDestino))).replace(/=/g, "");
                await fetch(obterUrlCanalIndividual(nodeName), { method: "PUT", body: JSON.stringify(payload) });
                alert("Canal vinculado!"); document.getElementById("channel-preview").style.display = "none"; document.getElementById("search-channel-input").value = "";
                canalSelecionadoProvisorio = null; initApp();
            } catch(err) { alert("Erro ao salvar."); }
        };
    }
}

// ==========================================
// 5. INTERFACE DA SIDEBAR E FILTROS
// ==========================================
function renderSidebar() {
    const tree = document.getElementById('sidebar-tree'); if (!tree) return; tree.innerHTML = '';
    const categories = [...new Set(database.map(item => item.categoria))];
    Object.keys(canaisDinamicos).forEach(key => {
        try { const catNome = decodeURIComponent(escape(atob(key))); if(!categories.includes(catNome)) categories.push(catNome); } catch(e){}
    });
    categories.sort().forEach(cat => {
        if(!cat) return;
        const catLi = document.createElement('li'); const catToggle = document.createElement('span'); catToggle.className = 'category-toggle'; catToggle.innerHTML = `<i class="fas fa-folder"></i> ${cat}`;
        const subUl = document.createElement('ul'); subUl.className = 'tree-sub hidden';
        catToggle.addEventListener('click', () => subUl.classList.toggle('hidden'));
        const subcategories = [...new Set(database.filter(item => item.categoria === cat).map(item => item.subcategoria))];
        const nodeName = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "");
        if(canaisDinamicos[nodeName]) subcategories.push("Vídeos Recentes");

        subcategories.sort().forEach(sub => {
            if(!sub) return; const subLi = document.createElement('li');
            subLi.innerHTML = sub === "Vídeos Recentes" ? `<i class="fas fa-sync text-red"></i> <b>${sub}</b>` : `<i class="fas fa-photo-film"></i> ${sub}`;
            subLi.addEventListener('click', (e) => { e.stopPropagation(); selectedCategory = cat; selectedSubcategory = sub; currentView = 'tracks'; renderMosaic(); if(window.innerWidth <= 768) handleToggleSidebar(); });
            subUl.appendChild(subLi);
        });
        catLi.appendChild(catToggle); catLi.appendChild(subUl); tree.appendChild(catLi);
    });
}

function filterInternalDatabase(query) {
    const lowerQuery = query.toLowerCase().trim();
    document.querySelectorAll('#sidebar-tree > li').forEach(catLi => {
        const catName = catLi.querySelector('.category-toggle').innerText.toLowerCase();
        let match = catName.includes(lowerQuery); let subMatchAny = false;
        catLi.querySelectorAll('.tree-sub li').forEach(subLi => {
            const realCat = catLi.querySelector('.category-toggle').innerText.trim(); const realSub = subLi.innerText.trim();
            const mediaMatch = database.some(item => item.categoria === realCat && item.subcategoria === realSub && item.título.toLowerCase().includes(lowerQuery));
            if(subLi.innerText.toLowerCase().includes(lowerQuery) || mediaMatch || match) { subLi.classList.remove('hidden'); subMatchAny = true; } else { subLi.classList.add('hidden'); }
        });
        if(match || subMatchAny) catLi.classList.remove('hidden'); else catLi.classList.add('hidden');
    });
}

async function searchYouTubeGlobal(query) {
    if(!query.trim()) return; currentView = 'search_results'; renderMosaic();
    const grid = document.getElementById('mosaic-grid'); if (grid) grid.innerHTML = '<h3>Buscando no YouTube...</h3>';
    
    try {
        const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=30&q=${encodeURIComponent(query)}&type=video,playlist&key=${CONFIG.YT_API_KEY}`);
        const data = await response.json();
        
        if (data.error) {
            console.error("Erro Google API:", data.error);
            if (grid) grid.innerHTML = `<h3 style="color:#e74c3c;">Erro do YouTube: ${data.error.message}</h3><p style="padding:10px; color:#a8a8b3;">Verifique as configurações na sua Cloud Console.</p>`;
            return;
        }

        lastYtSearchResults = [];
        if(data.items) {
            data.items.forEach(item => {
                const isPl = item.id.kind === 'youtube#playlist';
                lastYtSearchResults.push({ type: isPl ? 'playlist' : 'video', youtubeId: isPl ? item.id.playlistId : item.id.videoId, title: item.snippet.title, thumb: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : 'https://placehold.co/300x200?text=Sem+Capa' });
            });
        }
        renderMosaic();
    } catch (e) { 
        if (grid) grid.innerHTML = '<h3>Erro de rede ao conectar à API.</h3>'; 
    }
}

async function peekPlaylistContents(playlistId) {
    try {
        const res = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${CONFIG.YT_API_KEY}`);
        const data = await res.json();
        if(data.items) { alert(`Mídias:\n\n` + data.items.map((item, idx) => `${idx + 1}. ${item.snippet.title}`).join('\n').substring(0, 1200)); }
    } catch(e) { alert("Erro playlist."); }
}

function openAdminWithTrack(item) {
    if (document.getElementById('admin-modal')) document.getElementById('admin-modal').classList.remove('hidden');
    switchTabs('add-tab', 'tab-trigger-add');
    document.getElementById('manual-media-url').value = item.type === 'playlist' ? `https://www.youtube.com/playlist?list=${item.youtubeId}` : `https://www.youtube.com/embed/${item.youtubeId}`;
    document.getElementById('prev-thumb').src = item.thumb; document.getElementById('prev-title').value = item.title;
}

function extractPlaylistId(url) {
    const reg = /[&?]list=([^#\&\?]+)/;
    const match = url.match(reg);
    return match ? match[1] : null;
}

// ==========================================
// 6. REPRODUÇÃO TRIPLA DO PLAYER
// ==========================================
function playTrack(index) {
    if(currentPlaylist.length === 0) return; currentTrackIndex = index; const track = currentPlaylist[index];
    if (document.getElementById('player-container')) document.getElementById('player-container').classList.remove('hidden');
    if (document.getElementById('current-track-title')) document.getElementById('current-track-title').innerText = track.título;

    const ytPlayerEl = document.getElementById('yt-player'); const univPlayerEl = document.getElementById('universal-player'); const rawPlayerEl = document.getElementById('raw-player');
    if (univPlayerEl) univPlayerEl.src = ""; if (rawPlayerEl) rawPlayerEl.src = "";
    if (univPlayerEl) univPlayerEl.classList.add('hidden'); if (rawPlayerEl) rawPlayerEl.classList.add('hidden'); if (ytPlayerEl) ytPlayerEl.classList.add('hidden');
    if (rawPlayerEl) rawPlayerEl.pause();

    const linkOriginal = track.link.trim(); const vId = extractYoutubeId(linkOriginal);

    if(vId) {
        if (ytPlayerEl) ytPlayerEl.classList.remove('hidden');
        if (!ytPlayer) {
            ytPlayer = new YT.Player('yt-player', { videoId: vId, playerVars: { 'autoplay': 1, 'playsinline': 1, 'enablejsapi': 1 }, events: { 'onStateChange': (e) => { if(e.data === 0 && currentTrackIndex + 1 < currentPlaylist.length) playTrack(currentTrackIndex + 1); } } });
        } else { ytPlayer.loadVideoById(vId); }
    } 
    else if(linkOriginal.toLowerCase().endsWith('.mp4') || linkOriginal.toLowerCase().endsWith('.mkv') || linkOriginal.toLowerCase().includes('raw.githubusercontent')) {
        if (rawPlayerEl) { rawPlayerEl.classList.remove('hidden'); rawPlayerEl.src = linkOriginal; rawPlayerEl.play(); rawPlayerEl.onended = () => { if(currentTrackIndex + 1 < currentPlaylist.length) playTrack(currentTrackIndex + 1); }; }
    } 
    else {
        if (univPlayerEl) { univPlayerEl.classList.remove('hidden'); univPlayerEl.src = linkOriginal.includes("archive.org/details/") ? linkOriginal.replace("archive.org/details/", "archive.org/embed/") : linkOriginal; }
    }
}

function extractYoutubeId(url) {
    if (!url) return null; const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|\/shorts\/)([^#\&\?]*).*/; const match = url.match(regExp);
    if (match && match[2].length === 11) return match[2];
    if (url.trim().length === 11 && !url.includes('/') && !url.includes('.')) return url.trim();
    return null;
}

// ==========================================
// 7. ÁRVORE GERENCIAL SANFONA (CRUD COMPLETO)
// ==========================================
function renderCrudManager() {
    const listContainer = document.getElementById('crud-tree-list'); if (!listContainer) return; listContainer.innerHTML = '';
    const categories = [...new Set(database.map(item => item.categoria))];
    Object.keys(canaisDinamicos).forEach(k => { try { const c = decodeURIComponent(escape(atob(k))); if(!categories.includes(c)) categories.push(c); } catch(e){} });

    categories.sort().forEach(cat => {
        if(!cat) return;
        
        // 1. Linha da Categoria (Sempre Editável)
        const catRow = createCrudRow(cat, 'categoria', () => { let n = prompt("Novo nome para a Categoria:", cat); if(n && n.trim() !== "") renomearCategoriaCompleta(cat, n.trim()); }, () => { if(confirm(`Excluir ${cat}?`)) deletarCategoriaCompleta(cat); }, () => downloadJSON(database.filter(item => item.categoria === cat), `cat_${cat}`));
        const subContainer = document.createElement('div'); subContainer.style.display = expandedCrudCats[cat] ? 'block' : 'none';
        catRow.addEventListener('click', (e) => { if(e.target.closest('.crud-actions')) return; expandedCrudCats[cat] = !expandedCrudCats[cat]; subContainer.style.display = expandedCrudCats[cat] ? 'block' : 'none'; });
        listContainer.appendChild(catRow);

        const subcategories = [...new Set(database.filter(item => item.categoria === cat).map(item => item.subcategoria))];
        const nodeName = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "");
        if(canaisDinamicos[nodeName]) subcategories.push("Vídeos Recentes");

        subcategories.sort().forEach(sub => {
            // CORREÇÃO VISUAL: Se NÃO for canal dinâmico ("Vídeos Recentes"), injeta a função de edição. O botão irá aparecer imediatamente!
            const subRow = createCrudRow(sub, 'subcategoria', sub === "Vídeos Recentes" ? null : () => { let n = prompt("Novo nome para a Subcategoria:", sub); if(n && n.trim() !== "") renomearSubcategoriaCompleta(cat, sub, n.trim()); }, () => { if(confirm(`Excluir ${sub}?`)) deletarSubcategoria(cat, sub); }, () => downloadJSON(database.filter(item => item.categoria === cat && item.subcategoria === sub), `sub_${sub}`));
            const mediaContainer = document.createElement('div'); mediaContainer.style.display = expandedCrudSubs[cat + '_' + sub] ? 'block' : 'none';
            subRow.addEventListener('click', (e) => { if(e.target.closest('.crud-actions')) return; expandedCrudSubs[cat + '_' + sub] = !expandedCrudSubs[cat + '_' + sub]; mediaContainer.style.display = expandedCrudSubs[cat + '_' + sub] ? 'block' : 'none'; });
            subContainer.appendChild(subRow);

            if(sub === "Vídeos Recentes") {
                const iRow = document.createElement('div'); iRow.className = 'crud-item track-level'; iRow.innerHTML = `<span><i class="fas fa-link"></i> Canal: ${canaisDinamicos[nodeName].title}</span>`; mediaContainer.appendChild(iRow);
            } else {
                database.forEach((item, idx) => {
                    if(item.categoria === cat && item.subcategoria === sub) {
                        mediaContainer.appendChild(createCrudRow(item.título, 'mídia', () => openAdvancedEditModal(idx), () => { if(confirm(`Excluir?`)) deletarMidiaUnica(item); }, () => downloadJSON(item, item.título)));
                    }
                });
            }
            subContainer.appendChild(mediaContainer);
        });
        listContainer.appendChild(subContainer);
    });
}

// Injeta cirurgicamente as ações. Se 'onEdit' existir, renderiza o botão na interface gráfica.
function createCrudRow(title, type, onEdit, onDel, onExp) {
    const row = document.createElement('div'); row.className = `crud-item ${type === 'subcategoria' ? 'sub-level' : type === 'mídia' ? 'track-level' : ''}`;
    let icon = type === 'categoria' ? '<i class="fas fa-folder"></i>' : (type === 'subcategoria' ? '<i class="fas fa-video"></i>' : '<i class="fas fa-play-circle"></i>');
    
    row.innerHTML = `<span>${icon} <strong>[${type.toUpperCase()}]</strong> ${title}</span><div class="crud-actions">${onEdit ? '<button class="crud-btn btn-edit"><i class="fas fa-edit"></i></button>' : ''}<button class="crud-btn btn-del"><i class="fas fa-trash"></i></button><button class="crud-btn btn-exp"><i class="fas fa-download"></i></button></div>`;
    
    if(onEdit) row.querySelector('.btn-edit').onclick = (e) => { e.stopPropagation(); onEdit(); };
    row.querySelector('.btn-del').onclick = (e) => { e.stopPropagation(); onDel(); };
    row.querySelector('.btn-exp').onclick = (e) => { e.stopPropagation(); onExp(); };
    return row;
}

// ==========================================
// 8. PERSISTÊNCIA EM BLOCO E PROCESSO JSON
// ==========================================
function openAdvancedEditModal(index) {
    activeEditingIndex = index; const item = database[index];
    document.getElementById('edit-field-title').value = item.título || ""; document.getElementById('edit-field-link').value = item.link || "";
    document.getElementById('edit-field-capa').value = item.capa || ""; document.getElementById('edit-field-category').value = item.categoria || "";
    document.getElementById('edit-field-subcategory').value = item.subcategoria || "";
    if (document.getElementById('edit-media-modal')) document.getElementById('edit-media-modal').classList.remove('hidden');
}

async function saveAdvancedEditChanges(e) {
    if(e) e.preventDefault();
    const t = document.getElementById('edit-field-title').value.trim(); 
    const l = document.getElementById('edit-field-link').value.trim();
    const c = document.getElementById('edit-field-capa').value.trim(); 
    const cat = document.getElementById('edit-field-category').value.trim();
    const sub = document.getElementById('edit-field-subcategory').value.trim();
    
    if(!t || !l || !cat) return alert("Preencha os campos!");

    database[activeEditingIndex].título = t;
    database[activeEditingIndex].link = l;
    database[activeEditingIndex].capa = c;
    database[activeEditingIndex].categoria = cat;
    database[activeEditingIndex].subcategoria = sub;

    const loteLimpoParaSalvar = database.map(({idFirebase, ...resto}) => resto);

    try {
        let resposta = await fetch(CONFIG.FIREBASE_URL, { method: "PUT", body: JSON.stringify(loteLimpoParaSalvar), headers: { 'Content-Type': 'application/json' } });
        if (!resposta.ok) throw new Error("Erro.");
        alert("Gravado!"); document.getElementById('edit-media-modal').classList.add('hidden');
        currentView = 'categories'; selectedCategory = ''; selectedSubcategory = ''; await recarregarDadosDoBanco(); renderCrudManager();
    } catch (err) { alert("Erro: " + err.message); }
}

async function saveMediaToDatabase(e) {
    if(e) e.preventDefault();
    const url = document.getElementById('manual-media-url').value.trim(); 
    const categoria = document.getElementById('media-category').value.trim();
    const subcategoria = document.getElementById('media-subcategory').value.trim();
    
    if(!url || !categoria) return alert("Preencha a URL e a Categoria.");
    
    const pId = extractPlaylistId(url);
    const btnSave = document.getElementById('btn-save-media');

    try {
        if(pId) {
            btnSave.innerText = "Desmembrando Playlist no Firebase...";
            btnSave.disabled = true;
            
            let urlApi = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${pId}&key=${CONFIG.YT_API_KEY}`;
            let res = await fetch(urlApi);
            let data = await res.json();
            
            if(data.error) throw new Error(data.error.message);
            if(!data.items || data.items.length === 0) throw new Error("Playlist vazia.");
            
            for(let item of data.items) {
                let vId = item.snippet.resourceId.videoId;
                let título = item.snippet.title;
                let capa = item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : item.snippet.thumbnails.default.url;
                let linkVideo = `https://www.youtube.com/embed/${vId}`;
                
                await fetch(CONFIG.FIREBASE_URL, { 
                    method: 'POST', 
                    body: JSON.stringify({ título, link: linkVideo, capa, categoria, subcategoria }), 
                    headers: { 'Content-Type': 'application/json' } 
                });
            }
            alert(`Sucesso! Foram importados ${data.items.length} vídeos.`);
        } else {
            const título = document.getElementById('prev-title').value.trim();
            const capa = document.getElementById('prev-thumb').src;
            await fetch(CONFIG.FIREBASE_URL, { method: 'POST', body: JSON.stringify({ título, link: url, capa, categoria, subcategoria }), headers: { 'Content-Type': 'application/json' } });
            alert("Vídeo salvo!");
        }
        
        document.getElementById('manual-media-url').value = "";
        if (document.getElementById('admin-modal')) document.getElementById('admin-modal').classList.add('hidden');
        currentView = 'categories'; selectedCategory = ''; selectedSubcategory = ''; await recarregarDadosDoBanco();
    } catch (err) { alert("Erro: " + err.message); }
    finally {
        btnSave.innerText = "Salvar no meu Firebase";
        btnSave.disabled = false;
    }
}

async function importarCodigoJSON() {
    const campoTexto = document.getElementById('json-input-field');
    if (!campoTexto || !campoTexto.value.trim()) return alert("Cole o código.");
    try {
        let parsed = JSON.parse(campoTexto.value.trim());
        let loteValidado = [];
        if (Array.isArray(parsed)) loteValidado = parsed;
        else if (typeof parsed === 'object') Object.keys(parsed).forEach(k => { if(parsed[k]) loteValidado.push(parsed[k]); });
        if (loteValidado.length === 0) throw new Error("Vazio.");
        const loteLimpo = loteValidado.map(({idFirebase, ...resto}) => resto);
        if (confirm(`Importar ${loteLimpo.length} itens?`)) {
            await fetch(CONFIG.FIREBASE_URL, { method: "PUT", body: JSON.stringify(loteLimpo), headers: { 'Content-Type': 'application/json' } });
            alert("Sucesso!"); campoTexto.value = "";
            currentView = 'categories'; selectedCategory = ''; selectedSubcategory = ''; await recarregarDadosDoBanco(); renderCrudManager();
        }
    } catch (err) { alert("Erro: " + err.message); }
}

// SELETOR LINEAR MOTOR
function inicializarSeletorCoresLinear() {
    const bar = document.getElementById('color-spectrum-bar');
    const selector = document.getElementById('color-spectrum-selector');
    if (!bar || !selector) return;

    let isDragging = false;
    const coresGradiente = ["#000000", "#ff0000", "#ff00ff", "#0000ff", "#00ffff", "#00ff00", "#ffff00", "#ff0000", "#ffffff"];

    function calcularCorPelaPosicao(e) {
        const rect = bar.getBoundingClientRect();
        let clientX = e.clientX || (e.touches && e.touches[0].clientX);
        let x = clientX - rect.left;
        if (x < 0) x = 0; if (x > rect.width) x = rect.width;

        let percent = x / rect.width;
        selector.style.left = (percent * 100) + '%';

        let segment = percent * (coresGradiente.length - 1);
        let index = Math.floor(segment); let factor = segment - index;
        let cor1 = coresGradiente[index]; let cor2 = coresGradiente[index + 1] || coresGradiente[index];

        let rgb1 = hexToRgb(cor1); let rgb2 = hexToRgb(cor2);
        let r = Math.round(rgb1.r + factor * (rgb2.r - rgb1.r));
        let g = Math.round(rgb1.g + factor * (rgb2.g - rgb1.g));
        let b = Math.round(rgb1.b + factor * (rgb2.b - rgb1.b));

        let hexResult = rgbToHex(r, g, b);
        aplicarCorTema(hexResult);
        if(currentUser) localStorage.setItem(`streamhub_theme_${currentUser}`, hexResult);
    }

    function hexToRgb(hex) {
        let num = parseInt(hex.replace("#",""), 16); return { r: num >> 16, g: (num >> 8) & 0x00FF, b: num & 0x0000FF };
    }
    function rgbToHex(r, g, b) {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    bar.addEventListener('mousedown', (e) => { isDragging = true; calcularCorPelaPosicao(e); });
    document.addEventListener('mousemove', (e) => { if (isDragging) calcularCorPelaPosicao(e); });
    document.addEventListener('mouseup', () => isDragging = false);
    bar.addEventListener('touchstart', (e) => { isDragging = true; calcularCorPelaPosicao(e); }, {passive: true});
    document.addEventListener('touchmove', (e) => { if (isDragging) calcularCorPelaPosicao(e); }, {passive: true});
    document.addEventListener('touchend', () => isDragging = false);
}

function posicionarSetaPelaCor(hexColor) {
    const selector = document.getElementById('color-spectrum-selector'); if (!selector) return;
    if(hexColor.toLowerCase() === "#3498db") selector.style.left = "33%";
    if(hexColor.toLowerCase() === "#e74c3c") selector.style.left = "12%";
}

async function renomearCategoriaCompleta(antiga, nova) {
    try {
        const alvos = database.filter(item => item.categoria === antiga);
        for (let item of alvos) {
            item.categoria = nova; const { idFirebase, ...payload } = item;
            if (idFirebase) await fetch(obterUrlNodoItem(idFirebase), { method: "PUT", body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
        }
        const oldNodeName = btoa(unescape(encodeURIComponent(antiga))).replace(/=/g, "");
        if (canaisDinamicos[oldNodeName]) {
            const newNodeName = btoa(unescape(encodeURIComponent(nova))).replace(/=/g, "");
            await fetch(obterUrlCanalIndividual(newNodeName), { method: "PUT", body: JSON.stringify(canaisDinamicos[oldNodeName]), headers: { 'Content-Type': 'application/json' } });
            await fetch(obterUrlCanalIndividual(oldNodeName), { method: "DELETE" });
        }
        await recarregarDadosDoBanco(); renderCrudManager();
    } catch(e) { alert("Erro."); }
}

// MOTOR EM LOTE: Altera o nome da subcategoria de todas as mídias afetadas de uma vez só no Firebase
async function renomearSubcategoriaCompleta(cat, antigaSub, novaSub) {
    try {
        const alvos = database.filter(item => item.categoria === cat && item.subcategoria === antigaSub);
        if(alvos.length === 0) return alert("Nenhuma mídia localizada nesta subcategoria.");
        
        for (let item of alvos) {
            item.subcategoria = novaSub; 
            const { idFirebase, ...payload } = item;
            if (idFirebase) {
                await fetch(obterUrlNodoItem(idFirebase), { method: "PUT", body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
            }
        }
        alert("Subcategoria renomeada com sucesso!"); 
        await recarregarDadosDoBanco(); 
        renderCrudManager();
    } catch(e) { alert("Erro ao renomear subcategoria."); }
}

async function deletarMidiaUnica(item) {
    try {
        if(item.idFirebase) await fetch(obterUrlNodoItem(item.idFirebase), { method: 'DELETE' });
        else await fetch(CONFIG.FIREBASE_URL, { method: 'PUT', body: JSON.stringify(database.filter(i => i !== item).map(({idFirebase, ...rest}) => rest)), headers: { 'Content-Type': 'application/json' } });
        await recarregarDadosDoBanco(); renderCrudManager();
    } catch(e) { alert("Erro."); }
}

async function deletarSubcategoria(cat, sub) {
    try {
        if(sub === "Vídeos Recentes") { await fetch(obterUrlCanalIndividual(btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "")), { method: 'DELETE' }); }
        else {
            const alvos = database.filter(item => item.categoria === cat && item.subcategoria === sub);
            for(let item of alvos) { if(item.idFirebase) await fetch(obterUrlNodoItem(item.idFirebase), { method: 'DELETE' }); }
        }
        await recarregarDadosDoBanco(); renderCrudManager();
    } catch(e) { alert("Erro."); }
}

async function deletarCategoriaCompleta(cat) {
    try {
        const alvos = database.filter(item => item.categoria === cat);
        for(let item of alvos) { if(item.idFirebase) await fetch(obterUrlNodoItem(item.idFirebase), { method: 'DELETE' }); }
        await fetch(obterUrlCanalIndividual(btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "")), { method: 'DELETE' });
        currentView = 'categories'; await recarregarDadosDoBanco(); renderCrudManager();
    } catch(e) { alert("Erro."); }
}

function downloadJSON(obj, filename) {
    const prepararObjeto = Array.isArray(obj) ? obj.map(({idFirebase, ...r}) => r) : obj;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(prepararObjeto, null, 2));
    const a = document.createElement('a'); a.setAttribute("href", dataStr); a.setAttribute("download", `${filename.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_backup.json`);
    document.body.appendChild(a); a.click(); a.remove();
}

function handleToggleSidebar() {
    const sidebar = document.getElementById('sidebar'); if (!sidebar) return;
    if (window.innerWidth <= 768) { sidebar.classList.toggle('open'); sidebar.classList.remove('collapsed'); }
    else { sidebar.classList.toggle('collapsed'); sidebar.classList.remove('open'); }
}

function switchTabs(targetTabId, activeTriggerBtnId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    const triggerBtn = document.getElementById(activeTriggerBtnId); const targetTab = document.getElementById(targetTabId);
    if (triggerBtn) triggerBtn.classList.add('active'); if (targetTab) targetTab.classList.remove('hidden');
}

// ==========================================
// 9. MAPA DE EVENTOS E LUPA MOBILE
// ==========================================
function setupEventListeners() {
    if (document.getElementById('search-yt-input')) document.getElementById('search-yt-input').onkeypress = (e) => { if(e.key === 'Enter') searchYouTubeGlobal(e.target.value); };
    
    if (document.getElementById('search-yt-input-mobile')) {
        document.getElementById('search-yt-input-mobile').onkeypress = (e) => { if(e.key === 'Enter') searchYouTubeGlobal(e.target.value); };
    }
    
    if (document.getElementById('btn-toggle-search-mobile')) {
        document.getElementById('btn-toggle-search-mobile').onclick = (e) => {
            e.preventDefault();
            const row = document.getElementById('mobile-search-row');
            if (row) {
                row.classList.toggle('hidden');
                if(!row.classList.contains('hidden')) document.getElementById('search-yt-input-mobile').focus();
            }
        };
    }

    if (document.getElementById('search-internal-input')) document.getElementById('search-internal-input').oninput = (e) => filterInternalDatabase(e.target.value);
    if (document.getElementById('toggle-sidebar')) document.getElementById('toggle-sidebar').onclick = (e) => { e.preventDefault(); handleToggleSidebar(); };
    
    if (document.getElementById('bc-root')) document.getElementById('bc-root').onclick = () => { currentView = 'categories'; selectedCategory=''; selectedSubcategory=''; renderMosaic(); };
    if (document.getElementById('bc-home')) document.getElementById('bc-home').onclick = () => { currentView = 'categories'; selectedCategory=''; selectedSubcategory=''; renderMosaic(); };
    if (document.getElementById('bc-category')) document.getElementById('bc-category').onclick = () => { currentView = 'subcategories'; selectedSubcategory=''; renderMosaic(); };

    const btnFetchManual = document.getElementById('btn-fetch-manual');
    if (btnFetchManual) {
        btnFetchManual.onclick = async (e) => {
            e.preventDefault(); const url = document.getElementById('manual-media-url').value.trim(); if(!url) return alert("Insira uma URL.");
            btnFetchManual.innerText = "Buscando..."; const vId = extractYoutubeId(url);
            try {
                if (vId) {
                    const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${vId}&key=${CONFIG.YT_API_KEY}`);
                    const data = await res.json();
                    if (data.items && data.items.length > 0) {
                        const snip = data.items[0].snippet;
                        document.getElementById('prev-title').value = snip.title;
                        document.getElementById('prev-thumb').src = snip.thumbnails.medium ? snip.thumbnails.medium.url : snip.thumbnails.default.url;
                    } else {
                        document.getElementById('prev-title').value = "Vídeo do YouTube";
                        document.getElementById('prev-thumb').src = "https://placehold.co/120x90?text=YouTube";
                    }
                } else if(extractPlaylistId(url)) {
                    document.getElementById('prev-title').value = "Playlist Completa do YouTube (Lote Ativado)";
                    document.getElementById('prev-thumb').src = "https://placehold.co/120x90?text=Playlist+YT";
                } else {
                    document.getElementById('prev-title').value = "Mídia Externa / Arquivo Local";
                    document.getElementById('prev-thumb').src = "https://placehold.co/120x90?text=Link+Bruto";
                }
            } catch(err) { 
                document.getElementById('prev-title').value = "Link Capturado";
                document.getElementById('prev-thumb').src = "https://placehold.co/120x90?text=Mídia";
            } finally { btnFetchManual.innerText = "Capturar Dados"; }
        };
    }

    if (document.getElementById('btn-save-media')) document.getElementById('btn-save-media').onclick = (e) => saveMediaToDatabase(e);
    if (document.getElementById('btn-open-admin')) document.getElementById('btn-open-admin').onclick = (e) => { e.preventDefault(); if(document.getElementById('admin-modal')) document.getElementById('admin-modal').classList.remove('hidden'); switchTabs('add-tab', 'tab-trigger-add'); renderCrudManager(); };
    if (document.getElementById('btn-close-admin')) document.getElementById('btn-close-admin').onclick = (e) => { e.preventDefault(); if(document.getElementById('admin-modal')) document.getElementById('admin-modal').classList.add('hidden'); };
    if (document.getElementById('tab-trigger-manage')) document.getElementById('tab-trigger-manage').onclick = (e) => { e.preventDefault(); switchTabs('manage-tab', 'tab-trigger-manage'); renderCrudManager(); };
    if (document.getElementById('tab-trigger-add')) document.getElementById('tab-trigger-add').onclick = (e) => { e.preventDefault(); switchTabs('add-tab', 'tab-trigger-add'); };
    if (document.getElementById('tab-trigger-channel')) document.getElementById('tab-trigger-channel').onclick = (e) => { e.preventDefault(); switchTabs('channel-tab', 'tab-trigger-channel'); };
    if (document.getElementById('btn-submit-edit-media')) document.getElementById('btn-submit-edit-media').onclick = (e) => saveAdvancedEditChanges(e);
    if (document.getElementById('btn-cancel-edit-media')) document.getElementById('btn-cancel-edit-media').onclick = (e) => { e.preventDefault(); if(document.getElementById('edit-media-modal')) document.getElementById('edit-media-modal').classList.add('hidden'); };

    if (document.getElementById('btn-export-all-json')) {
        document.getElementById('btn-export-all-json').onclick = (e) => {
            e.preventDefault(); if (database.length === 0) return alert("Banco vazio!");
            downloadJSON(database, "backup_completo_streamhub");
        };
    }

    if (document.getElementById('btn-submit-json-code')) {
        document.getElementById('btn-submit-json-code').onclick = (e) => { e.preventDefault(); importarCodigoJSON(); };
    }

    if (document.getElementById('btn-reset-theme')) {
        document.getElementById('btn-reset-theme').onclick = (e) => {
            e.preventDefault();
            if(currentUser) {
                localStorage.removeItem(`streamhub_theme_${currentUser}`);
                let corOriginal = USERS_DATABASE[currentUser] ? USERS_DATABASE[currentUser].defaultColor : "#3498db";
                aplicarCorTema(corOriginal); posicionarSetaPelaCor(corOriginal);
            }
        };
    }

    const fileImport = document.getElementById('file-import-json');
    if (fileImport) {
        fileImport.onchange = (e) => {
            const file = e.target.files[0]; if (!file) return;
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    let parsed = JSON.parse(evt.target.result); let loteValidado = [];
                    if (Array.isArray(parsed)) loteValidado = parsed;
                    else if (typeof parsed === 'object') Object.keys(parsed).forEach(k => { if(parsed[k]) loteValidado.push(parsed[k]); });
                    if (loteValidado.length === 0) throw new Error("Vazio.");
                    const loteLimpo = loteValidado.map(({idFirebase, ...resto}) => resto);

                    if (confirm(`Substituir painel?`)) {
                        await fetch(CONFIG.FIREBASE_URL, { method: "PUT", body: JSON.stringify(loteLimpo), headers: { 'Content-Type': 'application/json' } });
                        alert("Sucesso!"); fileImport.value = "";
                        currentView = 'categories'; selectedCategory = ''; selectedSubcategory = ''; await recarregarDadosDoBanco(); renderCrudManager();
                    }
                } catch(err) { alert("Erro: " + err.message); }
            };
            reader.readAsText(file);
        };
    }

    if (document.getElementById('btn-close-player')) {
        document.getElementById('btn-close-player').onclick = (e) => {
            e.preventDefault(); if(ytPlayer && typeof ytPlayer.stopVideo === 'function') { try { ytPlayer.stopVideo(); } catch(err){} }
            if(document.getElementById('universal-player')) document.getElementById('universal-player').src = "";
            if(document.getElementById('raw-player')) { document.getElementById('raw-player').pause(); document.getElementById('raw-player').src = ""; }
            if(document.getElementById('player-container')) document.getElementById('player-container').classList.add('hidden');
        };
    }

    if (document.getElementById('btn-logout')) document.getElementById('btn-logout').onclick = (e) => { e.preventDefault(); handleLogoutActions(); };
    configurarEventosBuscaCanal();
    inicializarSeletorCoresLinear();
}

// Inicialização imediata das rotinas
configurarEventosLogin();
checkSession();
