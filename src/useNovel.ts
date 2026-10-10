import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { newProgress } from './engine.mjs';
import { addPlayer, emptyProfiles, reconcilePlayers, renamePlayer, updatePlayerProgress } from './profiles.mjs';
import { bundledPackage, restore, saveProfiles, cachePackage, fetchStory } from './repository';
import type { ProfileLibrary, Progress, StoryPackage } from './types';

export function useNovel() {
  const [pack, setPack] = useState(bundledPackage);
  const [library, setLibrary] = useState<ProfileLibrary>(emptyProfiles);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState<StoryPackage | null>(null);
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(false);
  const current = useRef(pack);
  const currentLibrary = useRef(library);
  const selectedId = useRef<string | null>(null);
  const resetProfiles = useRef(new Set<string>());
  const inFlight = useRef(false);
  current.current = pack;
  const activeProfile = library.players.find((player) => player.id === activeId) ?? null;
  const progress: Progress = activeProfile?.progress ?? newProgress(pack.story);
  const hasSave = Boolean(activeProfile?.progress);

  useEffect(() => {
    let active = true;
    restore().then(({ pack: restored, library: restoredLibrary, storageAvailable, migrated, damaged, resetIds }) => {
      if (!active) return;
      setPack(restored);
      currentLibrary.current = restoredLibrary;
      setLibrary(restoredLibrary);
      resetProfiles.current = new Set(resetIds);
      if (!storageAvailable) setNotice('Не удалось сохранить или загрузить данные устройства. Изменения могут остаться только в этой сессии.');
      else if (damaged) setNotice('Часть данных игроков повреждена. Доступные профили восстановлены.');
      else if (resetIds.length) setNotice('Некоторые сохранения несовместимы с историей. Остальные игроки могут продолжить.');
      else if (migrated) setNotice('Твоё сохранение перенесено в профиль «Игрок 1». Его можно переименовать.');
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  function commit(next: ProfileLibrary) {
    currentLibrary.current = next;
    setLibrary(next);
    void saveProfiles(next).catch(() => setNotice('Не удалось сохранить данные игроков на устройстве. Изменения доступны в этой сессии.'));
  }

  function selectPlayer(id: string) {
    if (!ready || !currentLibrary.current.players.some((player) => player.id === id)) return;
    selectedId.current = id;
    setActiveId(id);
    if (resetProfiles.current.has(id)) setNotice('Сохранённая сцена этого игрока недоступна. Можно начать новую историю.');
  }

  function createPlayer(name: string) {
    if (!ready) throw new Error('Профили ещё загружаются.');
    const added = addPlayer(currentLibrary.current, name);
    commit(added.library);
    selectPlayer(added.player.id);
  }

  function changePlayerName(id: string, name: string) {
    if (!ready) throw new Error('Профили ещё загружаются.');
    commit(renamePlayer(currentLibrary.current, id, name));
  }

  function clearPlayer() { selectedId.current = null; setActiveId(null); }

  function change(next: Progress) {
    const id = selectedId.current;
    if (!ready || !id) return;
    resetProfiles.current.delete(id);
    commit(updatePlayerProgress(currentLibrary.current, id, next));
  }

  function resume() {
    const saved = currentLibrary.current.players.find((player) => player.id === selectedId.current)?.progress;
    if (saved) change(saved);
  }

  const checkUpdates = useCallback(async (manual = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setChecking(true);
    try {
      const fresh = await fetchStory();
      if (fresh && fresh.story.version !== current.current.story.version) {
        setPending(fresh);
      } else {
        setPending(null);
        if (manual) setNotice(fresh ? 'У тебя актуальная версия истории.' : 'Хостинг ещё не подключён. Используются встроенные сцены.');
      }
    } catch {
      if (manual) setNotice('Не удалось проверить обновление. Можно продолжить текущую историю.');
    } finally { inFlight.current = false; setChecking(false); }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void checkUpdates();
    const timer = setInterval(() => void checkUpdates(), 60000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void checkUpdates(); });
    const onFocus = () => { if (document.visibilityState === 'visible') void checkUpdates(); };
    if (Platform.OS === 'web') document.addEventListener('visibilitychange', onFocus);
    return () => {
      clearInterval(timer);
      subscription.remove();
      if (Platform.OS === 'web') document.removeEventListener('visibilitychange', onFocus);
    };
  }, [ready, checkUpdates]);

  async function applyUpdate() {
    if (!pending) return;
    const reconciled = reconcilePlayers(currentLibrary.current, pending.story);
    setPack(pending);
    current.current = pending;
    resetProfiles.current = new Set([...resetProfiles.current, ...reconciled.resetIds]);
    commit(reconciled.library);
    setPending(null);
    setNotice(reconciled.resetIds.length ? 'Сюжет обновлён. Для игроков с удалёнными сценами доступна новая история; остальные сохранения сохранены.' : 'Сюжет обновлён для всех игроков. Их сцены и игровые переменные сохранены.');
    try { await cachePackage(pending); } catch { setNotice('История обновлена, но её не удалось сохранить в кэш.'); }
  }

  function restart() { change(newProgress(current.current.story)); }
  return { pack, progress, ready, hasSave, activeProfile, profiles: library.players, pending, notice, checking, setNotice, checkUpdates, applyUpdate, restart, change, resume, selectPlayer, createPlayer, changePlayerName, clearPlayer };
}
