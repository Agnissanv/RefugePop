// app.js - Moteur d'immersion cinématique - Code A-Z

const API_KEY = '578bd3c6b2ac39a432cb440a7c152ef6';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/w342';
const LANG = 'fr-FR';
const STREAM_TIMEOUT_MS = 30000; // délai avant d'afficher "flux non disponible" (30000 = 30 secondes)
const PERSONAL_MOVIES_URL = 'youtube/movies.json';
const IPTV_CHANNELS_URL = 'iptv/chaines.json';
const MATCHES_URL = 'foot_live_manuel/matches.json';
// --- UTILITAIRES pour blog ---
function slugifyMovie(movie) {
    const year = movie.release_date ? movie.release_date.split('-')[0] : '';
    const base = movie.title
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    return year ? `${base}-${year}` : base;
}

async function checkDeepLinkMovie() {
    const params = new URLSearchParams(window.location.search);
    const filmSlug = params.get('film');
    if (!filmSlug) return;

    const movies = await getPersonalMovies();
    const match = movies.find(m => slugifyMovie(m) === filmSlug);
    if (match) {
        openCinematicModal(match);
    }
}
// --- PUBLICITÉS ---
const HOUSE_ADS = [
    { type: 'image', src: 'ads/recrutement_commercial.jpg', link: 'https://www.agnissanisaac.com/emploie/emploi.html', label: 'Recrutement Commercial chez Code A-Z' },
    { type: 'image', src: 'ads/betwinner_affiliate.png', link: 'https://bwredir.com/32FI?extid=https://refugepop.agnissanisaac.com/&s1=RefugePop&p=%2Fregistration%2F', label: 'Betwinner Affiliate' },
    { type: 'image', src: 'https://images.chariowcdn.com/cdn-cgi/image/format=auto,onerror=redirect,quality=medium-high,slow-connection-quality=50/https://assets.chariowcdn.com/assets/store_mi4ltzhj002q/OQS4ItVQby2Q5KfbS910uzTJ19VRPsS6Ex0vJg63.png', link: 'https://codea-z.mychariow.shop/larsenal-du-developpeur-pro-le-pack-ultime', label: 'Arsenal du Développeur Pro - Le Pack Ultime' }
];

function getNextAdIndex() {
    const stored = parseInt(sessionStorage.getItem('houseAdIndex') || '0', 10);
    sessionStorage.setItem('houseAdIndex', String(stored + 1));
    return stored % HOUSE_ADS.length;
}

function maybeShowAdOverlay(wrapperEl, onDone) {
    if (HOUSE_ADS.length === 0 || Math.random() >= 0.25) {
        onDone();
        return;
    }

    const ad = HOUSE_ADS[getNextAdIndex()];
    const overlay = document.createElement('div');
    overlay.className = 'house-ad-overlay';
    overlay.innerHTML = `
        <span class="house-ad-tag">Publicité</span>
        <a href="${ad.link}" target="_blank" rel="noopener" class="house-ad-media">
            ${ad.type === 'video'
                ? `<video src="${ad.src}" autoplay muted playsinline></video>`
                : `<img src="${ad.src}" alt="${ad.label}">`}
        </a>
        <button class="house-ad-skip" disabled>Passer (5)</button>
    `;
    wrapperEl.appendChild(overlay);

    const skipBtn = overlay.querySelector('.house-ad-skip');
    let secondsLeft = 5;
    const countdown = setInterval(() => {
        secondsLeft--;
        if (secondsLeft <= 0) {
            clearInterval(countdown);
            skipBtn.textContent = 'Passer ⏭';
            skipBtn.disabled = false;
        } else {
            skipBtn.textContent = `Passer (${secondsLeft})`;
        }
    }, 1000);

    skipBtn.addEventListener('click', () => {
        clearInterval(countdown);
        overlay.remove();
        onDone();
    });
}
let personalMoviesCache = null;
let iptvChannelsCache = null;
let matchesCache = null;

const MONTHS_FR = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

function formatMatchDate(isoDate) {
    const [y, m, d] = isoDate.split('-').map(Number);
    return `${d} ${MONTHS_FR[m - 1]} ${y}`;
}

async function getMatches() {
    if (matchesCache) return matchesCache;
    try {
        const res = await fetch(MATCHES_URL);
        const data = await res.json();
        matchesCache = data;
        return data;
    } catch (e) {
        console.error('Erreur chargement matchs:', e);
        return [];
    }
}

function buildMatchCard(match) {
    const card = document.createElement('div');
    card.classList.add('match-card');
    card.innerHTML = `
        <div class="match-live-badge"><span class="live-dot">●</span> ${match.viewerStart.toLocaleString('fr-FR')} spectateurs</div>
        <div class="match-teams">
            <img class="match-flag-img" src="${match.logoHome}" alt="${match.teamHome}">
            <span class="match-vs">VS</span>
            <img class="match-flag-img" src="${match.logoAway}" alt="${match.teamAway}">
        </div>
        <p class="match-title">${match.teamHome} - ${match.teamAway}</p>
        <p class="match-datetime">${formatMatchDate(match.date)} à ${match.heure}</p>
    `;
    card.addEventListener('click', () => openMatchModal(match));
    return card;
}

function displayMatches(matches) {
    startPagedRender(matches, buildMatchCard, "Aucun match programmé pour le moment.");
}

const CATEGORY_ICONS = {
    'Général': '<i class="fa-solid fa-tv"></i>', 'Actualités': '<i class="fa-solid fa-newspaper"></i>', 'Films-Série': '<i class="fa-solid fa-film"></i>', 'Religieux': '<i class="fa-solid fa-hands-praying"></i>',
    'Musique': '<i class="fa-solid fa-music"></i>', 'Divertissement': '<i class="fa-solid fa-champagne-glasses"></i>', 'Indéfini': '❔', 'Documentaire': '<i class="fa-solid fa-book"></i>',
    'Animation': '<i class="fa-solid fa-paw"></i>', 'Sportif': '<i class="fa-solid fa-futbol"></i>', 'Style de vie': '<i class="fa-solid fa-leaf"></i>', 'Entreprise': '<i class="fa-solid fa-briefcase"></i>',
    'Éducation': '<i class="fa-solid fa-graduation-cap"></i>', 'Cuisine': '<i class="fa-solid fa-utensils"></i>', 'Voyage & Plein air': '<i class="fa-solid fa-plane"></i>', 'Culture': '<i class="fa-solid fa-theater-masks"></i>', 'Famille': '<i class="fa-solid fa-users"></i>', 'Jeunesse': '<i class="fa-solid fa-child"></i>'
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
    thriller: 53,
    policier: 80, crime: 80, polar: 80,
    mystere: 9648, mystery: 9648, enquete: 9648,
    aventure: 12, adventure: 12,
    scifi: 878, sciencefiction: 878,
    documentaire: 99, doc: 99,
    fantastique: 14, fantasy: 14,
};

const GENRE_LABELS = {
    28: '🔥 Action', 27: '👻 Horreur', 35: '😂 Comédie', 18: '🎭 Drame',
    10749: '💘 Amour', 16: '🐾 Animation', 53: '💓 Thriller', 80: '🔗 Policier',
    9648: '🔍 Mystère', 12: '🧭 Aventure', 878: '🚀 Science-Fiction',
    99: '📖 Documentaire', 14: '🧙 Fantastique', 10770: '📺 Téléfilm',
    36: '📜 Histoire', 10752: '⚔️ Guerre', 10751: '👪 Famille',
    37: '🤠 Western', 10402: '🎵 Musique'
};

function isRecentlyAdded(movie) {
    if (!movie.dateAdded) return false;
    const addedDate = new Date(movie.dateAdded);
    const diffDays = (Date.now() - addedDate.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays <= 14;
}

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

const personalPlayerError = document.getElementById('personalPlayerError');

function showPersonalPlayerError() {
    personalPlayerError.classList.remove('hidden');
}

function hidePersonalPlayerError() {
    personalPlayerError.classList.add('hidden');
    document.getElementById('personalVideoPlayer').style.visibility = 'visible';
}

function loadPersonalVideo(videoId, attempt = 0) {
    hidePersonalPlayerError();

    if (!ytApiReady || typeof YT === 'undefined' || !YT.Player) {
        if (attempt > 40) {
            // ~8 secondes d'attente écoulées, le script YouTube n'a jamais chargé (bloqueur de pub, réseau...)
            showPersonalPlayerError();
            return;
        }
        setTimeout(() => loadPersonalVideo(videoId, attempt + 1), 200);
        return;
    }

    if (!personalPlayer) {
        personalPlayer = new YT.Player('personalVideoPlayer', {
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
                },
                onError: () => {
                    // Vidéo retirée, privée, ou intégration désactivée sur YouTube
                    document.getElementById('personalVideoPlayer').style.visibility = 'hidden';
                    showPersonalPlayerError();
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

// --- FILTRAGE DES FILMS ---
async function handleMovieFilterClick(genreKey) {
    grid.innerHTML = `<div class="loader"><i class="fas fa-spinner"></i> Chargement...</div>`;
    const allMovies = await getPersonalMovies();

    if (genreKey === 'perso') {
        displayMovies(allMovies);
    } else if (genreKey === 'trending') {
        displayMovies([...allMovies].reverse());
    } else if (genreKey === 'favorites') {
        displayMovies(getFavorites());
    } else {
        const genreId = parseInt(genreKey, 10);
        const filtered = allMovies.filter(m => Array.isArray(m.genre_ids) && m.genre_ids.includes(genreId));
        displayMovies(filtered);
    }
}

function buildMovieCard(movie, index = 99) {
    const poster = movie.source === 'youtube'
        ? movie.poster
        : (movie.poster_path ? `${IMG_URL}${movie.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image');
    const backdrop = movie.source === 'youtube'
        ? (movie.backdrop || movie.poster)
        : (movie.backdrop_path ? `${IMG_URL}${movie.backdrop_path}` : poster);
    const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';

    const favIcon = isFavorite(movie.id) ? 'fas fa-check' : 'fas fa-plus';
    const favClass = isFavorite(movie.id) ? 'btn-fav active' : 'btn-fav';
    const availableBadge = isRecentlyAdded(movie)
        ? `<span class="badge-available"><i class="fas fa-star"></i> Nouveau</span>`
        : '';

    const card = document.createElement('div');
    card.classList.add('movie-card');

    card.innerHTML = `
        <img class="poster-img" src="${poster}" alt="${movie.title}" ${index < 4 ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"'}>
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
    batch.forEach((item, i) => grid.appendChild(currentCardBuilder(item, paginationIndex + i)));
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
    startPagedRender(movies, buildMovieCard, "Aucun film trouvé. Clique sur les boutons pour choisir ce que tu veux !");
}

function buildChannelCard(channel) {
    const card = document.createElement('div');
    card.classList.add('channel-card');
    card.innerHTML = `
        <div class="channel-logo-frame">
            <img src="${channel.logo}" alt="${channel.nom}" loading="lazy" class="channel-logo">
        </div>
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
        const primaryGenreId = (movie.genre_ids || []).find(id => GENRE_LABELS[id]);
        modalGenre.textContent = primaryGenreId ? GENRE_LABELS[primaryGenreId] : '🎬 Ma sélection';

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
        hidePersonalPlayerError();
        maybeShowAdOverlay(personalPlayerWrapper, () => {
            loadPersonalVideo(activeMovieData.youtubeId);
        });
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
        handleMovieFilterClick('trending');
        return;
    }

    grid.innerHTML = `<div class="loader"><i class="fas fa-spinner"></i> Recherche...</div>`;
    const intent = detectSearchIntent(query);

    try {
        const allMovies = await getPersonalMovies();
        let results;

        if (intent.type === 'genre') {
            results = allMovies.filter(m => Array.isArray(m.genre_ids) && m.genre_ids.includes(intent.value));
        } else if (intent.type === 'year') {
            results = allMovies.filter(m => (m.release_date || '').startsWith(intent.value));
        } else {
            const normalizedQuery = query.trim().toLowerCase();
            results = allMovies.filter(m => m.title.toLowerCase().includes(normalizedQuery));
        }

        displayMovies(results);
    } catch (error) {
        console.error("Erreur lors de la recherche:", error);
    }
}

let searchMode = 'movies'; // 'movies' ou 'live', selon le filtre actif

function searchChannels(query) {
    const normalizedQuery = query.trim().toLowerCase();

    if (normalizedQuery === '') {
        // Retour à la liste complète des chaînes (pas de filtre catégorie actif ici, comme convenu)
        getIptvChannels().then(displayChannels);
        return;
    }

    getIptvChannels().then(channels => {
        const filtered = channels.filter(ch =>
            ch.nom.toLowerCase().includes(normalizedQuery) ||
            (ch.categorie || '').toLowerCase().includes(normalizedQuery)
        );
        displayChannels(filtered);
    });
}

searchInput.addEventListener('input', debounce((e) => {
    if (searchMode === 'live') {
        searchChannels(e.target.value);
    } else {
        searchMovies(e.target.value);
    }
}, 1000));

// --- ÉCOUTEURS D'ÉVÉNEMENTS FILTRES ---
filterButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const categoryContainer = document.getElementById('categoryFiltersContainer');
        const mondialSidebar = document.getElementById('mondialSidebar');

        if (btn.dataset.genre === 'live') {
            searchMode = 'live';
            searchInput.value = '';
            searchInput.placeholder = 'Cherche une chaîne (BFM2, Sport, TV5Monde...)';

            mondialSidebar.classList.add('hidden');
            categoryContainer.innerHTML = '';
            grid.innerHTML = `<div class="loader"><i class="fas fa-spinner"></i> Chargement des chaînes...</div>`;
            await renderCategoryFilters();
            return;
        }

        if (btn.dataset.genre === 'mondial') {
            searchMode = 'movies';
            searchInput.value = '';
            searchInput.placeholder = 'Une envie douce, un frisson, une série ?...';

            categoryContainer.classList.add('hidden');
            mondialSidebar.classList.remove('hidden');
            grid.innerHTML = `<div class="loader"><i class="fas fa-spinner"></i> Chargement des matchs...</div>`;
            const matches = await getMatches();
            displayMatches(matches);
            return;
        }

        searchMode = 'movies';
        searchInput.value = '';
        searchInput.placeholder = 'Une envie douce, un frisson, une série ?...';

        categoryContainer.classList.add('hidden');
        mondialSidebar.classList.add('hidden');

        handleMovieFilterClick(btn.dataset.genre);
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

const PROXY_BASE = 'https://refugepop-proxy.valenbouge.workers.dev';

function proxify(url) {
    return `${PROXY_BASE}/?url=${encodeURIComponent(url)}`;
}

function playLiveStream(channel) {
    liveErrorMessage.classList.add('hidden');
    liveVideoPlayer.style.display = '';

    if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
    }

    if (Hls.isSupported()) {
        hlsInstance = new Hls();
        hlsInstance.loadSource(proxify(channel.url));
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
        liveVideoPlayer.src = proxify(channel.url);
        liveVideoPlayer.play();
        isLivePlaying = true;
    }
}

// --- MODALE LECTEUR IPTV ---
function openLiveModal(channel) {
    currentChannel = channel;
    liveChannelLogo.src = channel.logo;
    liveChannelName.textContent = channel.nom;
    liveModal.classList.add('active');
    document.body.style.overflow = 'hidden';
    maybeShowAdOverlay(livePlayerWrapper, () => {
        playLiveStream(channel);
    });
}

// --- FERMETURE MODALE LECTEUR IPTV ---
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



// --- LECTEUR DE MATCH (Mondial) ---
const matchModal = document.getElementById('matchModal');
const closeMatchModalBtn = document.getElementById('closeMatchModal');
const matchIframe = document.getElementById('matchIframe');
const matchModalTeams = document.getElementById('matchModalTeams');
const matchViewerCountEl = document.getElementById('matchViewerCount');
const matchFullscreenBtn = document.getElementById('matchFullscreenBtn');
const matchPlayerWrapper = document.getElementById('matchPlayerWrapper');
let matchViewerInterval = null;

function openMatchModal(match) {
    matchModalTeams.innerHTML = `
        <img class="match-flag-img-small" src="${match.logoHome}" alt="${match.teamHome}">
        ${match.teamHome} vs ${match.teamAway}
        <img class="match-flag-img-small" src="${match.logoAway}" alt="${match.teamAway}">
    `;
    matchIframe.src = '';

    let currentCount = match.viewerStart;
    matchViewerCountEl.textContent = currentCount.toLocaleString('fr-FR');

    clearInterval(matchViewerInterval);
    matchViewerInterval = setInterval(() => {
        const variation = Math.floor(Math.random() * 60) - 25;
        currentCount = Math.max(3000, currentCount + variation);
        matchViewerCountEl.textContent = currentCount.toLocaleString('fr-FR');
    }, 4000);

    matchModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    maybeShowAdOverlay(matchPlayerWrapper, () => {
        matchIframe.src = match.iframeUrl;
    });
}

function closeMatchModal() {
    matchModal.classList.remove('active');
    document.body.style.overflow = 'auto';
    matchIframe.src = '';
    clearInterval(matchViewerInterval);
}

closeMatchModalBtn.addEventListener('click', closeMatchModal);
matchModal.addEventListener('click', (e) => { if (e.target === matchModal) closeMatchModal(); });

matchFullscreenBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        matchPlayerWrapper.requestFullscreen();
    }
});

document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement === matchPlayerWrapper) {
        matchFullscreenBtn.querySelector('i').className = 'fas fa-compress';
    } else if (!document.fullscreenElement) {
        matchFullscreenBtn.querySelector('i').className = 'fas fa-expand';
    }
});


// Initialisation au démarrage
handleMovieFilterClick('trending');
checkDeepLinkMovie();


// --- FOOTER : liens rapides + retour en haut ---
document.querySelectorAll('.footer-quicklink').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const target = link.dataset.genreTarget;
        const btn = document.querySelector(`.filter-btn[data-genre="${target}"]`);
        if (btn) btn.click();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});

const backToTopBtn = document.getElementById('backToTopBtn');
backToTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

window.addEventListener('scroll', () => {
    backToTopBtn.classList.toggle('visible', window.scrollY > 400);
});