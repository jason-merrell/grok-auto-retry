const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'index.ts');
let content = fs.readFileSync(filePath, 'utf8');

// Fix classList operations that got mangled
content = content.replace(/classList\.tw-add\(/g, 'classList.add(\'tw-');
content = content.replace(/classList\.tw-remove\(/g, 'classList.remove(\'tw-');

// Add closing quotes for classList operations
content = content.replace(/classList\.add\('tw-([^']+)'\)/g, (match, classes) => {
  const prefixed = classes.split(' ').map(c => 'tw-' + c).join(' ');
  return `classList.add('${prefixed}')`;
});

content = content.replace(/classList\.remove\('tw-([^']+)'\)/g, (match, classes) => {
  const prefixed = classes.split(' ').map(c => 'tw-' + c).join(' ');
  return `classList.remove('${prefixed}')`;
});

// Fix className assignments - add tw- prefix to each class
content = content.replace(/className = "tw-([^"]+)"/g, (match, classes) => {
  // Already has tw- prefix from sed, fix by removing double prefix
  const fixed = classes.replace(/tw-/g, '');
  const prefixed = fixed.split(' ').map(c => {
    // Don't prefix arbitrary values or special syntax
    if (c.includes('[') || c.includes(':') || c.includes('/')) {
      return 'tw-' + c;
    }
    return 'tw-' + c;
  }).join(' ');
  return `className = "${prefixed}"`;
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('✓ Fixed Tailwind class prefixes');
