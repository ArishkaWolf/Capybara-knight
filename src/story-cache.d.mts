import type { StoryPackage } from './types';

export function restoreStoryCache(raw: string | null, bundled: StoryPackage): StoryPackage;
export function olderRelease(version: string, bundledVersion: string): boolean;
