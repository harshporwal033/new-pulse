import os
import sys
import feedparser
import requests
import trafilatura
from pymongo import MongoClient
from dotenv import load_dotenv
from datetime import datetime, timezone
import dateutil.parser
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

# Load .env from parent directory
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

MONGO_URI = os.getenv('MONGO_URI') or os.getenv('MONGODB_URI')
if not MONGO_URI:
    print("Error: MONGO_URI or MONGODB_URI not set in .env")
    sys.exit(1)

client = MongoClient(MONGO_URI)
db = client['newspulse']
articles_col = db['articles']
clusters_col = db['clusters']

FEEDS = [
    {"source": "BBC News", "url": "http://feeds.bbci.co.uk/news/rss.xml"},
    {"source": "NPR", "url": "https://feeds.npr.org/1001/rss.xml"},
    {"source": "The Guardian", "url": "https://www.theguardian.com/world/rss"}
]

def fetch_articles():
    print("Fetching articles from RSS feeds...")
    new_articles = []
    
    for feed in FEEDS:
        print(f"Parsing feed: {feed['source']}")
        parsed = feedparser.parse(feed['url'])
        
        for entry in parsed.entries:
            url = entry.get('link')
            if not url:
                continue
                
            # Deduplicate by URL
            if articles_col.find_one({"url": url}):
                continue
                
            title = entry.get('title', '')
            summary = entry.get('summary', '')
            
            # Extract published date
            pub_date_str = entry.get('published') or entry.get('updated')
            try:
                published_at = dateutil.parser.parse(pub_date_str)
                if published_at.tzinfo is None:
                    published_at = published_at.replace(tzinfo=timezone.utc)
                else:
                    published_at = published_at.astimezone(timezone.utc)
            except Exception:
                published_at = datetime.now(timezone.utc)
                
            # Fetch full text
            print(f"  Fetching full text for: {url}")
            try:
                downloaded = trafilatura.fetch_url(url)
                if downloaded:
                    content = trafilatura.extract(downloaded) or summary
                else:
                    content = summary
            except Exception as e:
                print(f"  Failed to fetch {url}: {e}")
                content = summary
                
            article = {
                "title": title,
                "summary": summary,
                "content": content,
                "source": feed['source'],
                "url": url,
                "publishedAt": published_at,
                "clusterId": None,
                "createdAt": datetime.now(timezone.utc),
                "updatedAt": datetime.now(timezone.utc)
            }
            new_articles.append(article)
            
    if new_articles:
        articles_col.insert_many(new_articles)
        print(f"Inserted {len(new_articles)} new articles.")
    else:
        print("No new articles to insert.")

def cluster_articles():
    print("Clustering articles...")
    all_articles = list(articles_col.find({}))
    if not all_articles:
        print("No articles to cluster.")
        return
        
    texts = []
    for a in all_articles:
        text = f"{a.get('title', '')} {a.get('summary', '')} {a.get('content', '')}"
        texts.append(text)
        
    vectorizer = TfidfVectorizer(stop_words='english', max_features=5000)
    try:
        tfidf_matrix = vectorizer.fit_transform(texts)
    except ValueError:
        print("Could not compute TF-IDF.")
        return
        
    feature_names = vectorizer.get_feature_names_out()
    cosine_sim = cosine_similarity(tfidf_matrix)
    
    THRESHOLD = 0.05
    clusters = [] 
    visited = set()
    
    for i in range(len(all_articles)):
        if i in visited:
            continue
            
        # Find the best existing cluster for this article (average-linkage)
        best_cluster_idx = -1
        best_avg_sim = 0.0
        
        for ci, cluster_members in enumerate(clusters):
            # Average similarity to all members of this cluster
            sims = [cosine_sim[i][m] for m in cluster_members]
            avg_sim = sum(sims) / len(sims)
            if avg_sim >= THRESHOLD and avg_sim > best_avg_sim:
                best_avg_sim = avg_sim
                best_cluster_idx = ci
        
        if best_cluster_idx >= 0:
            clusters[best_cluster_idx].append(i)
        else:
            clusters.append([i])
        visited.add(i)
        
    print(f"Formed {len(clusters)} clusters.")
    
    # Clear old clusters and reset article cluster IDs
    clusters_col.delete_many({})
    articles_col.update_many({}, {"$set": {"clusterId": None}})
    
    for cluster_indices in clusters:
        cluster_texts = [texts[idx] for idx in cluster_indices]
        cluster_tfidf = vectorizer.transform(cluster_texts)
        avg_tfidf = cluster_tfidf.mean(axis=0).A1
        top_indices = avg_tfidf.argsort()[-3:][::-1]
        
        label = " ".join([feature_names[idx] for idx in top_indices])
        if not label.strip():
            label = "Uncategorized"
            
        cluster_articles_docs = [all_articles[idx] for idx in cluster_indices]
        dates = [a['publishedAt'] for a in cluster_articles_docs]
        
        earliest_date = min(dates)
        latest_date = max(dates)
        article_ids = [str(a['_id']) for a in cluster_articles_docs]
        
        new_cluster = {
            "label": label,
            "articleCount": len(cluster_articles_docs),
            "articles": article_ids, 
            "earliestArticleDate": earliest_date,
            "latestArticleDate": latest_date,
            "createdAt": datetime.now(timezone.utc),
            "updatedAt": datetime.now(timezone.utc)
        }
        
        res = clusters_col.insert_one(new_cluster)
        cluster_id = str(res.inserted_id)
        
        # Update articles with new clusterId
        articles_col.update_many(
            {"_id": {"$in": [a['_id'] for a in cluster_articles_docs]}},
            {"$set": {"clusterId": cluster_id, "updatedAt": datetime.now(timezone.utc)}}
        )

if __name__ == "__main__":
    fetch_articles()
    cluster_articles()
    print("Pipeline execution completed.")
