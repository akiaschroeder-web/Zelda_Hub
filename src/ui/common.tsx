import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { COLORS } from './theme';

export function Button({
  label,
  onPress,
  primary,
  disabled,
  small,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  small?: boolean;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.btn,
        small && styles.btnSmall,
        primary && styles.btnPrimary,
        disabled && styles.btnDisabled,
        pressed && !disabled && { opacity: 0.75 },
      ]}
    >
      <Text style={[styles.btnText, small && { fontSize: 13 }, primary && styles.btnTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

/** A dimmed full-screen overlay with a centred dialog. */
export function Dialog({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <View style={styles.overlay}>
      <View style={styles.dialog}>
        <Text style={styles.dialogTitle}>{title}</Text>
        {children}
      </View>
    </View>
  );
}

export const text = StyleSheet.create({
  title: { color: COLORS.text, fontSize: 26, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
  heading: { color: COLORS.gold, fontSize: 13, fontWeight: '700', letterSpacing: 1.2 },
  body: { color: COLORS.text, fontSize: 14 },
  dim: { color: COLORS.textDim, fontSize: 13 },
});

const styles = StyleSheet.create({
  btn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.panelBorder,
    backgroundColor: COLORS.panel,
    alignItems: 'center',
  },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 12 },
  btnPrimary: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: COLORS.text, fontWeight: '700', fontSize: 15 },
  btnTextPrimary: { color: COLORS.background },
  panel: {
    backgroundColor: COLORS.panel,
    borderColor: COLORS.panelBorder,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialog: {
    backgroundColor: COLORS.panel,
    borderColor: COLORS.gold,
    borderWidth: 2,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 24,
    maxWidth: 420,
  },
  dialogTitle: { color: COLORS.text, fontSize: 20, fontWeight: '700', textAlign: 'center' },
});
