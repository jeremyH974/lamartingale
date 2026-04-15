"""
Couche 2.4 — Clustering UMAP + HDBSCAN
Compare clusters trouves vs 10 piliers (Adjusted Rand Index)
"""
import os
import json
import numpy as np
from dotenv import load_dotenv

load_dotenv()

def main():
    print("[COUCHE 2][CLUSTERING] Starting UMAP + HDBSCAN clustering")

    # Connect to Neon
    import psycopg2
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()

    # Get episodes with embeddings
    cur.execute("""
        SELECT e.episode_number, e.pillar, en.embedding::text
        FROM episodes e
        INNER JOIN episodes_enrichment en ON en.episode_id = e.id
        WHERE en.embedding IS NOT NULL
        ORDER BY e.episode_number
    """)
    rows = cur.fetchall()
    conn.close()

    print(f"  Episodes with embeddings: {len(rows)}")

    if len(rows) < 10:
        print("  Not enough episodes for clustering. Need at least 10.")
        return

    # Parse embeddings
    episode_numbers = []
    pillars = []
    embeddings = []

    for row in rows:
        ep_num, pillar, emb_str = row
        episode_numbers.append(ep_num)
        pillars.append(pillar)
        # Parse vector string "[0.1,0.2,...]"
        emb = [float(x) for x in emb_str.strip('[]').split(',')]
        embeddings.append(emb)

    X = np.array(embeddings)
    print(f"  Embedding matrix: {X.shape}")

    # UMAP reduction
    from umap import UMAP
    print("  Running UMAP (n_components=2, metric=cosine)...")
    reducer = UMAP(n_components=2, metric='cosine', random_state=42, n_neighbors=15, min_dist=0.1)
    X_2d = reducer.fit_transform(X)
    print(f"  UMAP done: {X_2d.shape}")

    # OPTICS clustering (density-based, similar to HDBSCAN but built into sklearn)
    from sklearn.cluster import OPTICS
    print("  Running OPTICS (min_samples=5, metric=euclidean)...")
    clusterer = OPTICS(min_samples=5, metric='euclidean', cluster_method='xi')
    cluster_labels = clusterer.fit_predict(X_2d)
    n_clusters = len(set(cluster_labels)) - (1 if -1 in cluster_labels else 0)
    n_noise = sum(1 for c in cluster_labels if c == -1)
    print(f"  Clusters found: {n_clusters}")
    print(f"  Noise points: {n_noise}")

    # Compare with 10 piliers
    from sklearn.metrics import adjusted_rand_score, confusion_matrix

    # Encode pillars as integers
    unique_pillars = sorted(set(pillars))
    pillar_to_int = {p: i for i, p in enumerate(unique_pillars)}
    pillar_labels = [pillar_to_int[p] for p in pillars]

    # Filter out noise for ARI
    mask = cluster_labels != -1
    if sum(mask) > 10:
        ari = adjusted_rand_score(
            [pillar_labels[i] for i in range(len(mask)) if mask[i]],
            [cluster_labels[i] for i in range(len(mask)) if mask[i]]
        )
    else:
        ari = 0.0

    print(f"\n  === RESULTS ===")
    print(f"  Adjusted Rand Index (vs 10 piliers): {ari:.4f}")
    print(f"  Interpretation: {'Fort alignement' if ari > 0.5 else 'Alignement modéré' if ari > 0.3 else 'Faible alignement'}")

    # Cluster composition
    print(f"\n  Cluster composition:")
    for c in sorted(set(cluster_labels)):
        if c == -1:
            continue
        members = [pillars[i] for i in range(len(cluster_labels)) if cluster_labels[i] == c]
        from collections import Counter
        top = Counter(members).most_common(3)
        label = top[0][0] if top else '?'
        print(f"    Cluster {c} ({len(members)} ep): {', '.join(f'{p}({n})' for p,n in top)}")

    # Export scatter plot data as JSON (can be visualized in frontend)
    output = {
        "metadata": {
            "n_episodes": len(rows),
            "n_clusters": n_clusters,
            "n_noise": n_noise,
            "ari_score": round(ari, 4),
            "ari_interpretation": 'Fort alignement' if ari > 0.5 else 'Alignement modéré' if ari > 0.3 else 'Faible alignement',
        },
        "points": [
            {
                "episode_number": episode_numbers[i],
                "pillar": pillars[i],
                "cluster": int(cluster_labels[i]),
                "x": float(X_2d[i, 0]),
                "y": float(X_2d[i, 1]),
            }
            for i in range(len(rows))
        ],
    }

    out_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'clustering.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2)
    print(f"\n  Exported to: {out_path}")
    print(f"[COUCHE 2][CLUSTERING] Done")

if __name__ == "__main__":
    main()
