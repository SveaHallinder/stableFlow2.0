import React from 'react';
import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Sidan hittades inte' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Sidan finns inte</Text>
        <Text style={styles.body}>
          Den här sidan kunde inte hittas. Gå tillbaka till startsidan.
        </Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Gå till startsidan</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#F8FAFD',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1C2439',
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    color: '#5A6785',
    textAlign: 'center',
    lineHeight: 20,
  },
  link: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#2D6CF6',
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
