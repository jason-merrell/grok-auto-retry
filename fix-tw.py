import re

with open('src/index.ts', 'r') as f:
    content = f.read()

# Fix mangled classList operations
content = re.sub(r'classList\.tw-add\(', 'classList.add(', content)
content = re.sub(r'classList\.tw-remove\(', 'classList.remove(', content)

# Fix className assignments - properly prefix each class
def prefix_classes(match):
    classes = match.group(1)
    # Split by spaces and prefix each class
    prefixed = ' '.join('tw-' + c if not c.startswith('tw-') else c for c in classes.split())
    return f'className = "{prefixed}"'

content = re.sub(r'className = "([^"]+)"', prefix_classes, content)

with open('src/index.ts', 'w') as f:
    f.write(content)

print('✓ Fixed Tailwind prefixes')
