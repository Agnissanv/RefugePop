// app.js - Moteur d'immersion cinématique style Netflix

const API_KEY = '578bd3c6b2ac39a432cb440a7c152ef6';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/w500';
const LANG = 'fr-FR';
let currentMovies = []; // la liste actuellement affichée, sert de base au filtrage local

// Éléments du DOM
const grid = document.getElementById('movieGrid');
const searchInput = document.getElementById('searchInput');
const filterButtons = document.querySelectorAll('.filter-btn');

// Modale 1 : Aperçu au survol
const hoverPreview = document.getElementById('hoverPreview');
const hoverImg = document.getElementById('hoverImg');
const hoverTitle = document.getElementById('hoverTitle');
const hoverYear = document.getElementById('hoverYear');
const hoverDesc = document.getElementById('hoverDesc');
const hoverPlayBtn = document.getElementById('hoverPlayBtn');
const hoverFavBtn = document.getElementById('hoverFavBtn');


let hoverTimeout = null;  // Gère le délai avant ouverture
let closeTimeout = null;  // Gère le délai avant fermeture


// Modale 2 : Détails cinématiques
const movieModal = document.getElementById('movieModal');
const closeModalBtn = document.getElementById('closeModal');
const videoPlayer = document.getElementById('videoPlayer');
const modalTitle = document.getElementById('modalTitle');
const modalYear = document.getElementById('modalYear');
const modalDesc = document.getElementById('modalDesc');
const watchMovieBtn = document.getElementById('watchMovieBtn');

// Modale 3 : Lecteur final
const playerModal = document.getElementById('playerModal');
const closePlayerModalBtn = document.getElementById('closePlayerModal');

let activeMovieData = null; 
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
        favs.splice(index, 1); // Retire des favoris s'il y est déjà
    } else {
        favs.push(movie); // Ajoute le film complet
    }
    localStorage.setItem('refugePopFavorites', JSON.stringify(favs));
}

function isFavorite(movieId) {
    return getFavorites().some(f => f.id === movieId);
}

function updateFavButtonState(movie) {
    if (isFavorite(movie.id)) {
        hoverFavBtn.innerHTML = '<i class="fas fa-check"></i>';
        hoverFavBtn.style.borderColor = 'var(--accent)';
        hoverFavBtn.style.color = 'var(--accent)';
    } else {
        hoverFavBtn.innerHTML = '<i class="fas fa-plus"></i>';
        hoverFavBtn.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        hoverFavBtn.style.color = 'white';
    }
}


// Initialisation : Chargement des tendances
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

// Injection des cartes et gestion des événements de survol/clic
function displayMovies(movies) {
    currentMovies = movies; // Met à jour la liste actuelle
    grid.innerHTML = "";
    if (!movies || movies.length === 0) {
        grid.innerHTML = `<div class="loader">Aucun film trouvé. Essaie une autre recherche ou un autre filtre 🎬</div>`;
        return;
    }

    movies.forEach(movie => {
        const poster = movie.poster_path ? `${IMG_URL}${movie.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image';
        const year = movie.release_date ? movie.release_date.split('-')[0] : '2026';

        const card = document.createElement('div');
        card.classList.add('movie-card');
        
        // NOUVELLE STRUCTURE DE CARTE POUR L'ACCORDÉON
        card.innerHTML = `
            <div class="card-visual">
                <img src="${poster}" alt="${movie.title}" loading="lazy">
            </div>
            <div class="card-content">
                <h3 class="card-inline-title">${movie.title}</h3>
                <span class="card-inline-year">🍿 ${year}</span>
                <p class="card-inline-desc">${movie.overview || "Aucun résumé disponible."}</p>
            </div>
        `;

        // Gestion du clic pour ouvrir la grande modale de détails actuelle
        card.addEventListener('click', () => {
            openCinematicModal(movie);
        });

        grid.appendChild(card);
    });
}

// Empêche la fermeture de l'aperçu si la souris est entrée à l'intérieur
hoverPreview.addEventListener('mouseenter', () => { clearTimeout(closeTimeout); });
hoverPreview.addEventListener('mouseleave', () => { hoverPreview.classList.remove('active'); });


// Filtrage par genre ou tendances
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

// Logique d'ouverture de la grande modale avec fond vidéo automatique
async function openCinematicModal(movie) {
    activeMovieData = movie;
    
    modalTitle.textContent = movie.title;
    modalYear.textContent = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
    modalDesc.textContent = movie.overview || "Aucun synopsis disponible.";

    // Préparation de l'état visuel et affichage de la modale
    videoPlayer.src = ""; 
    movieModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Récupération de la bande-annonce sur l'API TMDB
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
            // Injection de la vidéo en tâche de fond avec autoplay, mute et boucle
            videoPlayer.src = `https://www.youtube.com/embed/${video.key}?autoplay=1&mute=1&loop=1&playlist=${video.key}&controls=0&modestbranding=1`;
        }
    } catch (error) {
        console.error("Erreur lors de la récupération du trailer:", error);
    }
}

// Passage à la troisième modale : Le lecteur final
watchMovieBtn.addEventListener('click', () => {
    // 1. On coupe le son et le flux de la bande-annonce en arrière-plan
    videoPlayer.src = "";
    // 2. On ferme la modale cinématique
    movieModal.classList.remove('active');
    // 3. On ouvre le lecteur final sécurisé
    playerModal.classList.add('active');
});

// Fonctions de fermeture standards
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

searchInput.addEventListener('input', debounce((e) => {
    searchMovies(e.target.value);
}, 1000));

// Écouteur des boutons filtres mis à jour pour intercepter le filtre "Mes Favoris"
filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        if (btn.dataset.genre === 'favorites') {
            displayMovies(getFavorites()); // Charge les favoris locaux
        } else {
            getMoviesByGenre(btn.dataset.genre); // Charge via l'API TMDB
        }
    });
});

async function searchMovies(query) {
    if (query.trim() === '') {
        getTrendingMovies(); // retour aux tendances si le champ est vidé
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

// Initialisation globale de l'application
getTrendingMovies();