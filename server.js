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

// Route to handle video downloads
app.get('/download', async (req, res) => {
  try {
    const url = req.query.url;
    
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    // Enhanced URL validation
    if (!/^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/.test(url)) {
      return res.status(400).json({ error: 'Invalid YouTube URL format' });
    }

    // First try to get video info
    exec(`yt-dlp --dump-json ${url}`, (error, stdout, stderr) => {
      if (error) {
        console.error('YT-DLP Error:', stderr);
        return res.status(500).json({ 
          error: 'Failed to get video info',
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

        // Now download the video
        const ytdlProcess = exec(`yt-dlp -o - -f best ${url}`);
        
        ytdlProcess.stdout.pipe(res);
        ytdlProcess.stderr.on('data', (data) => console.error('Download error:', data.toString()));

        // Handle process exit
        ytdlProcess.on('exit', (code) => {
          if (code !== 0) {
            console.error(`yt-dlp process exited with code ${code}`);
          }
        });

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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server with timeout configuration
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the application at http://localhost:${PORT}`);
});

// Set timeout to 10 minutes (600000ms)
server.timeout = 600000;

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});