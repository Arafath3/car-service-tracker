import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LineChart, ProgressChart } from 'react-native-chart-kit';
import { Vehicle, ServiceRecord, Trip, RootStackParamList } from '../types';
import { useVehicles } from '../hooks/useVehicles';
import {
  getServicesForVehicle,
  getTripsForVehicle,
  deleteVehicle,
} from '../utils/storage';
import { calculateServiceStatuses, ServiceStatus } from '../utils/serviceIntervals';
import { ServiceStatusCard } from '../components/ServiceStatusCard';
import { StatTile } from '../components/StatTile';
import { Button } from '../components/Button';
import { theme } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'VehicleDetail'>;

const screenWidth = Dimensions.get('window').width;

export const VehicleDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { vehicleId } = route.params;
  const { vehicles, loading: loadingVehicles } = useVehicles();

  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);

  useEffect(() => {
    const target = vehicles.find((x) => x.id === vehicleId);

    if (!target && !loadingVehicles) {
      navigation.goBack();
      return;
    }

    if (target) {
      setVehicle(target);

      const fetchHistory = async () => {
        try {
          const serviceHistory = await getServicesForVehicle(vehicleId);
          const tripHistory = await getTripsForVehicle(vehicleId);

          setServices(serviceHistory);
          setTrips(tripHistory);
          setStatuses(calculateServiceStatuses(target, serviceHistory));
        } catch (err) {
          console.error('Error synchronizing local vehicle records:', err);
        } finally {
          setLoadingContext(false);
        }
      };

      fetchHistory();
    }
  }, [vehicles, vehicleId, loadingVehicles, navigation]);

  const handleDelete = () => {
    Alert.alert('Delete Vehicle', 'This will remove all service and trip data. Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteVehicle(vehicleId);
            navigation.goBack();
          } catch (err) {
            Alert.alert('Error', 'Failed to remove vehicle cleanly.');
          }
        },
      },
    ]);
  };

  if (loadingVehicles || (loadingContext && !vehicle)) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: theme.colors.textPrimary, padding: 20 }}>
          Loading metrics...
        </Text>
      </SafeAreaView>
    );
  }

  if (!vehicle) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={{ color: theme.colors.danger, padding: 20 }}>Vehicle not found.</Text>
      </SafeAreaView>
    );
  }

  const totalDistance = vehicle.currentOdometer - vehicle.startingOdometer;
  const totalTrips = trips.filter((trip) => !trip.isActive).length;
  const totalServices = services.length;
  const overdueCount = statuses.filter((status) => status.status === 'overdue').length;
  const dueSoonCount = statuses.filter((status) => status.status === 'due-soon').length;

  const recentTrips = [...trips]
    .filter((trip) => !trip.isActive && trip.endOdometer !== undefined)
    .slice(0, 6)
    .reverse();

  const hasChartData = recentTrips.length >= 2;

  const chartConfig = {
    backgroundGradientFrom: theme.colors.bgCard,
    backgroundGradientTo: theme.colors.bgCard,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(255, 107, 53, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
    propsForBackgroundLines: {
      stroke: theme.colors.border,
      strokeDasharray: '4 4',
    },
    propsForDots: {
      r: '5',
      strokeWidth: '2',
      stroke: theme.colors.accent,
    },
  };

  const progressData = {
    labels: ['Health'],
    data: [
      Math.max(
        0,
        Math.min(1, 1 - (overdueCount * 0.2 + dueSoonCount * 0.1))
      ),
    ],
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleDelete}>
          <Text style={styles.deleteText}>Delete</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>{vehicle.type === 'car' ? '🚗' : '🏍️'}</Text>

          <Text style={styles.heroNickname}>
            {vehicle.nickname || `${vehicle.make} ${vehicle.model}`}
          </Text>

          <Text style={styles.heroSubtitle}>
            {vehicle.year} · {vehicle.make} {vehicle.model}
          </Text>
        </View>

        <View style={styles.odometerCard}>
          <Text style={styles.odometerLabel}>CURRENT ODOMETER</Text>
          <Text style={styles.odometerValue}>{vehicle.currentOdometer.toLocaleString()}</Text>
          <Text style={styles.odometerUnit}>kilometers</Text>
        </View>

        <View style={styles.statRow}>
          <StatTile
            label="Distance Driven"
            value={totalDistance.toLocaleString()}
            unit="km"
            accent={theme.colors.accent}
          />

          <View style={{ width: theme.spacing.sm }} />

          <StatTile label="Trips" value={String(totalTrips)} accent={theme.colors.info} />
        </View>

        <View style={[styles.statRow, { marginTop: theme.spacing.sm }]}>
          <StatTile
            label="Services Logged"
            value={String(totalServices)}
            accent={theme.colors.success}
          />

          <View style={{ width: theme.spacing.sm }} />

          <StatTile
            label="Services Due"
            value={String(overdueCount + dueSoonCount)}
            accent={theme.colors.warning}
          />
        </View>

        <View style={styles.actionRow}>
          <Button
            title="🛰  Track Trip"
            onPress={() => navigation.navigate('TrackTrip', { vehicleId })}
            fullWidth
            size="lg"
          />
        </View>

        <View style={styles.actionRow}>
          <Button
            title="+ Log Service"
            onPress={() => navigation.navigate('AddService', { vehicleId })}
            variant="secondary"
            fullWidth
            size="lg"
          />
        </View>

        <Text style={styles.sectionTitle}>MILEAGE OVER TIME</Text>

        {hasChartData ? (
          <View style={styles.chartCard}>
            <LineChart
              data={{
                labels: recentTrips.map((_, index) => `T${index + 1}`),
                datasets: [
                  {
                    data: recentTrips.map((trip) => trip.endOdometer || 0),
                    strokeWidth: 3,
                  },
                ],
              }}
              width={screenWidth - theme.spacing.xl * 2 - 32}
              height={200}
              chartConfig={chartConfig}
              bezier
              style={styles.chart}
              withInnerLines
              withOuterLines={false}
            />

            <Text style={styles.chartCaption}>Odometer reading after each tracked trip</Text>
          </View>
        ) : (
          <View style={styles.emptyChart}>
            <Text style={styles.emptyChartText}>
              Track at least 2 trips to see your mileage chart
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>SERVICE HEALTH</Text>

        <View style={styles.healthRow}>
          <View style={styles.progressWrap}>
            <ProgressChart
              data={progressData}
              width={140}
              height={140}
              strokeWidth={12}
              radius={48}
              chartConfig={{
                backgroundGradientFrom: theme.colors.bgCard,
                backgroundGradientTo: theme.colors.bgCard,
                color: (opacity = 1) =>
                  overdueCount > 0
                    ? `rgba(239, 68, 68, ${opacity})`
                    : dueSoonCount > 0
                      ? `rgba(245, 158, 11, ${opacity})`
                      : `rgba(16, 185, 129, ${opacity})`,
                labelColor: () => 'transparent',
              }}
              hideLegend
            />

            <View style={styles.progressCenter} pointerEvents="none">
              <Text style={styles.progressPercent}>
                {Math.round(progressData.data[0] * 100)}%
              </Text>
            </View>
          </View>

          <View style={styles.healthInfo}>
            <View style={styles.healthRowItem}>
              <View style={[styles.healthDot, { backgroundColor: theme.colors.danger }]} />
              <Text style={styles.healthLabel}>Overdue</Text>
              <Text style={styles.healthValue}>{overdueCount}</Text>
            </View>

            <View style={styles.healthRowItem}>
              <View style={[styles.healthDot, { backgroundColor: theme.colors.warning }]} />
              <Text style={styles.healthLabel}>Due Soon</Text>
              <Text style={styles.healthValue}>{dueSoonCount}</Text>
            </View>

            <View style={styles.healthRowItem}>
              <View style={[styles.healthDot, { backgroundColor: theme.colors.success }]} />
              <Text style={styles.healthLabel}>OK</Text>
              <Text style={styles.healthValue}>
                {statuses.filter((status) => status.status === 'ok').length}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>SCHEDULED SERVICES</Text>

        {statuses.map((status) => (
          <ServiceStatusCard key={status.serviceType} status={status} />
        ))}

        {services.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: theme.spacing.xl }]}>
              SERVICE HISTORY
            </Text>

            {services.slice(0, 5).map((service) => (
              <View key={service.id} style={styles.historyCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.historyType}>{service.serviceType}</Text>
                  <Text style={styles.historyDate}>
                    {new Date(service.date).toLocaleDateString()} ·{' '}
                    {service.odometer.toLocaleString()} km
                  </Text>

                  {service.notes ? (
                    <Text style={styles.historyNotes}>{service.notes}</Text>
                  ) : null}
                </View>

                {service.cost ? (
                  <Text style={styles.historyCost}>${service.cost.toFixed(0)}</Text>
                ) : null}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
  },
  backText: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  deleteText: {
    color: theme.colors.danger,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.medium,
  },
  scroll: { paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.xxxl },
  hero: {
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
  },
  heroEmoji: { fontSize: 56 },
  heroNickname: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xxl,
    fontWeight: theme.fontWeight.bold,
    marginTop: theme.spacing.sm,
  },
  heroSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
    marginTop: 2,
  },
  odometerCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.accent,
  },
  odometerLabel: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 2,
  },
  odometerValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.huge + 8,
    fontWeight: theme.fontWeight.black,
    letterSpacing: 1,
    marginTop: 4,
  },
  odometerUnit: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  statRow: {
    flexDirection: 'row',
  },
  actionRow: {
    marginTop: theme.spacing.md,
  },
  sectionTitle: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.bold,
    letterSpacing: 2,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  chartCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chart: {
    borderRadius: theme.radius.md,
    marginVertical: theme.spacing.sm,
  },
  chartCaption: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.xs,
    marginTop: theme.spacing.xs,
  },
  emptyChart: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderStyle: 'dashed',
  },
  emptyChartText: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    textAlign: 'center',
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  progressWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressPercent: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.xl,
    fontWeight: theme.fontWeight.black,
  },
  healthInfo: {
    flex: 1,
    paddingLeft: theme.spacing.lg,
  },
  healthRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  healthDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: theme.spacing.sm,
  },
  healthLabel: {
    flex: 1,
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.md,
  },
  healthValue: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.bold,
  },
  historyCard: {
    backgroundColor: theme.colors.bgCard,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  historyType: {
    color: theme.colors.textPrimary,
    fontSize: theme.fontSize.md,
    fontWeight: theme.fontWeight.semibold,
  },
  historyDate: {
    color: theme.colors.textSecondary,
    fontSize: theme.fontSize.sm,
    marginTop: 2,
  },
  historyNotes: {
    color: theme.colors.textMuted,
    fontSize: theme.fontSize.sm,
    marginTop: 4,
    fontStyle: 'italic',
  },
  historyCost: {
    color: theme.colors.accent,
    fontSize: theme.fontSize.lg,
    fontWeight: theme.fontWeight.bold,
  },
});