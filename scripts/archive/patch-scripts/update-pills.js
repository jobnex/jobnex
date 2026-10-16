const fs = require('fs');
let content = fs.readFileSync('components/SearchFilterBar.tsx', 'utf8');

const searchString = 'className={`inline-flex items-center justify-center h-[34px] px-[0.95rem] text-[0.84rem] font-semibold leading-none tracking-[-0.01em] rounded-full border transition-all duration-150 select-none cursor-pointer whitespace-nowrap shrink-0';
const replacement = 'className={`inline-flex items-center justify-center px-4 py-[0.45rem] text-[0.875rem] transition-all duration-200 ease-out select-none cursor-pointer whitespace-nowrap shrink-0 border-[1.5px]';

const activeString = '? "bg-brand-dark text-white border-brand-dark shadow-[0_1px_3px_rgba(0,0,0,0.08)] dark:bg-white dark:text-[#111827] dark:border-white dark:shadow-[0_1px_4px_rgba(0,0,0,0.25)] font-bold"';
const newActiveString = '? "rounded-[10px] bg-black text-white border-black font-semibold dark:bg-white dark:text-black dark:border-white shadow-xs"';

const inactiveString = ': "bg-bg-input text-text-muted border-border-subtle hover:bg-white hover:text-text-primary hover:border-border-input dark:bg-bg-input dark:border-border-subtle dark:text-text-muted dark:hover:bg-[#222534] dark:hover:text-white dark:hover:border-border-input font-medium"';
const newInactiveString = ': "rounded-[20px] hover:rounded-[10px] bg-gray-50 text-gray-700 border-transparent hover:bg-gray-100 dark:bg-[#202330] dark:text-gray-300 dark:hover:bg-[#2B3042] font-medium"';

content = content.split(searchString).join(replacement);
content = content.split(activeString).join(newActiveString);
content = content.split(inactiveString).join(newInactiveString);

fs.writeFileSync('components/SearchFilterBar.tsx', content);
