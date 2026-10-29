import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Every t('some.key') in the UI must exist in lib/i18n.tsx in all three
// languages; otherwise the raw key ends up on screen.
const root = path.resolve(__dirname, '..');
const source = readFileSync(path.join(root, 'lib/i18n.tsx'), 'utf8');
const dictSource = source.slice(source.indexOf('const dict = ') + 'const dict = '.length, source.indexOf('\n} as const;') + 2);
// eslint-disable-next-line no-new-func
const dict = new Function(`return (${dictSource});`)();

function lookup(key: string) {
  return key.split('.').reduce((node: any, part) => node?.[part], dict);
}

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

const ui = ['app', 'components', 'hooks'].flatMap((d) => files(path.join(root, d)));

describe('translations', () => {
  const used = new Set<string>();
  const prefixes = new Set<string>();
  for (const file of ui) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/\bt\(\s*'([\w.-]+)'/g)) used.add(m[1]);
    for (const m of text.matchAll(/\bt\(`(\w+)\.\$\{/g)) prefixes.add(m[1]);
  }

  it('finds the keys used by the UI', () => {
    expect(used.size).toBeGreaterThan(30);
  });

  it.each([...used])('%s exists in id, en and zh', (key) => {
    const entry = lookup(key);
    expect(entry, key).toBeDefined();
    for (const lang of ['id', 'en', 'zh']) expect(typeof entry[lang], `${key}.${lang}`).toBe('string');
  });

  it.each([...prefixes])('every option under %s is translated', (prefix) => {
    for (const [key, entry] of Object.entries(lookup(prefix) as Record<string, any>)) {
      for (const lang of ['id', 'en', 'zh']) expect(typeof entry[lang], `${prefix}.${key}.${lang}`).toBe('string');
    }
  });
});
