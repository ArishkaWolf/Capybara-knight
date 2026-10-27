import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import { imageFrame, hotspotBox } from './geometry.mjs';
import type { Board } from './types';

type Props = { board: Board; width: number; height: number; insets: EdgeInsets; open: boolean; reducedMotion: boolean; onOpenChange: (open: boolean) => void; onChoose: (id: string) => void };
const serif = Platform.OS === 'web' ? 'Georgia, serif' : Platform.OS === 'ios' ? 'Georgia' : 'serif';

export function SceneBoard({ board, width, height, insets, open, reducedMotion, onOpenChange, onChoose }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const frame = imageFrame(board.imageSize, { width, height }, 'contain', insets);
  const article = board.kind === 'notices' ? board.items.find(item => item.id === selected) : undefined;
  const direct = board.items.every(item => item.rect.height * frame.height >= 48 && item.rect.width * frame.width >= 48);
  function enlarge(id: string | null = null) { setSelected(id); onOpenChange(true); }
  function select(id: string) { if (board.kind === 'drinks') onChoose(id); else enlarge(id); }
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    <View pointerEvents="none" style={[styles.info, { top: Math.max(90, insets.top + 76), left: Math.max(20, insets.left + 14), maxWidth: Math.min(300, width * 0.45) }]}><Text style={styles.infoTitle}>{board.title}</Text><Text style={styles.hint}>{board.hint}</Text></View>
    <Pressable accessibilityRole="button" accessibilityLabel={`Увеличить доску: ${board.title}`} onPress={() => enlarge()} style={({ pressed }) => [styles.boardRegion, hotspotBox(board.rect, frame, { width, height }, 48, insets), pressed && styles.regionActive]}>
      <View pointerEvents="none" style={styles.label}><Text style={styles.labelText}>{board.kind === 'drinks' ? 'Выбрать напиток ↗' : 'Объявления ↗'}</Text></View>
    </Pressable>
    {direct && board.items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={board.kind === 'drinks' ? `Заказать: ${item.title}` : `Прочитать: ${item.title}`} onHoverIn={() => setHovered(item.id)} onHoverOut={() => setHovered(null)} onPress={() => select(item.id)} style={({ pressed }) => [styles.itemRegion, hotspotBox(item.rect, frame, { width, height }, 48, insets), (pressed || hovered === item.id) && styles.regionActive]} />)}
    <Modal visible={open} transparent animationType={reducedMotion ? 'none' : 'fade'} supportedOrientations={['portrait', 'landscape-left', 'landscape-right']} onRequestClose={() => onOpenChange(false)}>
      <View style={styles.shade}>
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingTop: Math.max(16, insets.top + 12), paddingBottom: Math.max(16, insets.bottom + 12), paddingLeft: Math.max(16, insets.left + 12), paddingRight: Math.max(16, insets.right + 12), flexGrow: 1, justifyContent: 'center', alignItems: 'center' }}>
          <View accessibilityViewIsModal style={[styles.board, board.kind === 'notices' && styles.noticeBoard]}>
            <View style={styles.header}><Text accessibilityRole="header" style={[styles.title, { fontFamily: serif }]}>{board.title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Закрыть доску" onPress={() => onOpenChange(false)} style={styles.close}><Text style={styles.closeText}>×</Text></Pressable></View>
            <Text style={styles.hint}>{board.kind === 'drinks' ? 'Нажми на название — Игнат приготовит выбранный напиток.' : 'Лесные новости, представления и маленькие заботы.'}</Text>
            {article ? <View style={styles.paper}>
              <Text accessibilityRole="header" style={[styles.paperTitle, { fontFamily: serif }]}>{article.title}</Text>
              <Text style={styles.paperText}>{article.text}</Text>
              <Pressable accessibilityRole="button" onPress={() => setSelected(null)} style={styles.back}><Text style={styles.backText}>← К объявлениям</Text></Pressable>
            </View> : <View style={styles.items}>{board.items.map((item, index) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={board.kind === 'drinks' ? `Заказать: ${item.title}` : `Прочитать: ${item.title}`} onPress={() => select(item.id)} style={({ pressed }) => [styles.item, board.kind === 'notices' && styles.poster, width >= 800 && { flexBasis: '46%', flexGrow: 1 }, pressed && { opacity: 0.7 }]}>
              <Text style={styles.number}>{String(index + 1).padStart(2, '0')} {board.kind === 'drinks' ? '· ИЗ ПОГРЕБКА ИГНАТА' : '· ОБЪЯВЛЕНИЕ'}</Text>
              <Text style={[styles.itemTitle, { fontFamily: serif }, board.kind === 'notices' && styles.darkText]}>{item.title}</Text>
              <Text style={[styles.description, board.kind === 'notices' && styles.darkText]}>{board.kind === 'drinks' ? item.text : 'Прочитать объявление →'}</Text>
            </Pressable>)}</View>}
            <Pressable accessibilityRole="button" onPress={() => onOpenChange(false)} style={styles.footer}><Text style={styles.footerText}>{board.kind === 'drinks' ? 'Вернуться к стойке' : 'Отойти от доски'} →</Text></Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  boardRegion: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(238, 206, 148, 0.65)', borderRadius: 4, justifyContent: 'flex-end' },
  itemRegion: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(238, 206, 148, 0.35)', borderRadius: 3 },
  regionActive: { backgroundColor: 'rgba(245, 213, 159, 0.22)', borderColor: '#f2d4a2' },
  label: { backgroundColor: 'rgba(20, 16, 10, 0.92)', paddingHorizontal: 4, paddingVertical: 4, alignSelf: 'center', borderRadius: 3 },
  labelText: { color: '#f9e3bd', fontSize: 10, textAlign: 'center' },
  info: { position: 'absolute', padding: 12, borderRadius: 4, backgroundColor: 'rgba(19, 15, 10, 0.88)' },
  infoTitle: { color: '#ecd7b2', fontSize: 14 },
  shade: { flex: 1, backgroundColor: 'rgba(9, 7, 4, 0.94)' },
  scroll: { width: '100%' },
  board: { width: '100%', maxWidth: 900, backgroundColor: '#18221d', borderWidth: 8, borderColor: '#765135', borderRadius: 6, padding: 20 },
  noticeBoard: { backgroundColor: '#3b2a1e' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { color: '#f6e9d1', fontSize: 28, flexShrink: 1 },
  close: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#a98b62', borderRadius: 4 },
  closeText: { color: '#f6e9d1', fontSize: 28 },
  hint: { color: '#d1c4a9', fontSize: 13, lineHeight: 20, marginTop: 12, marginBottom: 18 },
  items: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  item: { minHeight: 80, padding: 16, borderWidth: 1, borderColor: '#607065', borderRadius: 4, flexBasis: '100%' },
  poster: { backgroundColor: '#efe0bd', borderColor: '#d0b57e' },
  number: { fontSize: 9, color: '#b78f59', letterSpacing: 1, marginBottom: 8 },
  itemTitle: { color: '#f8edda', fontSize: 23, marginBottom: 8 },
  description: { color: '#c6d0c8', fontSize: 13, lineHeight: 21 },
  darkText: { color: '#413020' },
  paper: { backgroundColor: '#f3e5c7', padding: 24, borderRadius: 3 },
  paperTitle: { color: '#35281c', fontSize: 27, marginBottom: 16 },
  paperText: { color: '#483827', fontSize: 17, lineHeight: 28 },
  back: { minHeight: 48, justifyContent: 'center', marginTop: 16 },
  backText: { color: '#785429', fontSize: 15 },
  footer: { minHeight: 48, marginTop: 16, justifyContent: 'center', alignItems: 'center' },
  footerText: { color: '#dfc69c', fontSize: 14 },
});
