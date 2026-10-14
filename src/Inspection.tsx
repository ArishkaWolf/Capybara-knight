import { Fragment, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { imageFrame, hotspotBox, outlineSegments } from './geometry.mjs';
import type { EvidenceId, Hotspot, Search } from './types';
import type { EdgeInsets } from 'react-native-safe-area-context';

type Props = { search: Search; evidence: EvidenceId[]; width: number; height: number; insets: EdgeInsets; busy: boolean; onInspect: (id: EvidenceId) => void; onFinish: () => void };

function Contour({ item, frame, touchBox, strong, found }: { item: Hotspot; frame: { x: number; y: number; width: number; height: number }; touchBox: { left: number; top: number }; strong: boolean; found: boolean }) {
  const color = found ? '#d8bd89' : strong ? '#f3d7a1' : 'rgba(240, 207, 145, 0.62)';
  if (!item.outline) return <View pointerEvents="none" style={[styles.objectBorder, { left: frame.x + item.rect.x * frame.width - touchBox.left, top: frame.y + item.rect.y * frame.height - touchBox.top, width: item.rect.width * frame.width, height: item.rect.height * frame.height, borderColor: color }]} />;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {outlineSegments(item.outline, frame).map((segment: { left: number; top: number; width: number; angle: number }, index: number) => <Fragment key={index}>
      <View style={[styles.stroke, { left: segment.left - touchBox.left, top: segment.top - touchBox.top - 2, width: segment.width, height: 4, backgroundColor: strong ? 'rgba(244, 213, 156, 0.15)' : 'rgba(244, 213, 156, 0.07)', transform: [{ rotate: `${segment.angle}deg` }] }]} />
      <View style={[styles.stroke, { left: segment.left - touchBox.left, top: segment.top - touchBox.top - 0.6, width: segment.width, height: 1.2, backgroundColor: color, transform: [{ rotate: `${segment.angle}deg` }] }]} />
    </Fragment>)}
  </View>;
}

export function Inspection({ search, evidence, width, height, insets, busy, onInspect, onFinish }: Props) {
  const [hints, setHints] = useState(false);
  const [hoveredId, setHoveredId] = useState<EvidenceId | null>(null);
  const frame = imageFrame(search.imageSize, { width, height }, 'contain', insets);
  const compact = height < 450;
  const foundItems = search.hotspots.filter((item) => evidence.includes(item.id));
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    {search.hotspots.map((item) => {
      const found = evidence.includes(item.id);
      const touchBox = hotspotBox(item.rect, frame, { width, height }, 48, insets);
      return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Осмотреть: ${item.label}${found ? ' (уже найдено)' : ''}`} disabled={busy} onHoverIn={() => setHoveredId(item.id)} onHoverOut={() => setHoveredId(null)} onPress={() => onInspect(item.id)} style={[styles.hotspot, touchBox]}>
        {({ pressed }) => <>
          {(item.alwaysHighlight || hints || found || hoveredId === item.id || pressed) && <Contour item={item} frame={frame} touchBox={touchBox} strong={hints || pressed || hoveredId === item.id} found={found} />}
          {item.id !== 'quill' && (hints || found) && <View pointerEvents="none" style={styles.marker}><Text style={styles.markerText}>{found ? '✓' : '◇'}</Text></View>}
        </>}
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
  hotspot: { position: 'absolute', backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center', overflow: 'visible' },
  objectBorder: { position: 'absolute', borderRadius: 3, borderWidth: 0.75 },
  stroke: { position: 'absolute', borderRadius: 2 },
  marker: { width: 16, height: 16, borderRadius: 8, backgroundColor: 'rgba(57, 43, 25, 0.78)', borderWidth: 0.75, borderColor: '#e1c18c', justifyContent: 'center', alignItems: 'center' },
  markerText: { color: '#f5dfba', fontSize: 10 },
  hud: { position: 'absolute', backgroundColor: 'rgba(20, 15, 9, 0.8)', padding: 12, borderRadius: 4, maxWidth: 310 },
  heading: { color: '#f5e5cc', fontSize: 14 },
  hint: { color: '#d5bc94', fontSize: 10, marginTop: 6 },
  inventory: { color: '#e7d5b3', fontSize: 10, marginTop: 8, maxWidth: 260 },
  hintButton: { paddingVertical: 10, minHeight: 48, justifyContent: 'center' },
  hintAction: { color: '#e9c98f', fontSize: 11, textDecorationLine: 'underline' },
  finish: { position: 'absolute', borderRadius: 3, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#f4e6cf', minHeight: 48, justifyContent: 'center' },
  finishText: { color: '#382619', fontSize: 12, fontWeight: '600' },
});
