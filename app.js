// app.js - Moteur d'immersion cinématique - Code A-Z

const API_KEY = '578bd3c6b2ac39a432cb440a7c152ef6';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/w500';
const LANG = 'fr-FR';
let currentMovies = []; // la liste actuellement affichée, sert de base au filtrage local

// Éléments du DOM
const grid = document.getElementById('movieGrid');
const searchInput = document.getElementById('searchInput');
const filterButtons = document.querySelectorAll('.filter-btn');

// Modales & Lecteurs
const movieModal = document.getElementById('movieModal');
const closeModalBtn = document.getElementById('closeModal');
const muteToggleBtn = document.getElementById('muteToggle');
const videoPlayer = document.getElementById('videoPlayer');
const modalTitle = document.getElementById('modalTitle');
const modalYear = document.getElementById('modalYear');
const modalDesc = document.getElementById('modalDesc');
const watchMovieBtn = document.getElementById('watchMovieBtn');

const playerModal = document.getElementById('playerModal');
const closePlayerModalBtn = document.getElementById('closePlayerModal');

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
function sendPlayerCommand(func) {
    videoPlayer.contentWindow?.postMessage(
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

function displayMovies(movies) {
    currentMovies = movies; 
    grid.innerHTML = "";
    
    if (!movies || movies.length === 0) {
        grid.innerHTML = `<div class="loader">Aucun film trouvé. Essaie une autre recherche ou un autre filtre 🎬</div>`;
        return;
    }

    movies.forEach(movie => {
        const poster = movie.poster_path ? `${IMG_URL}${movie.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image';
        const backdrop = movie.backdrop_path ? `${IMG_URL}${movie.backdrop_path}` : poster;
        const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
        
        const favIcon = isFavorite(movie.id) ? 'fas fa-check' : 'fas fa-plus';
        const favClass = isFavorite(movie.id) ? 'btn-fav active' : 'btn-fav';

        const card = document.createElement('div');
        card.classList.add('movie-card');
        
        // Structure Premium : Poster vertical + Backdrop horizontal secret + Textes & Actions
        card.innerHTML = `
            <img class="poster-img" src="${poster}" alt="${movie.title}" loading="lazy">
            <img class="backdrop-img" src="${backdrop}" alt="${movie.title} fond" loading="lazy">
            
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

        // Événement Bouton Lecture / Bande-annonce
        const playBtn = card.querySelector('.btn-play');
        playBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            openCinematicModal(movie);
        });

        // Événement Bouton Favoris
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

        // Clic sur le reste de la carte ouvre aussi les détails
        card.addEventListener('click', () => {
            openCinematicModal(movie);
        });

        grid.appendChild(card);
    });
}

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
    
    modalTitle.textContent = movie.title;
    modalTitle.classList.remove('as-logo');

    fetchMovieLogo(movie.id).then(logoUrl => {
        if (activeMovieData?.id !== movie.id) return;
        if (logoUrl) {
            modalTitle.innerHTML = `<div class="title-logo-wrap"><img src="${logoUrl}" alt="${movie.title}" class="title-logo-img"></div>`;
            modalTitle.classList.add('as-logo');
        }
    });
    modalYear.textContent = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
    modalDesc.textContent = movie.overview || "Aucune description disponible.";

    videoPlayer.src = ""; 
    movieModal.classList.add('active');
    document.body.style.overflow = 'hidden';

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
});

function closeAllModals() {
    movieModal.classList.remove('active');
    playerModal.classList.remove('active');
    document.body.style.overflow = 'auto';
    videoPlayer.src = "";
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
    const url = `${BASE_URL}/search/movie?api_key=${API_KEY}&language=${LANG}&query=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        displayMovies(data.results);
    } catch (error) {
        console.error("Erreur lors de la recherche:", error);
    }
}

searchInput.addEventListener('input', debounce((e) => {
    searchMovies(e.target.value);
}, 1000));

// --- ÉCOUTEURS D'ÉVÉNEMENTS FILTRES ---
filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (btn.dataset.genre === 'favorites') {
            displayMovies(getFavorites());
        } else {
            getMoviesByGenre(btn.dataset.genre);
        }
    });
});

// Initialisation au démarrage
getTrendingMovies();