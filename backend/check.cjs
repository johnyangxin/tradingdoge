const fs = require('fs');
const line = fs.readFileSync('src/workers.ts', 'utf8').split('\n')[118];
console.log('Line 119 characters:', line.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' '));
console.log('Line 119:', line);