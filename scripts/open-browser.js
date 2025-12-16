// Simple Node.js script to open index.html in the default browser
const { exec } = require('child_process');
const path = require('path');

const file = path.join(__dirname, '../index.html');

// macOS: use 'open', Windows: 'start', Linux: 'xdg-open'
const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';

exec(`${openCmd} "${file}"`, (err) => {
  if (err) {
    console.error('Failed to open browser:', err);
  } else {
    console.log('Browser opened with index.html');
  }
});
