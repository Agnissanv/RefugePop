// app.js - Version Propulsée par TMDB (Avec Filtres UX et Loader)

const API_KEY = '578bd3c6b2ac39a432cb440a7c152ef6'; // Ta clé TMDB fonctionnelle
const BASE_URL = 'https://api.themoviedb.org/3';
const IMG_URL = 'https://image.tmdb.org/t/p/w500';
const LANG = 'fr-FR';

const grid = document.getElementById('movieGrid');
const searchInput = document.getElementById('searchInput');
const modal = document.getElementById('movieModal');
const closeModalBtn = document.getElementById('closeModal');
const modalDetails = document.getElementById('modalDetails');
const videoContainer = document.getElementById('videoContainer');
const videoPlayer = document.getElementById('videoPlayer');
const playBtn = document.getElementById('playBtn');
const filterButtons = document.querySelectorAll('.filter-btn');

let activeMovieId = null;

// 1. Aller chercher les films tendances du moment
async function getTrendingMovies() {
    grid.innerHTML = `<div class="loader"><i class="fas fa-spinner"></i> Recherche des meilleures ondes...</div>`;
    const url = `${BASE_URL}/trending/movie/week?api_key=${API_KEY}&language=${LANG}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        displayMovies(data.results);
    } catch (error) {
        console.error("Erreur lors de la récupération des films:", error);
        grid.innerHTML = `<p class="no-results">Impossible de se connecter au refuge. Vérifie ta connexion.</p>`;
    }
}

// 2. Récupérer les films par catégorie/genre via TMDB
async function getMoviesByGenre(genreId) {
    grid.innerHTML = `<div class="loader"><i class="fas fa-spinner"></i> Tri de la pellicule...</div>`;
    const url = `${BASE_URL}/discover/movie?api_key=${API_KEY}&language=${LANG}&with_genres=${genreId}&sort_by=popularity.desc&include_adult=false`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        displayMovies(data.results);
    } catch (error) {
        console.error("Erreur lors du filtrage par genre:", error);
        grid.innerHTML = `<p class="no-results">Une erreur est survenue lors du filtrage.</p>`;
    }
}

// 3. Afficher les films dans la grille
function displayMovies(movies) {
    grid.innerHTML = "";
    
    if(movies.length === 0) {
        grid.innerHTML = `<p class="no-results">Aucun film trouvé pour votre mood actuel...</p>`;
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
        
        card.addEventListener('click', () => openModal(movie));
        grid.appendChild(card);
    });
}

// 4. Écouteur d'événements sur les boutons de filtre
filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        searchInput.value = "";

        const genre = btn.getAttribute('data-genre');
        if (genre === 'trending') {
            getTrendingMovies();
        } else {
            getMoviesByGenre(genre);
        }
    });
});

// 5. Recherche en temps réel
searchInput.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    
    if(query.length > 2) {
        filterButtons.forEach(b => b.classList.remove('active'));
        
        const url = `${BASE_URL}/search/movie?api_key=${API_KEY}&language=${LANG}&query=${encodeURIComponent(query)}&include_adult=false`;
        const response = await fetch(url);
        const data = await response.json();
        displayMovies(data.results);
    } else if (query.length === 0) {
        filterButtons.forEach(b => b.classList.remove('active'));
        const trendingBtn = document.querySelector('[data-genre="trending"]');
        if(trendingBtn) trendingBtn.classList.add('active');
        getTrendingMovies();
    }
});

// 6. Ouvrir la modale
function openModal(movie) {
    activeMovieId = movie.id;
    const poster = movie.poster_path ? `${IMG_URL}${movie.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image';
    const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';

    document.getElementById('modalImg').src = poster;
    document.getElementById('modalTitle').textContent = movie.title;
    document.getElementById('modalYear').textContent = year;
    document.getElementById('modalGenre').textContent = "🍿 Populaire";
    document.getElementById('modalDesc').textContent = movie.overview || "Aucun synopsis disponible pour ce film.";
    
    modalDetails.style.display = "flex";
    videoContainer.style.display = "none";
    videoPlayer.src = "";

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// 7. Action du bouton : Lancer la vidéo officielle
playBtn.addEventListener('click', async () => {
    if (!activeMovieId) return;

    const url = `${BASE_URL}/movie/${activeMovieId}/videos?api_key=${API_KEY}&language=${LANG}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        let video = data.results.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
        
        if (!video) {
            const resEn = await fetch(`${BASE_URL}/movie/${activeMovieId}/videos?api_key=${API_KEY}`);
            const dataEn = await resEn.json();
            video = dataEn.results.find(v => v.site === 'YouTube');
        }

        if (video) {
            modalDetails.style.display = "none";
            videoContainer.style.display = "block";
            videoPlayer.src = `https://www.youtube.com/embed/${video.key}?autoplay=1`;
        } else {
            alert("Désolé, aucune vidéo n'est disponible pour ce film pour le moment !");
        }
    } catch (error) {
        console.error("Erreur lors de la récupération de la vidéo:", error);
    }
});

function resetAndCloseModal() {
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    videoPlayer.src = "";
}

closeModalBtn.addEventListener('click', resetAndCloseModal);
modal.addEventListener('click', (e) => { if (e.target === modal) resetAndCloseModal(); });

// Démarrage de l'application
getTrendingMovies();