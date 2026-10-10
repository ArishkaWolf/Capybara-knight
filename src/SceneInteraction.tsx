import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { imageFrame, hotspotBox } from './geometry.mjs';
import type { Interaction } from './types';
import type { EdgeInsets } from 'react-native-safe-area-context';

type Props = { interaction: Interaction; width: number; height: number; insets: EdgeInsets; onInteract: (id: string) => void };

export function SceneInteraction({ interaction, width, height, insets, onInteract }: Props) {
  const [hovered, setHovered] = useState(false);
  const frame = imageFrame(interaction.imageSize, { width, height }, 'contain', insets);
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
    <View pointerEvents="none" style={[styles.hud, { top: Math.max(76, insets.top + 66), left: Math.max(20, insets.left + 14), maxWidth: width * 0.6 }]}>
      <Text style={styles.heading}>Записка на стойке</Text>
      <Text style={styles.hint}>Нажми на неё, чтобы прочитать</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={interaction.label} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} onPress={() => onInteract(interaction.id)} style={({ pressed }) => [styles.hotspot, hotspotBox(interaction.rect, frame, { width, height }, 48, insets), (hovered || pressed) && styles.highlight]} />
  </View>;
}

const styles = StyleSheet.create({
  hud: { position: 'absolute', backgroundColor: 'rgba(20, 15, 9, 0.8)', padding: 12, borderRadius: 4, maxWidth: 310 },
  heading: { color: '#f5e5cc', fontSize: 14 },
  hint: { color: '#d5bc94', fontSize: 10, marginTop: 6 },
  hotspot: { position: 'absolute', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(228, 199, 150, 0.5)', backgroundColor: 'transparent' },
  highlight: { borderColor: '#e4c796', backgroundColor: 'rgba(220, 179, 115, 0.15)' },
});
