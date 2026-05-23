import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import auth from '@react-native-firebase/auth';

import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { theme } from '../theme';
import { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export const LoginScreen: React.FC<Props> = ({ navigation }) => {
  // Assuming your AuthContext will expose these Firebase hooks or handle them
  const { loginAsGuest } = useAuth(); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({
      // Get this from your webClientId in firebase console / google-services.json
      webClientId: 'YOUR_WEB_CLIENT_ID_HERE.apps.googleusercontent.com', 
      offlineAccess: true,
    });
  }, []);

  // --- 1. Firebase Email & Password Sign In ---
  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await auth().signInWithEmailAndPassword(email.trim(), password);
      // Firebase's onAuthStateChanged listener in your app root will route them in automatically
    } catch (err: any) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/user-not-found') {
        setError('Invalid email or password.');
      } else if (err.code === 'auth/invalid-email') {
        setError('That email address is invalid.');
      } else {
        setError(err.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  // --- 2. Firebase Google Sign In ---
const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      
   
      const response = await GoogleSignin.signIn();
   
      if (isSuccessResponse(response)) {

        const idToken = response.data.idToken;
        
        if (!idToken) {
           throw new Error('Google Sign-In succeeded, but no ID token was returned.');
        }

        const googleCredential = auth.GoogleAuthProvider.credential(idToken);
        
        // Sign-in the user with the credential
        await auth().signInWithCredential(googleCredential);
      } else {
        // The user cancelled the prompt or dismissed the bottom sheet
        console.log('Sign in cancelled or no credential found', response);
      }

    } catch (err: any) {
      if (err.code !== 'ASYNC_OP_IN_PROGRESS') {
        setError('Google sign-in failed. Please try again.');
        console.error(err);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGuest = () => {
    Alert.alert(
      'Continue as Guest',
      'Your vehicles and service history will only live on this device. Sign up later to back up your data safely.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Continue', 
          style: 'default',
          onPress: () => loginAsGuest() 
        },
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
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              placeholder="Enter your email"
            />

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Enter your password"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Button
              title="Sign In"
              onPress={handleLogin}
              loading={loading}
              disabled={googleLoading}
              fullWidth
              size="lg"
              style={{ marginTop: theme.spacing.sm }}
            />

            {/* Custom styled Google Auth Button to match your theme layout */}
            <Button
              title="Sign In with Google"
              onPress={handleGoogleLogin}
              loading={googleLoading}
              disabled={loading}
              variant="secondary"
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