import React from 'react';
import { Image, ImageSourcePropType, ImageStyle, StyleProp } from 'react-native';

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
  const [failed, setFailed] = React.useState(false);

  const resolvedSource = failed || !source ? FALLBACK : source;

  return (
    <Image
      source={resolvedSource}
      style={style}
      onError={() => setFailed(true)}
      accessibilityLabel={accessibilityLabel ?? 'Profilbild'}
    />
  );
});
