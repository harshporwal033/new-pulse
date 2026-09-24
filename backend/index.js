const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('MONGO_URI is not defined in .env');
    process.exit(1);
}

const client = new MongoClient(MONGO_URI);
let db, articlesCol, clustersCol;

const jobs = new Map();

async function connectDB() {
    try {
        await client.connect();
        db = client.db('newspulse');
        articlesCol = db.collection('articles');
        clustersCol = db.collection('clusters');
        console.log('Connected to MongoDB');
    } catch (err) {
        console.error('Failed to connect to MongoDB', err);
        process.exit(1);
    }
}

const mapCluster = (c) => ({
    id: c._id.toString(),
    label: c.label,
    articleCount: c.articleCount,
    earliestArticleDate: c.earliestArticleDate,
    latestArticleDate: c.latestArticleDate,
});

app.get('/clusters', async (req, res) => {
    try {
        const clusters = await clustersCol.find({}).sort({ latestArticleDate: -1 }).toArray();
        res.json(clusters.map(mapCluster));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/clusters/:id', async (req, res) => {
    try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'Invalid cluster ID format' });
        }
        
        const cluster = await clustersCol.findOne({ _id: new ObjectId(id) });
        if (!cluster) {
            return res.status(404).json({ error: 'Cluster not found' });
        }
        
        const articleIds = cluster.articles.map(aId => new ObjectId(aId));
        const articles = await articlesCol.find({ _id: { $in: articleIds } })
                                          .sort({ publishedAt: 1 })
                                          .toArray();
                                          
        const mappedArticles = articles.map(a => ({
            id: a._id.toString(),
            title: a.title,
            source: a.source,
            publishedAt: a.publishedAt,
            url: a.url
        }));
        
        const response = mapCluster(cluster);
        response.articles = mappedArticles;
        
        res.json(response);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/timeline', async (req, res) => {
    try {
        const clusters = await clustersCol.find({}).sort({ earliestArticleDate: 1 }).toArray();
        const timeline = clusters.map(c => ({
            id: c._id.toString(),
            label: c.label,
            startTime: c.earliestArticleDate,
            endTime: c.latestArticleDate,
            articleCount: c.articleCount,
            sizeMetric: c.articleCount
        }));
        res.json(timeline);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/ingest/trigger', (req, res) => {
    const jobId = uuidv4();
    jobs.set(jobId, { jobId, status: 'queued', message: 'Job queued' });
    
    setTimeout(() => {
        jobs.set(jobId, { jobId, status: 'running', message: 'Scraping and clustering...' });
        
        const pythonPath = process.platform === 'win32'
          ? path.join(__dirname, '..', 'scraper', 'venv', 'Scripts', 'python.exe')
          : path.join(__dirname, '..', 'scraper', 'venv', 'bin', 'python');
        const scriptPath = path.join(__dirname, '..', 'scraper', 'main.py');
        
        const pyProc = spawn(pythonPath, ['-u', scriptPath], {
            cwd: path.join(__dirname, '..', 'scraper')
        });

        pyProc.on('error', (err) => {
            console.error('Failed to start scraper process:', err);
            jobs.set(jobId, { jobId, status: 'failed', message: 'Failed to start scraper process', error: err.toString() });
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to start scraper process' });
            }
        });
        
        let outData = '';
        let errData = '';
        
        pyProc.stdout.on('data', (data) => {
            const str = data.toString();
            outData += str;
            
            const job = jobs.get(jobId);
            if (job) {
                if (str.includes('Fetching articles from RSS feeds')) {
                    job.message = 'Step 1/3: Scraping RSS feeds...';
                } else if (str.includes('Clustering articles')) {
                    job.message = 'Step 2/3: Clustering articles...';
                } else if (str.includes('Pipeline execution completed')) {
                    job.message = 'Step 3/3: Updating dashboard...';
                }
                jobs.set(jobId, job);
            }
        });
        
        pyProc.stderr.on('data', (data) => errData += data.toString());
        
        pyProc.on('close', (code) => {
            if (code === 0) {
                jobs.set(jobId, { 
                    jobId, 
                    status: 'completed', 
                    message: 'Pipeline execution completed successfully',
                    details: outData 
                });
            } else {
                jobs.set(jobId, { 
                    jobId, 
                    status: 'failed', 
                    message: `Process exited with code ${code}`,
                    error: errData
                });
            }
        });
    }, 0);
    
    res.status(202).json({ jobId, status: 'queued' });
});

app.get('/ingest/status/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);
    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }
    res.json(job);
});

connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`Backend API running on port ${PORT}`);
    });
});
