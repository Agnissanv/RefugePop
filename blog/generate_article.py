"""
generate_article.py - Générateur d'articles de blog pour Refuge Pop
Pioche un film perso pas encore couvert, génère un article via l'API Gemini
(gratuite), et produit un vrai fichier HTML statique - pas de rendu JS,
pour un référencement optimal.

Usage : python generate_article.py
(à exécuter depuis le dossier blog/, à côté de articles.json)

Le fichier généré n'est jamais publié automatiquement : relis-le,
puis fais un git add/commit/push toi-même une fois satisfait.
"""

import json
import random
import re
import unicodedata
import xml.etree.ElementTree as ET
from datetime import date
from pathlib import Path
import requests

GEMINI_API_KEY = "videnn"
GEMINI_MODEL = "gemini-2.5-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

MOVIES_PATH = Path("../youtube/movies.json")
ARTICLES_JSON_PATH = Path("articles.json")
ARTICLES_DIR = Path("articles")
INDEX_PATH = Path("index.html")

SITE_URL = "https://refugepop.agnissanisaac.com"
SITEMAP_PATH = Path("../sitemap.xml")
SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"


def add_to_sitemap(url_path):
    ET.register_namespace('', SITEMAP_NS)
    if SITEMAP_PATH.exists():
        tree = ET.parse(SITEMAP_PATH)
        root = tree.getroot()
    else:
        root = ET.Element(f"{{{SITEMAP_NS}}}urlset")
        tree = ET.ElementTree(root)

    full_url = f"{SITE_URL}{url_path}"
    existing = {el.find(f"{{{SITEMAP_NS}}}loc").text for el in root.findall(f"{{{SITEMAP_NS}}}url")}
    if full_url in existing:
        return

    url_el = ET.SubElement(root, f"{{{SITEMAP_NS}}}url")
    ET.SubElement(url_el, f"{{{SITEMAP_NS}}}loc").text = full_url
    ET.SubElement(url_el, f"{{{SITEMAP_NS}}}changefreq").text = "monthly"

    tree.write(SITEMAP_PATH, encoding="UTF-8", xml_declaration=True)


# ---------- UTILITAIRES ----------

def slugify_movie(movie):
    """Doit rester identique à la fonction slugifyMovie() de app.js."""
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


def generate_article_text(movie):
    prompt = f"""Tu écris pour le blog de Refuge Pop, un site de cinéma francophone au ton décontracté
et bienveillant ("ton refuge cinéma, sans pression, sans choix infini").

Écris un article de blog engageant (450-600 mots) en français sur ce film :
Titre : {movie['title']}
Année : {(movie.get('release_date') or '')[:4]}
Synopsis : {movie.get('overview', '')}

L'article doit donner envie de regarder ce film ce soir, sans spoiler la fin.
Ton chaleureux, pas de superlatifs exagérés à l'américaine.

Réponds STRICTEMENT en JSON, sans balises markdown, sans \\`\\`\\`, format exact :
{{"titre_accrocheur": "...", "article_html": "<p>...</p><p>...</p>..."}}

Le champ "article_html" doit être découpé en plusieurs balises <p> (pas un seul bloc).
"""
    raw = call_gemini(prompt)
    cleaned = re.sub(r"^```json\s*|\s*```$", "", raw.strip())
    return json.loads(cleaned)


# ---------- GABARIT HTML ----------

ARTICLE_TEMPLATE = """<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{titre} | Blog Refuge Pop</title>
    <meta name="description" content="{description}">
    <link rel="canonical" href="{canonical_url}">
    <meta property="og:title" content="{titre} | Refuge Pop">
    <meta property="og:description" content="{description}">
    <meta property="og:image" content="{poster}">
    <meta property="og:type" content="article">
    <link rel="icon" type="image/svg+xml" href="/logo.svg">
    <link rel="stylesheet" href="/blog.css">
</head>
<body>
    <header class="blog-header">
        <a href="../index.html" class="blog-logo"><img src="/blog/logo.svg" alt="Refuge Pop" class="brand-logo-img"> REFUGE<span>POP</span></a>
        <a href="index.html" class="blog-back">← Tous les articles</a>
    </header>

    <main class="blog-article">
        <img src="{poster}" alt="{titre_film}" class="article-poster">
        <h1>{titre}</h1>
        <p class="article-date">{date_publication}</p>
        <div class="article-body">
            {article_html}
        </div>
        <a href="{deep_link}" class="article-cta">▶ Regarder {titre_film} sur Refuge Pop</a>
    </main>

    <footer class="blog-footer">
        <p>© 2026 Refuge Pop — <a href="../index.html">Retour au site</a></p>
    </footer>
</body>
</html>
"""


def build_article_html(movie, article_data, slug):
    deep_link = f"{SITE_URL}/?film={slug}"
    description = (movie.get("overview") or "")[:155].rsplit(" ", 1)[0] + "..."

    return ARTICLE_TEMPLATE.format(
        titre=article_data["titre_accrocheur"],
        titre_film=movie["title"],
        description=description,
        canonical_url=f"{SITE_URL}/blog/articles/{slug}.html",
        poster=movie.get("poster", ""),
        article_html=article_data["article_html"],
        date_publication=date.today().strftime("%d/%m/%Y"),
        deep_link=deep_link,
    )


# ---------- INDEX DU BLOG ----------

def rebuild_blog_index(articles):
    items = "\n".join(
        f'''<li class="index-item">
            <a href="articles/{a['slug']}.html">
                <img src="{a['poster']}" alt="{a['titre_film']}">
                <div>
                    <h3>{a['titre']}</h3>
                    <span>{a['date']}</span>
                </div>
            </a>
        </li>'''
        for a in sorted(articles, key=lambda x: x["date"], reverse=True)
    )

    INDEX_PATH.write_text(f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blog | Refuge Pop</title>
    <meta name="description" content="Le blog de Refuge Pop : recommandations, coups de cœur et actus autour de notre catalogue de films.">
    <link rel="canonical" href="{SITE_URL}/blog/index.html">
    <link rel="icon" type="image/svg+xml" href="../logo.svg">
    <link rel="stylesheet" href="../blog.css">
</head>
<body>
    <header class="blog-header">
        <a href="../index.html" class="blog-logo"><img src="/blog/logo.svg" alt="Refuge Pop" class="brand-logo-img"> REFUGE<span>POP</span></a>
        <h1>Le Blog</h1>
    </header>

    <main class="blog-index">
        <ul class="index-list">
            {items}
        </ul>
    </main>

    <footer class="blog-footer">
        <p>© 2026 Refuge Pop — <a href="../index.html">Retour au site</a></p>
    </footer>
</body>
</html>
""", encoding="utf-8")


# ---------- SCRIPT PRINCIPAL ----------

def main():
    movies = json.loads(MOVIES_PATH.read_text(encoding="utf-8"))
    articles = json.loads(ARTICLES_JSON_PATH.read_text(encoding="utf-8")) if ARTICLES_JSON_PATH.exists() else []
    covered_ids = {a["movie_id"] for a in articles}

    candidates = [m for m in movies if m["id"] not in covered_ids]
    if not candidates:
        print("⚠️  Tous les films ont déjà un article. Ajoute de nouveaux films perso d'abord.")
        return

    movie = random.choice(candidates)
    slug = slugify_movie(movie)
    print(f"🎬 Film choisi : {movie['title']}")
    print("✍️  Génération de l'article via Gemini...")

    article_data = generate_article_text(movie)
    html = build_article_html(movie, article_data, slug)

    ARTICLES_DIR.mkdir(exist_ok=True)
    output_path = ARTICLES_DIR / f"{slug}.html"
    output_path.write_text(html, encoding="utf-8")

    articles.append({
        "movie_id": movie["id"],
        "slug": slug,
        "titre": article_data["titre_accrocheur"],
        "titre_film": movie["title"],
        "poster": movie.get("poster", ""),
        "date": date.today().isoformat(),
    })
    ARTICLES_JSON_PATH.write_text(json.dumps(articles, ensure_ascii=False, indent=2), encoding="utf-8")

    rebuild_blog_index(articles)
    add_to_sitemap("/blog/index.html")
    add_to_sitemap(f"/blog/articles/{slug}.html")

    print(f"\n✅ Article généré : {output_path}")
    print("📋 Relis-le avant de le publier (git add / commit / push).")


if __name__ == "__main__":
    main()


# Methode pour lancer le script
# cd blog
# python generate_article.py