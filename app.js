// CONFIGURAÇÕES GERAIS - INSIRA SUAS CHAVES AQUI
const CONFIG = {
    ADMIN_USER: "diegosilvaeo",       
    ADMIN_PASSWORD: "arcnet2154",     
    YT_API_KEY: "AIzaSyATXiihPhDZohvy8mJKsAk8vjZ4WkPekmQ",
    FIREBASE_URL: "https://workin--music-default-rtdb.firebaseio.com/musicas.json" 
};

let database = [
    {
        capa: "https://img.youtube.com/vi/4p0Mv3NIdS4/0.jpg",
        categoria: "Rock",
        subcategoria: "Nacionais",
        título: "Capital Inicial - Primeiros Erros",
        link: "https://www.youtube.com/embed/4p0Mv3NIdS4"
    }
];

let currentView = 'categories'; 
let selectedCategory = '';
let selectedSubcategory = '';
let currentPlaylist = [];
let currentTrackIndex = 0;
let ytPlayer = null;
let lastYtSearchResults = []; 
let activeEditingIndex = null;

// Controladores para salvar quais blocos da arvore gerencial estao expandidos
let expandedCrudCats = {};
let expandedCrudSubs = {};

// ==========================================
// 1. AUTENTICAÇÃO COM SESSÃO DE 2 HORAS
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

document.getElementById('login-user').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') document.getElementById('login-pass').focus();
});
document.getElementById('login-pass').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleLogin();
});
document.getElementById('btn-login').addEventListener('click', handleLogin);
document.getElementById('btn-logout').addEventListener('click', handleLogoutActions);

function handleLogin() {
    const inputUser = document.getElementById('login-user').value;
    const inputPass = document.getElementById('login-pass').value;
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

function initApp() {
    fetch(CONFIG.FIREBASE_URL)
        .then(res => res.json())
        .then(data => { 
            if(data) {
                database = Array.isArray(data) ? data : Object.values(data);
            } 
        })
        .catch(e => console.log("Usando banco local padrão."))
        .finally(() => {
            renderSidebar();
            renderMosaic();
            setupEventListeners();
        });
}

function extractYoutubeId(url) {
    if(!url) return "";
    if(url.includes('embed/')) {
        return url.split('embed/')[1].split('?')[0];
    }
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length == 11) ? match[2] : "";
}

// ==========================================
// 2. RENDERIZAÇÃO DOS MOSAICOS (GRID)
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
        subcategories.forEach(sub => {
            const match = database.find(item => item.categoria === selectedCategory && item.subcategoria === sub);
            grid.appendChild(createCard(sub, match ? match.capa : '', false, false, () => {
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

        currentPlaylist = database.filter(item => item.categoria === selectedCategory && item.subcategoria === selectedSubcategory);
        currentPlaylist.forEach((track, index) => {
            // Procura o index real no banco completo para repassar ao botao de edicao direta
            const realIndex = database.findIndex(dbItem => dbItem.link === track.link && dbItem.título === track.título);
            grid.appendChild(createCard(track.título, track.capa, false, false, () => {
                playTrack(index);
            }, realIndex));
        });
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

            // INCLUSÃO DE RECURSOS EXTRAS: Assistir previa e listar mídias da playlist
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

// MODIFICADO: Agora inclui parametro realIndex para acionar o botão de edição flutuante no mosaico
function createCard(title, imgSrc, showAddButton = false, isPlaylist = false, clickCallback, realIndex = -1) {
    const card = document.createElement('div');
    card.className = 'card';
    let htmlContent = `<img src="${imgSrc}"><h4>${title}</h4>`;
    if(isPlaylist) htmlContent += `<span class="media-type-badge"><i class="fas fa-photo-film"></i> Playlist</span>`;
    if(showAddButton) {
        const btnText = isPlaylist ? "Add Playlist" : "Adicionar";
        htmlContent += `<button class="add-music-badge"><i class="fas fa-plus"></i> ${btnText}</button>`;
    }
    
    // REQUISITO: Ícone de edição rápida no canto inferior direito para mídias válidas exibidas
    if(realIndex >= 0) {
        htmlContent += `<div class="quick-edit-badge" title="Editar esta mídia na hora"><i class="fas fa-cog"></i></div>`;
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

// REQUISITO: Mostrar os títulos de cada vídeo contido em uma playlist direto na busca
async function peekPlaylistContents(playlistId) {
    alert("Buscando títulos da playlist... Aguarde.");
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${playlistId}&key=${CONFIG.YT_API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if(data.items && data.items.length > 0) {
            let titles = data.items.map((item, idx) => `${idx + 1}. ${item.snippet.title}`).join('\n');
            alert(`Mídias nesta Playlist:\n\n${titles.substring(0, 1500)}${titles.length > 1500 ? '\n...e mais mídias.' : ''}`);
        } else {
            alert("Esta playlist não retornou mídias públicas.");
        }
    } catch(e) {
        alert("Erro ao ler dados da playlist.");
    }
}

// ==========================================
// 3. MENU LATERAL SANFONA
// ==========================================
function renderSidebar() {
    const tree = document.getElementById('sidebar-tree');
    tree.innerHTML = '';

    const categories = [...new Set(database.map(item => item.categoria))];
    categories.forEach(cat => {
        if(!cat) return;
        const catLi = document.createElement('li');
        const catToggle = document.createElement('span');
        catToggle.className = 'category-toggle';
        catToggle.innerHTML = `<i class="fas fa-folder"></i> ${cat}`;
        
        const subUl = document.createElement('ul');
        subUl.className = 'tree-sub hidden';

        catToggle.addEventListener('click', () => subUl.classList.toggle('hidden'));

        const subcategories = [...new Set(database.filter(item => item.categoria === cat).map(item => item.subcategoria))];
        subcategories.forEach(sub => {
            if(!sub) return;
            const subLi = document.createElement('li');
            subLi.innerHTML = `<i class="fas fa-photo-film"></i> ${sub}`;
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

// ==========================================
// 4. PESQUISA GLOBAL YOUTUBE (V3)
// ==========================================
async function searchYouTubeGlobal(query) {
    if(!query.trim()) return;
    if(query.includes('list=')) {
        const urlParams = new URLSearchParams(new URL(query).search);
        return fetchPlaylistItems(urlParams.get('list'));
    }

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
                    thumb: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : 'https://placehold.co/300x200?text=Sem+Capa',
                    channel: item.snippet.channelTitle
                });
            });
        }
        renderMosaic();
    } catch (e) {
        document.getElementById('mosaic-grid').innerHTML = '<h3>Erro na busca global do YouTube.</h3>';
    }
}

async function fetchPlaylistItems(playlistId) {
    currentView = 'search_results';
    renderMosaic();
    document.getElementById('mosaic-grid').innerHTML = '<h3>Importando Playlist...</h3>';
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=40&playlistId=${playlistId}&key=${CONFIG.YT_API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        lastYtSearchResults = [];
        if(data.items) {
            data.items.forEach(item => {
                lastYtSearchResults.push({
                    type: 'video',
                    youtubeId: item.snippet.resourceId.videoId,
                    title: item.snippet.title,
                    thumb: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : 'https://placehold.co/120x90',
                    channel: item.snippet.channelTitle
                });
            });
        }
        renderMosaic();
    } catch(e) {
        document.getElementById('mosaic-grid').innerHTML = '<h3>Erro ao carregar playlist.</h3>';
    }
}

async function fetchManualLinkData(e) {
    if(e) { e.preventDefault(); e.stopPropagation(); }
    const url = document.getElementById('manual-media-url').value.trim();
    if(!url) return alert("Cole uma URL válida.");

    if(!url.includes("youtube.com") && !url.includes("youtu.be")) {
        document.getElementById('prev-thumb').src = "https://placehold.co/120x90?text=Link+Externo";
        document.getElementById('prev-title').value = "Mídia Externa / Arquivo Direto";
        document.getElementById('prev-title').dataset.videoid = url;
        document.getElementById('prev-title').dataset.mediatype = 'externo';
        return;
    }

    document.getElementById('btn-fetch-manual').innerText = "Buscando...";
    let isPlaylist = url.includes('list=');
    let targetId = isPlaylist ? new URLSearchParams(new URL(url).search).get('list') : extractYoutubeId(url);

    if(!targetId) {
        document.getElementById('btn-fetch-manual').innerText = "Capturar Dados";
        return alert("Não extraiu o ID.");
    }

    const endpoint = isPlaylist ? 'playlists' : 'videos';
    const apiUrl = `https://www.googleapis.com/youtube/v3/${endpoint}?part=snippet&id=${targetId}&key=${CONFIG.YT_API_KEY}`;
    try {
        const res = await fetch(apiUrl);
        const data = await res.json();
        if(data.items && data.items.length > 0) {
            const snippet = data.items[0].snippet;
            document.getElementById('prev-thumb').src = snippet.thumbnails.medium ? snippet.thumbnails.medium.url : 'https://placehold.co/120x90';
            document.getElementById('prev-title').value = snippet.title;
            document.getElementById('prev-title').dataset.videoid = targetId;
            document.getElementById('prev-title').dataset.mediatype = isPlaylist ? 'playlist' : 'video';
        }
    } catch(e) { alert("Erro de API."); }
    finally { document.getElementById('btn-fetch-manual').innerText = "Capturar Dados"; }
}

function openAdminWithTrack(item) {
    document.getElementById('admin-modal').classList.remove('hidden');
    switchTabs('add-tab', 'tab-trigger-add');
    document.getElementById('manual-media-url').value = ""; 
    document.getElementById('prev-thumb').src = item.thumb;
    document.getElementById('prev-title').value = item.title;
    document.getElementById('prev-title').dataset.videoid = item.youtubeId;
    document.getElementById('prev-title').dataset.mediatype = item.type; 
}

// REQUISITO: Indexar mídias individuais além de categorias/subcategorias na pesquisa lateral interna
function filterInternalDatabase(query) {
    const lowerQuery = query.toLowerCase().trim();
    const treeItems = document.querySelectorAll('#sidebar-tree > li');
    
    treeItems.forEach(catLi => {
        const catName = catLi.querySelector('.category-toggle').innerText.toLowerCase();
        let catMatches = catName.includes(lowerQuery);
        let subMatchesAny = false;

        const subLis = catLi.querySelectorAll('.tree-sub li');
        subLis.forEach(subLi => {
            const subName = subLi.innerText.toLowerCase();
            let subMatches = subName.includes(lowerQuery);

            // Procura mídias associadas a essa categoria e subcategoria para complementar o indice
            const realCat = catLi.querySelector('.category-toggle').innerText.trim();
            const realSub = subLi.innerText.trim();
            const mediaMatches = database.some(item => 
                item.categoria === realCat && 
                item.subcategoria === realSub && 
                item.título.toLowerCase().includes(lowerQuery)
            );

            if (subMatches || mediaMatches || catMatches) {
                subLi.classList.remove('hidden');
                subMatchesAny = true;
            } else {
                subLi.classList.add('hidden');
            }
        });

        if (catMatches || subMatchesAny) {
            catLi.classList.remove('hidden');
            // Abre automaticamente as pastas que possuem resultados correspondentes à pesquisa interna
            if(lowerQuery !== "") {
                catLi.querySelector('.tree-sub').classList.remove('hidden');
            }
        } else {
            catLi.classList.add('hidden');
        }
    });
}

// ==========================================
// 5. CHAVEAMENTO DINÂMICO TRIPLO AUTOMÁTICO
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

    univPlayerEl.src = "";
    rawPlayerEl.src = "";
    univPlayerEl.classList.add('hidden');
    rawPlayerEl.classList.add('hidden');
    ytPlayerEl.classList.add('hidden');

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
        } else {
            ytPlayer.loadVideoById(vId);
        }
    } 
    else if(linkLower.endsWith('.mp4') || linkLower.endsWith('.mkv') || linkLower.endsWith('.avi') || 
            linkLower.endsWith('.mpg') || linkLower.endsWith('.mpeg') || linkLower.endsWith('.mp3') || 
            linkLower.includes('raw.githubusercontent') || linkLower.includes('/raw/')) {
        
        if(ytPlayer && typeof ytPlayer.pauseVideo === 'function') { try { ytPlayer.pauseVideo(); } catch(err){} }
        
        rawPlayerEl.classList.remove('hidden');
        rawPlayerEl.src = track.link;
        rawPlayerEl.play();

        rawPlayerEl.onended = () => {
            if(currentTrackIndex + 1 < currentPlaylist.length) playTrack(currentTrackIndex + 1);
        };
    } 
    else {
        if(ytPlayer && typeof ytPlayer.pauseVideo === 'function') { try { ytPlayer.pauseVideo(); } catch(err){} }
        univPlayerEl.classList.remove('hidden');
        univPlayerEl.src = track.link;
    }
}

// ==========================================
// 6. NOVO LAYOUT GERENCIAL TOTALMENTE EM ÁRVORE SANFONA RETRÁTIL
// ==========================================
function renderCrudManager() {
    const listContainer = document.getElementById('crud-tree-list');
    listContainer.innerHTML = '';

    if (database.length === 0) {
        listContainer.innerHTML = '<p style="color: #666; padding: 1rem;">Banco de dados vazio.</p>';
        return;
    }

    const categories = [...new Set(database.map(item => item.categoria))];

    categories.forEach(cat => {
        if(!cat) return;
        
        // NÍVEL 1: Linha da Categoria
        const catRow = createCrudRow(cat, 'categoria', () => {
            let novo = prompt("Novo nome para a Categoria:", cat);
            if(novo && novo.trim() !== "" && novo.trim() !== cat) {
                database.forEach(item => { if(item.categoria === cat) item.categoria = novo.trim(); });
                saveState();
            }
        }, () => {
            if(confirm(`Excluir toda a categoria "${cat}" e suas mídias?`)) {
                database = database.filter(item => item.categoria !== cat);
                saveState();
            }
        }, () => {
            const bloco = database.filter(item => item.categoria === cat);
            downloadJSON(bloco, `categoria_${cat}`);
        });

        // Bloco contenedor de subcategorias (escondido por padrao)
        const subBlockContainer = document.createElement('div');
        subBlockContainer.style.display = expandedCrudCats[cat] ? 'block' : 'none';

        catRow.addEventListener('click', (e) => {
            // Evita disparar expansao ao clicar nos botoes de acao da direita
            if(e.target.closest('.crud-actions')) return; 
            expandedCrudCats[cat] = !expandedCrudCats[cat];
            subBlockContainer.style.display = expandedCrudCats[cat] ? 'block' : 'none';
        });

        listContainer.appendChild(catRow);

        const subcategories = [...new Set(database.filter(item => item.categoria === cat).map(item => item.subcategoria))];
        subcategories.forEach(sub => {
            if(!sub) return;

            // NÍVEL 2: Linha da Subcategoria
            const subRow = createCrudRow(sub, 'subcategoria', () => {
                let novo = prompt(`Novo nome para a Subcategoria [${cat} > ${sub}]:`, sub);
                if(novo && novo.trim() !== "" && novo.trim() !== sub) {
                    database.forEach(item => { if(item.categoria === cat && item.subcategoria === sub) item.subcategoria = novo.trim(); });
                    saveState();
                }
            }, () => {
                if(confirm(`Excluir toda a subcategoria "${sub}" deste grupo?`)) {
                    database = database.filter(item => !(item.categoria === cat && item.subcategoria === sub));
                    saveState();
                }
            }, () => {
                const bloco = database.filter(item => item.categoria === cat && item.subcategoria === sub);
                downloadJSON(bloco, `sub_cat_${sub}`);
            });

            // Bloco contenedor das midias (escondido por padrao)
            const mediaBlockContainer = document.createElement('div');
            mediaBlockContainer.style.display = expandedCrudSubs[cat + '_' + sub] ? 'block' : 'none';

            subRow.addEventListener('click', (e) => {
                if(e.target.closest('.crud-actions')) return;
                expandedCrudSubs[cat + '_' + sub] = !expandedCrudSubs[cat + '_' + sub];
                mediaBlockContainer.style.display = expandedCrudSubs[cat + '_' + sub] ? 'block' : 'none';
            });

            subBlockContainer.appendChild(subRow);

            // NÍVEL 3: Varre e renderiza as Mídias individuais
            database.forEach((item, idx) => {
                if(item.categoria === cat && item.subcategoria === sub) {
                    const mediaRow = createCrudRow(item.título, 'mídia', () => {
                        openAdvancedEditModal(idx);
                    }, () => {
                        if(confirm(`Excluir a mídia "${item.título}"?`)) { database.splice(idx, 1); saveState(); }
                    }, () => {
                        downloadJSON(item, `midia_${item.título}`);
                    });
                    mediaBlockContainer.appendChild(mediaRow);
                }
            });

            subBlockContainer.appendChild(mediaBlockContainer);
        });

        listContainer.appendChild(subBlockContainer);
    });
}

function createCrudRow(title, type, onEdit, onDel, onExp) {
    const row = document.createElement('div');
    row.className = `crud-item ${type === 'subcategoria' ? 'sub-level' : type === 'mídia' ? 'track-level' : ''}`;
    
    // Troca automatica de icones visando mídias gerais e pastas expansivas
    let icon = '<i class="fas fa-folder"></i>';
    if(type === 'subcategoria') icon = '<i class="fas fa-video"></i>';
    if(type === 'mídia') icon = '<i class="fas fa-play-circle"></i>';

    row.innerHTML = `<span>${icon} <strong>[${type.toUpperCase()}]</strong> ${title}</span>
        <div class="crud-actions">
            <button class="crud-btn btn-edit" title="Editar"><i class="fas fa-edit"></i></button>
            <button class="crud-btn btn-del" title="Excluir"><i class="fas fa-trash"></i></button>
            <button class="crud-btn btn-exp" title="Exportar Bloco"><i class="fas fa-download"></i></button>
        </div>`;
        
    row.querySelector('.btn-edit').onclick = (e) => { e.preventDefault(); e.stopPropagation(); onEdit(); };
    row.querySelector('.btn-del').onclick = (e) => { e.preventDefault(); e.stopPropagation(); onDel(); };
    row.querySelector('.btn-exp').onclick = (e) => { e.preventDefault(); e.stopPropagation(); onExp(); };
    return row;
}

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
    if(e) { e.preventDefault(); e.stopPropagation(); }
    if(activeEditingIndex === null) return;

    const t = document.getElementById('edit-field-title').value.trim();
    const l = document.getElementById('edit-field-link').value.trim();
    const c = document.getElementById('edit-field-capa').value.trim();
    const cat = document.getElementById('edit-field-category').value.trim();
    const sub = document.getElementById('edit-field-subcategory').value.trim();

    if(!t || !l || !c || !cat || !sub) {
        return alert("Todos os 5 campos devem estar preenchidos!");
    }

    database[activeEditingIndex].título = t;
    database[activeEditingIndex].link = l;
    database[activeEditingIndex].capa = c;
    database[activeEditingIndex].categoria = cat;
    database[activeEditingIndex].subcategoria = sub;

    document.getElementById('edit-media-modal').classList.add('hidden');
    activeEditingIndex = null;
    saveState();
}

function processImportedList(list) {
    if (list.length > 0) {
        if (confirm(`Deseja mesclar estes itens com as suas mídias atuais?`)) {
            database = database.concat(list);
            saveState();
            alert("Dados processados e salvos com sucesso no Firebase!");
            document.getElementById('import-json-code').value = ''; 
        }
    } else { alert("Formato inválido."); }
}

function handleJSONCodeImport(e) {
    if(e) { e.preventDefault(); e.stopPropagation(); }
    const rawCode = document.getElementById('import-json-code').value.trim();
    if(!rawCode) return alert("Cole o código JSON antes de processar.");
    try {
        const parsed = JSON.parse(rawCode);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        processImportedList(list);
    } catch(err) { alert("Erro de sintaxe no código JSON."); }
}

function handleJSONImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            const list = Array.isArray(imported) ? imported : Object.values(imported);
            processImportedList(list);
        } catch (err) { alert("Erro de leitura do arquivo JSON."); }
    };
    reader.readAsText(file);
}

function saveState() {
    fetch(CONFIG.FIREBASE_URL, { method: 'PUT', body: JSON.stringify(database) })
        .then(() => { renderSidebar(); renderMosaic(); renderCrudManager(); });
}

function downloadJSON(obj, filename) {
    const cleanFilename = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(obj, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `${cleanFilename}_backup.json`);
    document.body.appendChild(a);
    a.click(); a.remove();
}

async function saveMediaToDatabase(e) {
    if(e) { e.preventDefault(); e.stopPropagation(); }
    const cat = document.getElementById('media-category').value.trim();
    const sub = document.getElementById('media-subcategory').value.trim();
    const title = document.getElementById('prev-title').value;
    const idOrList = document.getElementById('prev-title').dataset.videoid;
    const thumb = document.getElementById('prev-thumb').src;
    const mediaType = document.getElementById('prev-title').dataset.mediatype;

    if(!cat || !sub || !title || !idOrList) return alert("Preencha categoria e subcategoria.");

    if (mediaType === 'playlist') {
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${idOrList}&key=${CONFIG.YT_API_KEY}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if(data.items) {
                data.items.forEach(item => {
                    database.push({
                        capa: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : thumb,
                        categoria: cat,
                        subcategoria: sub,
                        título: item.snippet.title,
                        link: `https://www.youtube.com/embed/${item.snippet.resourceId.videoId}`
                    });
                });
            }
        } catch(err) { console.error(err); }
    } else if (mediaType === 'externo') {
        database.push({ capa: thumb, categoria: cat, subcategoria: sub, título: title, link: idOrList });
    } else {
        database.push({ capa: thumb, categoria: cat, subcategoria: sub, título: title, link: `https://www.youtube.com/embed/${idOrList}` });
    }

    saveState();
    document.getElementById('manual-media-url').value = '';
    document.getElementById('media-category').value = '';
    document.getElementById('media-subcategory').value = '';
    closeAllModals();
    currentView = 'categories';
    renderMosaic();
}

function switchTabs(targetTabId, activeTriggerBtnId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(activeTriggerBtnId).classList.add('active');
    document.getElementById(targetTabId).classList.remove('hidden');
}

function handleToggleSidebar(e) {
    if(e) { e.preventDefault(); e.stopPropagation(); }
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('open')) {
        sidebar.classList.remove('open'); sidebar.classList.add('collapsed');
    } else {
        sidebar.classList.remove('collapsed'); sidebar.classList.add('open');
    }
}

function closeAllModals() { document.getElementById('admin-modal').classList.add('hidden'); }

// ==========================================
// CONFIGURAÇÃO DOS GATILHOS (BLINDADOS POINTERDOWN)
// ==========================================
function setupEventListeners() {
    document.getElementById('search-yt-input').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') searchYouTubeGlobal(e.target.value);
    });
    document.getElementById('search-internal-input').addEventListener('input', (e) => filterInternalDatabase(e.target.value));

    document.getElementById('btn-fetch-manual').onpointerdown = (e) => fetchManualLinkData(e);
    document.getElementById('btn-save-media').onpointerdown = (e) => saveMediaToDatabase(e);
    document.getElementById('toggle-sidebar').onpointerdown = (e) => handleToggleSidebar(e);
    document.getElementById('bc-root').addEventListener('click', () => { currentView = 'categories'; renderMosaic(); });
    
    document.getElementById('btn-open-admin').onpointerdown = (e) => {
        e.preventDefault(); document.getElementById('admin-modal').classList.remove('hidden');
        switchTabs('add-tab', 'tab-trigger-add'); renderCrudManager(); 
    };
    document.getElementById('btn-close-admin').onpointerdown = (e) => { e.preventDefault(); closeAllModals(); };
    document.getElementById('btn-export-json').onpointerdown = (e) => { e.preventDefault(); downloadJSON(database, 'banco_completo'); };
    document.getElementById('btn-trigger-import').onpointerdown = (e) => { e.preventDefault(); document.getElementById('import-json-file').click(); };
    document.getElementById('import-json-file').addEventListener('change', handleJSONImport);
    document.getElementById('btn-process-code').onpointerdown = (e) => handleJSONCodeImport(e);

    document.getElementById('btn-submit-edit-media').onpointerdown = (e) => saveAdvancedEditChanges(e);
    document.getElementById('btn-cancel-edit-media').onpointerdown = (e) => {
        e.preventDefault(); document.getElementById('edit-media-modal').classList.add('hidden'); activeEditingIndex = null;
    };

    document.getElementById('tab-trigger-manage').onpointerdown = (e) => {
        e.preventDefault(); switchTabs('manage-tab', 'tab-trigger-manage'); renderCrudManager();
    };
    document.getElementById('tab-trigger-add').onpointerdown = (e) => { e.preventDefault(); switchTabs('add-tab', 'tab-trigger-add'); };
    
    document.getElementById('btn-close-player').onpointerdown = (e) => {
        e.preventDefault();
        if(ytPlayer && typeof ytPlayer.stopVideo === 'function') { try { ytPlayer.stopVideo(); } catch(err){} }
        document.getElementById('universal-player').src = ""; 
        const rawPlayer = document.getElementById('raw-player');
        rawPlayer.pause();
        rawPlayer.src = "";
        document.getElementById('player-container').classList.add('hidden');
    };
}

window.onload = checkSession;
