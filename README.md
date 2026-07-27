# The Hit Lab — Starter Foundation

A Flask and Chart.js starter application for exploring a local Spotify catalogue.

## Project structure

```text
TheHitLab/
├── app.py
├── lib.py
├── requirements.txt
├── data/
│   └── spotify_catalog.csv
├── templates/
│   └── index.html
└── static/
    ├── css/
    │   └── style.css
    └── js/
        └── script.js
```

## Dataset

Place your Spotify CSV at:

```text
data/spotify_catalog.csv
```

The starter expects these columns:

```text
track_id
track_name
track_popularity
explicit
artist_name
artist_popularity
artist_followers
artist_genres
album_name
album_release_date
album_total_tracks
album_type
track_duration_min
```

Extra columns are allowed.

## Run the app

Open the project folder in VS Code, open a terminal and run:

```bash
python -m pip install -r requirements.txt
python app.py
```

On some Windows installations, use:

```bash
py -m pip install -r requirements.txt
py app.py
```

Open:

```text
http://127.0.0.1:5000
```

Do not open `templates/index.html` directly. The page must be served by Flask.

## Included starter features

- Dashboard KPIs
- Popularity distribution chart
- Album type chart
- Release trend chart
- Diagnostic correlations
- Catalogue search and filters
- Song Analyzer
- Starter recommendation engine
- Song comparison
- Consistent JSON API responses
- Responsive sidebar layout

## Deployment Note

This application is hosted on **Render's free tier**.

If the application has been inactive for a while, the first request may take up to **50 seconds** while the server starts. Once it has started, the application responds normally.

## Extending with GitHub Copilot

Keep the current structure. Ask Copilot to extend existing files rather than creating a new architecture.

Suggested instruction:

> Keep this Flask project structure unchanged. Preserve all working routes and frontend behaviour. Use app.py for Flask routes, lib.py for data processing, analytics, recommendations and machine-learning functions, templates/index.html for page structure, static/js/script.js for API calls and Chart.js interactions, and static/css/style.css for visual styling. Add one feature at a time and test existing functionality after every change.
