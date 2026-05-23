import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';
import { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const { login, loginAsGuest } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    const result = await login(username, password);
    setLoading(false);
    if (!result.success) setError(result.error || 'Login failed');
  };

  const handleGuest = () => {
    Alert.alert(
      'Continue as Guest',
      'Your data will be stored only on this device and will not sync. You can sign up later to keep your data safe.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => loginAsGuest() },   // edit this for better looking notification
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandWrap}>
            <View style={styles.logoBox}>
              <Text style={styles.logoEmoji}>⚙️</Text>
            </View>
            <Text style={styles.brandTitle}>SERVICE</Text>
            <Text style={styles.brandSubtitle}>TRACKER</Text>
            <View style={styles.tagline}>
              <View style={styles.taglineDot} />
              <Text style={styles.taglineText}>NEVER MISS A SERVICE</Text>
              <View style={styles.taglineDot} />
            </View>
          </View>

          <View style={styles.form}>
            <Text style={styles.heading}>Welcome back</Text>
            <Text style={styles.subheading}>Sign in to track your vehicles</Text>

            <Input
              label="Username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Enter username"
            />

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter password"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Button
              title="Sign In"
              onPress={handleLogin}
              loading={loading}
              fullWidth
              size="lg"
              style={{ marginTop: theme.spacing.sm }}
            />

            <View style={styles.dividerWrap}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OR</Text>
              <View style={styles.dividerLine} />
            </View>

            <Button
              title="Continue as Guest"
              onPress={handleGuest}
              variant="secondary"
              fullWidth
              size="lg"
            />

            <View style={styles.signupRow}>
              <Text style={styles.signupPrompt}>Don't have an account? </Text>
              <Text
                style={styles.signupLink}
                onPress={() => navigation.navigate('Signup')}
              >
                Sign up
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { flexGrow: 1, padding: theme.spacing.xl, paddingTop: theme.spacing.xxl },
  brandWrap: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxxl,
  },
  logoBox: {
    width: 72,
    height: 72,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  logoEmoji: { fontSize: 36 },
  brandTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.huge,
    fontWeight: theme.fontWeight.black,
    letterSpacing: 4,
    lineHeight: 48,
  },
  brandSubtitle: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.huge,
    fontWeight: theme.fontWeight.black,
    letterSpacing: 4,
    lineHeight: 48,
  },
  tagline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.md,
  },
  taglineDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.textMuted,
    marginHorizontal: theme.spacing.sm,
  },
  taglineText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    letterSpacing: 2,
    fontWeight: theme.fontWeight.semibold,
  },
  form: {
    backgroundColor: theme.colors.bgElevated,
    borderRadius: theme.radius.xl,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  heading: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
  },
  subheading: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    marginBottom: theme.spacing.xl,
    marginTop: 4,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.sm,
    marginBottom: theme.spacing.sm,
  },
  dividerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: theme.spacing.lg,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  dividerText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: 2,
    marginHorizontal: theme.spacing.md,
  },
  signupRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: theme.spacing.xl,
  },
  signupPrompt: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
  },
  signupLink: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
});
