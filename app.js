// app.js - Moteur d'immersion cinématique - Code A-Z

const API_KEY = '578bd3c6b2ac39a432cb440a7c152ef6';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/w500';
const LANG = 'fr-FR';
const STREAM_TIMEOUT_MS = 30000; // délai avant d'afficher "flux non disponible" (30000 = 30 secondes)
const PERSONAL_MOVIES_URL = 'youtube/movies.json';
const IPTV_CHANNELS_URL = 'iptv/chaines.json';
let personalMoviesCache = null;
let iptvChannelsCache = null;

const CATEGORY_ICONS = {
    'Général': '📺', 'information': '📰', 'Films-Série': '🎬', 'Religieux': '🙏',
    'Musique': '🎵', 'Divertissement': '🎉', 'Indéfini': '❔', 'Documentaire': '🎥',
    'Animation': '🧸', 'Sportif': '⚽', 'Style de vie': '🌿', 'Entreprise': '💼',
    'Éducation': '📚', 'Cuisine': '🍳', 'Voyage & Plein air': '✈️'
};
let activeChannelCategory = null;

async function getIptvChannels() {
    if (iptvChannelsCache) return iptvChannelsCache;
    try {
        const res = await fetch(IPTV_CHANNELS_URL);
        const data = await res.json();
        iptvChannelsCache = data;
        return data;
    } catch (e) {
        console.error('Erreur chargement chaînes IPTV:', e);
        return [];
    }
}

async function getPersonalMovies() {
    if (personalMoviesCache) return personalMoviesCache;
    try {
        const res = await fetch(PERSONAL_MOVIES_URL);
        const data = await res.json();
        personalMoviesCache = data;
        return data;
    } catch (e) {
        console.error('Erreur chargement films perso:', e);
        return [];
    }
}
let currentMovies = []; // la liste actuellement affichée, sert de base au filtrage local

// Éléments du DOM
const grid = document.getElementById('movieGrid');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const PAGE_SIZE = 20; // nombre de cartes affichées par lot
let paginationQueue = [];
let paginationIndex = 0;
const searchInput = document.getElementById('searchInput');
const GENRE_KEYWORDS = {
    action: 28,
    horreur: 27, horror: 27, epouvante: 27, epouvantail: 27,
    comedie: 35, comique: 35, drole: 35, humour: 35,
    drame: 18,
    amour: 10749, romance: 10749, romantique: 10749,
    animation: 16, anime: 16, dessinanime: 16,
};

function normalizeSearchText(s) {
    return s
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève les accents
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ''); // enlève espaces/ponctuation
}

function detectSearchIntent(rawQuery) {
    const cleaned = normalizeSearchText(rawQuery);
    if (/^\d{4}$/.test(cleaned)) {
        return { type: 'year', value: cleaned };
    }
    if (GENRE_KEYWORDS[cleaned] !== undefined) {
        return { type: 'genre', value: GENRE_KEYWORDS[cleaned] };
    }
    return { type: 'title', value: rawQuery };
}
const filterButtons = document.querySelectorAll('.filter-btn');

// Modales & Lecteurs
const movieModal = document.getElementById('movieModal');
const closeModalBtn = document.getElementById('closeModal');
const muteToggleBtn = document.getElementById('muteToggle');
const videoPlayer = document.getElementById('videoPlayer');
const modalTitle = document.getElementById('modalTitle');
const modalYear = document.getElementById('modalYear');
const modalDesc = document.getElementById('modalDesc');
const modalGenre = document.getElementById('modalGenre');
const watchMovieBtn = document.getElementById('watchMovieBtn');

const playerModal = document.getElementById('playerModal');
const closePlayerModalBtn = document.getElementById('closePlayerModal');
const playerMessageError = document.querySelector('.player-message-error');
const playerPlaceholder = document.querySelector('.player-placeholder');
const personalPlayerWrapper = document.getElementById('personalPlayerWrapper');
const personalVideoPlayer = document.getElementById('personalVideoPlayer');
const personalPlayerOverlay = document.getElementById('personalPlayerOverlay');
const seekIndicator = document.getElementById('seekIndicator');
let isPersonalPlaying = true;
let personalPlayer = null;
let ytApiReady = false;

// Appelée automatiquement par le script YouTube une fois chargé
function onYouTubeIframeAPIReady() {
    ytApiReady = true;
}

function loadPersonalVideo(videoId) {
    if (!ytApiReady || typeof YT === 'undefined' || !YT.Player) {
        // Script YouTube pas encore prêt (connexion lente) : on réessaie un peu plus tard
        setTimeout(() => loadPersonalVideo(videoId), 200);
        return;
    }
    if (!personalPlayer) {
        personalPlayer = new YT.Player('personalVideoPlayer', {
            host: 'https://www.youtube-nocookie.com',
            videoId: videoId,
            playerVars: {
                autoplay: 1,
                controls: 0,
                rel: 0,
                modestbranding: 1,
                iv_load_policy: 3,
                origin: window.location.origin
            },
            events: {
                onReady: (e) => {
                    e.target.playVideo();
                    isPersonalPlaying = true;
                }
            }
        });
    } else {
        personalPlayer.loadVideoById(videoId);
        isPersonalPlaying = true;
    }
}

function togglePersonalPlayPause() {
    if (!personalPlayer) return;
    isPersonalPlaying = !isPersonalPlaying;
    if (isPersonalPlaying) {
        personalPlayer.playVideo();
    } else {
        personalPlayer.pauseVideo();
    }
}

function showSeekIndicator(text, isRight) {
    seekIndicator.textContent = text;
    seekIndicator.className = 'seek-indicator visible ' + (isRight ? 'right' : 'left');
    clearTimeout(showSeekIndicator.timeoutId);
    showSeekIndicator.timeoutId = setTimeout(() => {
        seekIndicator.classList.remove('visible');
    }, 600);
}

function seekPersonalPlayer(seconds) {
    if (!personalPlayer || !personalPlayer.getCurrentTime) return;
    const current = personalPlayer.getCurrentTime();
    const target = Math.max(0, current + seconds);
    personalPlayer.seekTo(target, true);
    showSeekIndicator(seconds > 0 ? '+10s' : '-10s', seconds > 0);
}

let personalClickTimer = null;

personalPlayerOverlay.addEventListener('click', (e) => {
    if (personalClickTimer) {
        // Deuxième clic dans le délai => c'était un double-clic, on avance/recule
        clearTimeout(personalClickTimer);
        personalClickTimer = null;

        const rect = personalPlayerOverlay.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const isRightSide = clickX > rect.width / 2;
        seekPersonalPlayer(isRightSide ? 10 : -10);
    } else {
        // Premier clic : on attend un peu pour voir s'il y en a un deuxième
        personalClickTimer = setTimeout(() => {
            personalClickTimer = null;
            togglePersonalPlayPause();
        }, 280);
    }
});

document.addEventListener('keydown', (e) => {
    if (!playerModal.classList.contains('active') || activeMovieData?.source !== 'youtube' || !personalPlayer) return;

    if (e.key === 'ArrowRight') {
        e.preventDefault();
        seekPersonalPlayer(10);
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        seekPersonalPlayer(-10);
    } else if (e.key === ' ') {
        e.preventDefault();
        togglePersonalPlayPause();
    }
});

const personalFullscreenBtn = document.getElementById('personalFullscreenBtn');

personalFullscreenBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // évite de déclencher aussi le play/pause de l'overlay en dessous
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        personalPlayerWrapper.requestFullscreen();
    }
});

document.addEventListener('fullscreenchange', () => {
    const icon = personalFullscreenBtn.querySelector('i');
    icon.className = document.fullscreenElement ? 'fas fa-compress' : 'fas fa-expand';
});
let streamTimeoutId = null;

let isMuted = true; // état du son de la bande-annonce en arrière-plan
let activeMovieData = null; 
async function fetchMovieLogo(movieId) {
    const url = `${BASE_URL}/movie/${movieId}/images?api_key=${API_KEY}`;
    try {
        const res = await fetch(url);
        const data = await res.json();
        const logos = data.logos || [];
        const logo = logos.find(l => l.iso_639_1 === 'fr')
                  || logos.find(l => l.iso_639_1 === null)
                  || logos.find(l => l.iso_639_1 === 'en');
        return logo ? `https://image.tmdb.org/t/p/w500${logo.file_path}` : null;
    } catch (e) {
        console.error('Erreur logo:', e);
        return null;
    }
}

// --- FONCTIONS DE LECTURE VIDÉO ---
function sendPlayerCommand(func, targetIframe = videoPlayer) {
    targetIframe.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: func, args: [] }),
        '*'
    );
}

function updateMuteButton() {
    muteToggleBtn.innerHTML = isMuted
        ? '<i class="fas fa-volume-mute"></i>'
        : '<i class="fas fa-volume-up"></i>';
}

muteToggleBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    sendPlayerCommand(isMuted ? 'mute' : 'unMute');
    updateMuteButton();
});

// Utilitaires
function debounce(func, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// --- FONCTIONS DE GESTION DES FAVORIS ---
function getFavorites() {
    return JSON.parse(localStorage.getItem('refugePopFavorites')) || [];
}

function toggleFavorite(movie) {
    let favs = getFavorites();
    const index = favs.findIndex(f => f.id === movie.id);
    
    if (index > -1) {
        favs.splice(index, 1); 
    } else {
        favs.push(movie); 
    }
    localStorage.setItem('refugePopFavorites', JSON.stringify(favs));
}

function isFavorite(movieId) {
    return getFavorites().some(f => f.id === movieId);
}

// --- CHARGEMENT ET AFFICHAGE ---
async function getTrendingMovies() {
    grid.innerHTML = `<div class="loader"><i class="fas fa-spinner"></i> Initialisation du refuge...</div>`;
    const url = `${BASE_URL}/trending/movie/week?api_key=${API_KEY}&language=${LANG}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        displayMovies(data.results);
    } catch (error) {
        console.error("Erreur d'accès à l'API:", error);
    }
}

function buildMovieCard(movie) {
    const poster = movie.source === 'youtube'
        ? movie.poster
        : (movie.poster_path ? `${IMG_URL}${movie.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image');
    const backdrop = movie.source === 'youtube'
        ? (movie.backdrop || movie.poster)
        : (movie.backdrop_path ? `${IMG_URL}${movie.backdrop_path}` : poster);
    const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';

    const favIcon = isFavorite(movie.id) ? 'fas fa-check' : 'fas fa-plus';
    const favClass = isFavorite(movie.id) ? 'btn-fav active' : 'btn-fav';
    const availableBadge = movie.source === 'youtube'
        ? `<span class="badge-available"><i class="fas fa-check-circle"></i> Disponible</span>`
        : '';

    const card = document.createElement('div');
    card.classList.add('movie-card');

    card.innerHTML = `
        <img class="poster-img" src="${poster}" alt="${movie.title}" loading="lazy">
        <img class="backdrop-img" src="${backdrop}" alt="${movie.title} fond" loading="lazy">
        ${availableBadge}
        <div class="card-overlay">
            <h3 class="card-title">${movie.title}</h3>
            <span class="card-year">🍿 ${year}</span>
            <p class="card-desc">${movie.overview || "Aucun résumé disponible."}</p>
            <div class="card-actions">
                <button class="btn-play" title="Bande-annonce"><i class="fas fa-play"></i></button>
                <button class="${favClass}" title="Ajouter aux favoris"><i class="${favIcon}"></i></button>
            </div>
        </div>
    `;

    const playBtn = card.querySelector('.btn-play');
    playBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openCinematicModal(movie);
    });

    const favBtn = card.querySelector('.btn-fav');
    favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(movie);

        const icon = favBtn.querySelector('i');
        if (isFavorite(movie.id)) {
            icon.className = 'fas fa-check';
            favBtn.classList.add('active');
        } else {
            icon.className = 'fas fa-plus';
            favBtn.classList.remove('active');
        }
    });

    card.addEventListener('click', () => {
        openCinematicModal(movie);
    });

    return card;
}

let currentCardBuilder = null;

function renderNextBatch() {
    const batch = paginationQueue.slice(paginationIndex, paginationIndex + PAGE_SIZE);
    batch.forEach(item => grid.appendChild(currentCardBuilder(item)));
    paginationIndex += batch.length;
    loadMoreBtn.classList.toggle('hidden', paginationIndex >= paginationQueue.length);
}

function startPagedRender(items, cardBuilder, emptyMessage) {
    grid.innerHTML = "";
    paginationQueue = items || [];
    paginationIndex = 0;
    currentCardBuilder = cardBuilder;

    if (!paginationQueue.length) {
        grid.innerHTML = `<div class="loader">${emptyMessage}</div>`;
        loadMoreBtn.classList.add('hidden');
        return;
    }

    renderNextBatch();
}

function displayMovies(movies) {
    currentMovies = movies;
    startPagedRender(movies, buildMovieCard, "Aucun film trouvé. les films toujours disponibles sont dans la catégorie 🎬Autres.");
}

function buildChannelCard(channel) {
    const card = document.createElement('div');
    card.classList.add('channel-card');
    card.innerHTML = `
        <img src="${channel.logo}" alt="${channel.nom}" loading="lazy" class="channel-logo">
        <span class="channel-name">${channel.nom}</span>
    `;
    card.addEventListener('click', () => openLiveModal(channel));
    return card;
}

function displayChannels(channels) {
    startPagedRender(channels, buildChannelCard, "Aucune chaîne dans cette catégorie.");
}

async function renderCategoryFilters() {
    const channels = await getIptvChannels();
    const categories = [...new Set(channels.map(c => c.categorie))].sort();

    const container = document.getElementById('categoryFiltersContainer');
    container.innerHTML = `<button class="category-btn active" data-cat="all">Toutes</button>` +
        categories.map(cat =>
            `<button class="category-btn" data-cat="${cat}">${CATEGORY_ICONS[cat] || '📡'} ${cat}</button>`
        ).join('');

    container.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeChannelCategory = btn.dataset.cat === 'all' ? null : btn.dataset.cat;
            const filtered = activeChannelCategory
                ? channels.filter(c => c.categorie === activeChannelCategory)
                : channels;
            displayChannels(filtered);
        });
    });

    container.classList.remove('hidden');
    displayChannels(channels);
}

loadMoreBtn.addEventListener('click', renderNextBatch);

// --- FILTRAGE ---
async function getMoviesByGenre(genreId) {
    grid.innerHTML = `<div class="loader"><i class="fas fa-spinner"></i> Chargement...</div>`;
    
    const url = genreId === 'trending'
        ? `${BASE_URL}/trending/movie/week?api_key=${API_KEY}&language=${LANG}`
        : `${BASE_URL}/discover/movie?api_key=${API_KEY}&language=${LANG}&with_genres=${genreId}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        displayMovies(data.results);
    } catch (error) {
        console.error("Erreur lors du filtrage:", error);
    }
}

// --- MODALES ET LECTEURS DE VIDÉO ---
async function openCinematicModal(movie) {
    activeMovieData = movie;

    modalYear.textContent = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
    modalDesc.textContent = movie.overview || "Aucune description disponible.";
    videoPlayer.src = "";
    movieModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // --- FILM PERSO (YouTube) : tout est déjà dans le JSON, pas d'appel TMDB ---
    if (movie.source === 'youtube') {
        modalTitle.textContent = movie.title;
        modalTitle.classList.remove('as-logo');
        modalGenre.textContent = '🎬 Ma sélection';

        videoPlayer.src = `https://www.youtube.com/embed/${movie.youtubeId}?autoplay=1&mute=1&loop=1&playlist=${movie.youtubeId}&controls=0&modestbranding=1&enablejsapi=1&origin=${window.location.origin}`;
        isMuted = true;
        updateMuteButton();
        return;
    }

    // --- FILM TMDB : comportement existant, inchangé ---
    modalTitle.textContent = movie.title;
    modalTitle.classList.remove('as-logo');

    fetchMovieLogo(movie.id).then(logoUrl => {
        if (activeMovieData?.id !== movie.id) return;
        if (logoUrl) {
            modalTitle.innerHTML = `<div class="title-logo-wrap"><img src="${logoUrl}" alt="${movie.title}" class="title-logo-img"></div>`;
            modalTitle.classList.add('as-logo');
        }
    });

    const url = `${BASE_URL}/movie/${movie.id}/videos?api_key=${API_KEY}&language=${LANG}`;
    try {
        const response = await fetch(url);
        const data = await response.json();

        let video = data.results.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
        if (!video) {
            const resEn = await fetch(`${BASE_URL}/movie/${movie.id}/videos?api_key=${API_KEY}`);
            const dataEn = await resEn.json();
            video = dataEn.results.find(v => v.site === 'YouTube');
        }

        if (video) {
            videoPlayer.src = `https://www.youtube.com/embed/${video.key}?autoplay=1&mute=1&loop=1&playlist=${video.key}&controls=0&modestbranding=1&enablejsapi=1&origin=${window.location.origin}`;
            isMuted = true;
            updateMuteButton();
        }
    } catch (error) {
        console.error("Erreur lors de la récupération du trailer:", error);
    }
}

watchMovieBtn.addEventListener('click', () => {
    videoPlayer.src = "";
    movieModal.classList.remove('active');
    playerModal.classList.add('active');

    if (activeMovieData?.source === 'youtube') {
        playerPlaceholder.style.display = 'none';
        personalPlayerWrapper.classList.add('active');
        loadPersonalVideo(activeMovieData.youtubeId);
    } else {
        // Film TMDB : comportement existant (placeholder + timeout)
        playerPlaceholder.style.display = '';
        personalPlayerWrapper.classList.remove('active');
        personalVideoPlayer.src = '';

        playerMessageError.classList.remove('visible');
        clearTimeout(streamTimeoutId);
        streamTimeoutId = setTimeout(() => {
            playerMessageError.classList.add('visible');
        }, STREAM_TIMEOUT_MS);
    }
});

function closeAllModals() {
    movieModal.classList.remove('active');
    playerModal.classList.remove('active');
    document.body.style.overflow = 'auto';
    videoPlayer.src = "";

    clearTimeout(streamTimeoutId);
    playerMessageError.classList.remove('visible');

    personalPlayerWrapper.classList.remove('active');
    if (personalPlayer && personalPlayer.stopVideo) {
        personalPlayer.stopVideo();
    }
    playerPlaceholder.style.display = '';
}

closeModalBtn.addEventListener('click', closeAllModals);
closePlayerModalBtn.addEventListener('click', closeAllModals);
[movieModal, playerModal].forEach(m => {
    m.addEventListener('click', (e) => { if (e.target === m) closeAllModals(); });
});

// --- RECHERCHE ---
async function searchMovies(query) {
    if (query.trim() === '') {
        getTrendingMovies();
        return;
    }

    grid.innerHTML = `<div class="loader"><i class="fas fa-spinner"></i> Recherche...</div>`;
    const intent = detectSearchIntent(query);

    try {
        const personalMovies = await getPersonalMovies();
        let tmdbResults = [];
        let personalResults = [];

        if (intent.type === 'genre') {
            const url = `${BASE_URL}/discover/movie?api_key=${API_KEY}&language=${LANG}&with_genres=${intent.value}`;
            const res = await fetch(url);
            const data = await res.json();
            tmdbResults = data.results || [];

            personalResults = personalMovies.filter(movie =>
                Array.isArray(movie.genre_ids) && movie.genre_ids.includes(intent.value)
            );
        } else if (intent.type === 'year') {
            const url = `${BASE_URL}/discover/movie?api_key=${API_KEY}&language=${LANG}&primary_release_year=${intent.value}`;
            const res = await fetch(url);
            const data = await res.json();
            tmdbResults = data.results || [];

            personalResults = personalMovies.filter(movie =>
                (movie.release_date || '').startsWith(intent.value)
            );
        } else {
            const url = `${BASE_URL}/search/movie?api_key=${API_KEY}&language=${LANG}&query=${encodeURIComponent(query)}`;
            const res = await fetch(url);
            const data = await res.json();
            tmdbResults = data.results || [];

            const normalizedQuery = query.trim().toLowerCase();
            personalResults = personalMovies.filter(movie =>
                movie.title.toLowerCase().includes(normalizedQuery)
            );
        }

        // Tes films perso apparaissent en premier, suivis des résultats TMDB
        displayMovies([...personalResults, ...tmdbResults]);
    } catch (error) {
        console.error("Erreur lors de la recherche:", error);
    }
}

searchInput.addEventListener('input', debounce((e) => {
    searchMovies(e.target.value);
}, 1000));

// --- ÉCOUTEURS D'ÉVÉNEMENTS FILTRES ---
filterButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const categoryContainer = document.getElementById('categoryFiltersContainer');

        if (btn.dataset.genre === 'live') {
            categoryContainer.innerHTML = '';
            grid.innerHTML = `<div class="loader"><i class="fas fa-spinner"></i> Chargement des chaînes...</div>`;
            await renderCategoryFilters();
            return;
        }

        categoryContainer.classList.add('hidden');

        if (btn.dataset.genre === 'favorites') {
            displayMovies(getFavorites());
        } else if (btn.dataset.genre === 'perso') {
            grid.innerHTML = `<div class="loader"><i class="fas fa-spinner"></i> Chargement...</div>`;
            const movies = await getPersonalMovies();
            displayMovies(movies);
        } else {
            getMoviesByGenre(btn.dataset.genre);
        }
    });
});


// --- LECTEUR EN DIRECT (chaînes IPTV) ---
const liveModal = document.getElementById('liveModal');
const closeLiveModalBtn = document.getElementById('closeLiveModal');
const liveVideoPlayer = document.getElementById('liveVideoPlayer');
const livePlayerOverlay = document.getElementById('livePlayerOverlay');
const liveChannelLogo = document.getElementById('liveChannelLogo');
const liveChannelName = document.getElementById('liveChannelName');
const liveErrorMessage = document.getElementById('liveErrorMessage');
const liveRetryBtn = document.getElementById('liveRetryBtn');
const liveFullscreenBtn = document.getElementById('liveFullscreenBtn');
const livePlayerWrapper = document.getElementById('livePlayerWrapper');

let hlsInstance = null;
let currentChannel = null;
let isLivePlaying = true;

function playLiveStream(channel) {
    liveErrorMessage.classList.add('hidden');
    liveVideoPlayer.style.display = '';

    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }

    if (Hls.isSupported()) {
        hlsInstance = new Hls();
        hlsInstance.loadSource(channel.url);
        hlsInstance.attachMedia(liveVideoPlayer);
        hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
            liveVideoPlayer.play();
            isLivePlaying = true;
        });
        hlsInstance.on(Hls.Events.ERROR, (event, data) => {
            if (data.fatal) {
                liveVideoPlayer.style.display = 'none';
                liveErrorMessage.classList.remove('hidden');
            }
        });
    } else if (liveVideoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        liveVideoPlayer.src = channel.url;
        liveVideoPlayer.play();
        isLivePlaying = true;
    }
}

function openLiveModal(channel) {
    currentChannel = channel;
    liveChannelLogo.src = channel.logo;
    liveChannelName.textContent = channel.nom;
    liveModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    playLiveStream(channel);
}

function closeLiveModal() {
    liveModal.classList.remove('active');
    document.body.style.overflow = 'auto';
    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }
    liveVideoPlayer.pause();
    liveVideoPlayer.removeAttribute('src');
    liveVideoPlayer.load();
}

closeLiveModalBtn.addEventListener('click', closeLiveModal);
liveModal.addEventListener('click', (e) => { if (e.target === liveModal) closeLiveModal(); });

liveRetryBtn.addEventListener('click', () => {
    if (currentChannel) playLiveStream(currentChannel);
});

livePlayerOverlay.addEventListener('click', () => {
    isLivePlaying = !isLivePlaying;
    if (isLivePlaying) {
        liveVideoPlayer.play();
    } else {
        liveVideoPlayer.pause();
    }
});

liveFullscreenBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        livePlayerWrapper.requestFullscreen();
    }
});

document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === livePlayerWrapper) {
        liveFullscreenBtn.querySelector('i').className = 'fas fa-compress';
    } else if (!document.fullscreenElement) {
        liveFullscreenBtn.querySelector('i').className = 'fas fa-expand';
    }
});


// Initialisation au démarrage
getTrendingMovies();