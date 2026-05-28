// CONFIGURAÇÕES GERAIS - INSIRA SUAS CHAVES AQUI
const CONFIG = {
    ADMIN_USER: "admin",       
    ADMIN_PASSWORD: "123",     
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
    return (match && match[2].length == 11) ? match[2] : url;
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
            }));
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
            }));
        });
    } 
    else if (currentView === 'tracks') {
        document.getElementById('bc-category').classList.remove('hidden');
        document.getElementById('bc-category').querySelector('.txt').innerText = selectedCategory;
        document.getElementById('bc-subcategory').classList.remove('hidden');
        document.getElementById('bc-subcategory').querySelector('.txt').innerText = selectedSubcategory;

        currentPlaylist = database.filter(item => item.categoria === selectedCategory && item.subcategoria === selectedSubcategory);
        currentPlaylist.forEach((track, index) => {
            grid.appendChild(createCard(track.título, track.capa, false, false, () => {
                playTrack(index);
            }));
        });
    }
    else if (currentView === 'search_results') {
        document.getElementById('bc-search').classList.remove('hidden');
        lastYtSearchResults.forEach(item => {
            const isPlaylist = item.type === 'playlist';
            const card = createCard(item.title, item.thumb, true, isPlaylist, null);
            card.querySelector('.add-music-badge').onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                openAdminWithTrack(item);
            };
            grid.appendChild(card);
        });
    }
}

function createCard(title, imgSrc, showAddButton = false, isPlaylist = false, clickCallback) {
    const card = document.createElement('div');
    card.className = 'card';
    let htmlContent = `<img src="${imgSrc}"><h4>${title}</h4>`;
    if(isPlaylist) htmlContent += `<span class="media-type-badge"><i class="fas fa-list"></i> Playlist</span>`;
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
            subLi.innerHTML = `<i class="fas fa-music"></i> ${sub}`;
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
// 4. INTEGRAÇÃO E BUSCA YOUTUBE
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
                    thumb: item.snippet.thumbnails.medium ? item.snippet.thumbnails.medium.url : 'https://placehold.co/300x200?text=Sem+Thumb',
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

function filterInternalDatabase(query) {
    const lowerQuery = query.toLowerCase();
    document.querySelectorAll('#sidebar-tree > li').forEach(catLi => {
        const name = catLi.querySelector('.category-toggle').innerText.toLowerCase();
        let match = name.includes(lowerQuery);
        catLi.querySelectorAll('.tree-sub li').forEach(subLi => {
            if(subLi.innerText.toLowerCase().includes(lowerQuery)) {
                subLi.classList.remove('hidden'); match = true;
            } else { subLi.classList.add('hidden'); }
        });
        if(match) catLi.classList.remove('hidden'); else catLi.classList.add('hidden');
    });
}

// ==========================================
// 5. CONTROLE DO PLAYER INTEGRADO
// ==========================================
function playTrack(index) {
    if(currentPlaylist.length === 0) return;
    currentTrackIndex = index;
    const track = currentPlaylist[index];
    const vId = extractYoutubeId(track.link);

    document.getElementById('player-container').classList.remove('hidden');
    document.getElementById('current-track-title').innerText = track.título;

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

// ==========================================
// 6. NOVO COMPONENTE CRUD EM ÁRVORE HIERÁRQUICA COMPLETA
// ==========================================
function renderCrudManager() {
    const listContainer = document.getElementById('crud-tree-list');
    listContainer.innerHTML = '';

    if (database.length === 0) {
        listContainer.innerHTML = '<p style="color: #666; padding: 1rem;">Banco vazio.</p>';
        return;
    }

    // Mapeamento dinâmico do Array Linear para estruturar a árvore visual
    const categories = [...new Set(database.map(item => item.categoria))];

    categories.forEach(cat => {
        if(!cat) return;
        // Linha da Categoria
        listContainer.appendChild(createCrudRow(cat, 'category', () => {
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
        }));

        // Varre Subcategorias deste grupo
        const subcategories = [...new Set(database.filter(item => item.categoria === cat).map(item => item.subcategoria))];
        subcategories.forEach(sub => {
            if(!sub) return;
            // Linha da Subcategoria
            listContainer.appendChild(createCrudRow(sub, 'subcategory', () => {
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
            }));

            // Varre as Mídias/Músicas deste subgrupo
            database.forEach((item, idx) => {
                if(item.categoria === cat && item.subcategoria === sub) {
                    // Linha da Mídia individual
                    listContainer.appendChild(createCrudRow(item.título, 'track', () => {
                        let novo = prompt("Novo título para este vídeo:", item.título);
                        if(novo && novo.trim() !== "") { database[idx].título = novo.trim(); saveState(); }
                    }, () => {
                        if(confirm(`Excluir o vídeo "${item.título}"?`)) { database.splice(idx, 1); saveState(); }
                    }, () => {
                        downloadJSON(item, `video_${item.título}`);
                    }));
                }
            });
        });
    });
}

function createCrudRow(title, type, onEdit, onDel, onExp) {
    const row = document.createElement('div');
    row.className = `crud-item ${type === 'subcategory' ? 'sub-level' : type === 'track' ? 'track-level' : ''}`;
    row.innerHTML = `<span><strong>[${type.toUpperCase()}]</strong> ${title}</span>
        <div class="crud-actions">
            <button class="crud-btn btn-edit" title="Editar Nome"><i class="fas fa-edit"></i></button>
            <button class="crud-btn btn-del" title="Excluir"><i class="fas fa-trash"></i></button>
            <button class="crud-btn btn-exp" title="Exportar Bloco JSON"><i class="fas fa-download"></i></button>
        </div>`;
        
    row.querySelector('.btn-edit').onclick = (e) => { e.preventDefault(); onEdit(); };
    row.querySelector('.btn-del').onclick = (e) => { e.preventDefault(); onDel(); };
    row.querySelector('.btn-exp').onclick = (e) => { e.preventDefault(); onExp(); };
    return row;
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
    } else {
        database.push({
            capa: thumb,
            categoria: cat,
            subcategoria: sub,
            título: title,
            link: `https://www.youtube.com/embed/${idOrList}`
        });
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

    document.getElementById('tab-trigger-manage').onpointerdown = (e) => {
        e.preventDefault(); switchTabs('manage-tab', 'tab-trigger-manage'); renderCrudManager();
    };
    document.getElementById('tab-trigger-add').onpointerdown = (e) => { e.preventDefault(); switchTabs('add-tab', 'tab-trigger-add'); };
    document.getElementById('btn-close-player').onpointerdown = (e) => { e.preventDefault(); if(ytPlayer) ytPlayer.stopVideo(); document.getElementById('player-container').classList.add('hidden'); };
}

window.onload = checkSession;
