const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Helper function to sanitize filenames
const sanitizeFilename = (str) => {
  return str.replace(/[^\w\s.-]/gi, '').replace(/\s+/g, '_');
};

// Rate limiting middleware
let lastRequestTime = 0;
app.use('/download', (req, res, next) => {
  const now = Date.now();
  if (now - lastRequestTime < 5000) { // 5 second cooldown
    return res.status(429).json({ 
      error: 'Please wait 5 seconds between downloads',
      retryAfter: 5 - Math.floor((now - lastRequestTime)/1000)
    });
  }
  lastRequestTime = now;
  next();
});

// Route to handle video downloads
app.get('/download', async (req, res) => {
  try {
    const url = req.query.url;
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    // Enhanced URL validation
    const videoId = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|youtu\.be\/)([^"&?\/\s]{11})/)?.[1];
    if (!videoId) {
      return res.status(400).json({ error: 'Invalid YouTube URL format' });
    }

    // Custom yt-dlp command with headers and retries
    const ytdlCommand = `yt-dlp \
      --force-ipv4 \
      --socket-timeout 30 \
      --retries 3 \
      --throttled-rate 100K \
      --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36" \
      --referer "https://www.youtube.com/" \
      --dump-json ${url}`;

    exec(ytdlCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('YT-DLP Error:', stderr);
        return res.status(500).json({ 
          error: 'YouTube is temporarily blocking requests. Please try again later.',
          details: stderr.toString()
        });
      }

      try {
        const info = JSON.parse(stdout);
        const cleanTitle = sanitizeFilename(info.title || 'video');
        const filename = `${cleanTitle}.mp4`;

        // Set headers
        res.header('Content-Disposition', `attachment; filename="${filename}"`);
        res.header('Content-Type', 'video/mp4');

        // Download command with optimized parameters
        const downloadCommand = `yt-dlp \
          -o - \
          -f 'best[height<=720]' \
          --no-cache-dir \
          --throttled-rate 100K \
          ${url}`;

        const ytdlProcess = exec(downloadCommand);
        
        ytdlProcess.stdout.pipe(res);
        ytdlProcess.stderr.on('data', (data) => console.error('Download error:', data.toString()));

      } catch (parseError) {
        console.error('Parse Error:', parseError);
        res.status(500).json({ error: 'Failed to process video information' });
      }
    });

  } catch (error) {
    console.error('Server Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

server.timeout = 600000; // 10 minute timeout