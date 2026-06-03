import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Link } from "expo-router";
import { getApp } from "@react-native-firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  signInWithCredential,
  GoogleAuthProvider,
} from "@react-native-firebase/auth";
import {
  GoogleSignin,
  isSuccessResponse,
} from "@react-native-google-signin/google-signin";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { useAuth } from "@/context/AuthContext";
import { theme } from "@/theme";
import { ThemedAlert, AlertButton } from "@/components/ThemedAlert";

const authInstance = getAuth(getApp());

export default function LoginScreen() {
  const { loginAsGuest } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message?: string;
    buttons?: AlertButton[];
  } | null>(null);

  useEffect(() => {
    const webClientId =
      "735398182032-7hjj4m5dap6chhjj3939ketcllja3nrq.apps.googleusercontent.com";
    GoogleSignin.configure({ webClientId, offlineAccess: true });
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(authInstance, email.trim(), password);
    } catch (err: any) {
      if (
        err.code === "auth/wrong-password" ||
        err.code === "auth/user-not-found"
      ) {
        setError("Invalid email or password.");
      } else if (err.code === "auth/invalid-email") {
        setError("That email address is invalid.");
      } else {
        setError(err.message || "Login failed");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      await GoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const response = await GoogleSignin.signIn();
      if (isSuccessResponse(response)) {
        const idToken = response.data.idToken;
        if (!idToken) throw new Error("No ID token returned from Google.");
        const googleCredential = GoogleAuthProvider.credential(idToken);
        await signInWithCredential(authInstance, googleCredential);
      }
    } catch (err: any) {
      if (err.code !== "ASYNC_OP_IN_PROGRESS") {
        setError("Google sign-in failed. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleGuest = () => {
    setAlertConfig({
      title: "Continue as Guest",
      message:
        "Your vehicles and service history will only live on this device. Sign up later to back up your data.",
      buttons: [
        { text: "Cancel", style: "cancel" },
        { text: "Continue", onPress: () => loginAsGuest() },
      ],
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.brandWrap}>
            <View style={styles.logoBox}>
              <Text style={styles.logoEmoji}>⚙️</Text>
            </View>
            <Text style={styles.brandTitle}>SERVICE</Text>
            <Text style={styles.brandSubtitle}>TRACKER</Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.heading}>Welcome back</Text>
            <Text style={styles.subheading}>
              Sign in to track your vehicles
            </Text>

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
              fullWidth
              size="lg"
            />

            <Button
              title="Continue with Google"
              onPress={handleGoogleLogin}
              loading={googleLoading}
              variant="secondary"
              fullWidth
              size="lg"
              style={{ marginTop: theme.spacing.sm }}
            />

            <Button
              title="Continue as Guest"
              onPress={handleGuest}
              variant="ghost"
              fullWidth
              size="lg"
              style={{ marginTop: theme.spacing.sm }}
            />

            <Link href="/(auth)/signup" style={styles.linkText}>
              Don't have an account? Sign up
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ThemedAlert
        visible={!!alertConfig}
        title={alertConfig?.title ?? ""}
        message={alertConfig?.message}
        buttons={alertConfig?.buttons}
        onRequestClose={() => setAlertConfig(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  scroll: { padding: theme.spacing.xl },
  brandWrap: { alignItems: "center", marginBottom: theme.spacing.xl },
  logoBox: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: theme.colors.bgCard,
    alignItems: "center",
    justifyContent: "center",
  },
  logoEmoji: { fontSize: 40 },
  brandTitle: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.black,
    letterSpacing: 4,
    marginTop: theme.spacing.md,
  },
  brandSubtitle: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 6,
  },
  form: { gap: theme.spacing.md },
  heading: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
  },
  subheading: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    marginBottom: theme.spacing.md,
  },
  errorText: { color: theme.colors.danger, fontSize: theme.fontSize.sm },
  linkText: {
    color: theme.colors.accent,
    textAlign: "center",
    marginTop: theme.spacing.lg,
  },
});
