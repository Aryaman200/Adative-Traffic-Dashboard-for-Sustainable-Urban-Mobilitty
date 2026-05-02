"""
SAARTHI — ML Model Training Pipeline
Uses Delhi traffic dataset to train:
  1. Travel Time Predictor (Random Forest Regressor)
  2. Congestion Level Classifier (Gradient Boosting)
  3. Optimal Signal Timing Model (Random Forest Regressor)
"""

import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestRegressor, GradientBoostingClassifier, RandomForestClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.metrics import mean_absolute_error, r2_score, accuracy_score, classification_report
import joblib
import os
import json

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'Data')
MODEL_DIR = os.path.join(os.path.dirname(__file__), 'models')
os.makedirs(MODEL_DIR, exist_ok=True)


def load_data():
    """Load and merge feature + target datasets."""
    features = pd.read_csv(os.path.join(DATA_DIR, 'delhi_traffic_features.csv'))
    target = pd.read_csv(os.path.join(DATA_DIR, 'delhi_traffic_target.csv'))
    df = features.merge(target, on='Trip_ID')
    print(f"Loaded {len(df)} trip records")
    print(f"Columns: {list(df.columns)}")
    print(f"Traffic density levels: {df['traffic_density_level'].value_counts().to_dict()}")
    return df


def preprocess(df):
    """Encode categorical features, create derived features."""
    df = df.copy()

    # Encode categoricals
    encoders = {}
    cat_cols = ['start_area', 'end_area', 'time_of_day', 'day_of_week', 'weather_condition',
                'traffic_density_level', 'road_type']

    for col in cat_cols:
        le = LabelEncoder()
        df[col + '_enc'] = le.fit_transform(df[col].astype(str))
        encoders[col] = le

    # Derived features
    df['speed_distance_ratio'] = df['average_speed_kmph'] / (df['distance_km'] + 0.01)
    df['is_peak'] = df['time_of_day'].isin(['Morning Peak', 'Evening Peak']).astype(int)
    df['is_weekend'] = (df['day_of_week'] == 'Weekend').astype(int)
    df['is_rain'] = df['weather_condition'].isin(['Rain', 'Fog']).astype(int)
    df['is_highway'] = (df['road_type'] == 'Highway').astype(int)
    df['congestion_score'] = df['distance_km'] / (df['average_speed_kmph'] + 0.01) * 60

    return df, encoders


def train_travel_time_model(df):
    """Model 1: Predict travel time given route + conditions."""
    print("\n" + "="*60)
    print("MODEL 1: Travel Time Predictor")
    print("="*60)

    feature_cols = [
        'start_area_enc', 'end_area_enc', 'distance_km', 'time_of_day_enc',
        'day_of_week_enc', 'weather_condition_enc', 'traffic_density_level_enc',
        'road_type_enc', 'average_speed_kmph', 'is_peak', 'is_weekend',
        'is_rain', 'is_highway', 'speed_distance_ratio'
    ]

    X = df[feature_cols]
    y = df['travel_time_minutes']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = RandomForestRegressor(n_estimators=150, max_depth=15, min_samples_split=5, random_state=42, n_jobs=-1)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, y_pred)
    r2 = r2_score(y_test, y_pred)
    print(f"  MAE:  {mae:.2f} minutes")
    print(f"  R²:   {r2:.4f}")

    # Feature importance
    importances = dict(zip(feature_cols, model.feature_importances_))
    top_features = sorted(importances.items(), key=lambda x: -x[1])[:5]
    print(f"  Top features: {[f'{f}: {v:.3f}' for f, v in top_features]}")

    joblib.dump(model, os.path.join(MODEL_DIR, 'travel_time_model.pkl'))
    print("  Saved: travel_time_model.pkl")

    return model, feature_cols


def train_congestion_classifier(df):
    """Model 2: Classify congestion level (Low/Medium/High)."""
    print("\n" + "="*60)
    print("MODEL 2: Congestion Level Classifier")
    print("="*60)

    feature_cols = [
        'distance_km', 'time_of_day_enc', 'day_of_week_enc',
        'weather_condition_enc', 'road_type_enc', 'average_speed_kmph',
        'is_peak', 'is_weekend', 'is_rain', 'is_highway',
        'speed_distance_ratio', 'congestion_score'
    ]

    X = df[feature_cols]
    y = df['traffic_density_level_enc']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = GradientBoostingClassifier(n_estimators=120, max_depth=6, learning_rate=0.1, random_state=42)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    acc = accuracy_score(y_test, y_pred)
    print(f"  Accuracy: {acc:.4f}")

    joblib.dump(model, os.path.join(MODEL_DIR, 'congestion_classifier.pkl'))
    print("  Saved: congestion_classifier.pkl")

    return model, feature_cols


def train_signal_timing_model(df):
    """Model 3: Predict optimal signal green time based on traffic conditions.
    We generate synthetic signal data from the traffic patterns."""
    print("\n" + "="*60)
    print("MODEL 3: Optimal Signal Timing Model")
    print("="*60)

    # Generate synthetic signal training data from trip records
    signal_records = []
    for _, row in df.iterrows():
        # For each trip, estimate what the ideal green time should be
        # at the origin intersection
        congestion = row['congestion_score']
        speed = row['average_speed_kmph']
        density_map = {'Low': 0, 'Medium': 1, 'High': 2}
        density_level = density_map.get(row['traffic_density_level'], 1)

        # Webster's optimal cycle heuristic
        demand_ratio = min(0.9, 0.15 + density_level * 0.25 + (1 - speed / 80) * 0.2)
        lost_time = 12  # 3 phases × 4s
        optimal_cycle = min(180, max(60, int((1.5 * lost_time + 5) / max(0.05, 1 - demand_ratio))))
        effective_green = optimal_cycle - lost_time

        # Green split for main phase (proportional to demand)
        main_green = int(effective_green * max(0.3, min(0.7, 0.35 + demand_ratio * 0.35)))

        signal_records.append({
            'distance_km': row['distance_km'],
            'time_of_day_enc': row['time_of_day_enc'],
            'day_of_week_enc': row['day_of_week_enc'],
            'weather_condition_enc': row['weather_condition_enc'],
            'road_type_enc': row['road_type_enc'],
            'average_speed_kmph': speed,
            'traffic_density_enc': density_level,
            'is_peak': row['is_peak'],
            'is_weekend': row['is_weekend'],
            'is_rain': row['is_rain'],
            'congestion_score': congestion,
            'demand_ratio': demand_ratio,
            'optimal_cycle': optimal_cycle,
            'optimal_green': main_green
        })

    sig_df = pd.DataFrame(signal_records)

    feature_cols = [
        'distance_km', 'time_of_day_enc', 'day_of_week_enc',
        'weather_condition_enc', 'road_type_enc', 'average_speed_kmph',
        'traffic_density_enc', 'is_peak', 'is_weekend', 'is_rain',
        'congestion_score', 'demand_ratio'
    ]

    # Train cycle time predictor
    X = sig_df[feature_cols]

    # Cycle time model
    y_cycle = sig_df['optimal_cycle']
    X_train, X_test, y_train, y_test = train_test_split(X, y_cycle, test_size=0.2, random_state=42)
    cycle_model = RandomForestRegressor(n_estimators=100, max_depth=12, random_state=42, n_jobs=-1)
    cycle_model.fit(X_train, y_train)
    print(f"  Cycle MAE:  {mean_absolute_error(y_test, cycle_model.predict(X_test)):.1f}s")
    print(f"  Cycle R²:   {r2_score(y_test, cycle_model.predict(X_test)):.4f}")

    # Green time model
    y_green = sig_df['optimal_green']
    X_train, X_test, y_train, y_test = train_test_split(X, y_green, test_size=0.2, random_state=42)
    green_model = RandomForestRegressor(n_estimators=100, max_depth=12, random_state=42, n_jobs=-1)
    green_model.fit(X_train, y_train)
    print(f"  Green MAE:  {mean_absolute_error(y_test, green_model.predict(X_test)):.1f}s")
    print(f"  Green R²:   {r2_score(y_test, green_model.predict(X_test)):.4f}")

    joblib.dump(cycle_model, os.path.join(MODEL_DIR, 'signal_cycle_model.pkl'))
    joblib.dump(green_model, os.path.join(MODEL_DIR, 'signal_green_model.pkl'))
    print("  Saved: signal_cycle_model.pkl, signal_green_model.pkl")

    return cycle_model, green_model, feature_cols


def save_metadata(encoders, feature_cols_tt, feature_cols_cong, feature_cols_sig):
    """Save encoder mappings and feature lists for the API server."""
    meta = {
        'feature_cols_travel_time': feature_cols_tt,
        'feature_cols_congestion': feature_cols_cong,
        'feature_cols_signal': feature_cols_sig,
        'encoders': {}
    }
    for col, le in encoders.items():
        meta['encoders'][col] = {str(k): int(v) for k, v in zip(le.classes_, le.transform(le.classes_))}

    with open(os.path.join(MODEL_DIR, 'metadata.json'), 'w') as f:
        json.dump(meta, f, indent=2)
    print("\nSaved: metadata.json")


if __name__ == '__main__':
    print("[SAARTHI] ML Model Training Pipeline")
    print("=" * 60)

    df = load_data()
    df, encoders = preprocess(df)

    tt_model, tt_cols = train_travel_time_model(df)
    cong_model, cong_cols = train_congestion_classifier(df)
    cycle_model, green_model, sig_cols = train_signal_timing_model(df)

    save_metadata(encoders, tt_cols, cong_cols, sig_cols)

    print("\n" + "=" * 60)
    print("[OK] All models trained and saved to backend/models/")
    print("   Run `python backend/server.py` to start the API.")
    print("=" * 60)
