import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { DialogueLine } from './types';
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type Props = {
  line: DialogueLine;
  complete: boolean;
  reducedMotion: boolean;
  paused: boolean;
  compact: boolean;
  maxHeight: number;
  onTyping: (typing: boolean) => void;
  onAdvance: (pageX: number) => void;
  children?: ReactNode;
};

export function Dialogue({ line, complete, reducedMotion, paused, compact, maxHeight, onTyping, onAdvance, children }: Props) {
  const [count, setCount] = useState(0);
  const position = useRef(0);
  const scrolling = useRef(false);
  const panel = useRef(new Animated.Value(0)).current;
  const ink = useRef(new Animated.Value(0)).current;
  const characters = Array.from(line.text);

  useEffect(() => {
    Animated.timing(panel, { toValue: 1, duration: reducedMotion ? 0 : 360, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start();
    Animated.timing(ink, { toValue: 1, delay: reducedMotion ? 0 : 160, duration: reducedMotion ? 0 : 280, useNativeDriver: Platform.OS !== 'web' }).start();
    return () => { panel.stopAnimation(); ink.stopAnimation(); };
  }, [panel, ink, reducedMotion]);

  useEffect(() => {
    if (complete || reducedMotion) { position.current = characters.length; setCount(characters.length); onTyping(false); return; }
    if (paused || position.current === characters.length) return;
    onTyping(true);
    let interval: ReturnType<typeof setInterval> | undefined;
    const delay = setTimeout(() => {
      interval = setInterval(() => {
        position.current = Math.min(position.current + 1, characters.length);
        setCount(position.current);
        if (position.current === characters.length) { clearInterval(interval); onTyping(false); }
      }, 22);
    }, 180);
    return () => { clearTimeout(delay); clearInterval(interval); };
  }, [line.text, complete, reducedMotion, paused, onTyping]);

  return (
    <AnimatedPressable accessible={false} onPressIn={() => { scrolling.current = false; }} onPress={(event) => { if (!scrolling.current) onAdvance(event.nativeEvent.pageX); }} style={[styles.card, compact && styles.compact, { maxHeight, opacity: panel, transform: [{ translateY: panel.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }]}>
      <ScrollView nestedScrollEnabled showsVerticalScrollIndicator contentContainerStyle={styles.content} onScrollBeginDrag={() => { scrolling.current = true; }}>
        <View>
        <View style={styles.heading}>
          <View style={styles.accent} />
          <Text style={styles.speaker}>{line.speaker}</Text>
        </View>
        <Animated.View style={{ opacity: ink, transform: [{ translateX: ink.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }}>
          <Text accessibilityLabel={line.text} style={[styles.text, compact && styles.smallText]}>
            {characters.slice(0, count).join('')}<Text style={styles.hidden}>{characters.slice(count).join('')}</Text>
          </Text>
        </Animated.View>
        </View>
        {children}
      </ScrollView>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 4, paddingHorizontal: 30, paddingVertical: 22, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.22, shadowRadius: 20, elevation: 8 },
  compact: { paddingHorizontal: 20, paddingVertical: 14 },
  content: { flexGrow: 1 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  accent: { width: 20, height: 2, backgroundColor: '#9b753f' },
  speaker: { color: '#846236', fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  text: { color: '#111', fontSize: 21, lineHeight: 31 },
  smallText: { fontSize: 16, lineHeight: 24 },
  hidden: { color: 'transparent' },
});
