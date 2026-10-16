const fs = require('fs');

// 1. Update LocationDropdown.tsx
let locContent = fs.readFileSync('components/LocationDropdown.tsx', 'utf8');
locContent = locContent.replace(
  /bg-\[\#EDF0F3\]/g,
  'bg-[#F1F4F7]'
);
locContent = locContent.replace(
  /bg-\[\#E2E6EA\]/g,
  'bg-[#E5E9EE]'
);
fs.writeFileSync('components/LocationDropdown.tsx', locContent);

// 2. Update SearchFilterBar.tsx
let searchContent = fs.readFileSync('components/SearchFilterBar.tsx', 'utf8');
searchContent = searchContent.replace(
  /bg-\[\#EDF0F3\]/g,
  'bg-[#F1F4F7]'
);
searchContent = searchContent.replace(
  /bg-\[\#E2E6EA\]/g,
  'bg-[#E5E9EE]'
);

fs.writeFileSync('components/SearchFilterBar.tsx', searchContent);
