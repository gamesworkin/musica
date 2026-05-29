// ==========================================
// CONFIGURAÇÕES GERAIS E KEYS
// ==========================================
const CONFIG = {
    ADMIN_USER: "diegosilvaeo",       
    ADMIN_PASSWORD: "arcnet2154",     
    YT_API_KEY: "AIzaSyATXiihPhDZohvy8mJKsAk8vjZ4WkPekmQ",
    FIREBASE_URL: "https://workin--music-default-rtdb.firebaseio.com/musicas.json" 
};

// Estado Global da Aplicação
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

// ==========================================
// 1. AUTENTICAÇÃO COM SESSÃO E SUPORTE A ENTER
// ==========================================
function checkSession() {
    const loginData = localStorage.getItem('streamhub_session');
    if (loginData) {
        const session = JSON.parse(loginData);
        if (Date.now() - session.timestamp < 2 * 60 * 60 * 1000) {
            document.getElementById('login-screen').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
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

    inputUser.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') inputPass.focus();
    });

    inputPass.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    btnLogin.addEventListener('click', handleLogin);
}

function handleLogin() {
    const inputUser = document.getElementById('login-user').value.trim();
    const inputPass = document.getElementById('login-pass').value.trim();
    
    if (inputUser === CONFIG.ADMIN_USER && inputPass === CONFIG.ADMIN_PASSWORD) {
        localStorage.setItem('streamhub_session', JSON.stringify({ user: inputUser, timestamp: Date.now() }));
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        initApp();
    } else {
        alert("Usuário ou senha incorretos!");
    }
}

function handleLogoutActions() {
    localStorage.removeItem('streamhub_session');
    if (ytPlayer) { try { ytPlayer.stopVideo(); } catch(e){} }
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
}

// ==========================================
// 2. INICIALIZAÇÃO E CARGA DO FIREBASE (CORRIGIDO)
// ==========================================
async function initApp() {
    await carregarCanaisDinamicos();
    
    // Conexão e tratamento do nó principal de mídias
    try {
        const res = await fetch(CONFIG.FIREBASE_URL);
        const data = await res.json();
        database = [];
        if (data) {
            // Mapeia o objeto linear tratando arrays e objetos sem quebrar chaves acentuadas
            if (Array.isArray(data)) {
                database = data.filter(item => item !== null);
            } else {
                Object.keys(data).forEach(key => {
                    if (data[key]) database.push({ idFirebase: key, ...data[key] });
                });
            }
        }
    } catch (e) {
        console.log("Erro ao carregar mídias, usando array local.", e);
    } finally {
        renderSidebar();
        renderMosaic();
        setupEventListeners();
    }
}

async function carregarCanaisDinamicos() {
    try {
        // Encurta a URL base do Firebase para localizar o nó de canais
        const baseUrl = CONFIG.FIREBASE_URL.substring(0, CONFIG.FIREBASE_URL.lastIndexOf('/'));
        const res = await fetch(`${baseUrl}/canais_dinamicos.json`);
        const data = await res.json();
        canaisDinamicos = data || {};
    } catch (e) {
        console.error("Erro ao carregar canais dinâmicos:", e);
    }
}

// ==========================================
// 3. RENDERIZAÇÃO DO MOSAICO
// ==========================================
function renderMosaic() {
    const grid = document.getElementById('mosaic-grid');
    grid.innerHTML = '';

    document.getElementById('bc-category').classList.add('hidden');
    document.getElementById('bc-subcategory').classList.add('hidden');
    document.getElementById('bc-search').classList.add('hidden');

    if (currentView === 'categories') {
        const categories = [...new Set(database.map(item => item.categoria))];
        categories.forEach(cat => {
            if(!cat) return;
            const match = database.find(item => item.categoria === cat);
            grid.appendChild(createCard(cat, match ? match.capa : '', false, false, () => {
                selectedCategory = cat;
                currentView = 'subcategories';
                renderMosaic();
            }, -1));
        });
    } 
    else if (currentView === 'subcategories') {
        document.getElementById('bc-category').classList.remove('hidden');
        document.getElementById('bc-category').querySelector('.txt').innerText = selectedCategory;

        const subcategories = [...new Set(database.filter(item => item.categoria === selectedCategory).map(item => item.subcategoria))];
        
        // Verifica se há canal associado a esta categoria para injetar subcategoria virtual
        const nodeName = btoa(unescape(encodeURIComponent(selectedCategory))).replace(/=/g, "");
        if (canaisDinamicos[nodeName] && !subcategories.includes("Vídeos Recentes")) {
            subcategories.push("Vídeos Recentes");
        }

        subcategories.forEach(sub => {
            const match = database.find(item => item.categoria === selectedCategory && item.subcategoria === sub);
            grid.appendChild(createCard(sub, match ? match.capa : (canaisDinamicos[nodeName] ? canaisDinamicos[nodeName].thumb : ''), false, false, () => {
                selectedSubcategory = sub;
                currentView = 'tracks';
                renderMosaic();
            }, -1));
        });
    } 
    else if (currentView === 'tracks') {
        document.getElementById('bc-category').classList.remove('hidden');
        document.getElementById('bc-category').querySelector('.txt').innerText = selectedCategory;
        document.getElementById('bc-subcategory').classList.remove('hidden');
        document.getElementById('bc-subcategory').querySelector('.txt').innerText = selectedSubcategory;

        if (selectedSubcategory === "Vídeos Recentes") {
            const nodeName = btoa(unescape(encodeURIComponent(selectedCategory))).replace(/=/g, "");
            if (canaisDinamicos[nodeName]) {
                buscarVideosRecentesDoCanal(canaisDinamicos[nodeName].uploadsPlaylistId);
            }
        } else {
            currentPlaylist = database.filter(item => item.categoria === selectedCategory && item.subcategoria === selectedSubcategory);
            currentPlaylist.forEach((track, index) => {
                const realIndex = database.findIndex(dbItem => dbItem.link === track.link && dbItem.título === track.título);
                grid.appendChild(createCard(track.título, track.capa, false, false, () => {
                    playTrack(index);
                }, realIndex));
            });
        }
    }
    else if (currentView === 'search_results') {
        document.getElementById('bc-search').classList.remove('hidden');
        lastYtSearchResults.forEach(item => {
            const isPlaylist = item.type === 'playlist';
            const card = createCard(item.title, item.thumb, true, isPlaylist, null, -1);
            
            card.querySelector('.add-music-badge').onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                openAdminWithTrack(item);
            };

            const btnGroup = document.createElement('div');
            btnGroup.className = 'search-btn-group';
            
            const btnPlay = document.createElement('button');
            btnPlay.style.background = '#2980b9';
            btnPlay.innerHTML = `<i class="fas fa-play"></i> Assistir`;
            btnPlay.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                let fakeTrack = { título: item.title, link: isPlaylist ? `https://www.youtube.com/playlist?list=${item.youtubeId}` : `https://www.youtube.com/embed/${item.youtubeId}` };
                currentPlaylist = [fakeTrack];
                playTrack(0);
            };
            btnGroup.appendChild(btnPlay);

            if(isPlaylist) {
                const btnList = document.createElement('button');
                btnList.style.background = '#8e44ad';
                btnList.innerHTML = `<i class="fas fa-list"></i> Ver Mídias`;
                btnList.onclick = (e) => {
                    e.preventDefault(); e.stopPropagation();
                    peekPlaylistContents(item.youtubeId);
                };
                btnGroup.appendChild(btnList);
            }

            card.appendChild(btnGroup);
            grid.appendChild(card);
        });
    }
}

function createCard(title, imgSrc, showAddButton = false, isPlaylist = false, clickCallback, realIndex = -1) {
    const card = document.createElement('div');
    card.className = 'card';
    let htmlContent = `<img src="${imgSrc || 'https://placehold.co/160x90?text=Sem+Capa'}"><h4>${title}</h4>`;
    if(isPlaylist) htmlContent += `<span class="media-type-badge"><i class="fas fa-photo-film"></i> Playlist</span>`;
    if(showAddButton) {
        const btnText = isPlaylist ? "Add Playlist" : "Adicionar";
        htmlContent += `<button class="add-music-badge"><i class="fas fa-plus"></i> ${btnText}</button>`;
    }
    
    if(realIndex >= 0) {
        htmlContent += `<div class="quick-edit-badge" title="Editar esta mídia"><i class="fas fa-cog"></i></div>`;
    }

    card.innerHTML = htmlContent;
    if(clickCallback) card.addEventListener('click', clickCallback);

    if(realIndex >= 0) {
        card.querySelector('.quick-edit-badge').addEventListener('click', (e) => {
            e.preventDefault(); e.stopPropagation();
            openAdvancedEditModal(realIndex);
        });
    }

    return card;
}

// ==========================================
// 4. CHAMADAS DA API DE CANAIS DINÂMICOS
// ==========================================
async function buscarVideosRecentesDoCanal(playlistId) {
    document.getElementById('mosaic-grid').innerHTML = '<h3>Atualizando vídeos recentes do canal via API...</h3>';
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=15&playlistId=${playlistId}&key=${CONFIG.YT_API_KEY}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        if(data.items) {
            currentPlaylist = data.items.map(item => ({
                título: item.snippet.title,
                link: `https://www.youtube.com/embed/${item.snippet.resourceId.videoId}`,
                capa: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : item.snippet.thumbnails.default.url,
                categoria: selectedCategory,
                subcategoria: "Vídeos Recentes",
                isDinâmico: true
            }));
            
            const grid = document.getElementById('mosaic-grid');
            grid.innerHTML = '';
            currentPlaylist.forEach((track, index) => {
                grid.appendChild(createCard(track.título, track.capa, false, false, () => {
                    playTrack(index);
                }, -1));
            });
        }
    } catch (e) {
        document.getElementById('mosaic-grid').innerHTML = '<h3>Erro ao carregar feeds do canal.</h3>';
    }
}

function configurarEventosBuscaCanal() {
    document.getElementById("btn-search-channel").onpointerdown = async (e) => {
        e.preventDefault();
        const termo = document.getElementById("search-channel-input").value.trim();
        if(!termo) return alert("Digite o nome de um canal.");

        try {
            const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(termo)}&key=${CONFIG.YT_API_KEY}`;
            const res = await fetch(url);
            const data = await res.json();

            if(!data.items || data.items.length === 0) return alert("Nenhum canal localizado.");

            const item = data.items[0];
            canalSelecionadoProvisorio = {
                channelId: item.snippet.channelId,
                title: item.snippet.title,
                thumb: item.snippet.thumbnails.default.url,
                description: item.snippet.description
            };

            document.getElementById("chan-thumb").src = canalSelecionadoProvisorio.thumb;
            document.getElementById("chan-title-text").innerText = canalSelecionadoProvisorio.title;
            document.getElementById("chan-desc-text").innerText = canalSelecionadoProvisorio.description;
            document.getElementById("channel-preview").style.display = "flex";
        } catch(err) { alert("Erro na API."); }
    };

    document.getElementById("btn-save-channel-link").onpointerdown = async (e) => {
        e.preventDefault();
        const catDestino = document.getElementById("channel-target-category").value.trim();
        if(!canalSelecionadoProvisorio || !catDestino) return alert("Preencha todos os dados.");

        try {
            const baseUrl = CONFIG.FIREBASE_URL.substring(0, CONFIG.FIREBASE_URL.lastIndexOf('/'));
            const uploadsListId = canalSelecionadoProvisorio.channelId.replace(/^UC/, "UU");
            const payload = {
                channelId: canalSelecionadoProvisorio.channelId,
                uploadsPlaylistId: uploadsListId,
                title: canalSelecionadoProvisorio.title,
                thumb: canalSelecionadoProvisorio.thumb
            };

            const nodeName = btoa(unescape(encodeURIComponent(catDestino))).replace(/=/g, "");
            await fetch(`${baseUrl}/canais_dinamicos/${nodeName}.json`, {
                method: "PUT",
                body: JSON.stringify(payload)
            });

            alert("Canal vinculado com sucesso!");
            document.getElementById("channel-preview").style.display = "none";
            document.getElementById("search-channel-input").value = "";
            document.getElementById("channel-target-category").value = "";
            canalSelecionadoProvisorio = null;
            initApp();
        } catch(err) { alert("Erro ao salvar canal."); }
    };
}

// ==========================================
// 5. COMPONENTES DE INTERFACE E EVENTOS
// ==========================================
function renderSidebar() {
    const tree = document.getElementById('sidebar-tree');
    tree.innerHTML = '';

    const categories = [...new Set(database.map(item => item.categoria))];
    
    // Injeta categorias órfãs vindas dos canais dinâmicos
    Object.keys(canaisDinamicos).forEach(key => {
        try {
            const catNome = decodeURIComponent(escape(atob(key)));
            if(!categories.includes(catNome)) categories.push(catNome);
        } catch(e){}
    });

    categories.sort().forEach(cat => {
        if(!cat) return;
        const catLi = document.createElement('li');
        const catToggle = document.createElement('span');
        catToggle.className = 'category-toggle';
        catToggle.innerHTML = `<i class="fas fa-folder"></i> ${cat}`;
        
        const subUl = document.createElement('ul');
        subUl.className = 'tree-sub hidden';

        catToggle.addEventListener('click', () => subUl.classList.toggle('hidden'));

        const subcategories = [...new Set(database.filter(item => item.categoria === cat).map(item => item.subcategoria))];
        
        const nodeName = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "");
        if(canaisDinamicos[nodeName]) subcategories.push("Vídeos Recentes");

        subcategories.sort().forEach(sub => {
            if(!sub) return;
            const subLi = document.createElement('li');
            subLi.innerHTML = sub === "Vídeos Recentes" ? `<i class="fas fa-sync text-red"></i> <b>${sub}</b>` : `<i class="fas fa-photo-film"></i> ${sub}`;
            subLi.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedCategory = cat;
                selectedSubcategory = sub;
                currentView = 'tracks';
                renderMosaic();
                if(window.innerWidth <= 768) handleToggleSidebar();
            });
            subUl.appendChild(subLi);
        });

        catLi.appendChild(catToggle);
        catLi.appendChild(subUl);
        tree.appendChild(catLi);
    });
}

function filterInternalDatabase(query) {
    const lowerQuery = query.toLowerCase().trim();
    document.querySelectorAll('#sidebar-tree > li').forEach(catLi => {
        const catName = catLi.querySelector('.category-toggle').innerText.toLowerCase();
        let match = catName.includes(lowerQuery);
        let subMatchAny = false;

        catLi.querySelectorAll('.tree-sub li').forEach(subLi => {
            const subName = subLi.innerText.toLowerCase();
            const realCat = catLi.querySelector('.category-toggle').innerText.trim();
            const realSub = subLi.innerText.trim();

            const mediaMatch = database.some(item => 
                item.categoria === realCat && item.subcategoria === realSub && item.título.toLowerCase().includes(lowerQuery)
            );

            if(subName.includes(lowerQuery) || mediaMatch || match) {
                subLi.classList.remove('hidden'); subMatchAny = true;
            } else { subLi.classList.add('hidden'); }
        });

        if(match || subMatchAny) catLi.classList.remove('hidden'); else catLi.classList.add('hidden');
    });
}

async function searchYouTubeGlobal(query) {
    if(!query.trim()) return;
    currentView = 'search_results';
    renderMosaic();
    document.getElementById('mosaic-grid').innerHTML = '<h3>Buscando no YouTube...</h3>';

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=30&q=${encodeURIComponent(query)}&type=video,playlist&key=${CONFIG.YT_API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        lastYtSearchResults = [];
        if(data.items) {
            data.items.forEach(item => {
                const isPl = item.id.kind === 'youtube#playlist';
                lastYtSearchResults.push({
                    type: isPl ? 'playlist' : 'video',
                    youtubeId: isPl ? item.id.playlistId : item.id.videoId,
                    title: item.snippet.title,
                    thumb: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : 'https://placehold.co/300x200?text=Sem+Capa'
                });
            });
        }
        renderMosaic();
    } catch (e) {
        document.getElementById('mosaic-grid').innerHTML = '<h3>Erro na busca do YouTube.</h3>';
    }
}

async function peekPlaylistContents(playlistId) {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${CONFIG.YT_API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if(data.items) {
            let titles = data.items.map((item, idx) => `${idx + 1}. ${item.snippet.title}`).join('\n');
            alert(`Mídias nesta Playlist:\n\n${titles.substring(0, 1500)}`);
        }
    } catch(e) { alert("Erro ao ler playlist."); }
}

// ==========================================
// 6. CHAVEAMENTO TRIPLO DO PLAYER
// ==========================================
function playTrack(index) {
    if(currentPlaylist.length === 0) return;
    currentTrackIndex = index;
    const track = currentPlaylist[index];

    document.getElementById('player-container').classList.remove('hidden');
    document.getElementById('current-track-title').innerText = track.título;

    const ytPlayerEl = document.getElementById('yt-player');
    const univPlayerEl = document.getElementById('universal-player');
    const rawPlayerEl = document.getElementById('raw-player');

    univPlayerEl.src = ""; rawPlayerEl.src = "";
    univPlayerEl.classList.add('hidden'); rawPlayerEl.classList.add('hidden'); ytPlayerEl.classList.add('hidden');
    rawPlayerEl.pause();

    const linkLower = track.link.toLowerCase();

    if(linkLower.includes('youtube.com') || linkLower.includes('youtu.be')) {
        ytPlayerEl.classList.remove('hidden');
        const vId = extractYoutubeId(track.link);
        if (!ytPlayer) {
            ytPlayer = new YT.Player('yt-player', {
                videoId: vId,
                playerVars: { 'autoplay': 1, 'playsinline': 1 },
                events: { 'onStateChange': (e) => { if(e.data === 0 && currentTrackIndex + 1 < currentPlaylist.length) playTrack(currentTrackIndex + 1); } }
            });
        } else { ytPlayer.loadVideoById(vId); }
    } 
    else if(linkLower.endsWith('.mp4') || linkLower.endsWith('.mkv') || linkLower.endsWith('.avi') || linkLower.includes('raw.githubusercontent')) {
        rawPlayerEl.classList.remove('hidden');
        rawPlayerEl.src = track.link;
        rawPlayerEl.play();
        rawPlayerEl.onended = () => { if(currentTrackIndex + 1 < currentPlaylist.length) playTrack(currentTrackIndex + 1); };
    } 
    else {
        univPlayerEl.classList.remove('hidden');
        univPlayerEl.src = track.link.includes("archive.org/details/") ? track.link.replace("archive.org/details/", "archive.org/embed/") : track.link;
    }
}

// ==========================================
// 7. ARVORE GERENCIAL SANFONA (CRUD)
// ==========================================
function renderCrudManager() {
    const listContainer = document.getElementById('crud-tree-list');
    listContainer.innerHTML = '';

    const categories = [...new Set(database.map(item => item.categoria))];
    Object.keys(canaisDinamicos).forEach(k => {
        try { const c = decodeURIComponent(escape(atob(k))); if(!categories.includes(c)) categories.push(c); } catch(e){}
    });

    categories.sort().forEach(cat => {
        if(!cat) return;
        const catRow = createCrudRow(cat, 'categoria', () => {
            let novo = prompt("Novo nome para a Categoria:", cat);
            if(novo && novo.trim() !== "") {
                database.forEach(item => { if(item.categoria === cat) item.categoria = novo.trim(); });
                saveState();
            }
        }, () => {
            if(confirm(`Excluir toda a categoria "${cat}"?`)) {
                deletarCategoriaCompleta(cat);
            }
        }, () => {
            downloadJSON(database.filter(item => item.categoria === cat), `categoria_${cat}`);
        });

        const subContainer = document.createElement('div');
        subContainer.style.display = expandedCrudCats[cat] ? 'block' : 'none';
        catRow.addEventListener('click', (e) => {
            if(e.target.closest('.crud-actions')) return;
            expandedCrudCats[cat] = !expandedCrudCats[cat];
            subContainer.style.display = expandedCrudCats[cat] ? 'block' : 'none';
        });

        listContainer.appendChild(catRow);

        const subcategories = [...new Set(database.filter(item => item.categoria === cat).map(item => item.subcategoria))];
        const nodeName = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "");
        if(canaisDinamicos[nodeName]) subcategories.push("Vídeos Recentes");

        subcategories.sort().forEach(sub => {
            const subRow = createCrudRow(sub, 'subcategoria', null, () => {
                if(confirm(`Excluir subcategoria "${sub}"?`)) deletarSubcategoria(cat, sub);
            }, () => {
                downloadJSON(database.filter(item => item.categoria === cat && item.subcategoria === sub), `sub_${sub}`);
            });

            const mediaContainer = document.createElement('div');
            mediaContainer.style.display = expandedCrudSubs[cat + '_' + sub] ? 'block' : 'none';
            subRow.addEventListener('click', (e) => {
                if(e.target.closest('.crud-actions')) return;
                expandedCrudSubs[cat + '_' + sub] = !expandedCrudSubs[cat + '_' + sub];
                mediaContainer.style.display = expandedCrudSubs[cat + '_' + sub] ? 'block' : 'none';
            });

            subContainer.appendChild(subRow);

            if(sub === "Vídeos Recentes") {
                const infoRow = document.createElement('div');
                infoRow.className = 'crud-item track-level';
                infoRow.innerHTML = `<span><i class="fas fa-link"></i> Canal Conectado: ${canaisDinamicos[nodeName].title}</span>`;
                mediaContainer.appendChild(infoRow);
            } else {
                database.forEach((item, idx) => {
                    if(item.categoria === cat && item.subcategoria === sub) {
                        const mediaRow = createCrudRow(item.título, 'mídia', () => openAdvancedEditModal(idx), () => {
                            if(confirm(`Excluir mídia?`)) { deletarMidiaUnica(item); }
                        }, () => downloadJSON(item, item.título));
                        mediaContainer.appendChild(mediaRow);
                    }
                });
            }
            subContainer.appendChild(mediaContainer);
        });
        listContainer.appendChild(subContainer);
    });
}

function createCrudRow(title, type, onEdit, onDel, onExp) {
    const row = document.createElement('div');
    row.className = `crud-item ${type === 'subcategoria' ? 'sub-level' : type === 'mídia' ? 'track-level' : ''}`;
    let icon = type === 'categoria' ? '<i class="fas fa-folder"></i>' : (type === 'subcategoria' ? '<i class="fas fa-video"></i>' : '<i class="fas fa-play-circle"></i>');

    row.innerHTML = `<span>${icon} <strong>[${type.toUpperCase()}]</strong> ${title}</span>
        <div class="crud-actions">
            ${onEdit ? '<button class="crud-btn btn-edit"><i class="fas fa-edit"></i></button>' : ''}
            <button class="crud-btn btn-del"><i class="fas fa-trash"></i></button>
            <button class="crud-btn btn-exp"><i class="fas fa-download"></i></button>
        </div>`;
    if(onEdit) row.querySelector('.btn-edit').onclick = (e) => { e.stopPropagation(); onEdit(); };
    row.querySelector('.btn-del').onclick = (e) => { e.stopPropagation(); onDel(); };
    row.querySelector('.btn-exp').onclick = (e) => { e.stopPropagation(); onExp(); };
    return row;
}

// ==========================================
// 8. PERSISTÊNCIA E OPERAÇÕES CRUD NO FIREBASE
// ==========================================
function openAdvancedEditModal(index) {
    activeEditingIndex = index;
    const item = database[index];
    document.getElementById('edit-field-title').value = item.título || "";
    document.getElementById('edit-field-link').value = item.link || "";
    document.getElementById('edit-field-capa').value = item.capa || "";
    document.getElementById('edit-field-category').value = item.categoria || "";
    document.getElementById('edit-field-subcategory').value = item.subcategoria || "";
    document.getElementById('edit-media-modal').classList.remove('hidden');
}

function saveAdvancedEditChanges(e) {
    if(e) { e.preventDefault(); }
    const t = document.getElementById('edit-field-title').value.trim();
    const l = document.getElementById('edit-field-link').value.trim();
    const c = document.getElementById('edit-field-capa').value.trim();
    const cat = document.getElementById('edit-field-category').value.trim();
    const sub = document.getElementById('edit-field-subcategory').value.trim();

    if(!t || !l || !cat) return alert("Preencha os campos obrigatórios.");

    database[activeEditingIndex].título = t;
    database[activeEditingIndex].link = l;
    database[activeEditingIndex].capa = c;
    database[activeEditingIndex].categoria = cat;
    database[activeEditingIndex].subcategoria = sub;

    document.getElementById('edit-media-modal').classList.add('hidden');
    saveState();
}

async function deletarMidiaUnica(item) {
    if(item.idFirebase) {
        const baseUrl = CONFIG.FIREBASE_URL.substring(0, CONFIG.FIREBASE_URL.lastIndexOf('/'));
        await fetch(`${baseUrl}/midias/${item.idFirebase}.json`, { method: 'DELETE' });
    }
    database = database.filter(i => i !== item);
    saveState();
}

async function deletarSubcategoria(cat, sub) {
    const baseUrl = CONFIG.FIREBASE_URL.substring(0, CONFIG.FIREBASE_URL.lastIndexOf('/'));
    if(sub === "Vídeos Recentes") {
        const nodeName = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "");
        await fetch(`${baseUrl}/canais_dinamicos/${nodeName}.json`, { method: 'DELETE' });
    } else {
        const alvos = database.filter(item => item.categoria === cat && item.subcategoria === sub);
        for(let item of alvos) {
            if(item.idFirebase) await fetch(`${baseUrl}/midias/${item.idFirebase}.json`, { method: 'DELETE' });
        }
        database = database.filter(item => !(item.categoria === cat && item.subcategoria === sub));
    }
    saveState();
}

async function deletarCategoriaCompleta(cat) {
    const baseUrl = CONFIG.FIREBASE_URL.substring(0, CONFIG.FIREBASE_URL.lastIndexOf('/'));
    const alvos = database.filter(item => item.categoria === cat);
    for(let item of alvos) {
        if(item.idFirebase) await fetch(`${baseUrl}/midias/${item.idFirebase}.json`, { method: 'DELETE' });
    }
    const nodeName = btoa(unescape(encodeURIComponent(cat))).replace(/=/g, "");
    await fetch(`${baseUrl}/canais_dinamicos/${nodeName}.json`, { method: 'DELETE' });
    
    database = database.filter(item => item.categoria !== cat);
    saveState();
}

function saveState() {
    // Organiza a lista para salvar no formato Array estruturado compatível com PUT
    const dadosSalvar = database.map(({idFirebase, ...rest}) => rest);
    const baseUrl = CONFIG.FIREBASE_URL.substring(0, CONFIG.FIREBASE_URL.lastIndexOf('/'));
    
    fetch(`${baseUrl}/midias.json`, { method: 'PUT', body: JSON.stringify(dadosSalvar) })
        .then(() => {
            // Sincroniza e redesenha visões
            fetch(CONFIG.FIREBASE_URL)
                .then(res => res.json())
                .then(data => {
                    database = [];
                    if(data) {
                        if (Array.isArray(data)) database = data.filter(i => i !== null);
                        else Object.keys(data).forEach(k => database.push({ idFirebase: k, ...data[k] }));
                    }
                    renderSidebar(); renderMosaic(); renderCrudManager();
                });
        });
}

function downloadJSON(obj, filename) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(obj, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `${filename.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_backup.json`);
    document.body.appendChild(a); a.click(); a.remove();
}

function handleToggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('open');
    sidebar.classList.toggle('collapsed');
}

function switchTabs(targetTabId, activeTriggerBtnId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(activeTriggerBtnId).classList.add('active');
    document.getElementById(targetTabId).classList.remove('hidden');
}

// ==========================================
// 9. CONFIGURAÇÃO DOS GATILHOS DA INTERFACE
// ==========================================
function setupEventListeners() {
    document.getElementById('search-yt-input').onkeypress = (e) => { if(e.key === 'Enter') searchYouTubeGlobal(e.target.value); };
    document.getElementById('search-internal-input').oninput = (e) => filterInternalDatabase(e.target.value);
    document.getElementById('toggle-sidebar').onpointerdown = (e) => { e.preventDefault(); handleToggleSidebar(); };
    document.getElementById('bc-root').onclick = () => { currentView = 'categories'; renderMosaic(); };

    document.getElementById('btn-open-admin').onpointerdown = (e) => {
        e.preventDefault(); document.getElementById('admin-modal').classList.remove('hidden');
        switchTabs('add-tab', 'tab-trigger-add'); renderCrudManager(); 
    };
    document.getElementById('btn-close-admin').onpointerdown = (e) => { e.preventDefault(); document.getElementById('admin-modal').classList.add('hidden'); };
    
    document.getElementById('tab-trigger-manage').onpointerdown = (e) => { e.preventDefault(); switchTabs('manage-tab', 'tab-trigger-manage'); renderCrudManager(); };
    document.getElementById('tab-trigger-add').onpointerdown = (e) => { e.preventDefault(); switchTabs('add-tab', 'tab-trigger-add'); };
    document.getElementById('tab-trigger-channel').onpointerdown = (e) => { e.preventDefault(); switchTabs('channel-tab', 'tab-trigger-channel'); };

    document.getElementById('btn-submit-edit-media').onpointerdown = (e) => saveAdvancedEditChanges(e);
    document.getElementById('btn-cancel-edit-media').onpointerdown = (e) => { e.preventDefault(); document.getElementById('edit-media-modal').classList.add('hidden'); };

    document.getElementById('btn-close-player').onpointerdown = (e) => {
        e.preventDefault();
        if(ytPlayer && typeof ytPlayer.stopVideo === 'function') { try { ytPlayer.stopVideo(); } catch(err){} }
        document.getElementById('universal-player').src = "";
        const rp = document.getElementById('raw-player'); rp.pause(); rp.src = "";
        document.getElementById('player-container').classList.add('hidden');
    };

    configurarEventosBuscaCanal();
}

// Inicialização de Sessão
window.onload = () => {
    configurarEventosLogin();
    checkSession();
};
