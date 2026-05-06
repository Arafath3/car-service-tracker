// Theme - inspired by automotive dashboards
// Dark, refined, with bold accent colors
export const theme = {
  colors: {
    // Backgrounds
    bg: '#0A0E1A',
    bgElevated: '#141927',
    bgCard: '#1A2030',
    bgInput: '#1F2638',

    // Text
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',

    // Accents
    accent: '#FF6B35', // bright orange - automotive
    accentDark: '#E5552A',
    accentSoft: 'rgba(255, 107, 53, 0.15)',

    // Status
    success: '#10B981',
    successSoft: 'rgba(16, 185, 129, 0.15)',
    warning: '#F59E0B',
    warningSoft: 'rgba(245, 158, 11, 0.15)',
    danger: '#EF4444',
    dangerSoft: 'rgba(239, 68, 68, 0.15)',
    info: '#3B82F6',
    infoSoft: 'rgba(59, 130, 246, 0.15)',

    // Borders / dividers
    border: '#2A3245',
    borderLight: '#1F2638',

    // Special
    chartGradientFrom: '#FF6B35',
    chartGradientTo: '#FFA07A',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    xxxl: 48,
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 16,
    xl: 24,
    full: 9999,
  },
  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    huge: 44,
  },
  fontWeight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    black: '900' as const,
  },
};

export type Theme = typeof theme;
