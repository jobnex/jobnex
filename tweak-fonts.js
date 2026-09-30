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

  // We are looking for classNames that contain font-heading AND either font-bold or font-extrabold
  // Since parsing HTML classes in regex is hard, we can just replace font-bold/font-extrabold on any line that has font-heading.
  
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('font-heading')) {
      if (lines[i].includes('font-bold')) {
        lines[i] = lines[i].replace(/font-bold/g, 'font-medium');
      }
      if (lines[i].includes('font-extrabold')) {
        lines[i] = lines[i].replace(/font-extrabold/g, 'font-medium');
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
