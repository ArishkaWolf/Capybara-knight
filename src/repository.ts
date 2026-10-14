import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import bundled from '../assets/story.json';
import { validateStory } from './engine.mjs';
import { createProfileStorage } from './profiles.mjs';
import { restoreStoryCache } from './story-cache.mjs';
import type { StoryPackage } from './types';

const CACHE_KEY = 'capybara.story.v1';
export const bundledPackage: StoryPackage = { story: validateStory(bundled), baseUrl: null };
const profileStorage = createProfileStorage(AsyncStorage);
export const saveProfiles = profileStorage.save;

export async function restore() {
  let pack = bundledPackage;
  let storageAvailable = true;
  try {
    const cache = await AsyncStorage.getItem(CACHE_KEY);
    pack = restoreStoryCache(cache, bundledPackage);
  } catch { storageAvailable = false; }
  const profiles = await profileStorage.load(pack.story);
  return { pack, ...profiles, storageAvailable: storageAvailable && profiles.storageAvailable };
}

export async function cachePackage(pack: StoryPackage) {
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(pack));
}

function storyUrl() {
  const configured = process.env.EXPO_PUBLIC_STORY_URL;
  if (configured) return new URL(configured);
  if (Platform.OS === 'web' && typeof window !== 'undefined') return new URL('story.json', window.location.href);
  return null;
}

export async function fetchStory(): Promise<StoryPackage | null> {
  const url = storyUrl();
  if (!url) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    url.searchParams.set('_check', String(Date.now()));
    const response = await fetch(url.toString(), { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const story = validateStory(await response.json());
    return { story, baseUrl: new URL('./', url).toString() };
  } finally { clearTimeout(timeout); }
}

export function imageUrl(pack: StoryPackage, image: string) {
  if (!pack.baseUrl) return null;
  const url = new URL(image, pack.baseUrl);
  url.searchParams.set('v', pack.story.version);
  return url.toString();
}
