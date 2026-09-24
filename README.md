# News Pulse 🌐📰

An automated full-stack news aggregation and topic-clustering platform. News Pulse periodically ingests articles across major global sources, extracts clean content, groups related events using NLP clustering, and displays trends on an interactive timeline.

---

## 🚀 Live Demo

- **Frontend (Vercel):** [https://new-pulse-rho.vercel.app](https://new-pulse-rho.vercel.app)
- **Backend API (Render):** [https://news-pulse-api-s88c.onrender.com](https://news-pulse-api-s88c.onrender.com)

---

## 🛠️ Architecture & Tech Stack

- **Frontend:** Next.js 16 (App Router, TypeScript, Tailwind CSS)
- **Backend:** Node.js, Express.js
- **Scraper & Machine Learning:** Python 3, Trafilatura (content extraction), Scikit-Learn (TF-IDF vectorization & document clustering), Feedparser (RSS)
- **Database:** MongoDB Atlas (Mongoose ODM)
- **Deployment:** Vercel (Client UI) & Render (API Web Service)

---

## ✨ Key Features

1. **Multi-Source RSS Ingestion:** Scrapes articles from BBC News, NPR, and The Guardian.
2. **Automated NLP Clustering:** Vectorizes extracted article bodies using TF-IDF and clusters related breaking events together based on cosine similarity.
3. **Interactive Timeline:** Visualizes clusters across temporal axes, allowing users to filter by news publisher and inspect individual stories.
4. **On-Demand Pipeline Execution:** Features a manual ingestion trigger endpoint (`/ingest/trigger`) to scrape and recalculate clusters in real time.

---

## 🏃 Local Setup & Installation

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)
- MongoDB connection URI

### 1. Clone Repository
\`\`\`bash
git clone https://github.com/harshporwal033/new-pulse.git
cd new-pulse
\`\`\`

### 2. Backend Setup
\`\`\`bash
cd backend
npm install
\`\`\`
Create a `.env` file in the root directory:
\`\`\`env
MONGO_URI=your_mongodb_connection_string
PORT=5000
\`\`\`
Start the backend:
\`\`\`bash
npm start
\`\`\`

### 3. Python Scraper Virtual Environment
\`\`\`bash
cd ../scraper
python -m venv venv

# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
\`\`\`

### 4. Frontend Setup
\`\`\`bash
cd ../frontend
npm install
npm run dev
\`\`\`
Open [http://localhost:3000](http://localhost:3000) to view the application.
