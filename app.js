// app.js - Version Propulsée par TMDB

const API_KEY = '578bd3c6b2ac39a432cb440a7c152ef6'; // Remplace par ta clé TMDB
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

let activeMovieId = null; // On stocke l'ID TMDB du film sélectionné

// 1. Aller chercher les films tendances du moment au chargement
async function getTrendingMovies() {
    const url = `${BASE_URL}/trending/movie/week?api_key=${API_KEY}&language=${LANG}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        displayMovies(data.results);
    } catch (error) {
        console.error("Erreur lors de la récupération des films:", error);
    }
}

// 2. Afficher les films dans la grille UX
function displayMovies(movies) {
    grid.innerHTML = "";
    
    // Si aucun film n'est trouvé
    if(movies.length === 0) {
        grid.innerHTML = `<p class="no-results">Aucun film trouvé pour votre mood actuel...</p>`;
        return;
    }

    movies.forEach(movie => {
        // Sécurité si le film n'a pas d'affiche
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

// 3. Recherche en temps réel (Déclenchée quand l'utilisateur tape)
searchInput.addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    
    if(query.length > 2) {
        // Recherche active (Filtre adulte désactivé par défaut via &include_adult=false)
        const url = `${BASE_URL}/search/movie?api_key=${API_KEY}&language=${LANG}&query=${encodeURIComponent(query)}&include_adult=false`;
        const response = await fetch(url);
        const data = await response.json();
        displayMovies(data.results);
    } else if (query.length === 0) {
        // Si la barre est vidée, on remet les tendances
        getTrendingMovies();
    }
});

// 4. Ouvrir la modale et préparer les données du film
function openModal(movie) {
    activeMovieId = movie.id; // On garde l'ID pour chercher la vidéo plus tard
    const poster = movie.poster_path ? `${IMG_URL}${movie.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Image';
    const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';

    document.getElementById('modalImg').src = poster;
    document.getElementById('modalTitle').textContent = movie.title;
    document.getElementById('modalYear').textContent = year;
    document.getElementById('modalGenre').textContent = "🍿 Populaire";
    document.getElementById('modalDesc').textContent = movie.overview || "Aucun synopsis disponible pour ce film.";
    
    // Reset de l'état de la modale
    modalDetails.style.display = "flex";
    videoContainer.style.display = "none";
    videoPlayer.src = ""; 

    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

// 5. L'ACTION DU BOUTON : Aller chercher le trailer/film sur TMDB et le lancer
playBtn.addEventListener('click', async () => {
    if (!activeMovieId) return;

    // On demande à TMDB les vidéos liées à ce film
    const url = `${BASE_URL}/movie/${activeMovieId}/videos?api_key=${API_KEY}&language=${LANG}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        // On cherche en priorité un "Trailer" (Bande-annonce) sur YouTube
        let video = data.results.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
        
        // Si pas de vidéo en français, on cherche la version globale (souvent en anglais)
        if (!video) {
            const resEn = await fetch(`${BASE_URL}/movie/${activeMovieId}/videos?api_key=${API_KEY}`);
            const dataEn = await resEn.json();
            video = dataEn.results.find(v => v.site === 'YouTube');
        }

        if (video) {
            modalDetails.style.display = "none"; 
            videoContainer.style.display = "block"; 
            // On injecte l'URL embed YouTube officielle du film avec Autoplay
            videoPlayer.src = `https://www.youtube.com/embed/${video.key}?autoplay=1`;
        } else {
            alert("Désolé, aucune vidéo n'est disponible pour ce film pour le moment !");
        }

    } catch (error) {
        console.error("Erreur lors de la récupération de la vidéo:", error);
    }
});

// Fermeture
function resetAndCloseModal() {
    modal.classList.remove('active');
    document.body.style.overflow = 'auto';
    videoPlayer.src = ""; 
}

closeModalBtn.addEventListener('click', resetAndCloseModal);
modal.addEventListener('click', (e) => { if (e.target === modal) resetAndCloseModal(); });

// Démarrage de l'application
getTrendingMovies();