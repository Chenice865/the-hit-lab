import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib import SpotifyCatalog


def test_predict_popularity_returns_valid_payload():
    catalog = SpotifyCatalog("data/spotify_catalog.csv")
    payload = {
        "genre": "Pop",
        "artist_popularity": 70,
        "artist_followers": 1200000,
        "duration": 3.2,
        "release_year": 2020,
        "album_type": "album",
        "explicit": False,
    }

    result = catalog.predict_popularity(payload)

    assert isinstance(result["predicted_popularity"], (int, float))
    assert isinstance(result["submitted_profile"], dict)
    assert isinstance(result["model_metrics"], dict)
    assert "predicted_popularity" in result
