// CONFIGURAÇÕES GERAIS - INSIRA SUAS CHAVES AQUI
const CONFIG = {
    ADMIN_USER: "admin",       // Seu usuário pessoal de acesso
    ADMIN_PASSWORD: "123",     // Sua senha pessoal de acesso
    YT_API_KEY: "AIzaSyATXiihPhDZohvy8mJKsAk8vjZ4WkPekmQ",
    FIREBASE_URL: "https://workin--music-default-rtdb.firebaseio.com/musicas.json" 
};

// ESTADO GLOBAL DA APLICAÇÃO (Árvore sincronizada com o Firebase)
let database = {
    "Rock": {
        "Nacionais": [
            { id: "v_1", title: "Capital Inicial - Primeiros Erros", youtubeId: "4p0Mv3NIdS4", thumb: "https://img.youtube.com/vi/4p0Mv3NIdS4/0.jpg", channel: "Capital Inicial" }
        ]
    }
};

let currentView = 'categories'; // categories, subcategories, tracks, search_results
let selectedCategory = '';
let selectedSubcategory = '';
let currentPlaylist = [];
let currentTrackIndex = 0;
let ytPlayer = null;
let lastYtSearchResults = []; // Cache local dos resultados da busca global

// ==========================================
// 1. AUTENTICAÇÃO
// ==========================================
document.getElementById('btn-login').addEventListener('click', () => {
    const inputUser = document.getElementById('login-user').value;
    const inputPass = document.getElementById('login-pass').value;
    
    if (inputUser === CONFIG.ADMIN_USER && inputPass === CONFIG.ADMIN_PASSWORD) {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');
        initApp();
    } else {
        alert("Usuário ou senha incorretos!");
    }
});

function initApp() {
    // Tenta puxar a base de dados em tempo real do Firebase caso configurado
    fetch(CONFIG.FIREBASE_URL)
        .then(res => res.json())
        .then(data => { if(data) database = data; })
        .catch(e => console.log("Usando banco local padrão simulado."))
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

    // Gerenciador de visibilidade das breadcrumbs
    document.getElementById('bc-category').classList.add('hidden');
    document.getElementById('bc-subcategory').classList.add('hidden');
    document.getElementById('bc-search').classList.add('hidden');

    if (currentView === 'categories') {
        Object.keys(database).forEach(cat => {
            const firstSub = Object.keys(database[cat])[0];
            const firstTrack = firstSub ? database[cat][firstSub][0] : null;
            const thumb = firstTrack ? firstTrack.thumb : 'https://placehold.co/300x200?text=Vazio';

            grid.appendChild(createCard(cat, thumb, false, () => {
                selectedCategory = cat;
                currentView = 'subcategories';
                renderMosaic();
            }));
        });
    } 
    else if (currentView === 'subcategories') {
        document.getElementById('bc-category').classList.remove('hidden');
        document.getElementById('bc-category').querySelector('.txt').innerText = selectedCategory;

        Object.keys(database[selectedCategory]).forEach(sub => {
            const firstTrack = database[selectedCategory][sub][0];
            const thumb = firstTrack ? firstTrack.thumb : 'https://placehold.co/300x200?text=Vazio';

            grid.appendChild(createCard(sub, thumb, false, () => {
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

        const tracks = database[selectedCategory][selectedSubcategory] || [];
        currentPlaylist = tracks; 

        tracks.forEach((track, index) => {
            grid.appendChild(createCard(track.title, track.thumb, false, () => {
                playTrack(index);
            }));
        });
    }
    else if (currentView === 'search_results') {
        document.getElementById('bc-search').classList.remove('hidden');
        
        lastYtSearchResults.forEach(item => {
            const card = createCard(item.title, item.thumb, true, null);
            
            // Botão "+" dinâmico para adição direta capturada pela API
            const addBtn = card.querySelector('.add-music-badge');
            addBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                openAdminWithTrack(item);
            });

            grid.appendChild(card);
        });
    }
}

function createCard(title, imgSrc, showAddButton = false, clickCallback) {
    const card = document.createElement('div');
    card.className = 'card';
    
    let htmlContent = `<img src="${imgSrc}"><h4>${title}</h4>`;
    if(showAddButton) {
        htmlContent += `<button class="add-music-badge"><i class="fas fa-plus"></i> Add</button>`;
    }
    
    card.innerHTML = htmlContent;
    if(clickCallback) card.addEventListener('click', clickCallback);
    return card;
}

// ==========================================
// 3. PESQUISA GLOBAL NA API DO YOUTUBE (V3)
// ==========================================
async function searchYouTubeGlobal(query) {
    if(!query.trim()) return;
    
    currentView = 'search_results';
    renderMosaic();
    document.getElementById('mosaic-grid').innerHTML = '<h3>Buscando no YouTube...</h3>';

    // categoryId 10 = Restringe por música. Q = Termo digitado.
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&q=${encodeURIComponent(query)}&type=video&videoCategoryId=10&key=${CONFIG.YT_API_KEY}`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        lastYtSearchResults = [];
        if(data.items) {
            data.items.forEach(item => {
                lastYtSearchResults.push({
                    youtubeId: item.id.videoId,
                    title: item.snippet.title,
                    thumb: item.snippet.thumbnails.medium.url,
                    channel: item.snippet.channelTitle
                });
            });
        }
        renderMosaic();
    } catch (e) {
        console.error("Erro na busca da API do YouTube", e);
        document.getElementById('mosaic-grid').innerHTML = '<h3>Erro ao conectar à API do YouTube. Confira sua Key.</h3>';
    }
}

// Preenche o formulário gerencial automaticamente com os metadados trazidos pela API
function openAdminWithTrack(item) {
    document.getElementById('admin-modal').classList.remove('hidden');
    document.getElementById('prev-thumb').src = item.thumb;
    document.getElementById('prev-title').value = item.title;
    document.getElementById('prev-title').dataset.videoid = item.youtubeId;
    document.getElementById('prev-title').dataset.channel = item.channel;
    
    // Foca no campo de categoria para digitação manual rápida
    document.getElementById('media-category').focus();
}

// ==========================================
// 4. PESQUISA / FILTRO INTERNO (FIREBASE)
// ==========================================
function filterInternalDatabase(query) {
    const lowerQuery = query.toLowerCase();
    const treeItems = document.querySelectorAll('#sidebar-tree > li');

    treeItems.forEach(catLi => {
        const catName = catLi.querySelector('strong').innerText.toLowerCase();
        let catHasVisibleSub = false;

        const subLis = catLi.querySelectorAll('.tree-sub li');
        subLis.forEach(subLi => {
            const subName = subLi.innerText.toLowerCase();
            if (subName.includes(lowerQuery) || catName.includes(lowerQuery)) {
                subLi.classList.remove('hidden');
                catHasVisibleSub = true;
            } else {
                subLi.classList.add('hidden');
            }
        });

        if (catName.includes(lowerQuery) || catHasVisibleSub) {
            catLi.classList.remove('hidden');
        } else {
            catLi.classList.add('hidden');
        }
    });
}

function renderSidebar() {
    const tree = document.getElementById('sidebar-tree');
    tree.innerHTML = '';

    Object.keys(database).forEach(cat => {
        const catLi = document.createElement('li');
        catLi.innerHTML = `<strong><i class="fas fa-folder"></i> ${cat}</strong>`;
        
        const subUl = document.createElement('ul');
        subUl.className = 'tree-sub';
        
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

        catLi.appendChild(subUl);
        tree.appendChild(catLi);
    });
}

// ==========================================
// 5. PLAYER DE ÁUDIO & CONTROLE DE FILA (AUTO-PLAY)
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
    if (event.data === 0) { // Vídeo Terminou
        if (currentTrackIndex + 1 < currentPlaylist.length) {
            playTrack(currentTrackIndex + 1);
        } else {
            alert("Playlist concluída!");
        }
    }
}

// ==========================================
// 6. CRUD E ATUALIZAÇÃO NO BANCO (PUT)
// ==========================================
function saveMediaToDatabase() {
    const cat = document.getElementById('media-category').value.trim();
    const sub = document.getElementById('media-subcategory').value.trim();
    const title = document.getElementById('prev-title').value;
    const vId = document.getElementById('prev-title').dataset.videoid;
    const thumb = document.getElementById('prev-thumb').src;
    const channel = document.getElementById('prev-title').dataset.channel;

    if(!cat || !sub || !title || !vId) return alert("Preencha a categoria e subcategoria manualmente.");

    if(!database[cat]) database[cat] = {};
    if(!database[cat][sub]) database[cat][sub] = [];

    database[cat][sub].push({
        id: "v_" + Date.now(),
        title: title,
        youtubeId: vId,
        thumb: thumb,
        channel: channel
    });

    fetch(CONFIG.FIREBASE_URL, {
        method: 'PUT',
        body: JSON.stringify(database)
    }).then(() => {
        alert("Música indexada e salva no Firebase!");
        renderSidebar();
        // Limpa campos manuais
        document.getElementById('media-category').value = '';
        document.getElementById('media-subcategory').value = '';
        closeAllModals();
        currentView = 'categories';
        renderMosaic();
    });
}

function exportJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(database, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "firebase_songs_backup.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// ==========================================
// EVENTOS DISPARADORES
// ==========================================
function setupEventListeners() {
    // Escuta Enter na pesquisa do Header para disparar busca global (YouTube)
    document.getElementById('search-yt-input').addEventListener('keypress', (e) => {
        if(e.key === 'Enter') searchYouTubeGlobal(e.target.value);
    });

    // Escuta digitação no menu esquerdo para filtrar base interna (Firebase)
    document.getElementById('search-internal-input').addEventListener('input', (e) => {
        filterInternalDatabase(e.target.value);
    });

    document.getElementById('toggle-sidebar').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });
    
    document.getElementById('bc-root').addEventListener('click', () => {
        currentView = 'categories';
        renderMosaic();
    });

    document.getElementById('btn-open-admin').addEventListener('click', () => {
        document.getElementById('admin-modal').classList.remove('hidden');
    });
    
    document.getElementById('btn-close-admin').addEventListener('click', closeAllModals);
    document.getElementById('btn-save-media').addEventListener('click', saveMediaToDatabase);
    document.getElementById('btn-export-json').addEventListener('click', exportJSON);
    
    document.getElementById('btn-close-player').addEventListener('click', () => {
        if(ytPlayer) ytPlayer.stopVideo();
        document.getElementById('player-container').classList.add('hidden');
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.tab).classList.remove('hidden');
        });
    });
}

function closeAllModals() {
    document.getElementById('admin-modal').classList.add('hidden');
}
