import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { Image, type ImageProps } from 'expo-image';

type Frame = { id: string; source: ImageProps['source']; fit: 'contain' | 'cover'; insets: { top: number; bottom: number; left: number; right: number } };
type Request = { frame: Frame; covered: boolean; loaded: boolean; swapped: boolean; revealing: boolean };

/** Keep the previous illustration until the next bitmap is ready behind black. */
export function SceneBackdrop({ frame, reducedMotion, onReady, onError }: { frame: Frame; reducedMotion: boolean; onReady: (id: string) => void; onError: (id: string) => void }) {
  const [active, setActive] = useState<Frame | null>(null);
  const [pending, setPending] = useState<Frame | null>(null);
  const shade = useRef(new Animated.Value(1)).current;
  const request = useRef<Request | null>(null);
  const motion = useRef(reducedMotion);
  motion.current = reducedMotion;
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };

  function swap(current: Request) {
    if (request.current !== current || !current.covered || !current.loaded || current.swapped) return;
    current.swapped = true;
    setActive(current.frame);
    setPending(null);
  }

  useEffect(() => {
    const current: Request = { frame, covered: false, loaded: false, swapped: false, revealing: false };
    request.current = current;
    setPending(frame);
    shade.stopAnimation();
    Animated.timing(shade, { toValue: 1, duration: motion.current ? 0 : 220, useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => {
      if (!finished || request.current !== current) return;
      current.covered = true;
      swap(current);
    });
    return () => { request.current = null; shade.stopAnimation(); };
    // A frame ID includes the image, fallback source, fit and story version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame.id, shade]);

  function reveal(id: string) {
    const current = request.current;
    if (!current || current.frame.id !== id || !current.swapped || current.revealing) return;
    current.revealing = true;
    Animated.timing(shade, { toValue: 0, duration: motion.current ? 0 : 380, useNativeDriver: Platform.OS !== 'web' }).start(({ finished }) => {
      if (finished && request.current === current) callbacks.current.onReady(id);
    });
  }

  const imageStyle = (item: Frame) => [StyleSheet.absoluteFill, item.fit === 'contain' && frame.insets];
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>
    {active && <Image source={active.source} contentFit="cover" blurRadius={24} cachePolicy="disk" transition={0} style={[StyleSheet.absoluteFill, { opacity: 0.3 }]} accessible={false} />}
    {active && <Image key={active.id} source={active.source} contentFit={active.fit} cachePolicy="disk" transition={0} style={imageStyle(active)} onDisplay={() => reveal(active.id)} onError={() => callbacks.current.onError(active.id)} accessible={false} />}
    {pending && <Image key={`preload:${pending.id}`} source={pending.source} contentFit={pending.fit} cachePolicy="disk" transition={0} style={[imageStyle(pending), { opacity: 0 }]} onLoad={() => {
      const current = request.current;
      if (current?.frame.id === pending.id) { current.loaded = true; swap(current); }
    }} onError={() => { if (request.current?.frame.id === pending.id) callbacks.current.onError(pending.id); }} accessible={false} />}
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#080706', opacity: shade }]} />
  </View>;
}
