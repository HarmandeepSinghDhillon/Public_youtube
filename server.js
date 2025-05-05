const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const app = express();

// Configuration
const CONFIG = {
  COOLDOWN: 10000, // 10 seconds between requests
  MAX_RETRIES: 2,
  THROTTLE_RATE: '100K',
  QUALITY: 'best[height<=720]',
  USER_AGENTS: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ]
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Rate limiting storage
const requestTracker = new Map();

// Enhanced rate limiting middleware
app.use('/download', (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const now = Date.now();
  
  if (requestTracker.has(ip)) {
    const lastRequest = requestTracker.get(ip);
    const timeSince = now - lastRequest;
    
    if (timeSince < CONFIG.COOLDOWN) {
      const waitTime = Math.ceil((CONFIG.COOLDOWN - timeSince)/1000);
      return res.status(429).json({
        error: `Please wait ${waitTime} seconds before another download`,
        retryAfter: waitTime
      });
    }
  }
  
  requestTracker.set(ip, now);
  next();
});

// Helper functions
const sanitizeFilename = (str) => str.replace(/[^\w\s.-]/gi, '').replace(/\s+/g, '_');
const getRandomUserAgent = () => CONFIG.USER_AGENTS[Math.floor(Math.random() * CONFIG.USER_AGENTS.length)];
const generateRequestId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

// YouTube URL validation
const validateYouTubeUrl = (url) => {
  const patterns = [
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

// Download endpoint
app.get('/download', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'YouTube URL is required' });

    const videoId = validateYouTubeUrl(url);
    if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL format' });

    // Randomized request parameters
    const userAgent = getRandomUserAgent();
    const referer = `https://www.youtube.com/watch?v=${videoId}`;
    const requestId = generateRequestId();

    console.log(`Starting download for ${videoId} (Request ID: ${requestId})`);

    // Build yt-dlp command
    const ytdlCommand = `yt-dlp \
      --force-ipv4 \
      --socket-timeout 30 \
      --retries ${CONFIG.MAX_RETRIES} \
      --throttled-rate ${CONFIG.THROTTLE_RATE} \
      --user-agent "${userAgent}" \
      --referer "${referer}" \
      --extractor-args "youtube:skip=dash,webpage" \
      --no-cache-dir \
      --dump-json ${url}`;

    exec(ytdlCommand, (error, stdout, stderr) => {
      if (error) {
        console.error(`Download failed for ${videoId} (${requestId}):`, stderr);
        return res.status(500).json({
          error: 'YouTube is blocking requests from this server',
          solution: 'Please try again later or use a different network',
          requestId
        });
      }

      try {
        const info = JSON.parse(stdout);
        const filename = `${sanitizeFilename(info.title || 'video')}.mp4`;

        res.header('Content-Disposition', `attachment; filename="${filename}"`);
        res.header('Content-Type', 'video/mp4');

        const downloadCommand = `yt-dlp \
          -o - \
          -f '${CONFIG.QUALITY}' \
          --no-cache-dir \
          --throttled-rate ${CONFIG.THROTTLE_RATE} \
          --user-agent "${userAgent}" \
          ${url}`;

        const ytdlProcess = exec(downloadCommand);
        
        ytdlProcess.stdout.pipe(res);
        ytdlProcess.stderr.on('data', (data) => 
          console.error(`Stream error (${requestId}):`, data.toString())
        );

      } catch (parseError) {
        console.error(`Parse error (${requestId}):`, parseError);
        res.status(500).json({ error: 'Failed to process video information', requestId });
      }
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Server setup
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Configuration:', CONFIG);
});

server.timeout = 600000;