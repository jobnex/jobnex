const fs = require('fs');
let content = fs.readFileSync('app/(main)/page.tsx', 'utf8');

// Restore LoaderDots import if missing
if (!content.includes('LoaderDots')) {
  content = `import { LoaderDots } from "@/components/ui/LoaderDots";\n` + content;
}

// Restore isLoading dots logic
const newLoadingLogic = `        {isLoading ? (
          <div className="flex justify-center py-20">
            <LoaderDots className="w-12 h-12" />
          </div>
        ) : isError ? (
          <div className="text-center text-red-500 py-10 font-bold">
            Failed to load jobs. Please try again later.
          </div>
        ) : (
          <div>`;

const oldLoadingLogic = `        {isError ? (
          <div className="text-center text-red-500 py-10 font-bold">
            Failed to load jobs. Please try again later.
          </div>
        ) : (
          <div>`;

content = content.replace(oldLoadingLogic, newLoadingLogic);

// Fix JobGrid isLoading prop
content = content.replace(
  /isLoading={isLoading \|\| isFetching}/g,
  'isLoading={isFetching && !isLoading}'
);

fs.writeFileSync('app/(main)/page.tsx', content);
