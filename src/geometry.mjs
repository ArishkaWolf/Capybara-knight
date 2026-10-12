// The same image frame is used by resizeMode and the clickable regions.
export function imageFrame(imageSize, viewport, mode = 'contain', insets = {}) {
  const left = insets.left ?? 0;
  const top = insets.top ?? 0;
  const availableWidth = Math.max(1, viewport.width - left - (insets.right ?? 0));
  const availableHeight = Math.max(1, viewport.height - top - (insets.bottom ?? 0));
  const scale = Math[mode === 'cover' ? 'max' : 'min'](availableWidth / imageSize.width, availableHeight / imageSize.height);
  const width = imageSize.width * scale;
  const height = imageSize.height * scale;
  return { x: left + (availableWidth - width) / 2, y: top + (availableHeight - height) / 2, width, height };
}

export function hotspotBox(rect, frame, viewport, minimum = 48, insets = {}) {
  const left = insets.left ?? 0;
  const top = insets.top ?? 0;
  const availableWidth = Math.max(1, viewport.width - left - (insets.right ?? 0));
  const availableHeight = Math.max(1, viewport.height - top - (insets.bottom ?? 0));
  const width = Math.min(availableWidth, Math.max(minimum, rect.width * frame.width));
  const height = Math.min(availableHeight, Math.max(minimum, rect.height * frame.height));
  const centerX = frame.x + (rect.x + rect.width / 2) * frame.width;
  const centerY = frame.y + (rect.y + rect.height / 2) * frame.height;
  return { left: Math.max(left, Math.min(left + availableWidth - width, centerX - width / 2)), top: Math.max(top, Math.min(top + availableHeight - height, centerY - height / 2)), width, height };
}

// Visual outlines follow the artwork; touch targets may be larger on small screens.
export function outlineSegments(points, frame) {
  return points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    const x = frame.x + point.x * frame.width;
    const y = frame.y + point.y * frame.height;
    const dx = (next.x - point.x) * frame.width;
    const dy = (next.y - point.y) * frame.height;
    const width = Math.hypot(dx, dy);
    return { left: x + dx / 2 - width / 2, top: y + dy / 2, width, angle: Math.atan2(dy, dx) * 180 / Math.PI };
  });
}
