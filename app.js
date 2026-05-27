// CONFIGURAÇÕES GERAIS - INSIRA SUAS CHAVES AQUI
const CONFIG = {
    ADMIN_USER: "admin",       
    ADMIN_PASSWORD: "123",     
    YT_API_KEY: "AIzaSyATXiihPhDZohvy8mJKsAk8vjZ4WkPekmQ",
    FIREBASE_URL: "https://workin--music-default-rtdb.firebaseio.com/musicas.json" 
};

let database = {
    "Rock": {
        "Nacionais": [
            { id: "v_1", title: "Capital Inicial - Primeiros Erros", youtubeId: "4p0Mv3NIdS4", thumb: "https://img.youtube.com/vi/4p0Mv3NIdS4/0.jpg", channel: "Capital Inicial" }
        ]
    }
};

let currentView = 'categories'; 
let selectedCategory = '';
let selectedSubcategory = '';
let currentPlaylist = [];
let currentTrackIndex = 0;
let ytPlayer = null;
let lastYtSearchResults = []; 

// ==========================================
// 1. AUTENTICAÇÃO COM SESSÃO DE 2 HORAS E LOGOUT
// ==========================================
function checkSession() {
    const loginData = localStorage.getItem('streamhub_session');
    if (loginData) {
        const session = JSON.parse(loginData);
        const twoHours = 2 * 60 * 60 * 1000;
        if (Date.now() - session.timestamp < twoHours) {
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
        const sessionValue = { user: inputUser, timestamp: Date.now() };
        localStorage.setItem('streamhub_session', JSON.stringify(sessionValue));
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
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
}

function initApp() {
    fetch(CONFIG.FIREBASE_URL)
        .then(res => res.json())
        .then(data => { if(data) database = data; })
        .catch(e => console.log("Usando banco local padrão."))
        .finally(() => {
            renderSidebar();
            renderMosaic();
            setupEventListeners();
        });
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
        Object.keys(database).forEach(cat => {
            if (!database[cat] || Object.keys(database[cat]).length === 0) return;
            const firstSub = Object.keys(database[cat])[0];
            const firstTrack = database[cat][firstSub] ? database[cat][firstSub][0] : null;
            const thumb = firstTrack ? firstTrack.thumb : 'https://placehold.co/300x200?text=Vazio';

            grid.appendChild(createCard(cat, thumb, false, false, () => {
                selectedCategory = cat;
                currentView = 'subcategories';
                renderMosaic();
            }));
        });
    } 
    else if (currentView === 'subcategories') {
        document.getElementById('bc-category').classList.remove('hidden');
        document.getElementById('bc-category').querySelector('.txt').innerText = selectedCategory;

        if(database[selectedCategory]) {
            Object.keys(database[selectedCategory]).forEach(sub => {
                const firstTrack = database[selectedCategory][sub][0];
                const thumb = firstTrack ? firstTrack.thumb : 'https://placehold.co/300x200?text=Vazio';

                grid.appendChild(createCard(sub, thumb, false, false, () => {
                    selectedSubcategory = sub;
                    currentView = 'tracks';
                    renderMosaic();
                }));
            });
        }
    } 
    else if (currentView === 'tracks') {
        document.getElementById('bc-category').classList.remove('hidden');
        document.getElementById('bc-category').querySelector('.txt').innerText = selectedCategory;
        document.getElementById('bc-subcategory').classList.remove('hidden');
        document.getElementById('bc-subcategory').querySelector('.txt').innerText = selectedSubcategory;

        const tracks = database[selectedCategory][selectedSubcategory] || [];
        currentPlaylist = tracks; 

        tracks.forEach((track, index) => {
            grid.appendChild(createCard(track.title, track.thumb, false, false, () => {
                playTrack(index);
            }));
        });
    }
    else if (currentView === 'search_results') {
        document.getElementById('bc-search').classList.remove('hidden');
        lastYtSearchResults.forEach(item => {
            const isPlaylist = item.type === 'playlist';
            
            // MODIFICADO: Passa o status 'isPlaylist' para customizar o texto do botão interno do card
            const card = createCard(item.title, item.thumb, true, isPlaylist, null);
            card.querySelector('.add-music-badge').addEventListener('click', (e) => {
                e.stopPropagation();
                openAdminWithTrack(item);
            });
            grid.appendChild(card);
        });
    }
}

// MODIFICADO: A função agora renderiza "Add Playlist" dinamicamente com base no parâmetro isPlaylist
function createCard(title, imgSrc, showAddButton = false, isPlaylist = false, clickCallback) {
    const card = document.createElement('div');
    card.className = 'card';
    let htmlContent = `<img src="${imgSrc}"><h4>${title}</h4>`;
    
    if(isPlaylist) {
        htmlContent += `<span class="media-type-badge"><i class="fas fa-list"></i> Playlist</span>`;
    }
    if(showAddButton) {
        const btnText = isPlaylist ? "Add Playlist" : "Add";
        htmlContent += `<button class="add-music-badge"><i class="fas fa-plus"></i> ${btnText}</button>`;
    }
    
    card.innerHTML = htmlContent;
    if(clickCallback) card.addEventListener('click', clickCallback);
    return card;
}

// ==========================================
// 3. MENU LATERAL SANFONA
// ==========================================
function renderSidebar() {
    const tree = document.getElementById('sidebar-tree');
    tree.innerHTML = '';

    Object.keys(database).forEach(cat => {
        const catLi = document.createElement('li');
        
        const catToggle = document.createElement('span');
        catToggle.className = 'category-toggle';
        catToggle.innerHTML = `<i class="fas fa-folder"></i> ${cat}`;
        
        const subUl = document.createElement('ul');
        subUl.className = 'tree-sub hidden'; 

        catToggle.addEventListener('click', () => {
            subUl.classList.toggle('hidden');
        });

        Object.keys(database[cat]).forEach(sub => {
            const subLi = document.createElement('li');
            subLi.innerHTML = `<i class="fas fa-music"></i> ${sub}`;
            subLi.addEventListener('click', (e) => {
                e.stopPropagation();
                selectedCategory = cat;
                selectedSubcategory = sub;
                currentView = 'tracks';
                renderMosaic();
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
        const playlistId = urlParams.get('list');
        fetchPlaylistItems(playlistId);
        return;
    }

    currentView = 'search_results';
    renderMosaic();
    document.getElementById('mosaic-grid').innerHTML = '<h3>Buscando no YouTube...</h3>';

    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=30&q=${encodeURIComponent(query)}&type=video,playlist&key=${CONFIG.YT_API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.error) {
            console.error("Erro reportado pela API do YT: ", data.error);
            document.getElementById('mosaic-grid').innerHTML = `<h3>Erro na API: ${data.error.message}</h3>`;
            return;
        }

        lastYtSearchResults = [];
        if(data.items) {
            data.items.forEach(item => {
                const isPl = item.id.kind === 'youtube#playlist';
                lastYtSearchResults.push({
                    type: isPl ? 'playlist' : 'video',
                    youtubeId: isPl ? item.id.playlistId : item.id.videoId,
                    title: item.snippet.title,
                    thumb: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : 'https://placehold.co/300x200?text=Sem+Thumb',
                    channel: item.snippet.channelTitle
                });
            });
        }
        renderMosaic();
    } catch (e) {
        document.getElementById('mosaic-grid').innerHTML = '<h3>Erro na busca global da API do YouTube.</h3>';
    }
}

async function fetchPlaylistItems(playlistId) {
    currentView = 'search_results';
    renderMosaic();
    document.getElementById('mosaic-grid').innerHTML = '<h3>Importando Playlist do YouTube...</h3>';
    
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
        document.getElementById('mosaic-grid').innerHTML = '<h3>Erro ao processar os dados da Playlist.</h3>';
    }
}

async function fetchManualLinkData() {
    const url = document.getElementById('manual-media-url').value.trim();
    if(!url) return alert("Cole uma URL válida do YouTube.");

    document.getElementById('btn-fetch-manual').innerText = "Buscando...";

    let isPlaylist = url.includes('list=');
    let targetId = "";

    if(isPlaylist) {
        const urlParams = new URLSearchParams(new URL(url).search);
        targetId = urlParams.get('list');
    } else {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        targetId = (match && match[2].length == 11) ? match[2] : url;
    }

    if(!targetId) {
        document.getElementById('btn-fetch-manual').innerText = "Capturar Dados";
        return alert("Não foi possível extrair o ID desta URL.");
    }

    const endpoint = isPlaylist ? 'playlists' : 'videos';
    const apiUrl = `https://www.googleapis.com/youtube/v3/${endpoint}?part=snippet&id=${targetId}&key=${CONFIG.YT_API_KEY}`;

    try {
        const res = await fetch(apiUrl);
        const data = await res.json();
        if(data.items && data.items.length > 0) {
            const snippet = data.items[0].snippet;
            const item = {
                type: isPlaylist ? 'playlist' : 'video',
                youtubeId: targetId,
                title: snippet.title,
                thumb: snippet.thumbnails.medium ? snippet.thumbnails.medium.url : 'https://placehold.co/120x90',
                channel: snippet.channelTitle
            };
            
            document.getElementById('prev-thumb').src = item.thumb;
            document.getElementById('prev-title').value = item.title;
            document.getElementById('prev-title').dataset.videoid = item.youtubeId;
            document.getElementById('prev-title').dataset.channel = item.channel;
            document.getElementById('prev-title').dataset.mediatype = item.type;
        } else {
            alert("Nenhuma mídia encontrada com esta URL.");
        }
    } catch(e) {
        console.error(e);
        alert("Erro de comunicação com a API do YouTube.");
    } finally {
        document.getElementById('btn-fetch-manual').innerText = "Capturar Dados";
    }
}

function openAdminWithTrack(item) {
    document.getElementById('admin-modal').classList.remove('hidden');
    switchTabs('add-tab', 'tab-trigger-add');

    document.getElementById('manual-media-url').value = ""; 
    document.getElementById('prev-thumb').src = item.thumb;
    document.getElementById('prev-title').value = item.title;
    document.getElementById('prev-title').dataset.videoid = item.youtubeId;
    document.getElementById('prev-title').dataset.channel = item.channel;
    document.getElementById('prev-title').dataset.mediatype = item.type; 
    document.getElementById('media-category').focus();
}

function filterInternalDatabase(query) {
    const lowerQuery = query.toLowerCase();
    const treeItems = document.querySelectorAll('#sidebar-tree > li');
    treeItems.forEach(catLi => {
        const catName = catLi.querySelector('.category-toggle').innerText.toLowerCase();
        let hasMatch = false;
        const subLis = catLi.querySelectorAll('.tree-sub li');
        subLis.forEach(subLi => {
            if(subLi.innerText.toLowerCase().includes(lowerQuery)) {
                subLi.classList.remove('hidden');
                hasMatch = true;
            } else {
                subLi.classList.add('hidden');
            }
        });
        if(catName.includes(lowerQuery) || hasMatch) catLi.classList.remove('hidden');
        else catLi.classList.add('hidden');
    });
}

// ==========================================
// 5. PLAYER DE VÍDEO & CONTROLE DE FILA
// ==========================================
function playTrack(index) {
    if(currentPlaylist.length === 0) return;
    currentTrackIndex = index;
    const track = currentPlaylist[index];

    document.getElementById('player-container').classList.remove('hidden');
    document.getElementById('current-track-title').innerText = track.title;

    if (!ytPlayer) {
        ytPlayer = new YT.Player('yt-player', {
            videoId: track.youtubeId,
            playerVars: { 'autoplay': 1, 'playsinline': 1 },
            events: { 'onStateChange': onPlayerStateChange }
        });
    } else {
        ytPlayer.loadVideoById(track.youtubeId);
    }
}

function onPlayerStateChange(event) {
    if (event.data === 0) { 
        if (currentTrackIndex + 1 < currentPlaylist.length) {
            playTrack(currentTrackIndex + 1);
        } else {
            alert("Fim da playlist!");
        }
    }
}

// ==========================================
// 6. COMPONENTE CRUD
// ==========================================
function renderCrudManager() {
    const listContainer = document.getElementById('crud-tree-list');
    listContainer.innerHTML = '';

    if (!database || Object.keys(database).length === 0) {
        listContainer.innerHTML = '<p style="color: #666; padding: 1rem;">Seu banco de dados está vazio.</p>';
        return;
    }

    Object.keys(database).forEach(cat => {
        listContainer.appendChild(createCrudRow(cat, 'category', () => {
            let novo = prompt("Novo nome da Categoria:", cat);
            if(novo && novo.trim() !== "" && novo !== cat) { 
                database[novo.trim()] = database[cat]; 
                delete database[cat]; 
                saveState(); 
            }
        }, () => {
            if(confirm(`Excluir categoria "${cat}" e tudo o que há dentro dela?`)) { 
                delete database[cat]; 
                saveState(); 
            }
        }, () => downloadJSON(database[cat], cat)));

        if (database[cat]) {
            Object.keys(database[cat]).forEach(sub => {
                listContainer.appendChild(createCrudRow(sub, 'subcategory', () => {
                    let novo = prompt("Novo nome da Subcategoria:", sub);
                    if(novo && novo.trim() !== "" && novo !== sub) { 
                        database[cat][novo.trim()] = database[cat][sub]; 
                        delete database[cat][sub]; 
                        saveState(); 
                    }
                }, () => {
                    if(confirm(`Excluir subcategoria "${sub}" inteira?`)) { 
                        delete database[cat][sub]; 
                        saveState(); 
                    }
                }, () => downloadJSON(database[cat][sub], sub)));

                if (database[cat][sub] && Array.isArray(database[cat][sub])) {
                    database[cat][sub].forEach((track, idx) => {
                        listContainer.appendChild(createCrudRow(track.title, 'track', () => {
                            let novo = prompt("Novo título da Música:", track.title);
                            if(novo && novo.trim() !== "") { 
                                database[cat][sub][idx].title = novo.trim(); 
                                saveState(); 
                            }
                        }, () => {
                            if(confirm(`Excluir música "${track.title}"?`)) { 
                                database[cat][sub].splice(idx, 1); 
                                saveState(); 
                            }
                        }, () => downloadJSON(track, track.title)));
                    });
                }
            });
        }
    });
}

function createCrudRow(title, type, onEdit, onDel, onExp) {
    const row = document.createElement('div');
    row.className = `crud-item ${type === 'subcategory' ? 'sub-level' : type === 'track' ? 'track-level' : ''}`;
    row.innerHTML = `<span><strong>[${type.toUpperCase()}]</strong> ${title}</span>
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

function saveState() {
    fetch(CONFIG.FIREBASE_URL, { 
        method: 'PUT', 
        body: JSON.stringify(database) 
    })
    .then(() => {
        renderSidebar(); 
        renderMosaic(); 
        renderCrudManager();
    })
    .catch(err => {
        console.error("Erro na sincronização Firebase, atualizando local: ", err);
        renderSidebar(); 
        renderMosaic(); 
        renderCrudManager();
    });
}

function downloadJSON(obj, filename) {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(obj, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `${filename.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_backup.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
}

async function saveMediaToDatabase() {
    const cat = document.getElementById('media-category').value.trim();
    const sub = document.getElementById('media-subcategory').value.trim();
    const title = document.getElementById('prev-title').value;
    const idOrList = document.getElementById('prev-title').dataset.videoid;
    const thumb = document.getElementById('prev-thumb').src;
    const channel = document.getElementById('prev-title').dataset.channel;
    const mediaType = document.getElementById('prev-title').dataset.mediatype;

    if(!cat || !sub || !title || !idOrList) {
        return alert("Preencha a categoria e subcategoria manualmente antes de salvar.");
    }

    if(!database[cat]) database[cat] = {};
    if(!database[cat][sub]) database[cat][sub] = [];

    if (mediaType === 'playlist') {
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${idOrList}&key=${CONFIG.YT_API_KEY}`;
        try {
            const res = await fetch(url);
            const data = await res.json();
            if(data.items && data.items.length > 0) {
                data.items.forEach(item => {
                    database[cat][sub].push({
                        id: "v_" + Date.now() + Math.random().toString(36).substr(2, 5),
                        title: item.snippet.title,
                        youtubeId: item.snippet.resourceId.videoId,
                        thumb: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : thumb,
                        channel: item.snippet.channelTitle
                    });
                });
                alert(`${data.items.length} músicas da playlist foram importadas com sucesso!`);
            } else {
                alert("Esta playlist não possui vídeos públicos acessíveis.");
                return;
            }
        } catch(e) {
            console.error("Erro ao importar playlist", e);
            alert("Erro de comunicação com o YouTube.");
            return;
        }
    } else {
        database[cat][sub].push({ id: "v_" + Date.now(), title, youtubeId: idOrList, thumb, channel });
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

// ==========================================
// CONFIGURAÇÃO DOS GATILHOS
// ==========================================
function setupEventListeners() {
    document.getElementById('search-yt-input').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') searchYouTubeGlobal(e.target.value);
    });

    document.getElementById('search-internal-input').addEventListener('input', (e) => {
        filterInternalDatabase(e.target.value);
    });

    document.getElementById('btn-fetch-manual').addEventListener('click', fetchManualLinkData);

    document.getElementById('toggle-sidebar').addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('collapsed');
        sidebar.classList.toggle('open');
    });
    
    document.getElementById('bc-root').addEventListener('click', () => { currentView = 'categories'; renderMosaic(); });
    
    document.getElementById('btn-open-admin').addEventListener('click', () => {
        document.getElementById('admin-modal').classList.remove('hidden');
        switchTabs('add-tab', 'tab-trigger-add');
        renderCrudManager(); 
    });
    
    document.getElementById('btn-close-admin').addEventListener('click', closeAllModals);
    document.getElementById('btn-save-media').addEventListener('click', saveMediaToDatabase);
    document.getElementById('btn-export-json').addEventListener('click', () => downloadJSON(database, 'banco_completo'));
    
    document.getElementById('tab-trigger-manage').addEventListener('click', () => {
        switchTabs('manage-tab', 'tab-trigger-manage');
        renderCrudManager();
    });
    document.getElementById('tab-trigger-add').addEventListener('click', () => {
        switchTabs('add-tab', 'tab-trigger-add');
    });
    
    document.getElementById('btn-close-player').addEventListener('click', () => {
        if(ytPlayer) ytPlayer.stopVideo();
        document.getElementById('player-container').classList.add('hidden');
    });
}

window.onload = checkSession;
