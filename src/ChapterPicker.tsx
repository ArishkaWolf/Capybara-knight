import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Progress, Story } from './types';

type Props = { story: Story; progress: Progress; onRewind: (id: string) => void; onClose: () => void };

export function ChapterPicker({ story, progress, onRewind, onClose }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const entries = (progress.history ?? []).flatMap(saved => {
    const chapter = story.chapters?.find(item => item.id === saved.chapterId);
    return chapter ? [{ ...saved, chapter }] : [];
  });
  const target = entries.find(item => item.chapterId === selected);
  return <View>
    <Text accessibilityRole="header" style={styles.title}>{target ? 'Переиграть главу?' : 'Пройденные главы'}</Text>
    {target ? <>
      <Text style={styles.chapter}>{target.chapter.title}</Text>
      <Text style={styles.text}>{target.partial ? 'Ты вернёшься к сцене, с которой началась история переходов в этом сохранении.' : 'Ты вернёшься к началу этой главы в своём прохождении.'} Решения и улики после этой точки будут сброшены. Можно будет выбрать другой путь.</Text>
      <Pressable accessibilityRole="button" onPress={() => onRewind(target.chapterId)} style={[styles.action, styles.light]}><Text style={styles.darkText}>Переиграть главу</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => setSelected(null)} style={styles.action}><Text style={styles.buttonText}>Назад к главам</Text></Pressable>
    </> : <>
      <Text style={styles.text}>Открыты только главы, до которых дошёл этот игрок. Выбери точку, чтобы вернуться и изменить решения.</Text>
      {entries.map((entry, index) => <Pressable key={entry.chapterId} accessibilityRole="button" accessibilityLabel={`Переиграть: ${entry.chapter.title}`} onPress={() => setSelected(entry.chapterId)} style={({ pressed }) => [styles.entry, pressed && { opacity: 0.7 }]}>
        <Text style={styles.number}>{String(index + 1).padStart(2, '0')} {entry.chapter.scenes.includes(progress.sceneId) ? '· ТЕКУЩАЯ ГЛАВА' : '· ПРОЙДЕНО'}</Text>
        <Text style={styles.chapter}>{entry.chapter.title}</Text>
        <Text style={styles.caption}>{entry.partial ? 'Сохранённая сцена: ' : 'Вход в главу: '}{story.scenes.find(scene => scene.id === entry.sceneId)?.chapter} →</Text>
      </Pressable>)}
      {!entries.length && <Text style={styles.text}>Начни историю, чтобы открыть первую главу.</Text>}
      {entries.some(entry => entry.partial) && <Text style={styles.caption}>У старого сохранения нет записей о прежних главах. История переходов ведётся с текущей сцены; пройденные после обновления главы будут добавляться автоматически.</Text>}
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.action}><Text style={styles.buttonText}>← Назад в меню</Text></Pressable>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  title: { color: '#f5e8cf', fontSize: 25, marginBottom: 18 },
  text: { color: '#d3c5ae', fontSize: 14, lineHeight: 23, marginBottom: 20 },
  entry: { borderWidth: 1, borderColor: '#695337', borderRadius: 4, padding: 16, minHeight: 80, marginBottom: 12 },
  number: { color: '#c49a61', fontSize: 10, letterSpacing: 1, marginBottom: 8 },
  chapter: { color: '#f2e1c3', fontSize: 18, lineHeight: 25, marginBottom: 8 },
  caption: { color: '#b9a587', fontSize: 12, lineHeight: 20 },
  action: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#695337', padding: 14, marginTop: 12, borderRadius: 3 },
  light: { backgroundColor: '#efe0c3', borderColor: '#efe0c3' },
  darkText: { color: '#392a19', fontSize: 14 },
  buttonText: { color: '#e9d7b5', fontSize: 14 },
});
