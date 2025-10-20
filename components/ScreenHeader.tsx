import React from 'react';
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Logo from '@/assets/images/logo-blue.svg';
import SearchIcon from '@/assets/images/Search-icon.svg';
import { HeaderIconButton, PageHeader } from '@/components/Primitives';
import { space } from '@/design/tokens';

type ScreenHeaderProps = {
  title: string;
  style?: StyleProp<ViewStyle>;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode; // Allow custom content in center
  showSearch?: boolean;
  onPressSearch?: () => void;
  showLogo?: boolean; // Control if logo should show by default
};

export const ScreenHeader = ({
  title,
  style,
  left,
  right,
  children,
  showSearch = true,
  onPressSearch,
  showLogo = true,
}: ScreenHeaderProps) => {
  // Resolve left content
  const resolvedLeft = typeof left !== 'undefined' 
    ? left 
    : showLogo 
      ? <Logo width={32} height={32} />
      : null;

  // Resolve right content
  const resolvedRight =
    typeof right !== 'undefined'
      ? right
      : showSearch
        ? (
          <HeaderIconButton onPress={onPressSearch}>
            <SearchIcon width={20} height={20} />
          </HeaderIconButton>
        )
        : null;

  return (
    <PageHeader
      style={[{ 
        marginBottom: 0, 
        justifyContent: 'space-between', 
        paddingVertical: 0,
        paddingHorizontal: 14,
      }, style]}
      title={title}
      left={resolvedLeft}
      right={resolvedRight}
    >
      {children}
    </PageHeader>
  );
};

export default ScreenHeader;
