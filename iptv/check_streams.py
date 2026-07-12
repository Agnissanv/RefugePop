"""
check_streams.py - Vérifie la santé des flux IPTV de Refuge Pop
Teste chaque URL de chaines.json et sépare les flux morts dans
chaines_indisponibles.json (jamais supprimés définitivement).

Usage : python check_streams.py
(à exécuter depuis le dossier iptv/, là où se trouve chaines.json)
"""

import json
from pathlib import Path
import requests

CHAINES_PATH = Path("chaines.json")
INDISPONIBLES_PATH = Path("chaines_indisponibles.json")
TIMEOUT_SECONDS = 8

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}


def check_stream(url):
    """Retourne True si le flux répond correctement, False sinon."""
    try:
        res = requests.get(url, headers=HEADERS, timeout=TIMEOUT_SECONDS, stream=True)
        if res.status_code >= 400:
            return False
        # On vérifie qu'on reçoit bien un vrai fichier de playlist HLS,
        # pas une page d'erreur HTML déguisée en 200 OK
        first_chunk = next(res.iter_content(200), b"")
        return b"#EXTM3U" in first_chunk
    except requests.RequestException:
        return False


def main():
    channels = json.loads(CHAINES_PATH.read_text(encoding="utf-8"))
    indisponibles = []
    if INDISPONIBLES_PATH.exists():
        indisponibles = json.loads(INDISPONIBLES_PATH.read_text(encoding="utf-8"))

    still_working = []
    newly_dead = []

    for i, channel in enumerate(channels, 1):
        print(f"[{i}/{len(channels)}] Test de {channel['nom']}...", end=" ")
        if check_stream(channel["url"]):
            print("✅")
            still_working.append(channel)
        else:
            print("❌")
            newly_dead.append(channel)

    all_indisponibles = indisponibles + newly_dead

    CHAINES_PATH.write_text(json.dumps(still_working, ensure_ascii=False, indent=2), encoding="utf-8")
    INDISPONIBLES_PATH.write_text(json.dumps(all_indisponibles, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\n✅ {len(still_working)} chaîne(s) fonctionnelle(s), conservée(s) dans chaines.json")
    print(f"❌ {len(newly_dead)} chaîne(s) hors service, déplacée(s) vers chaines_indisponibles.json")


if __name__ == "__main__":
    main()
