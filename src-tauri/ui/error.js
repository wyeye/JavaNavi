const params = new URLSearchParams(location.search);
document.getElementById('message').textContent = params.get('message') || 'Unknown startup failure';
document.getElementById('logPath').textContent = params.get('log') || 'No log file was created';
