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
    
    // Validate URL
    if (!url) {
      return res.status(400).json({ error: 'YouTube URL is required' });
    }

    // Basic YouTube URL validation
    if (!url.includes('youtube.com/watch') && !url.includes('youtu.be/')) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    // Get video info first to set proper filename
    exec(`yt-dlp --get-title --get-filename ${url}`, (titleError, titleStdout, titleStderr) => {
      if (titleError) {
        console.error('Error getting video info:', titleStderr);
        return res.status(500).json({ error: 'Could not retrieve video information' });
      }

      const [videoTitle, originalFilename] = titleStdout.split('\n').filter(Boolean);
      const cleanTitle = videoTitle ? sanitizeFilename(videoTitle) : 'video';
      const filename = `${cleanTitle}.mp4`;

      // Set headers before piping the response
      res.header('Content-Disposition', `attachment; filename="${filename}"`);
      res.header('Content-Type', 'video/mp4');

      // Download and stream the video
      const ytdlProcess = exec(`yt-dlp -o - -f best ${url}`, (error, stdout, stderr) => {
        if (error) {
          console.error('Download error:', stderr);
          if (!res.headersSent) {
            return res.status(500).json({ error: 'Error downloading video' });
          }
        }
      });

      // Handle process exit
      ytdlProcess.on('exit', (code) => {
        if (code !== 0) {
          console.error(`yt-dlp process exited with code ${code}`);
        }
      });

      // Pipe the video data to the response
      ytdlProcess.stdout.pipe(res);
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the application at http://localhost:${PORT}`);
});