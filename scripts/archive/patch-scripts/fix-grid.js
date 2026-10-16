const fs = require('fs');
let content = fs.readFileSync('app/(main)/job-hunt/manage/page.tsx', 'utf8');

// Revert Responsibilities pt-2
content = content.replace(
  '<div className="space-y-2.5 md:col-span-2 pt-2">\n                            <label className="block text-sm font-bold">Responsibilities & Achievements</label>',
  '<div className="space-y-2.5 md:col-span-2">\n                            <label className="block text-sm font-bold">Responsibilities & Achievements</label>'
);

// Revert descriptions
content = content.replace(
  '<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">\n                <p className="text-[0.825rem] text-gray-500 dark:text-gray-400 font-medium">Add past roles to showcase your career progression.</p>',
  '<div className="flex justify-end pt-1">'
);

content = content.replace(
  '<div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">\n                <p className="text-[0.825rem] text-gray-500 dark:text-gray-400 font-medium">Add relevant degrees or certifications to bolster your profile.</p>',
  '<div className="flex justify-end pt-1">'
);

// Fix SkillsSelector and DomainsSelector components
content = content.replace(
  '<div className="space-y-2.5 flex flex-col h-full">',
  '<div className="flex-1 flex flex-col gap-2.5 min-h-0">'
);
content = content.replace(
  '<div className="space-y-2.5 flex flex-col h-full">',
  '<div className="flex-1 flex flex-col gap-2.5 min-h-0">'
);

// Fix grid wrappers
content = content.replace(
  '<div className="space-y-2.5">\n                            <label className="block text-sm font-bold">Domains</label>',
  '<div className="flex flex-col h-full gap-2.5">\n                            <label className="block text-sm font-bold shrink-0">Domains</label>'
);

content = content.replace(
  '<div className="space-y-2.5">\n                            <label className="block text-sm font-bold">Skills</label>',
  '<div className="flex flex-col h-full gap-2.5">\n                            <label className="block text-sm font-bold shrink-0">Skills</label>'
);

fs.writeFileSync('app/(main)/job-hunt/manage/page.tsx', content);
