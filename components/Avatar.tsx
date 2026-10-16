import React from 'react';
import { ImageSourcePropType, ImageStyle, StyleProp } from 'react-native';
import { PrivateImage } from '@/components/PrivateImage';

const FALLBACK = require('@/assets/images/dummy-avatar.png');

type AvatarProps = {
  source?: ImageSourcePropType;
  style?: StyleProp<ImageStyle>;
  accessibilityLabel?: string;
};

export const Avatar = React.memo(function Avatar({
  source,
  style,
  accessibilityLabel,
}: AvatarProps) {
  return (
    <PrivateImage
      source={source}
      fallbackSource={FALLBACK}
      compact
      style={style}
      accessibilityLabel={accessibilityLabel ?? 'Profilbild'}
    />
  );
});
