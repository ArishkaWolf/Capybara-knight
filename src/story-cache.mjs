import { validateStory } from './engine.mjs';

export function olderRelease(version, bundledVersion) {
  const pattern = /^(\d{4}-\d{2}-\d{2})\.(\d+)$/;
  const cached = version.match(pattern);
  const bundled = bundledVersion.match(pattern);
  return Boolean(cached && bundled && (cached[1] < bundled[1] || cached[1] === bundled[1] && Number(cached[2]) < Number(bundled[2])));
}

export function restoreStoryCache(raw, bundled) {
  if (!raw) return bundled;
  try {
    const cached = JSON.parse(raw);
    const story = validateStory(cached.story);
    if (typeof cached.baseUrl !== 'string') return bundled;
    const url = new URL(cached.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || olderRelease(story.version, bundled.story.version)) return bundled;
    return { story, baseUrl: url.href };
  } catch {
    return bundled;
  }
}
