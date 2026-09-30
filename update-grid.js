const fs = require('fs');
let content = fs.readFileSync('components/JobGrid.tsx', 'utf8');

// Remove h-[215px] and h-[310px] wrappers
const loadingLogicToReplace = `  if (isLoading) {
    if (isSplitView) {
      return (
        <div className="flex flex-col gap-3">
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i} className="h-[215px]">
               <JobCardSkeleton compact={true} />
            </div>
          ))}
        </div>
      );
    }
    return (
      <div className={\`grid grid-cols-1 md:grid-cols-2 \${twoColumns ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-6\`}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <div key={i} className="h-[310px]">
             <JobCardSkeleton />
          </div>
        ))}
      </div>
    );
  }`;

const newLoadingLogic = `  if (isLoading) {
    if (isSplitView) {
      return (
        <div className="flex flex-col gap-3">
          {Array.from({ length: skeletonCount }).map((_, i) => (
             <JobCardSkeleton key={i} compact={true} />
          ))}
        </div>
      );
    }
    return (
      <div className={\`grid grid-cols-1 md:grid-cols-2 \${twoColumns ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-6\`}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
           <JobCardSkeleton key={i} />
        ))}
      </div>
    );
  }`;

content = content.replace(loadingLogicToReplace, newLoadingLogic);

fs.writeFileSync('components/JobGrid.tsx', content);
