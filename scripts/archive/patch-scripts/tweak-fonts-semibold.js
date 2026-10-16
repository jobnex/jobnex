const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    const dirPath = path.join(dir, f);
    const isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      if (f !== 'node_modules' && f !== '.next' && f !== '.git') {
        walkDir(dirPath, callback);
      }
    } else {
      if (f.endsWith('.tsx') || f.endsWith('.ts')) {
        callback(dirPath);
      }
    }
  });
}

let count = 0;
walkDir(process.cwd(), (filePath) => {
  let content = fs.readFileSync(filePath, 'utf-8');
  let originalContent = content;
  
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('font-heading')) {
      if (lines[i].includes('font-semibold')) {
        lines[i] = lines[i].replace(/font-semibold/g, 'font-medium');
      }
    }
  }
  
  const newContent = lines.join('\n');
  if (newContent !== originalContent) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    count++;
    console.log(`Updated ${filePath}`);
  }
});

console.log(`Updated ${count} files.`);
