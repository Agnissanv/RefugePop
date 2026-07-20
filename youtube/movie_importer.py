"""
movie_importer.py - Import automatique des films perso pour Refuge Pop
Scanne des chaînes YouTube, filtre les vraies vidéos de films (durée > seuil),
cherche une correspondance TMDB FIABLE (vérifiée par similarité de titre),
et met à jour movies.json. Les correspondances douteuses partent dans
needs_review.json au lieu d'être ajoutées automatiquement.

Usage : python movie_importer.py
(à exécuter depuis le dossier youtube/, là où se trouve movies.json)
"""

import json
import re
import time
import unicodedata
import difflib
from pathlib import Path
from datetime import date
import requests
from requests.exceptions import ConnectionError, Timeout

# ---------- CONFIGURATION ----------

YOUTUBE_API_KEY = "AIzaSyClQkZw4CAiGzaqHL9ea_UPIfPTWEiWQag"
TMDB_API_KEY = "578bd3c6b2ac39a432cb440a7c152ef6"

CHANNEL_HANDLES = [
    "@CineNanarFilmsComplets",
    "@CINE_PRIME",
    "@M_District",
    "@CineClubFilm",
    "@CineMoviesFilmsComplets",
    "@MyDigitalCompany",
    "@ArtflixFilmsClassiques",
    "@LesArchivesFilms",
    "@CultCinemaClassics",
    "@BoxOfficeActionFR",
    "@BoxOfficeFR",
    "@BoxOfficeFilmsCompletsFR",
    "@BoxofficeKidsFR",
    "@BoxOfficeTeenFR",
    "@BoxOfficeAnimation-FR",
    "@BoxOfficeCOMEDIES",
    "@BoxOfficeROMANCES",
    "@BoxOfficeHORREUR",
    "@BoxOffice4K",
    "@CINESTORIES_HQ",
    "@Boxoffice-AtelierFilms",
    "@CINESTREAM-q8p",
    "@Cine_Pulse_Films",
    "@BoxOfficeSF",
    "@MOVIETIME-JI",
    "@AllocineBA",
    "@sunnyali-o6i",
    "@Films_Complets",
    "@BoxOfficeDRAMES",
    "@CINESTARMOVIES-g8n",
    "@CineTotalFrance-FilmsComplets",
    "@CINECHILL_OFFICIEL",
]

MIN_DURATION_MINUTES = 40
MATCH_THRESHOLD = 0.82  # 0 à 1 : plus haut = plus strict. 0.82 exige une vraie ressemblance de titre.

MOVIES_JSON_PATH = Path("movies.json")
NEEDS_REVIEW_PATH = Path("needs_review.json")
LOG_PATH = Path("match_log.txt")
TMDB_IMG_BASE = "https://image.tmdb.org/t/p/w500"


# ---------- UTILITAIRES ----------

def normalize_text(s):
    """Enlève accents, ponctuation, met en minuscule, pour comparer deux titres équitablement."""
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')
    s = re.sub(r'[^a-z0-9 ]', '', s.lower())
    return re.sub(r'\s+', ' ', s).strip()


def title_similarity(a, b):
    return difflib.SequenceMatcher(None, normalize_text(a), normalize_text(b)).ratio()


def parse_iso8601_duration(duration):
    pattern = re.compile(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?')
    match = pattern.match(duration)
    if not match:
        return 0
    hours, minutes, seconds = (int(x) if x else 0 for x in match.groups())
    return hours * 60 + minutes + seconds / 60


def clean_title(raw_title):
    return raw_title.split('|')[0].strip()


def get_uploads_playlist_id(handle):
    url = "https://www.googleapis.com/youtube/v3/channels"
    params = {"part": "contentDetails", "forHandle": handle.lstrip('@'), "key": YOUTUBE_API_KEY}
    res = requests.get(url, params=params).json()
    items = res.get("items", [])
    if not items:
        print(f"⚠️  Chaîne introuvable : {handle}")
        return None
    return items[0]["contentDetails"]["relatedPlaylists"]["uploads"]


def get_playlist_videos(playlist_id):
    videos = []
    page_token = None
    url = "https://www.googleapis.com/youtube/v3/playlistItems"
    while True:
        params = {"part": "snippet", "playlistId": playlist_id, "maxResults": 50, "key": YOUTUBE_API_KEY}
        if page_token:
            params["pageToken"] = page_token
        res = requests.get(url, params=params).json()
        for item in res.get("items", []):
            snippet = item["snippet"]
            video_id = snippet["resourceId"]["videoId"]
            title = snippet["title"]
            videos.append((video_id, title))
        page_token = res.get("nextPageToken")
        if not page_token:
            break
    return videos


def get_video_details(video_ids):
    details = {}
    url = "https://www.googleapis.com/youtube/v3/videos"
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i + 50]
        params = {"part": "contentDetails,snippet", "id": ",".join(batch), "key": YOUTUBE_API_KEY}
        res = requests.get(url, params=params).json()
        for item in res.get("items", []):
            vid = item["id"]
            duration = parse_iso8601_duration(item["contentDetails"]["duration"])
            thumbs = item["snippet"]["thumbnails"]
            thumbnail = thumbs.get("maxres", thumbs.get("high", {})).get("url", "")
            details[vid] = {"minutes": duration, "thumbnail": thumbnail}
    return details



def backfill_genres(movies):
    """Ajoute genre_ids aux films déjà présents qui ne l'ont pas encore (via leur tmdbId)."""
    updated = 0
    for movie in movies:
        if movie.get("source") == "youtube" and movie.get("tmdbId") and "genre_ids" not in movie:
            url = f"https://api.themoviedb.org/3/movie/{movie['tmdbId']}"
            params = {"api_key": TMDB_API_KEY, "language": "fr-FR"}
            try:
                res = requests.get(url, params=params).json()
                genres = res.get("genres", [])
                movie["genre_ids"] = [g["id"] for g in genres]
                updated += 1
                time.sleep(0.15)
            except Exception as e:
                print(f"⚠️  Impossible de récupérer le genre pour tmdbId {movie['tmdbId']}: {e}")
    if updated:
        print(f"🔄 Genres rattrapés pour {updated} film(s) déjà présents.")
    return movies



from requests.exceptions import ConnectionError, Timeout

def get_tmdb_runtime(tmdb_id):
    """Retourne la durée officielle du film (en minutes), ou None si indisponible."""
    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"
    try:
        res = requests.get(url, params={"api_key": TMDB_API_KEY}, timeout=10)
        res.raise_for_status()
        return res.json().get("runtime")
    except Exception:
        return None


def runtime_is_plausible(video_minutes, tmdb_runtime):
    """Compare la durée réelle de la vidéo à la durée officielle TMDB, avec tolérance."""
    if not tmdb_runtime:
        return True  # donnée indisponible : on ne bloque pas sur ce seul critère
    tolerance = max(20, tmdb_runtime * 0.25)
    return abs(video_minutes - tmdb_runtime) <= tolerance
def search_tmdb(title, retries=3):
    """Cherche sur TMDB et ne retourne un résultat que si son titre ressemble vraiment à la requête.
    Intègre une gestion d'erreur réseau pour éviter les crashs [WinError 10054]."""
    url = "https://api.themoviedb.org/3/search/movie"
    params = {"api_key": TMDB_API_KEY, "language": "fr-FR", "query": title}
    
    # Ajout d'un User-Agent classique pour passer sous le radar des pare-feux
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36"
    }

    # Boucle de réessai en cas d'échec de connexion
    for attempt in range(retries):
        try:
            res = requests.get(url, params=params, headers=headers, timeout=10)
            res.raise_for_status() # Vérifie que le code HTTP est 200 OK
            data = res.json()
            break # Succès de la requête, on sort de la boucle for
            
        except (ConnectionError, Timeout) as e:
            print(f"⚠️ Perte de connexion TMDB pour '{title}' (Tentative {attempt + 1}/{retries}). Reprise dans 3s...")
            time.sleep(3)
    else:
        # Cette clause 'else' s'exécute si la boucle for se termine sans atteindre le 'break' (donc si tous les retries échouent)
        print(f"❌ Impossible de joindre TMDB pour le film : {title}")
        return None, 0.0

    results = data.get("results", [])
    if not results:
        return None, 0.0

    best_match = None
    best_score = 0.0
    for movie in results[:8]:  # on regarde les 8 premiers résultats
        candidates = [movie.get("title", ""), movie.get("original_title", "")]
        score = max(title_similarity(title, c) for c in candidates if c)
        if score > best_score:
            best_score = score
            best_match = movie

    if best_match and best_score >= MATCH_THRESHOLD:
        return best_match, best_score
    return None, best_score

# ---------- SCRIPT PRINCIPAL ----------

def main():
    existing_movies = []
    if MOVIES_JSON_PATH.exists():
        existing_movies = json.loads(MOVIES_JSON_PATH.read_text(encoding="utf-8"))

    needs_review = []
    if NEEDS_REVIEW_PATH.exists():
        needs_review = json.loads(NEEDS_REVIEW_PATH.read_text(encoding="utf-8"))

    existing_ids = {m["youtubeId"] for m in existing_movies if m.get("source") == "youtube"}
    existing_movies = backfill_genres(existing_movies)
    already_reviewed_ids = {r["youtubeId"] for r in needs_review}
    skip_ids = existing_ids | already_reviewed_ids
    used_tmdb_ids = {m["tmdbId"] for m in existing_movies if m.get("tmdbId")}

    new_movies = []
    new_review_entries = []
    log_lines = []

    for handle in CHANNEL_HANDLES:
        print(f"🔎 Analyse de {handle}...")
        playlist_id = get_uploads_playlist_id(handle)
        if not playlist_id:
            continue

        videos = get_playlist_videos(playlist_id)
        candidate_ids = [vid for vid, _ in videos if vid not in skip_ids]
        if not candidate_ids:
            continue

        details = get_video_details(candidate_ids)

        for video_id, raw_title in videos:
            if video_id in skip_ids or video_id not in details:
                continue

            info = details[video_id]
            if info["minutes"] < MIN_DURATION_MINUTES:
                continue

            cleaned_title = clean_title(raw_title)
            tmdb_match, score = search_tmdb(cleaned_title)

            if tmdb_match and tmdb_match["id"] in used_tmdb_ids:
                new_review_entries.append({
                    "youtubeId": video_id,
                    "title": cleaned_title,
                    "thumbnail": info["thumbnail"],
                    "channel": handle,
                    "best_score": round(score, 2),
                    "reason": f"tmdbId {tmdb_match['id']} déjà utilisé par un autre film",
                })
                log_lines.append(
                    f"⚠️  {cleaned_title} → tmdbId {tmdb_match['id']} déjà attribué à un autre film, mis de côté"
                )
                skip_ids.add(video_id)
                time.sleep(0.25)
                continue

            if tmdb_match and not runtime_is_plausible(info["minutes"], get_tmdb_runtime(tmdb_match["id"])):
                new_review_entries.append({
                    "youtubeId": video_id,
                    "title": cleaned_title,
                    "thumbnail": info["thumbnail"],
                    "channel": handle,
                    "best_score": round(score, 2),
                    "reason": "durée de la vidéo incohérente avec la durée officielle du film",
                })
                log_lines.append(
                    f"⚠️  {cleaned_title} → durée incohérente avec {tmdb_match['title']}, mis de côté"
                )
                skip_ids.add(video_id)
                time.sleep(0.25)
                continue

            if tmdb_match:
                poster = (f"{TMDB_IMG_BASE}{tmdb_match['poster_path']}"
                          if tmdb_match.get("poster_path") else info["thumbnail"])
                backdrop = (f"{TMDB_IMG_BASE}{tmdb_match['backdrop_path']}"
                            if tmdb_match.get("backdrop_path") else poster)
                entry = {
                    "id": f"yt-{video_id}",
                    "source": "youtube",
                    "title": tmdb_match["title"],
                    "poster": poster,
                    "backdrop": backdrop,
                    "overview": tmdb_match.get("overview") or "Description à venir.",
                    "release_date": tmdb_match.get("release_date") or "",
                    "youtubeId": video_id,
                    "tmdbId": tmdb_match["id"],
                    "genre_ids": tmdb_match.get("genre_ids", []),
                    "dateAdded": date.today().isoformat(),
                }
                new_movies.append(entry)
                used_tmdb_ids.add(tmdb_match["id"])
                year = (tmdb_match.get("release_date") or "----")[:4]
                log_lines.append(
                    f"✅ {cleaned_title} → {tmdb_match['title']} ({year}) [confiance {score:.2f}] [tmdbId {tmdb_match['id']}]"
                )
            else:
                new_review_entries.append({
                    "youtubeId": video_id,
                    "title": cleaned_title,
                    "thumbnail": info["thumbnail"],
                    "channel": handle,
                    "best_score": round(score, 2),
                })
                log_lines.append(
                    f"⚠️  {cleaned_title} → aucune correspondance fiable (meilleur score {score:.2f}), mis de côté dans needs_review.json"
                )

            skip_ids.add(video_id)
            time.sleep(0.25)

    all_movies = existing_movies + new_movies
    all_reviews = needs_review + new_review_entries

    MOVIES_JSON_PATH.write_text(json.dumps(all_movies, ensure_ascii=False, indent=2), encoding="utf-8")
    NEEDS_REVIEW_PATH.write_text(json.dumps(all_reviews, ensure_ascii=False, indent=2), encoding="utf-8")
    LOG_PATH.write_text("\n".join(log_lines), encoding="utf-8")

    print(f"\n✅ Terminé : {len(new_movies)} film(s) ajouté(s) à movies.json (correspondance fiable)")
    print(f"📋 {len(new_review_entries)} film(s) mis de côté dans needs_review.json (à vérifier manuellement)")
    print(f"📄 Détails complets dans {LOG_PATH}")


if __name__ == "__main__":
    main()









# Maintenance notes pour lancer le script :
# cd youtube

# python movie_importer.py
