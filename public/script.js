document.getElementById('download').addEventListener('click', () => {
    const url = document.getElementById('url').value.trim();
    const status = document.getElementById('status');
    
    if (!url) {
        status.textContent = 'Please enter a YouTube URL';
        return;
    }
    
    status.textContent = 'Processing...';
    
    // Send to backend
    window.location.href = `/download?url=${encodeURIComponent(url)}`;
    
    status.textContent = 'Download should start shortly...';
});