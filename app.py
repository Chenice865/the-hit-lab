from __future__ import annotations

from flask import Flask, jsonify, render_template, request

from lib import SpotifyCatalog, SpotifyDataError

app = Flask(__name__)

try:
    catalog = SpotifyCatalog("data/spotify_catalog.csv")
    STARTUP_ERROR = None
except SpotifyDataError as exc:
    catalog = None
    STARTUP_ERROR = str(exc)


def api_success(data, message: str | None = None, status: int = 200):
    payload = {"success": True, "data": data}
    if message:
        payload["message"] = message
    return jsonify(payload), status


def api_error(message: str, status: int = 400):
    return jsonify({"success": False, "error": message}), status


def require_catalog():
    if catalog is None:
        raise SpotifyDataError(
            STARTUP_ERROR
            or "The Spotify catalogue could not be loaded. "
               "Place spotify_catalog.csv inside the data folder."
        )
    return catalog


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return api_success(
        {
            "status": "ok" if catalog is not None else "error",
            "dataset_loaded": catalog is not None,
            "startup_error": STARTUP_ERROR,
        }
    )


@app.get("/api/dashboard")
def dashboard():
    try:
        return api_success(require_catalog().dashboard())
    except SpotifyDataError as exc:
        return api_error(str(exc), 500)


@app.get("/api/explore")
def explore():
    try:
        limit = request.args.get("limit", default=25, type=int)
        query = request.args.get("q", default="", type=str)
        explicit = request.args.get("explicit", default="all", type=str)
        album_type = request.args.get("album_type", default="all", type=str)
        min_popularity = request.args.get("min_popularity", default=0, type=int)

        data = require_catalog().explore(
            query=query,
            explicit=explicit,
            album_type=album_type,
            min_popularity=min_popularity,
            limit=limit,
        )
        return api_success(data)
    except (SpotifyDataError, ValueError) as exc:
        return api_error(str(exc), 400)


@app.get("/api/filters")
def filters():
    try:
        return api_success(require_catalog().filter_options())
    except SpotifyDataError as exc:
        return api_error(str(exc), 500)


@app.get("/api/tracks/search")
def search_tracks():
    try:
        query = request.args.get("q", default="", type=str)
        limit = request.args.get("limit", default=15, type=int)
        return api_success(require_catalog().search_tracks(query, limit))
    except SpotifyDataError as exc:
        return api_error(str(exc), 500)


@app.get("/api/tracks/<track_id>")
def track_details(track_id: str):
    try:
        track = require_catalog().track_details(track_id)
        if track is None:
            return api_error("Track not found.", 404)
        return api_success(track)
    except SpotifyDataError as exc:
        return api_error(str(exc), 500)


@app.get("/api/analyzer/options")
def analyzer_options():
    try:
        return api_success(require_catalog().analyzer_options())
    except SpotifyDataError as exc:
        return api_error(str(exc), 500)


@app.post("/api/analyzer/predict")
def analyze_predict():
    print("prediction route entered", flush=True)
    try:
        payload = request.get_json(silent=True) or {}
        print(f"request JSON received: {payload}", flush=True)
        print("validation started", flush=True)
        if not isinstance(payload, dict):
            raise ValueError("Prediction payload must be an object.")
        print("validation completed", flush=True)
        print("feature preparation started", flush=True)
        result = require_catalog().predict_popularity(payload)
        print("feature preparation completed", flush=True)
        print("prediction started", flush=True)
        print("prediction completed", flush=True)
        print("response about to return", flush=True)
        return api_success(result)
    except SpotifyDataError as exc:
        return api_error(str(exc), 500)
    except ValueError as exc:
        return api_error(str(exc), 400)
    except Exception as exc:
        return api_error("An unexpected server error occurred.", 500)


@app.get("/api/recommendations/<track_id>")
def recommendations(track_id: str):
    try:
        limit = request.args.get("limit", default=8, type=int)
        recommendations_data = require_catalog().recommendations(track_id, limit)
        return api_success(recommendations_data)
    except SpotifyDataError as exc:
        return api_error(str(exc), 500)
    except KeyError:
        return api_error("Track not found.", 404)


@app.get("/api/compare")
def compare():
    try:
        first_id = request.args.get("first", default="", type=str)
        second_id = request.args.get("second", default="", type=str)

        if not first_id or not second_id:
            return api_error("Choose two tracks to compare.")

        comparison = require_catalog().compare(first_id, second_id)
        return api_success(comparison)
    except SpotifyDataError as exc:
        return api_error(str(exc), 500)
    except KeyError:
        return api_error("One or both tracks could not be found.", 404)


@app.errorhandler(404)
def not_found(_error):
    if request.path.startswith("/api/"):
        return api_error("API route not found.", 404)
    return render_template("index.html"), 404


@app.errorhandler(500)
def server_error(_error):
    if request.path.startswith("/api/"):
        return api_error("An unexpected server error occurred.", 500)
    return "An unexpected server error occurred.", 500


if __name__ == "__main__":
    app.run(debug=True)
