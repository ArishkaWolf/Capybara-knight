import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { imageFrame, hotspotBox } from './geometry.mjs';
import type { EvidenceId, Search } from './types';
import type { EdgeInsets } from 'react-native-safe-area-context';

type Props = { search: Search; evidence: EvidenceId[]; width: number; height: number; insets: EdgeInsets; busy: boolean; onInspect: (id: EvidenceId) => void; onFinish: () => void };

export function Inspection({ search, evidence, width, height, insets, busy, onInspect, onFinish }: Props) {
  const [hints, setHints] = useState(false);
  const [hoveredId, setHoveredId] = useState<EvidenceId | null>(null);
  const frame = imageFrame(search.imageSize, { width, height }, 'contain', insets);
  const compact = height < 450;
  const foundItems = search.hotspots.filter((item) => evidence.includes(item.id));
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {search.hotspots.map((item) => {
      const found = evidence.includes(item.id);
      const hidden = item.id === 'quill';
      return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Осмотреть: ${item.label}${found ? ' (уже найдено)' : ''}`} disabled={busy} onHoverIn={() => { if (!hidden) setHoveredId(item.id); }} onHoverOut={() => setHoveredId(null)} onPress={() => onInspect(item.id)} style={({ pressed }) => [styles.hotspot, hotspotBox(item.rect, frame, { width, height }, 48, insets), hidden && styles.hiddenHotspot, !hidden && (hints || found || hoveredId === item.id || pressed) && styles.visible, !hidden && found && styles.found]}>
        {!hidden && (hints || found) && <View pointerEvents="none" style={styles.marker}><Text style={styles.markerText}>{found ? '✓' : '◇'}</Text></View>}
      </Pressable>;
    })}
    <View style={[styles.hud, { top: Math.max(76, insets.top + 66), left: Math.max(20, insets.left + 14), maxWidth: width * 0.43 }, compact && { padding: 8 }]}>
      <Text style={styles.heading}>{search.title ?? 'Осмотри комнату'}</Text>
      {!compact && <Text style={styles.hint}>Нажимай на предметы</Text>}
      {foundItems.length > 0 && <Text style={styles.inventory}>{foundItems.map((item) => item.label).join(' · ')}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel={hints ? 'Скрыть подсказку' : 'Подсказка: показать области поиска'} disabled={busy} onPress={() => setHints((value) => !value)} style={styles.hintButton}><Text style={styles.hintAction}>{hints ? 'Скрыть подсказку' : 'Подсказка'}</Text></Pressable>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={search.finishLabel} disabled={busy} onPress={onFinish} style={({ pressed }) => [styles.finish, { top: Math.max(76, insets.top + 66), right: Math.max(20, insets.right + 14), maxWidth: width * 0.42, opacity: busy ? 0.45 : pressed ? 0.75 : 1 }]}><Text style={styles.finishText}>{search.finishLabel} →</Text></Pressable>
  </View>;
}

const styles = StyleSheet.create({
  hotspot: { position: 'absolute', borderRadius: 12, borderWidth: 1, borderColor: 'transparent', backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
  hiddenHotspot: { cursor: 'auto' },
  visible: { borderColor: '#e4c796', backgroundColor: 'rgba(220, 179, 115, 0.12)' },
  found: { borderColor: '#ccb17d', backgroundColor: 'rgba(199, 173, 113, 0.1)' },
  marker: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#392b19', borderWidth: 1, borderColor: '#e1c18c', justifyContent: 'center', alignItems: 'center' },
  markerText: { color: '#f5dfba', fontSize: 14 },
  hud: { position: 'absolute', backgroundColor: 'rgba(20, 15, 9, 0.8)', padding: 12, borderRadius: 4, maxWidth: 310 },
  heading: { color: '#f5e5cc', fontSize: 14 },
  hint: { color: '#d5bc94', fontSize: 10, marginTop: 6 },
  inventory: { color: '#e7d5b3', fontSize: 10, marginTop: 8, maxWidth: 260 },
  hintButton: { paddingVertical: 10, minHeight: 48, justifyContent: 'center' },
  hintAction: { color: '#e9c98f', fontSize: 11, textDecorationLine: 'underline' },
  finish: { position: 'absolute', borderRadius: 3, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#f4e6cf', minHeight: 48, justifyContent: 'center' },
  finishText: { color: '#382619', fontSize: 12, fontWeight: '600' },
});
