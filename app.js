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
        card.innerHTML = `
            <img src="${poster}" alt="${movie.title}" loading="lazy">
            <div class="card-info">
                <div class="card-title">${movie.title}</div>
                <div class="card-year">${year}</div>
            </div>
        `;
        
        // GESTION DU SURVOL (Petite modale d'aperçu)
        card.addEventListener('mouseenter', () => {
            hoverImg.src = poster;
            hoverTitle.textContent = movie.title;
            hoverYear.textContent = year;
            hoverDesc.textContent = movie.overview || "Aucun résumé disponible pour le moment.";
            hoverPreview.classList.add('active');
        });

        card.addEventListener('mouseleave', () => {
            hoverPreview.classList.remove('active');
        });

        // GESTION DU CLIC (Grande modale cinématique)
        card.addEventListener('click', () => {
            hoverPreview.classList.remove('active'); // Ferme l'aperçu instantanément
            openCinematicModal(movie);
        });

        grid.appendChild(card);
    });
}

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

filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        getMoviesByGenre(btn.dataset.genre);
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