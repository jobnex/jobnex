const fs = require('fs');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = dir + '/' + f;
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else if (dirPath.endsWith('.tsx') || dirPath.endsWith('.ts')) {
      callback(dirPath);
    }
  });
}

walkDir('app', processFile);
walkDir('components', processFile);

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  if (content.includes('Loader2') && !filePath.includes('LoaderDots.tsx')) {
    if (content.includes('from "lucide-react"')) {
      content = content.replace(/import\s+\{([^}]*?)Loader2([^}]*?)\}\s+from\s+"lucide-react";?/g, (match, p1, p2) => {
        const remaining = (p1 + p2).replace(/,\s*,/g, ',').replace(/(^,\s*)|(\s*,\s*$)/g, '').trim();
        if (remaining) {
          return `import { ${remaining} } from "lucide-react";\nimport { LoaderDots } from "@/components/ui/LoaderDots";`;
        }
        return `import { LoaderDots } from "@/components/ui/LoaderDots";`;
      });
      changed = true;
    }
    
    content = content.replace(/<Loader2([\s\S]*?)\/>/g, (match, p1) => {
      let newProps = p1.replace(/animate-spin/g, '');
      newProps = newProps.replace(/text-text-primary/g, '');
      newProps = newProps.replace(/text-brand-dark dark:text-brand-lime/g, '');
      newProps = newProps.replace(/text-brand-dark/g, '');
      return `<LoaderDots${newProps}/>`;
    });
    changed = true;
  }

  const customLoaderRegex = /<div className="animate-spin[^>]*><\/div>/g;
  if (customLoaderRegex.test(content)) {
    content = content.replace(customLoaderRegex, (match) => {
      const hMatch = match.match(/h-\d+/);
      const wMatch = match.match(/w-\d+/);
      const hClass = hMatch ? hMatch[0] : 'h-12';
      const wClass = wMatch ? wMatch[0] : 'w-12';
      
      let newImport = '';
      if (!content.includes('LoaderDots')) {
        newImport = `import { LoaderDots } from "@/components/ui/LoaderDots";\n`;
      }
      return newImport + `<LoaderDots className="${wClass} ${hClass}" />`;
    });
    // For app/(main)/page.tsx the customLoaderRegex replaces inline, 
    // but the import might be injected inline.
    // Let's do the import injection at the top instead.
    content = content.replace(/import \{ LoaderDots \} from "@\/components\/ui\/LoaderDots";\n<LoaderDots/g, '<LoaderDots');
    if (!content.includes('import { LoaderDots }') && changed) {
       // Insert at line 1
       content = `import { LoaderDots } from "@/components/ui/LoaderDots";\n` + content;
    }

    changed = true;
  }

  if (changed) {
    fs.writeFileSync(filePath, content);
    console.log('Updated ' + filePath);
  }
}
