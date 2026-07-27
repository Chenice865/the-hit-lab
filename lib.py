from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


class SpotifyDataError(RuntimeError):
    """Raised when the Spotify catalogue cannot be loaded or validated."""


class SpotifyCatalog:
    REQUIRED_COLUMNS = {
        "track_id",
        "track_name",
        "track_popularity",
        "explicit",
        "artist_name",
        "artist_popularity",
        "artist_followers",
        "artist_genres",
        "album_name",
        "album_release_date",
        "album_total_tracks",
        "album_type",
        "track_duration_min",
    }

    DISPLAY_COLUMNS = [
        "track_id",
        "track_name",
        "artist_name",
        "track_popularity",
        "artist_popularity",
        "artist_followers",
        "artist_genres",
        "album_name",
        "album_release_date",
        "album_type",
        "track_duration_min",
        "explicit",
    ]

    def __init__(self, csv_path: str | Path):
        self.csv_path = Path(csv_path)
        self.df = self._load_and_clean()

    def _load_and_clean(self) -> pd.DataFrame:
        if not self.csv_path.exists():
            raise SpotifyDataError(
                f"Dataset not found at '{self.csv_path}'. "
                "Place spotify_catalog.csv inside the data folder."
            )

        try:
            df = pd.read_csv(self.csv_path)
        except Exception as exc:
            raise SpotifyDataError(f"Could not read the dataset: {exc}") from exc

        missing = sorted(self.REQUIRED_COLUMNS.difference(df.columns))
        if missing:
            raise SpotifyDataError(
                "The dataset is missing required columns: " + ", ".join(missing)
            )

        df = df.copy()
        text_columns = [
            "track_id",
            "track_name",
            "artist_name",
            "artist_genres",
            "album_name",
            "album_type",
        ]
        for column in text_columns:
            df[column] = df[column].fillna("").astype(str).str.strip()

        numeric_columns = [
            "track_popularity",
            "artist_popularity",
            "artist_followers",
            "album_total_tracks",
            "track_duration_min",
        ]
        for column in numeric_columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")

        df["explicit"] = (
            df["explicit"]
            .astype(str)
            .str.lower()
            .map({"true": True, "1": True, "yes": True, "false": False, "0": False, "no": False})
            .fillna(False)
            .astype(bool)
        )

        df["album_release_date"] = pd.to_datetime(
            df["album_release_date"], errors="coerce"
        )
        df["release_year"] = df["album_release_date"].dt.year

        df = df.dropna(
            subset=["track_id", "track_name", "artist_name", "track_popularity"]
        )
        df = df.drop_duplicates(subset=["track_id"], keep="first")

        for column in numeric_columns:
            if df[column].isna().all():
                df[column] = 0
            else:
                df[column] = df[column].fillna(df[column].median())

        df["track_popularity"] = df["track_popularity"].clip(0, 100)
        df["artist_popularity"] = df["artist_popularity"].clip(0, 100)
        df["track_duration_min"] = df["track_duration_min"].clip(lower=0)
        df["artist_followers"] = df["artist_followers"].clip(lower=0)

        return df.reset_index(drop=True)

    @staticmethod
    def _safe_number(value: Any, digits: int = 2):
        if pd.isna(value):
            return None
        if isinstance(value, (np.integer, int)):
            return int(value)
        if isinstance(value, (np.floating, float)):
            return round(float(value), digits)
        return value

    def _records(self, df: pd.DataFrame) -> list[dict[str, Any]]:
        records = []
        safe_columns = [column for column in self.DISPLAY_COLUMNS if column in df.columns]

        for raw in df[safe_columns].to_dict(orient="records"):
            record = {}
            for key, value in raw.items():
                if key == "album_release_date":
                    record[key] = (
                        value.strftime("%Y-%m-%d")
                        if isinstance(value, pd.Timestamp) and not pd.isna(value)
                        else ""
                    )
                elif key == "explicit":
                    record[key] = bool(value)
                else:
                    record[key] = self._safe_number(value)
            records.append(record)

        return records

    def dashboard(self) -> dict[str, Any]:
        df = self.df

        top_tracks = (
            df.sort_values(
                ["track_popularity", "artist_popularity"],
                ascending=False,
            )
            .head(10)
        )

        top_artists = (
            df.groupby("artist_name", as_index=False)
            .agg(
                average_track_popularity=("track_popularity", "mean"),
                artist_popularity=("artist_popularity", "max"),
                followers=("artist_followers", "max"),
                track_count=("track_id", "count"),
            )
            .sort_values(
                ["average_track_popularity", "artist_popularity"],
                ascending=False,
            )
            .head(10)
        )

        popularity_bins = pd.cut(
            df["track_popularity"],
            bins=[-1, 19, 39, 59, 79, 100],
            labels=["0–19", "20–39", "40–59", "60–79", "80–100"],
        )
        distribution = (
            popularity_bins.value_counts(sort=False)
            .rename_axis("range")
            .reset_index(name="count")
        )

        album_types = (
            df["album_type"]
            .replace("", "Unknown")
            .value_counts()
            .head(8)
            .rename_axis("album_type")
            .reset_index(name="count")
        )

        release_trend = (
            df.dropna(subset=["release_year"])
            .query("release_year >= 1990")
            .groupby("release_year", as_index=False)
            .agg(
                track_count=("track_id", "count"),
                average_popularity=("track_popularity", "mean"),
            )
            .sort_values("release_year")
            .tail(20)
        )

        correlation = df[
            ["track_popularity", "artist_popularity", "artist_followers", "track_duration_min"]
        ].corr(numeric_only=True)["track_popularity"].drop("track_popularity")

        return {
            "kpis": {
                "tracks": int(len(df)),
                "artists": int(df["artist_name"].nunique()),
                "albums": int(df["album_name"].replace("", np.nan).nunique()),
                "average_popularity": round(float(df["track_popularity"].mean()), 1),
                "explicit_share": round(float(df["explicit"].mean() * 100), 1),
            },
            "top_tracks": self._records(top_tracks),
            "top_artists": [
                {
                    "artist_name": row.artist_name,
                    "average_track_popularity": round(
                        float(row.average_track_popularity), 1
                    ),
                    "artist_popularity": round(float(row.artist_popularity), 1),
                    "followers": int(row.followers),
                    "track_count": int(row.track_count),
                }
                for row in top_artists.itertuples(index=False)
            ],
            "popularity_distribution": [
                {"range": str(row.range), "count": int(row.count)}
                for row in distribution.itertuples(index=False)
            ],
            "album_types": [
                {"album_type": str(row.album_type), "count": int(row.count)}
                for row in album_types.itertuples(index=False)
            ],
            "release_trend": [
                {
                    "release_year": int(row.release_year),
                    "track_count": int(row.track_count),
                    "average_popularity": round(float(row.average_popularity), 1),
                }
                for row in release_trend.itertuples(index=False)
            ],
            "diagnostics": [
                {
                    "feature": feature.replace("_", " ").title(),
                    "correlation": round(float(value), 3),
                }
                for feature, value in correlation.items()
            ],
        }

    def filter_options(self) -> dict[str, list[str]]:
        album_types = sorted(
            value for value in self.df["album_type"].dropna().unique().tolist() if value
        )
        return {"album_types": album_types}

    def explore(
        self,
        query: str = "",
        explicit: str = "all",
        album_type: str = "all",
        min_popularity: int = 0,
        limit: int = 25,
    ) -> dict[str, Any]:
        limit = max(1, min(int(limit), 100))
        min_popularity = max(0, min(int(min_popularity), 100))

        filtered = self.df[self.df["track_popularity"] >= min_popularity].copy()

        query = query.strip()
        if query:
            mask = (
                filtered["track_name"].str.contains(query, case=False, na=False)
                | filtered["artist_name"].str.contains(query, case=False, na=False)
                | filtered["album_name"].str.contains(query, case=False, na=False)
            )
            filtered = filtered[mask]

        if explicit in {"true", "false"}:
            filtered = filtered[filtered["explicit"] == (explicit == "true")]

        if album_type != "all":
            filtered = filtered[filtered["album_type"] == album_type]

        filtered = filtered.sort_values(
            ["track_popularity", "artist_popularity"],
            ascending=False,
        )

        return {
            "count": int(len(filtered)),
            "tracks": self._records(filtered.head(limit)),
        }

    def search_tracks(self, query: str, limit: int = 15) -> list[dict[str, Any]]:
        query = query.strip()
        if len(query) < 2:
            return []

        limit = max(1, min(int(limit), 50))
        mask = (
            self.df["track_name"].str.contains(query, case=False, na=False)
            | self.df["artist_name"].str.contains(query, case=False, na=False)
        )

        matches = (
            self.df[mask]
            .sort_values(
                ["track_popularity", "artist_popularity"],
                ascending=False,
            )
            .head(limit)
        )
        return self._records(matches)

    def track_details(self, track_id: str) -> dict[str, Any] | None:
        match = self.df[self.df["track_id"] == str(track_id)]
        if match.empty:
            return None
        return self._records(match.head(1))[0]

    def analyzer_options(self) -> dict[str, Any]:
        genres = []
        for genres_field in self.df["artist_genres"].fillna("").astype(str):
            for raw_value in genres_field.split(","):
                genre = raw_value.strip()
                if genre:
                    genres.append(genre)

        album_types = sorted(
            value
            for value in self.df["album_type"].fillna("").astype(str).str.strip().tolist()
            if value
        )
        release_years = sorted(
            int(value)
            for value in self.df["release_year"].dropna().astype(int).tolist()
            if pd.notna(value)
        )

        return {
            "genres": sorted(dict.fromkeys(genres)),
            "album_types": sorted(dict.fromkeys(album_types)),
            "release_years": sorted(dict.fromkeys(release_years)),
        }

    def _estimate_from_profile(
        self,
        genre: str,
        artist_popularity: float,
        artist_followers: float,
        duration: float,
        release_year: int,
        album_type: str,
        explicit: bool,
    ) -> float:
        baseline = float(self.df["track_popularity"].mean())
        artist_popularity = max(0, min(100, float(artist_popularity)))
        artist_followers = max(0, float(artist_followers))
        duration = max(0, float(duration))
        release_year = int(release_year)

        genre_match = self.df[
            self.df["artist_genres"].astype(str).str.contains(genre, case=False, na=False)
        ]["track_popularity"]
        genre_mean = float(genre_match.mean()) if not genre_match.empty else baseline

        album_type_mean = baseline
        if album_type:
            album_rows = self.df[self.df["album_type"] == album_type]
            if not album_rows.empty:
                album_type_mean = float(album_rows["track_popularity"].mean())

        release_year_mean = baseline
        if release_year:
            year_rows = self.df[self.df["release_year"] == release_year]
            if not year_rows.empty:
                release_year_mean = float(year_rows["track_popularity"].mean())

        follower_scale = 0
        if self.df["artist_followers"].max() > 0:
            follower_scale = min(100, (np.log1p(artist_followers) / np.log1p(float(self.df["artist_followers"].max()))) * 100)

        duration_penalty = 0
        if duration > 0:
            duration_penalty = min(100, max(0, (duration / 8) * 12))

        score = (
            0.35 * baseline
            + 0.25 * artist_popularity
            + 0.15 * genre_mean
            + 0.10 * album_type_mean
            + 0.08 * release_year_mean
            + 0.07 * follower_scale
            - 0.05 * duration_penalty
        )

        if explicit:
            score -= 1.5

        return float(np.clip(score, 0, 100))

    def _estimate_from_profile_vectorized(
        self,
        genre: str,
        artist_popularity: float,
        artist_followers: float,
        duration: float,
        release_year: int,
        album_type: str,
        explicit: bool,
    ) -> np.ndarray:
        baseline = float(self.df["track_popularity"].mean())
        artist_popularity_values = self.df["artist_popularity"].clip(0, 100).to_numpy(dtype=float)
        artist_followers = max(0, float(artist_followers))
        duration = max(0, float(duration))
        release_year = int(release_year)

        genre_mask = self.df["artist_genres"].astype(str).str.contains(genre, case=False, na=False)
        genre_mean = (
            float(self.df.loc[genre_mask, "track_popularity"].mean())
            if genre_mask.any()
            else baseline
        )

        album_type_mean = baseline
        if album_type:
            album_rows = self.df[self.df["album_type"] == album_type]
            if not album_rows.empty:
                album_type_mean = float(album_rows["track_popularity"].mean())

        release_year_mean = baseline
        if release_year:
            year_rows = self.df[self.df["release_year"] == release_year]
            if not year_rows.empty:
                release_year_mean = float(year_rows["track_popularity"].mean())

        follower_scale = 0
        if self.df["artist_followers"].max() > 0:
            follower_scale = min(100, (np.log1p(artist_followers) / np.log1p(float(self.df["artist_followers"].max()))) * 100)

        duration_penalty = 0
        if duration > 0:
            duration_penalty = min(100, max(0, (duration / 8) * 12))

        score = (
            0.35 * baseline
            + 0.25 * artist_popularity_values
            + 0.15 * genre_mean
            + 0.10 * album_type_mean
            + 0.08 * release_year_mean
            + 0.07 * follower_scale
            - 0.05 * duration_penalty
        )

        if explicit:
            score -= 1.5

        return np.clip(score, 0, 100)

    def predict_popularity(self, payload: dict[str, Any]) -> dict[str, Any]:
        print("prediction route entered", flush=True)
        if not isinstance(payload, dict):
            raise ValueError("Prediction payload must be an object.")

        required_fields = [
            "genre",
            "artist_popularity",
            "artist_followers",
            "duration",
            "release_year",
            "album_type",
            "explicit",
        ]
        missing = [field for field in required_fields if field not in payload]
        if missing:
            raise ValueError("Missing prediction fields: " + ", ".join(missing))

        print("validation started", flush=True)
        genre = str(payload.get("genre", "")).strip()
        artist_popularity = float(payload.get("artist_popularity", 0) or 0)
        artist_followers = float(payload.get("artist_followers", 0) or 0)
        duration = float(payload.get("duration", 0) or 0)
        release_year = int(payload.get("release_year", 0) or 0)
        album_type = str(payload.get("album_type", "")).strip()
        explicit_value = payload.get("explicit", False)
        if isinstance(explicit_value, str):
            explicit_value = explicit_value.lower() in {"1", "true", "yes", "y"}
        explicit = bool(explicit_value)

        artist_popularity = max(0, min(100, artist_popularity))
        artist_followers = max(0, artist_followers)
        duration = max(0, duration)
        release_year = max(1900, int(release_year))
        print("validation completed", flush=True)

        print("feature preparation started", flush=True)
        predicted_score = self._estimate_from_profile(
            genre=genre,
            artist_popularity=artist_popularity,
            artist_followers=artist_followers,
            duration=duration,
            release_year=release_year,
            album_type=album_type,
            explicit=explicit,
        )
        predictions = self._estimate_from_profile_vectorized(
            genre=genre,
            artist_popularity=artist_popularity,
            artist_followers=artist_followers,
            duration=duration,
            release_year=release_year,
            album_type=album_type,
            explicit=explicit,
        )
        print("feature preparation completed", flush=True)

        print("prediction started", flush=True)
        observed = self.df["track_popularity"].to_numpy(dtype=float)
        predicted = np.array(predictions, dtype=float)
        mae = float(np.mean(np.abs(observed - predicted)))
        rmse = float(np.sqrt(np.mean((observed - predicted) ** 2)))
        ss_res = float(np.sum((observed - predicted) ** 2))
        ss_tot = float(np.sum((observed - observed.mean()) ** 2))
        r2 = 1 - (ss_res / ss_tot) if ss_tot > 0 else 1.0
        print("prediction completed", flush=True)

        return {
            "predicted_popularity": round(predicted_score, 1),
            "explanation": (
                "This estimate combines the supplied profile with patterns learned from the Spotify dataset, "
                "including artist popularity, follower scale, genre, album type, release year, duration and explicit status."
            ),
            "submitted_profile": {
                "genre": genre or "No genre selected",
                "artist_popularity": round(artist_popularity, 1),
                "artist_followers": int(artist_followers),
                "duration": round(duration, 2),
                "release_year": release_year,
                "album_type": album_type or "Unknown",
                "explicit": explicit,
            },
            "model_metrics": {
                "mean_absolute_error": round(mae, 2),
                "root_mean_squared_error": round(rmse, 2),
                "r2_score": round(r2, 3),
            },
        }

    def recommendations(self, track_id: str, limit: int = 8) -> dict[str, Any]:
        target_rows = self.df[self.df["track_id"] == str(track_id)]
        if target_rows.empty:
            raise KeyError(track_id)

        limit = max(1, min(int(limit), 20))
        target = target_rows.iloc[0]

        candidates = self.df[self.df["track_id"] != str(track_id)].copy()

        popularity_distance = (
            candidates["track_popularity"] - target["track_popularity"]
        ).abs() / 100
        artist_distance = (
            candidates["artist_popularity"] - target["artist_popularity"]
        ).abs() / 100

        duration_scale = max(float(self.df["track_duration_min"].std()), 0.5)
        duration_distance = (
            candidates["track_duration_min"] - target["track_duration_min"]
        ).abs() / duration_scale

        album_match_penalty = (
            candidates["album_type"].ne(target["album_type"]).astype(float) * 0.15
        )
        explicit_penalty = (
            candidates["explicit"].ne(target["explicit"]).astype(float) * 0.10
        )

        candidates["similarity_score"] = (
            1
            - (
                0.45 * popularity_distance
                + 0.25 * artist_distance
                + 0.05 * duration_distance.clip(upper=3)
                + album_match_penalty
                + explicit_penalty
            )
        ).clip(0, 1)

        recommendations_df = candidates.sort_values(
            ["similarity_score", "track_popularity"],
            ascending=False,
        ).head(limit)

        records = self._records(recommendations_df)
        for index, record in enumerate(records):
            record["similarity_score"] = round(
                float(recommendations_df.iloc[index]["similarity_score"] * 100), 1
            )

        return {
            "source_track": self._records(target_rows.head(1))[0],
            "recommendations": records,
            "method": (
                "Starter similarity model using popularity, artist popularity, "
                "duration, album type and explicit status."
            ),
        }

    def compare(self, first_id: str, second_id: str) -> dict[str, Any]:
        first = self.track_details(first_id)
        second = self.track_details(second_id)

        if first is None or second is None:
            raise KeyError("Track not found")

        metrics = [
            ("Track popularity", "track_popularity"),
            ("Artist popularity", "artist_popularity"),
            ("Duration (minutes)", "track_duration_min"),
            ("Artist followers", "artist_followers"),
        ]

        comparison_metrics = []
        for label, key in metrics:
            first_value = first.get(key) or 0
            second_value = second.get(key) or 0

            if first_value > second_value:
                winner = "first"
            elif second_value > first_value:
                winner = "second"
            else:
                winner = "tie"

            comparison_metrics.append(
                {
                    "label": label,
                    "key": key,
                    "first": first_value,
                    "second": second_value,
                    "winner": winner,
                }
            )

        return {
            "first": first,
            "second": second,
            "metrics": comparison_metrics,
        }
