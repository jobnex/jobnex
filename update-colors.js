const fs = require('fs');

// 1. Update LocationDropdown.tsx
let locContent = fs.readFileSync('components/LocationDropdown.tsx', 'utf8');
locContent = locContent.replace(
  'bg-gray-100 border-[1.5px] border-transparent rounded-[12px] outline-none cursor-pointer transition-all duration-150 focus:border-black dark:bg-[#202330]',
  'bg-gray-200 border-[1.5px] border-transparent rounded-[12px] outline-none cursor-pointer transition-all duration-150 focus:border-black dark:bg-[#202330]'
);
locContent = locContent.replace(
  'border-black dark:border-white bg-gray-200 dark:bg-[#1A1C24]',
  'border-black dark:border-white bg-gray-300 dark:bg-[#1A1C24]'
);
locContent = locContent.replace(
  'hover:bg-gray-200 hover:border-gray-300 dark:hover:border-[#383D52]',
  'hover:bg-gray-300 hover:border-gray-400 dark:hover:border-[#383D52]'
);
fs.writeFileSync('components/LocationDropdown.tsx', locContent);

// 2. Update SearchFilterBar.tsx
let searchContent = fs.readFileSync('components/SearchFilterBar.tsx', 'utf8');

// FilterResetBlock backgrounds
searchContent = searchContent.replace(
  `? 'h-[48px] px-1 bg-gray-100 border-2 border-transparent rounded-[12px] dark:bg-[#202330]'`,
  `? 'h-[48px] px-1 bg-gray-200 border-2 border-transparent rounded-[12px] dark:bg-[#202330]'`
);
searchContent = searchContent.replace(
  `: 'h-[36px] bg-gray-100 border-[1.5px] border-transparent rounded-[10px] dark:bg-[#202330]'`,
  `: 'h-[36px] bg-gray-200 border-[1.5px] border-transparent rounded-[10px] dark:bg-[#202330]'`
);

// Reset filter button hover
searchContent = searchContent.replace(
  /hover:bg-gray-100/g,
  'hover:bg-gray-200'
);

// Search input background
searchContent = searchContent.replace(
  `bg-gray-100 border-2 border-transparent rounded-[12px] outline-none transition-all duration-150 focus:bg-white`,
  `bg-gray-200 border-2 border-transparent rounded-[12px] outline-none transition-all duration-150 focus:bg-white`
);

// Pill inactive backgrounds
const oldInactive = `: "rounded-[20px] hover:rounded-[10px] bg-gray-100 text-gray-700 border-transparent hover:bg-gray-200 dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"`;
const newInactive = `: "rounded-[20px] hover:rounded-[10px] bg-gray-200 text-gray-800 border-transparent hover:bg-gray-300 dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"`;
searchContent = searchContent.split(oldInactive).join(newInactive);

fs.writeFileSync('components/SearchFilterBar.tsx', searchContent);
