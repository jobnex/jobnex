const fs = require('fs');

// 1. Update LocationDropdown.tsx
let locContent = fs.readFileSync('components/LocationDropdown.tsx', 'utf8');
locContent = locContent.replace(
  /bg-\[\#F1F4F7\]/g,
  'bg-gray-200'
);
locContent = locContent.replace(
  /bg-\[\#E5E9EE\]/g,
  'bg-gray-300'
);
fs.writeFileSync('components/LocationDropdown.tsx', locContent);

// 2. Update SearchFilterBar.tsx
let searchContent = fs.readFileSync('components/SearchFilterBar.tsx', 'utf8');
searchContent = searchContent.replace(
  /bg-\[\#F1F4F7\]/g,
  'bg-gray-200'
);
searchContent = searchContent.replace(
  /bg-\[\#E5E9EE\]/g,
  'bg-gray-300'
);
searchContent = searchContent.replace(
  /text-gray-700/g,
  'text-gray-800'
);
fs.writeFileSync('components/SearchFilterBar.tsx', searchContent);
