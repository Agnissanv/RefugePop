"""
generate_social_post.py - Générateur de posts réseaux sociaux pour Refuge Pop
Pioche un film perso au hasard dans le catalogue, télécharge son affiche,
et génère 3 légendes (TikTok/Reels, Facebook/Instagram, Statut WhatsApp)
via l'API Gemini (même API que generate_article.py).

Ce script ne publie jamais rien automatiquement : il prépare le texte et
l'image, à toi de relire et de poster toi-même où tu veux.

Usage :
    python generate_social_post.py
    python generate_social_post.py --titre "Andron"     (force un film précis)
    python generate_social_post.py --pas-de-repetition  (défaut : évite les films déjà promus récemment)

(à exécuter depuis le dossier social/, à côté de posts.json)
"""

import argparse
import json
import random
import re
import unicodedata
from datetime import date
from pathlib import Path
import requests

GEMINI_API_KEY = "videnn"
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

TMDB_API_KEY = "578bd3c6b2ac39a432cb440a7c152ef6"
TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/original"  # meilleure qualité disponible

MOVIES_PATH = Path("../youtube/movies.json")
POSTS_HISTORY_PATH = Path("posts.json")
DOWNLOADS_DIR = Path("downloads")
OUTPUT_TEXT_DIR = Path("posts_output")

SITE_URL = "https://refugepop.agnissanisaac.com"

# Au-delà de ce nombre de films déjà promus, les plus anciens sortent de l'historique
# (permet de les repiocher au hasard sans forcer --titre)
MAX_HISTORY_ENTRIES = 15


# ---------- UTILITAIRES ----------

def slugify_movie(movie):
    """Doit rester identique à slugifyMovie() dans app.js et generate_article.py."""
    title = movie["title"]
    year = (movie.get("release_date") or "").split("-")[0]
    base = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode("ascii")
    base = re.sub(r"[^a-zA-Z0-9]+", "-", base).strip("-").lower()
    return f"{base}-{year}" if year else base


def call_gemini(prompt, max_retries=3):
    params = {"key": GEMINI_API_KEY}
    body = {"contents": [{"parts": [{"text": prompt}]}]}

    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            res = requests.post(GEMINI_URL, params=params, json=body, timeout=60)
            res.raise_for_status()
            data = res.json()
            return data["candidates"][0]["content"]["parts"][0]["text"]
        except requests.exceptions.RequestException as e:
            last_error = e
            print(f"⚠️  Tentative {attempt}/{max_retries} échouée ({e}), nouvel essai...")

    raise last_error


def generate_captions(movie):
    prompt = f"""Tu écris des légendes de posts réseaux sociaux pour Refuge Pop, un site de cinéma
francophone au ton décontracté et bienveillant ("ton refuge cinéma, sans pression, sans choix infini,
gratuit et sans compte à créer").

Film à promouvoir :
Titre : {movie['title']}
Année : {(movie.get('release_date') or '')[:4]}
Synopsis : {movie.get('overview', '')}

Génère 3 légendes différentes pour ce film, sans spoiler la fin :

1. "tiktok" : très courte et percutante (1-2 phrases max), pour une vidéo TikTok/Reels avec
   extrait de bande-annonce. Doit donner envie de cliquer immédiatement.
2. "facebook_instagram" : un peu plus descriptive (2-4 phrases), pour un post Facebook/Instagram
   avec l'affiche du film. Peut inclure 1-2 emojis pertinents.
3. "whatsapp" : très brève (1 phrase), pour un statut WhatsApp.

Ne mets JAMAIS de lien dans le texte généré (le lien sera ajouté séparément par le script).
Ne mets pas de hashtags.

Réponds STRICTEMENT en JSON, sans balises markdown, sans \\`\\`\\`, format exact :
{{"tiktok": "...", "facebook_instagram": "...", "whatsapp": "..."}}
"""
    raw = call_gemini(prompt)
    cleaned = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
    return json.loads(cleaned)


def get_best_poster_url(movie):
    """Interroge TMDB directement pour récupérer l'affiche officielle en meilleure qualité.
    Le champ movie['poster'] stocké dans movies.json peut être une simple miniature YouTube
    (voir movie_importer.py) si TMDB n'avait pas de poster_path au moment de l'import -
    on retente donc ici une vraie recherche TMDB avant de se replier sur le champ existant."""
    tmdb_id = movie.get("tmdbId")
    if tmdb_id:
        try:
            url = f"https://api.themoviedb.org/3/movie/{tmdb_id}"
            res = requests.get(url, params={"api_key": TMDB_API_KEY, "language": "fr-FR"}, timeout=10)
            res.raise_for_status()
            poster_path = res.json().get("poster_path")
            if poster_path:
                return f"{TMDB_POSTER_BASE}{poster_path}"
        except requests.exceptions.RequestException as e:
            print(f"⚠️  Impossible de joindre TMDB pour l'affiche ({e}), repli sur l'affiche existante.")

    return movie.get("poster", "")


def download_poster(movie, slug):
    poster_url = get_best_poster_url(movie)
    if not poster_url:
        return None

    DOWNLOADS_DIR.mkdir(exist_ok=True)
    extension = poster_url.split(".")[-1].split("?")[0]
    if extension not in ("jpg", "jpeg", "png", "webp"):
        extension = "jpg"

    output_path = DOWNLOADS_DIR / f"{slug}.{extension}"
    try:
        res = requests.get(poster_url, timeout=15)
        res.raise_for_status()
        output_path.write_bytes(res.content)
        return output_path
    except requests.exceptions.RequestException as e:
        print(f"⚠️  Impossible de télécharger l'affiche : {e}")
        return None


# ---------- HISTORIQUE (évite les répétitions) ----------

def load_history():
    if POSTS_HISTORY_PATH.exists():
        return json.loads(POSTS_HISTORY_PATH.read_text(encoding="utf-8"))
    return []


def save_history(history):
    POSTS_HISTORY_PATH.write_text(json.dumps(history, ensure_ascii=False, indent=2), encoding="utf-8")


def save_captions_to_file(movie, slug, link, captions, poster_path):
    OUTPUT_TEXT_DIR.mkdir(exist_ok=True)
    output_path = OUTPUT_TEXT_DIR / f"{slug}.txt"

    content = f"""Film : {movie['title']} ({(movie.get('release_date') or '')[:4]})
Lien : {link}
Affiche : {poster_path if poster_path else "non disponible"}
Généré le : {date.today().isoformat()}

--- TikTok / Reels ---
{captions['tiktok']}
👉 Lien en bio : {link}

--- Facebook / Instagram ---
{captions['facebook_instagram']}
🔗 {link}

--- Statut WhatsApp ---
{captions['whatsapp']}
{link}
"""
    output_path.write_text(content, encoding="utf-8")
    return output_path


def record_post(history, movie):
    history = [h for h in history if h["movie_id"] != movie["id"]]
    history.append({
        "movie_id": movie["id"],
        "titre": movie["title"],
        "date": date.today().isoformat(),
    })
    if len(history) > MAX_HISTORY_ENTRIES:
        history = history[-MAX_HISTORY_ENTRIES:]
    save_history(history)


# ---------- SCRIPT PRINCIPAL ----------

def main():
    parser = argparse.ArgumentParser(description="Génère un post réseaux sociaux pour un film Refuge Pop.")
    parser.add_argument("--titre", help="Force un film précis (recherche approximative sur le titre)")
    parser.add_argument("--pas-de-repetition", action="store_true", default=True,
                         help="Évite les films déjà promus récemment (activé par défaut)")
    args = parser.parse_args()

    movies = json.loads(MOVIES_PATH.read_text(encoding="utf-8"))
    history = load_history()
    recent_ids = {h["movie_id"] for h in history}

    if args.titre:
        candidates = [m for m in movies if args.titre.lower() in m["title"].lower()]
        if not candidates:
            print(f"❌ Aucun film trouvé pour '{args.titre}'.")
            return
        movie = candidates[0]
    else:
        pool = [m for m in movies if m["id"] not in recent_ids] if args.pas_de_repetition else movies
        if not pool:
            print("⚠️  Tous les films récents ont déjà été promus, tirage dans tout le catalogue.")
            pool = movies
        movie = random.choice(pool)

    slug = slugify_movie(movie)
    link = f"{SITE_URL}/?film={slug}"

    print(f"🎬 Film choisi : {movie['title']} ({(movie.get('release_date') or '')[:4]})")
    print("✍️  Génération des légendes via Gemini...")
    captions = generate_captions(movie)

    poster_path = download_poster(movie, slug)

    print("\n" + "=" * 50)
    print(f"🎬 Film choisi : {movie['title']} ({(movie.get('release_date') or '')[:4]})")
    if poster_path:
        print(f"🖼️  Affiche téléchargée : {poster_path}")
    else:
        print("🖼️  Affiche non téléchargée (voir avertissement ci-dessus)")
    print(f"🔗 Lien : {link}")

    print("\n--- TikTok / Reels ---")
    print(captions["tiktok"])
    print(f"👉 Lien en bio : {link}")

    print("\n--- Facebook / Instagram ---")
    print(captions["facebook_instagram"])
    print(f"🔗 {link}")

    print("\n--- Statut WhatsApp ---")
    print(captions["whatsapp"])
    print(link)
    print("=" * 50)

    saved_file = save_captions_to_file(movie, slug, link, captions, poster_path)
    print(f"\n📝 Légendes sauvegardées dans : {saved_file}")

    record_post(history, movie)
    print(f"📋 Historique mis à jour ({POSTS_HISTORY_PATH}).")
    print("Relis les légendes avant de poster, ajuste-les si besoin. Bonne promo ! 🍿")


if __name__ == "__main__":
    main()


# Méthode pour lancer le script :
# cd social
# python generate_social_post.py
# python generate_social_post.py --titre "Andron"
