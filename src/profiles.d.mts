import type { PlayerProfile, ProfileLibrary, Progress, Story } from './types';

type RestoredProfiles = { library: ProfileLibrary; migrated: boolean; damaged: boolean; resetIds: string[] };
type ProfileStorage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<unknown> };

export const PROFILE_KEY: string;
export const LEGACY_SAVE_KEY: string;
export function emptyProfiles(): ProfileLibrary;
export function normalizePlayerName(name: unknown): string;
export function addPlayer(library: ProfileLibrary, name: string, now?: number): { library: ProfileLibrary; player: PlayerProfile };
export function renamePlayer(library: ProfileLibrary, id: string, name: string): ProfileLibrary;
export function updatePlayerProgress(library: ProfileLibrary, id: string, progress: Progress, now?: number): ProfileLibrary;
export function reconcilePlayers(library: ProfileLibrary, story: Story): { library: ProfileLibrary; resetIds: string[] };
export function restoreProfileLibrary(raw: string | null, legacy: string | null, story: Story, now?: number): RestoredProfiles;
export function createProfileStorage(storage: ProfileStorage): { load: (story: Story) => Promise<RestoredProfiles & { storageAvailable: boolean }>; save: (library: ProfileLibrary) => Promise<void> };
