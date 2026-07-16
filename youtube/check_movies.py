"""
check_movies.py - Vérifie que les films perso de Refuge Pop sont bien intégrables
Teste chaque youtubeId de movies.json via l'API oEmbed publique de YouTube.
Les vidéos supprimées/privées/à intégration désactivée partent dans
movies_indisponibles.json (jamais supprimées définitivement, juste mises de côté).

Ne détecte PAS les restrictions géographiques (comportement volontaire) :
oEmbed répond normalement même pour un film bloqué dans un pays donné,
puisque ce blocage dépend de l'IP du visiteur, pas du serveur qui teste ici.

Usage : python check_movies.py
(à exécuter depuis le dossier youtube/, là où se trouve movies.json)
"""

import json
import time
from pathlib import Path
import requests

MOVIES_PATH = Path("movies.json")
UNAVAILABLE_PATH = Path("movies_indisponibles.json")
TIMEOUT_SECONDS = 8

OEMBED_URL = "https://www.youtube.com/oembed"


def check_video(youtube_id):
    """Retourne True si la vidéo est intégrable, False sinon."""
    url = f"https://www.youtube.com/watch?v={youtube_id}"
    try:
        res = requests.get(OEMBED_URL, params={"url": url, "format": "json"}, timeout=TIMEOUT_SECONDS)
        return res.status_code == 200
    except requests.RequestException:
        return False


def main():
    movies = json.loads(MOVIES_PATH.read_text(encoding="utf-8")) if MOVIES_PATH.exists() else []
    unavailable = json.loads(UNAVAILABLE_PATH.read_text(encoding="utf-8")) if UNAVAILABLE_PATH.exists() else []

    # On regroupe tout (actifs + précédemment indisponibles) pour un vrai test complet à chaque fois,
    # ce qui permet de récupérer automatiquement une vidéo qui redeviendrait disponible.
    seen_ids = set()
    all_movies = []
    for m in movies + unavailable:
        key = m.get("youtubeId")
        if key and key not in seen_ids:
            all_movies.append(m)
            seen_ids.add(key)

    still_working = []
    newly_unavailable = []

    for i, movie in enumerate(all_movies, 1):
        yt_id = movie.get("youtubeId")
        title = movie.get("title", "Sans titre")
        print(f"[{i}/{len(all_movies)}] Test de {title}...", end=" ")

        if not yt_id:
            print("⚠️  pas de youtubeId, ignoré")
            continue

        if check_video(yt_id):
            print("✅")
            still_working.append(movie)
        else:
            print("❌")
            newly_unavailable.append(movie)

        time.sleep(0.15)

    MOVIES_PATH.write_text(json.dumps(still_working, ensure_ascii=False, indent=2), encoding="utf-8")
    UNAVAILABLE_PATH.write_text(json.dumps(newly_unavailable, ensure_ascii=False, indent=2), encoding="utf-8")

    recovered = sum(1 for m in still_working if m in unavailable)
    print(f"\n✅ {len(still_working)} film(s) intégrable(s), conservé(s) dans movies.json")
    print(f"🔄 dont {recovered} récupéré(s) qui étaient marqués indisponibles")
    print(f"❌ {len(newly_unavailable)} film(s) toujours indisponible(s) dans movies_indisponibles.json")


if __name__ == "__main__":
    main()


# pour lancer le script
# cd youtube
# python check_movies.py