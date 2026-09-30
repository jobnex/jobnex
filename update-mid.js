const fs = require('fs');

// 1. Update LocationDropdown.tsx
let locContent = fs.readFileSync('components/LocationDropdown.tsx', 'utf8');
locContent = locContent.replace(
  /bg-gray-200/g,
  'bg-[#EDF0F3]'
);
locContent = locContent.replace(
  /bg-gray-300/g,
  'bg-[#E2E6EA]'
);
// Re-adjust hover border color if needed
locContent = locContent.replace(
  /hover:border-gray-400/g,
  'hover:border-gray-300'
);
fs.writeFileSync('components/LocationDropdown.tsx', locContent);

// 2. Update SearchFilterBar.tsx
let searchContent = fs.readFileSync('components/SearchFilterBar.tsx', 'utf8');

searchContent = searchContent.replace(
  /bg-gray-200/g,
  'bg-[#EDF0F3]'
);
searchContent = searchContent.replace(
  /bg-gray-300/g,
  'bg-[#E2E6EA]'
);
searchContent = searchContent.replace(
  /text-gray-800/g,
  'text-gray-700'
);

fs.writeFileSync('components/SearchFilterBar.tsx', searchContent);
