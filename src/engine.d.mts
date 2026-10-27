import type { Choice, Condition, DialogueLine, EvidenceId, FlagId, GameState, Progress, Scene, Story } from './types';

export const EVIDENCE_IDS: readonly EvidenceId[];
export const FLAG_IDS: readonly FlagId[];
export function initialState(): GameState;
export function matchesCondition(condition: Condition | undefined, state: GameState): boolean;
export function sceneLines(scene: Scene, state: GameState): DialogueLine[];
export function sceneChoices(scene: Scene, state: GameState): Choice[];
export function nextScene(scene: Scene, state: GameState): string | null;
export function validateStory(value: unknown): Story;
export function newProgress(story: Story): Progress;
export function rewindChapter(story: Story, progress: Progress, chapterId: string): Progress;
export function dialogueForPlayer(line: DialogueLine, name: string): DialogueLine;
export function reconcileProgress(story: Story, saved: unknown): { progress: Progress; reset: boolean };
export function advance(story: Story, progress: Progress): Progress;
export function choose(story: Story, progress: Progress, choiceId: string): Progress;
export function inspect(story: Story, progress: Progress, clueId: EvidenceId): Progress;
export function finishSearch(story: Story, progress: Progress): Progress;
export function interact(story: Story, progress: Progress, itemId: string): Progress;
