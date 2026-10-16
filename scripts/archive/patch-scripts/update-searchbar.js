const fs = require('fs');
let content = fs.readFileSync('components/SearchFilterBar.tsx', 'utf8');

// 1. FilterResetBlock background
content = content.replace(
  `? 'h-[48px] px-1 bg-gray-50 border-2 border-transparent rounded-[12px] dark:bg-[#202330] shadow-sm'`,
  `? 'h-[48px] px-1 bg-gray-100 border-2 border-transparent rounded-[12px] dark:bg-[#202330]'`
);
content = content.replace(
  `: 'h-[36px] bg-gray-50 border-[1.5px] border-transparent rounded-[10px] dark:bg-[#202330]'`,
  `: 'h-[36px] bg-gray-100 border-[1.5px] border-transparent rounded-[10px] dark:bg-[#202330]'`
);

// 2. Search input background and shadow removal
content = content.replace(
  `className={\`w-full h-[48px] pl-11 pr-10 font-body text-[1rem] font-medium text-gray-900 bg-gray-50 border-2 border-transparent rounded-[12px] outline-none transition-all duration-150 focus:bg-white focus:border-black dark:bg-[#202330] dark:text-white dark:focus:bg-[#1A1C24] dark:focus:border-white placeholder:text-gray-400 placeholder:font-medium \${variant === 'saved' ? 'shadow-sm' : ''}\`}`,
  `className={\`w-full h-[48px] pl-11 pr-10 font-body text-[1rem] font-medium text-gray-900 bg-gray-100 border-2 border-transparent rounded-[12px] outline-none transition-all duration-150 focus:bg-white focus:border-black dark:bg-[#202330] dark:text-white dark:focus:bg-[#1A1C24] dark:focus:border-white placeholder:text-gray-400 placeholder:font-medium\`}`
);

// 3. Filter pills inactive background
const inactivePillOld = `: "rounded-[20px] hover:rounded-[10px] bg-gray-50 text-gray-700 border-transparent hover:bg-gray-100 dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"`;
const inactivePillNew = `: "rounded-[20px] hover:rounded-[10px] bg-gray-100 text-gray-700 border-transparent hover:bg-gray-200 dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"`;
content = content.split(inactivePillOld).join(inactivePillNew);

fs.writeFileSync('components/SearchFilterBar.tsx', content);
