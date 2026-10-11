import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, BackHandler, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Dialogue } from './src/Dialogue';
import { Inspection } from './src/Inspection';
import { SceneInteraction } from './src/SceneInteraction';
import { PlayerSelect } from './src/PlayerSelect';
import { bundledImages } from './src/assets';
import { advance, choose, inspect, finishSearch, interact, sceneLines, sceneChoices } from './src/engine.mjs';
import { bundledPackage, imageUrl } from './src/repository';
import { useNovel } from './src/useNovel';
import type { EvidenceId, Progress } from './src/types';

const serif = Platform.OS === 'web' ? 'Georgia, serif' : Platform.OS === 'ios' ? 'Georgia' : 'serif';

function Button({ label, onPress, light = false, disabled = false }: { label: string; onPress: () => void; light?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, light && styles.lightButton, disabled && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}><Text style={[styles.buttonText, light && { color: '#302418' }]}>{label}</Text></Pressable>;
}

function Novel() {
  const novel = useNovel();
  const { pack, progress } = novel;
  const windowSize = useWindowDimensions();
  const [layout, setLayout] = useState<{ width: number; height: number } | null>(null);
  const { width, height } = layout ?? windowSize;
  const insets = useSafeAreaInsets();
  const compact = height < 600 || width < 900;
  const portrait = height > width;
  const shortScreen = height < 500 && !portrait;
  const [screen, setScreen] = useState<'profiles' | 'home' | 'game'>('profiles');
  const choosingPlayer = screen === 'profiles' || !novel.activeProfile;
  const [menu, setMenu] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [typing, setTyping] = useState(false);
  const [complete, setComplete] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [loadedImageKey, setLoadedImageKey] = useState('');
  const [failedImageKey, setFailedImageKey] = useState('');
  const [retry, setRetry] = useState(0);
  const [fallbackKey, setFallbackKey] = useState('');
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [inspection, setInspection] = useState<{ key: string; id: EvidenceId; line: number } | null>(null);
  const lastTap = useRef(0);
  const scene = pack.story.scenes.find((item) => item.id === progress.sceneId)!;
  const background = choosingPlayer || screen === 'home' ? pack.story.scenes.find((item) => item.id === pack.story.startScene)! : scene;
  const uri = imageUrl(pack, background.image);
  const imageKey = `${background.image}:${pack.story.version}:${retry}:${uri}`;
  const imageReady = loadedImageKey === imageKey;
  const imageError = failedImageKey === imageKey;
  const source = uri && fallbackKey !== imageKey ? { uri: `${uri}&retry=${retry}` } : bundledImages[background.image];
  const interactiveBackground = Boolean(background.search || background.interaction);
  const lines = sceneLines(scene, progress.state);
  const availableChoices = sceneChoices(scene, progress.state);
  const activeInspection = progress.searching && inspection?.key === `${pack.story.version}:${scene.id}` ? scene.search?.hotspots.find((item) => item.id === inspection.id) : undefined;
  const line = activeInspection && inspection ? activeInspection.dialogues[inspection.line] : !progress.searching && !progress.interacting && progress.line >= 0 ? lines[progress.line] : undefined;
  const showChoices = screen === 'game' && !progress.ending && !progress.searching && !progress.interacting && !typing && progress.line === lines.length - 1 && availableChoices.length > 0;
  const sceneIndex = pack.story.scenes.indexOf(scene);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    const activity = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => { sub.remove(); activity.remove(); };
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const rotation = screen === 'game' ? ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE) : ScreenOrientation.unlockAsync();
    void rotation.catch(() => undefined);
  }, [screen]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menu) { setMenu(false); setConfirmRestart(false); return true; }
      if (screen === 'game') { setMenu(true); return true; }
      if (screen === 'home') { showPlayers(); return true; }
      return false;
    });
    return () => back.remove();
  });

  useEffect(() => {
    if (screen !== 'game' || !foreground) return;
    const next = pack.story.scenes.find((item) => item.id === scene.next);
    if (next) {
      const nextUri = imageUrl(pack, next.image);
      if (nextUri) void Image.prefetch(nextUri, { cachePolicy: 'disk' }).catch(() => undefined);
    }
  }, [screen, scene.next, pack, foreground]);

  const onTyping = useCallback((value: boolean) => setTyping(value), []);

  function move(next: Progress) {
    setInspection(null);
    setComplete(false);
    setTyping(next.line >= 0 && !next.ending && !reducedMotion);
    novel.change(next);
  }

  function next() {
    if (screen !== 'game' || menu || portrait || !imageReady || progress.ending) return;
    if (typing) { setComplete(true); setTyping(false); return; }
    if (Date.now() - lastTap.current < 180) return;
    lastTap.current = Date.now();
    if (progress.searching) {
      if (!activeInspection || !inspection) return;
      if (inspection.line < activeInspection.dialogues.length - 1) {
        setInspection({ ...inspection, line: inspection.line + 1 }); setComplete(false); setTyping(!reducedMotion);
      } else { setInspection(null); setComplete(false); setTyping(false); }
      return;
    }
    const updated = advance(pack.story, progress) as Progress;
    if (updated !== progress) move(updated);
  }

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const keyDown = (event: KeyboardEvent) => {
      if (event.repeat || (event.target instanceof HTMLElement && event.target.closest('[role="button"], button, input, textarea'))) return;
      if (['ArrowRight', ' ', 'Enter'].includes(event.key)) { event.preventDefault(); next(); }
      if (event.key === 'Escape' && screen === 'game') setMenu((current) => !current);
    };
    window.addEventListener('keydown', keyDown);
    return () => window.removeEventListener('keydown', keyDown);
  });

  async function fullscreen() {
    if (Platform.OS !== 'web') return;
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
      const orientation = window.screen.orientation as unknown as { lock?: (orientation: string) => Promise<void> };
      if (document.fullscreenElement) await orientation?.lock?.('landscape');
    } catch { novel.setNotice('Полноэкранный режим недоступен в этом браузере.'); }
  }

  function startFresh() {
    novel.restart(); setInspection(null); setScreen('game'); setMenu(false); setConfirmRestart(false); setComplete(false); setTyping(false);
  }

  function showPlayers() {
    setScreen('profiles'); setMenu(false); setConfirmRestart(false); setInspection(null); setTyping(false); setComplete(false);
    novel.clearPlayer();
  }

  function selectPlayer(id: string) {
    novel.selectPlayer(id); setScreen('home'); setInspection(null); setComplete(false); setTyping(false); lastTap.current = 0;
  }

  function inspectClue(id: EvidenceId) {
    if (!imageReady || !progress.searching || activeInspection) return;
    novel.change(inspect(pack.story, progress, id) as Progress);
    setInspection({ key: `${pack.story.version}:${scene.id}`, id, line: 0 });
    setComplete(false); setTyping(!reducedMotion);
  }

  function closeInspection() { setInspection(null); setComplete(false); setTyping(false); }

  const choices = showChoices ? <View style={styles.choices}>{availableChoices.map((choice, i) => <Pressable key={choice.id} accessibilityRole="button" accessibilityLabel={choice.label} onPress={() => { if (imageReady) move(choose(pack.story, progress, choice.id) as Progress); }} style={({ pressed }) => [styles.choice, availableChoices.length > 2 && { flexBasis: width < 760 ? '45%' : '30%' }, pressed && { backgroundColor: '#eadbc5' }]}><Text style={styles.choiceNumber}>{String(i + 1).padStart(2, '0')}</Text><Text style={styles.choiceText}>{choice.label}</Text><Text style={styles.choiceArrow}>→</Text></Pressable>)}</View> : null;
  const playerSwitcher = <Pressable accessibilityRole="button" accessibilityLabel="Сменить игрока" onPress={showPlayers} style={[styles.playerSwitch, !portrait && { position: 'absolute', bottom: Math.max(18, insets.bottom + 12), left: Math.max(24, insets.left + 18), maxWidth: width * 0.4 }]}><Text numberOfLines={2} style={styles.currentPlayer}>Играет: {novel.activeProfile?.name}</Text><Text style={styles.switchLabel}>Сменить игрока →</Text></Pressable>;

  return <View style={styles.root} onLayout={({ nativeEvent }) => setLayout({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })}>
    <StatusBar hidden />
    <Image key={`${imageKey}:${fallbackKey === imageKey}`} source={source} contentFit={interactiveBackground ? 'contain' : 'cover'} cachePolicy="disk" transition={reducedMotion ? 0 : 300} style={[StyleSheet.absoluteFill, interactiveBackground && { top: insets.top, bottom: insets.bottom, left: insets.left, right: insets.right }]} onLoad={() => setLoadedImageKey(imageKey)} onError={() => {
      if (uri && fallbackKey !== imageKey && bundledImages[background.image] && pack.story.version === bundledPackage.story.version) setFallbackKey(imageKey);
      else setFailedImageKey(imageKey);
    }} accessible={false} />
    {choosingPlayer ? <PlayerSelect players={novel.profiles} story={pack.story} ready={novel.ready} compact={compact} topInset={insets.top} bottomInset={insets.bottom} leftInset={insets.left} rightInset={insets.right} notice={novel.notice} onSelect={selectPlayer} onCreate={(name) => { novel.createPlayer(name); setScreen('home'); }} onRename={novel.changePlayerName} /> : screen === 'home' ? <>
      <View style={styles.homeShade} />
      <ScrollView style={[styles.homeScroll, { right: portrait ? insets.right + 24 : Math.max(insets.right + 24, width * 0.07), width: portrait ? width - insets.left - insets.right - 48 : Math.min(width * 0.49, 550) }]} contentContainerStyle={[styles.homeContent, { paddingTop: Math.max(shortScreen ? 60 : 80, insets.top + 52), paddingBottom: Math.max(24, insets.bottom + 20) }]}>
        <Text style={styles.eyebrow}>НЕБОЛЬШАЯ ВИЗУАЛЬНАЯ НОВЕЛЛА</Text>
        <Text accessibilityRole="header" style={[styles.title, { fontFamily: serif, fontSize: compact ? height < 360 ? 38 : 46 : 78 }, shortScreen && { marginTop: 8 }]}>Капибара{ '\n' }рыцарь</Text>
        <View style={[styles.goldLine, shortScreen && { marginVertical: 8 }]} />
        <Text style={[styles.description, compact && { fontSize: 14, lineHeight: 21 }]}>Тихий путник. Незнакомая дорога.{ '\n' }История, в которой решаешь ты.</Text>
        <View style={[styles.startButtons, compact && { marginTop: shortScreen ? 12 : 20 }]}>
          {novel.hasSave && <Button label="Продолжить историю →" disabled={!novel.ready} onPress={() => { novel.resume(); setScreen('game'); setComplete(false); setTyping(progress.line >= 0 && !reducedMotion); }} />}
          <Button label={novel.hasSave ? 'Начать заново' : 'Начать историю →'} disabled={!novel.ready} light onPress={() => novel.hasSave ? (setConfirmRestart(true), setMenu(true)) : startFresh()} />
        </View>
        {portrait && playerSwitcher}
      </ScrollView>
      {!portrait && playerSwitcher}
    </> : <>
      <Pressable accessibilityRole="button" accessibilityLabel={progress.interacting ? scene.interaction?.hint ?? 'Сначала прочитай записку на стойке' : progress.searching && !activeInspection ? 'Осматривай предметы на картинке' : showChoices ? 'Сначала выбери действие в диалоге' : typing ? 'Показать реплику целиком' : 'Следующая реплика или сцена'} onPress={next} style={styles.tapArea} />
      <View pointerEvents="none" style={[styles.sceneHeading, { top: Math.max(20, insets.top + 12), left: Math.max(24, insets.left + 18) }]}>
        <Text style={styles.chapter}>{scene.chapter}</Text>
        <Text style={styles.counter}>{String(sceneIndex + 1).padStart(2, '0')} / {String(pack.story.scenes.length).padStart(2, '0')}</Text>
      </View>
      {progress.searching && scene.search && imageReady && !progress.ending && <Inspection key={`${pack.story.version}:${scene.id}`} search={scene.search} evidence={progress.state.evidence ?? []} width={width} height={height} insets={insets} busy={Boolean(activeInspection)} onInspect={inspectClue} onFinish={() => move(finishSearch(pack.story, progress) as Progress)} />}
      {progress.interacting && scene.interaction && imageReady && !progress.ending && <SceneInteraction key={`${pack.story.version}:${scene.id}`} interaction={scene.interaction} width={width} height={height} insets={insets} onInteract={(id) => { if (!menu && !portrait) move(interact(pack.story, progress, id) as Progress); }} />}
      {!progress.ending && imageReady && <View pointerEvents="box-none" style={[styles.dialoguePosition, { left: Math.max(24, insets.left + 16, (width - 1180) / 2), right: Math.max(24, insets.right + 16, (width - 1180) / 2), bottom: Math.max(22, insets.bottom + 14) }]}>
        {line ? <Dialogue key={`${pack.story.version}:${scene.id}:${activeInspection && inspection ? `${inspection.id}:${inspection.line}` : progress.line}`} line={line} complete={complete} reducedMotion={reducedMotion} paused={menu || portrait || !foreground} compact={compact} maxHeight={Math.max(100, height - insets.top - insets.bottom - 100) * 0.85} onTyping={onTyping} onAdvance={(pageX) => { if (pageX >= width / 2) next(); }}>
          {choices}
          <Pressable accessibilityRole="button" accessibilityLabel="Продолжить чтение" onPress={next} style={styles.dialogueFooter}><Text style={styles.dialogueHint}>{showChoices ? 'Выбери один из вариантов' : typing ? 'Нажми справа, чтобы показать текст' : activeInspection ? 'Нажми справа, чтобы продолжить осмотр' : 'Нажми на правую часть экрана'}</Text><Text style={styles.nextArrow}>{showChoices ? '◇' : '→'}</Text></Pressable>
          {activeInspection && <Pressable accessibilityRole="button" accessibilityLabel="Вернуться к осмотру" onPress={closeInspection} style={styles.returnToSearch}><Text style={styles.returnToSearchText}>Вернуться к осмотру</Text></Pressable>}
        </Dialogue> : choices ? <ScrollView style={[styles.emptyChoiceCard, { maxHeight: height * 0.65 }]} contentContainerStyle={{ padding: 20 }}><Text style={styles.choicePrompt}>Как ты поступишь?</Text>{choices}</ScrollView> : !progress.searching && !progress.interacting ? <View pointerEvents="none" style={styles.sceneHint}><Text style={styles.sceneHintText}>Нажми справа, чтобы продолжить  →</Text></View> : null}
      </View>}
      {progress.ending && <View style={styles.overlay}>
        <ScrollView contentContainerStyle={[styles.modalScroll, { paddingTop: Math.max(80, insets.top + 72), paddingBottom: Math.max(20, insets.bottom + 12) }]} style={{ width: '100%' }}>
          <View style={[styles.endCard, compact && { padding: 24 }]}>
            <Text style={styles.eyebrow}>КОНЕЦ ЭТОЙ ГЛАВЫ</Text><Text style={[styles.endTitle, { fontFamily: serif }]}>{progress.ending.title}</Text><Text style={styles.endText}>{progress.ending.text}</Text>
            <View style={styles.endButtons}><Button label="Начать заново" light onPress={startFresh} /><Button label="Главное меню" onPress={() => setScreen('home')} /></View>
          </View>
        </ScrollView>
      </View>}
    </>}

    <View style={[styles.toolbar, { top: Math.max(16, insets.top + 10), right: Math.max(20, insets.right + 12) }]}>
      {Platform.OS === 'web' && <Pressable accessibilityRole="button" accessibilityLabel="Полный экран" onPress={fullscreen} style={styles.iconButton}><Text style={styles.icon}>⛶</Text></Pressable>}
      {!choosingPlayer && <Pressable accessibilityRole="button" accessibilityLabel="Открыть меню" onPress={() => { setConfirmRestart(false); setMenu(true); }} style={styles.iconButton}><Text style={styles.menuIcon}>•••</Text></Pressable>}
    </View>

    {!choosingPlayer && !imageReady && !imageError && <View pointerEvents="none" style={styles.loading}><ActivityIndicator color="#e1bf84" /><Text style={styles.loadingText}>Открываем сцену…</Text></View>}
    {!choosingPlayer && imageError && <View style={styles.overlay}><View style={styles.errorCard}><Text style={styles.errorTitle}>Не удалось открыть картинку</Text><Text style={styles.endText}>Проверь подключение и попробуй ещё раз.</Text><Button label="Повторить" light onPress={() => setRetry((value) => value + 1)} /><Button label="В меню" onPress={() => setScreen('home')} /></View></View>}

    {!choosingPlayer && novel.pending && !menu && <View style={[styles.update, { top: Math.max(74, insets.top + 66) }]}><Text style={styles.updateText}>Доступно обновление истории</Text><Pressable accessibilityRole="button" onPress={() => { setComplete(false); setTyping(false); void novel.applyUpdate(); }}><Text style={styles.updateAction}>Обновить ↻</Text></Pressable></View>}
    {!choosingPlayer && Boolean(novel.notice) && !menu && <Pressable accessibilityRole="button" accessibilityLabel={`${novel.notice} Закрыть уведомление`} onPress={() => novel.setNotice('')} style={styles.notice}><Text style={styles.noticeText}>{novel.notice}  ×</Text></Pressable>}

    <Modal visible={menu} transparent animationType={reducedMotion ? 'none' : 'fade'} supportedOrientations={['portrait', 'landscape-left', 'landscape-right']} onRequestClose={() => { setMenu(false); setConfirmRestart(false); }}>
      <View style={styles.overlay}><ScrollView style={{ width: '100%' }} contentContainerStyle={[styles.modalScroll, { paddingTop: Math.max(20, insets.top + 12), paddingBottom: Math.max(20, insets.bottom + 12), paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}><View style={[styles.menuCard, compact && { padding: 24, width: 420 }]}>
        <Text style={[styles.menuTitle, { fontFamily: serif }]}>{confirmRestart ? 'Новая история?' : 'Передышка'}</Text>
        {confirmRestart ? <><Text style={styles.endText}>Прогресс игрока «{novel.activeProfile?.name}» будет заменён. Начать с первой сцены?</Text><Button label="Начать заново" light onPress={startFresh} /><Button label="Вернуться" onPress={() => setConfirmRestart(false)} /></> : <>
          <Text style={styles.menuPlayer}>Играет: {novel.activeProfile?.name}</Text>
          <Text style={styles.menuDescription}>Нажимай справа, чтобы менять реплики и сцены. Первое нажатие во время чтения показывает весь текст. В моменты выбора нажми на вариант ответа.</Text>
          <Button label={screen === 'game' ? 'Вернуться к истории' : 'Закрыть меню'} light onPress={() => setMenu(false)} />
          {screen === 'game' && <Button label="Главное меню" onPress={() => { setMenu(false); setScreen('home'); }} />}
          <Button label="Сменить игрока" onPress={showPlayers} />
          <Button label="Начать заново" disabled={!novel.ready} onPress={() => setConfirmRestart(true)} />
          <Button label={novel.pending ? 'Применить обновление истории' : novel.checking ? 'Проверяем…' : 'Проверить обновления'} disabled={novel.checking} onPress={() => { if (novel.pending) { setComplete(false); setTyping(false); void novel.applyUpdate(); } else void novel.checkUpdates(true); }} />
          {Boolean(novel.notice) && <Text style={styles.menuNotice}>{novel.notice}</Text>}
          <Text style={styles.version}>ПРОГРЕСС СОХРАНЯЕТСЯ АВТОМАТИЧЕСКИ · {pack.story.version}</Text>
        </>}
      </View></ScrollView></View>
    </Modal>

    {portrait && screen === 'game' && !menu && <View style={[styles.overlay, styles.portrait]}><Text style={styles.rotate}>↻</Text><Text style={[styles.rotateTitle, { fontFamily: serif }]}>Истории нужно чуть больше места</Text><Text style={styles.rotateText}>Поверни устройство горизонтально{ '\n' }или расширь окно браузера.</Text><Button label="Главное меню" onPress={() => setScreen('home')} /></View>}
  </View>;
}

export default function App() { return <SafeAreaProvider><Novel /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#15100c', overflow: 'hidden' },
  homeShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(8, 7, 5, 0.43)' },
  homeScroll: { position: 'absolute', top: 0, bottom: 0 },
  homeContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'flex-start' },
  eyebrow: { fontSize: 10, letterSpacing: 2.5, color: '#dfc496', fontWeight: '600' },
  title: { color: '#fff6e8', lineHeight: undefined, marginTop: 15, letterSpacing: -1.5 },
  goldLine: { width: 48, height: 2, backgroundColor: '#cfa364', marginVertical: 18 },
  description: { color: '#e3d8c6', fontSize: 17, lineHeight: 27 },
  startButtons: { marginTop: 32, gap: 10, width: '100%', maxWidth: 360 },
  button: { borderWidth: 1, borderColor: '#64543f', borderRadius: 3, paddingHorizontal: 22, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  lightButton: { backgroundColor: '#f3e7d4', borderColor: '#f3e7d4' },
  buttonText: { color: '#f5ebde', fontSize: 14, fontWeight: '500' },
  playerSwitch: { marginTop: 20, padding: 10, gap: 5, minHeight: 48, maxWidth: '100%', justifyContent: 'center', backgroundColor: 'rgba(15, 12, 8, 0.65)', borderRadius: 3 },
  currentPlayer: { fontSize: 12, color: '#f1e2c8' },
  switchLabel: { fontSize: 10, color: '#d4bc95' },
  toolbar: { position: 'absolute', flexDirection: 'row', gap: 8 },
  iconButton: { width: 48, height: 48, backgroundColor: 'rgba(19, 15, 10, 0.55)', borderRadius: 4, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(227, 207, 171, 0.24)' },
  icon: { fontSize: 26, color: '#f1e4ce' },
  menuIcon: { fontSize: 19, color: '#f1e4ce', letterSpacing: 3 },
  tapArea: { position: 'absolute', top: 0, right: 0, bottom: 0, width: '50%' },
  sceneHeading: { position: 'absolute', backgroundColor: 'rgba(15, 12, 8, 0.5)', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 3 },
  chapter: { color: '#f7ead6', fontSize: 13, letterSpacing: 0.5 },
  counter: { color: '#c5ad84', fontSize: 9, letterSpacing: 2, marginTop: 5 },
  dialoguePosition: { position: 'absolute' },
  dialogueFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, minHeight: 48, gap: 10 },
  dialogueHint: { flex: 1, fontSize: 11, lineHeight: 16, letterSpacing: 0.5, color: '#8b8275' },
  nextArrow: { color: '#846236', fontSize: 23 },
  returnToSearch: { paddingTop: 8, paddingBottom: 5, minHeight: 48, alignSelf: 'flex-end', justifyContent: 'center' },
  returnToSearchText: { color: '#846236', fontSize: 12, textDecorationLine: 'underline' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  choice: { flexGrow: 1, flexBasis: '100%', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#dbc8ac', backgroundColor: '#faf6ee', borderRadius: 3, paddingHorizontal: 12, paddingVertical: 11, gap: 10, minHeight: 48 },
  choiceNumber: { color: '#ab8c5a', fontSize: 10, letterSpacing: 1 },
  choiceText: { flex: 1, color: '#272016', fontSize: 15, lineHeight: 19 },
  choiceArrow: { color: '#a0814e', fontSize: 18 },
  emptyChoiceCard: { backgroundColor: '#fff', borderRadius: 4 },
  choicePrompt: { color: '#111', fontSize: 18 },
  sceneHint: { alignSelf: 'flex-end', backgroundColor: 'rgba(18, 13, 8, 0.6)', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 3 },
  sceneHintText: { color: '#f0e0c5', fontSize: 12, letterSpacing: 0.4 },
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(12, 10, 7, 0.82)', justifyContent: 'center', alignItems: 'center' },
  endCard: { maxWidth: 580, width: '86%', padding: 40, backgroundColor: '#201a13', borderRadius: 5, borderWidth: 1, borderColor: '#5e4930' },
  endTitle: { color: '#f7ead5', fontSize: 36, marginVertical: 16 },
  endText: { color: '#d5c7b2', fontSize: 15, lineHeight: 23, marginBottom: 20 },
  endButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  loading: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: '#ddc9a6', fontSize: 12 },
  errorCard: { width: '80%', maxWidth: 450, gap: 10, padding: 28, backgroundColor: '#201a13', borderRadius: 5 },
  errorTitle: { fontSize: 22, color: '#f8ecd9', marginBottom: 8 },
  update: { position: 'absolute', alignSelf: 'center', maxWidth: '90%', backgroundColor: '#f7ead5', paddingHorizontal: 16, borderRadius: 3, flexDirection: 'row', alignItems: 'center', gap: 18 },
  updateText: { color: '#46321b', fontSize: 12 },
  updateAction: { color: '#745025', fontSize: 12, fontWeight: '700', padding: 6, minHeight: 48, lineHeight: 36 },
  notice: { position: 'absolute', top: 124, left: '15%', right: '15%', padding: 13, backgroundColor: '#292016', borderRadius: 4, borderWidth: 1, borderColor: '#7c6040' },
  noticeText: { fontSize: 12, lineHeight: 18, color: '#eed9b8', textAlign: 'center' },
  modalScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 20 },
  menuCard: { width: 460, maxWidth: '90%', padding: 36, backgroundColor: '#211b14', gap: 10, borderRadius: 5, borderWidth: 1, borderColor: '#5e4930' },
  menuTitle: { fontSize: 34, color: '#f2e4ca', marginBottom: 5 },
  menuDescription: { color: '#cdbda5', fontSize: 13, lineHeight: 21, marginBottom: 9 },
  menuPlayer: { color: '#e4c493', fontSize: 13 },
  menuNotice: { color: '#dcc097', fontSize: 12, lineHeight: 18, marginTop: 4 },
  version: { color: '#98866a', fontSize: 8, letterSpacing: 1.2, marginTop: 13 },
  portrait: { backgroundColor: '#17120d', padding: 32, gap: 20 },
  rotate: { fontSize: 64, color: '#c6a36a' },
  rotateTitle: { fontSize: 30, color: '#f4e6cc', textAlign: 'center' },
  rotateText: { color: '#bca98b', fontSize: 15, lineHeight: 25, textAlign: 'center' },
});
