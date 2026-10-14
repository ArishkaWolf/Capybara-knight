import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import type { PlayerProfile, Story } from './types';

type Props = {
  players: PlayerProfile[];
  story: Story;
  ready: boolean;
  compact: boolean;
  topInset: number;
  bottomInset: number;
  leftInset: number;
  rightInset: number;
  notice: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
};
const serif = Platform.OS === 'web' ? 'Georgia, serif' : Platform.OS === 'ios' ? 'Georgia' : 'serif';

function lastPlayed(player: PlayerProfile) {
  if (player.lastPlayedAt === null) return player.progress ? 'Прогресс сохранён' : 'История ещё не начата';
  return `Последняя игра: ${new Date(player.lastPlayedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
}

export function PlayerSelect({ players, story, ready, compact, topInset, bottomInset, leftInset, rightInset, notice, onSelect, onCreate, onRename }: Props) {
  const [editor, setEditor] = useState<{ id: string | null; name: string } | null>(null);
  const [error, setError] = useState('');
  const { width } = useWindowDimensions();
  const narrow = width < 480;
  function edit(player?: PlayerProfile) {
    setError('');
    setEditor({ id: player?.id ?? null, name: player?.name ?? '' });
  }
  function submit() {
    if (!editor || !editor.name.trim()) return;
    try {
      if (editor.id) onRename(editor.id, editor.name);
      else onCreate(editor.name);
      setEditor(null);
      setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сохранить имя.'); }
  }

  return <View style={styles.root}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.scroll, { paddingTop: Math.max(76, topInset + 66), paddingBottom: Math.max(24, bottomInset + 20), paddingLeft: Math.max(24, leftInset + 20), paddingRight: Math.max(24, rightInset + 20) }]}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>КАПИБАРА-РЫЦАРЬ</Text>
        <Text accessibilityRole="header" style={[styles.title, { fontFamily: serif, fontSize: compact ? 32 : 44 }]}>Кто отправится в путь?</Text>
        <Text style={styles.description}>У каждого игрока своя история. Выбери профиль или добавь нового игрока.</Text>
        {Boolean(notice) && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
        {!ready ? <View style={styles.loading}><ActivityIndicator color="#e1bf84" /><Text style={styles.metadata}>Загружаем игроков…</Text></View> : <>
          {players.length === 0 && <View style={styles.empty}><Text style={styles.emptyTitle}>Приключение ждёт первого игрока</Text><Text style={styles.metadata}>Введи своё имя, чтобы сохранять прохождение на этом устройстве.</Text></View>}
          <View style={styles.list}>{players.map((player) => {
            const chapter = player.progress ? player.progress.ending?.title ?? story.scenes.find((scene) => scene.id === player.progress?.sceneId)?.chapter ?? 'Сохранённая история' : 'Новая история';
            return <View key={player.id} style={[styles.playerRow, narrow && { flexDirection: 'column' }]}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Играть: ${player.name}`} onPress={() => onSelect(player.id)} style={({ pressed }) => [styles.playerButton, pressed && styles.pressed]}>
                <View style={styles.avatar}><Text style={styles.initial}>{Array.from(player.name)[0].toLocaleUpperCase('ru-RU')}</Text></View>
                <View style={styles.playerText}><Text style={styles.playerName}>{player.name}</Text><Text style={styles.chapter}>{chapter}</Text><Text style={styles.metadata}>{lastPlayed(player)}</Text></View>
                <Text style={styles.arrow}>→</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Переименовать: ${player.name}`} onPress={() => edit(player)} style={({ pressed }) => [styles.rename, narrow && { maxWidth: undefined, borderLeftWidth: 0, borderTopWidth: 1, borderTopColor: '#51412d' }, pressed && styles.pressed]}><Text style={styles.renameText}>Изменить имя</Text></Pressable>
            </View>;
          })}</View>
          <Pressable accessibilityRole="button" accessibilityLabel="Добавить игрока" onPress={() => edit()} style={({ pressed }) => [styles.add, pressed && styles.pressed]}><Text style={styles.addText}>＋ Добавить игрока</Text></Pressable>
          <Text style={styles.local}>Профили и сохранения хранятся на этом устройстве.</Text>
        </>}
      </View>
    </ScrollView>
    <Modal visible={Boolean(editor)} transparent animationType="fade" supportedOrientations={['portrait', 'landscape-left', 'landscape-right']} onRequestClose={() => setEditor(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.editorOverlay}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.editorScroll, { paddingTop: Math.max(20, topInset + 12), paddingBottom: Math.max(20, bottomInset + 12), paddingLeft: Math.max(24, leftInset + 16), paddingRight: Math.max(24, rightInset + 16) }]}>
          <View style={[styles.editorCard, compact && { padding: 22 }]}>
            <Text accessibilityRole="header" style={[styles.editorTitle, { fontFamily: serif }]}>{editor?.id ? 'Имя игрока' : 'Новый игрок'}</Text>
            <Text style={styles.description}>{editor?.id ? 'Имя можно менять — твоё прохождение останется с тобой.' : 'Как тебя зовут? Это имя будет видно в списке игроков.'}</Text>
            <TextInput accessibilityLabel="Имя игрока" placeholder="Имя игрока" placeholderTextColor="#9e8f7a" value={editor?.name ?? ''} onChangeText={(name) => { setEditor((current) => current ? { ...current, name } : null); setError(''); }} maxLength={40} autoFocus autoCorrect={false} returnKeyType="done" onSubmitEditing={submit} style={styles.input} />
            {Boolean(error) && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
            <View style={styles.editorActions}>
              <Pressable accessibilityRole="button" accessibilityLabel={editor?.id ? 'Сохранить имя' : 'Создать профиль'} disabled={!editor?.name.trim()} onPress={submit} style={({ pressed }) => [styles.save, !editor?.name.trim() && styles.disabled, pressed && styles.pressed]}><Text style={styles.saveText}>{editor?.id ? 'Сохранить имя' : 'Создать профиль'}</Text></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Отмена" onPress={() => setEditor(null)} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}><Text style={styles.cancelText}>Отмена</Text></Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(10, 8, 5, 0.78)' },
  scroll: { flexGrow: 1, justifyContent: 'center' },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center' },
  eyebrow: { color: '#d8bb89', fontSize: 10, letterSpacing: 2.5 },
  title: { color: '#fff2db', marginTop: 10, marginBottom: 12 },
  description: { color: '#d7c7ac', fontSize: 14, lineHeight: 21 },
  list: { gap: 10, marginTop: 22 },
  playerRow: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: '#211b14', borderWidth: 1, borderColor: '#5d4931', borderRadius: 5, overflow: 'hidden' },
  playerButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, minHeight: 90 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#3f3020', borderWidth: 1, borderColor: '#8d7046', alignItems: 'center', justifyContent: 'center' },
  initial: { color: '#f0d4a5', fontSize: 20 },
  playerText: { flex: 1, gap: 4 },
  playerName: { color: '#f7ead5', fontSize: 18, fontWeight: '600' },
  chapter: { color: '#d6bc90', fontSize: 13 },
  metadata: { color: '#aa9a84', fontSize: 11, lineHeight: 17 },
  arrow: { color: '#dec08e', fontSize: 23 },
  rename: { paddingHorizontal: 14, justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: '#51412d', minHeight: 48, maxWidth: 116 },
  renameText: { color: '#d4bf9a', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  add: { marginTop: 16, backgroundColor: '#f3e7d4', borderRadius: 3, alignItems: 'center', justifyContent: 'center', minHeight: 48, padding: 12 },
  addText: { color: '#302418', fontSize: 14, fontWeight: '600' },
  local: { color: '#aa9980', fontSize: 11, textAlign: 'center', marginTop: 14 },
  loading: { paddingVertical: 32, gap: 12, alignItems: 'center' },
  empty: { marginTop: 22, padding: 20, borderWidth: 1, borderColor: '#5d4931', borderRadius: 5, gap: 8, backgroundColor: '#211b14' },
  emptyTitle: { color: '#f0dfc3', fontSize: 17 },
  notice: { color: '#efd1a0', fontSize: 12, lineHeight: 19, marginTop: 14, padding: 12, backgroundColor: '#302416', borderRadius: 3 },
  editorOverlay: { flex: 1, backgroundColor: 'rgba(12, 10, 7, 0.9)' },
  editorScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 20, paddingHorizontal: 24 },
  editorCard: { width: '100%', maxWidth: 460, backgroundColor: '#211b14', borderWidth: 1, borderColor: '#6b5132', borderRadius: 5, padding: 30, gap: 14 },
  editorTitle: { color: '#f5e6cc', fontSize: 30 },
  input: { backgroundColor: '#15100c', borderWidth: 1, borderColor: '#93734a', borderRadius: 3, color: '#fff2de', paddingHorizontal: 14, paddingVertical: 12, minHeight: 48, fontSize: 16 },
  error: { color: '#f0b3a0', fontSize: 12, lineHeight: 18 },
  editorActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  save: { flexGrow: 1, backgroundColor: '#f3e7d4', borderRadius: 3, minHeight: 48, paddingHorizontal: 18, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  saveText: { color: '#302418', fontSize: 14, fontWeight: '600' },
  cancel: { flexGrow: 1, borderWidth: 1, borderColor: '#65503a', borderRadius: 3, minHeight: 48, paddingHorizontal: 18, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  cancelText: { color: '#f1e2c8', fontSize: 14 },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.72 },
});
