# Service Tracker — Car & Motorbike Service Reminder App

A React Native + TypeScript app built with Expo (Android-focused) that tracks vehicle mileage and reminds you when services are due. It now includes **passive driving detection** using a state-machine + GPS rolling-window classifier.

## Features

✅ **Login / Signup / Guest Mode** — Local-only auth, no server needed
✅ **Multiple Vehicles** — Add cars and motorbikes to your garage
✅ **Manual GPS Trip Tracking** — Start/stop a trip, track distance live
✅ **🆕 Passive Driving Detection** — App detects driving in the background
✅ **State-machine Detection Engine** — idle → monitoring → moving → driving → stopped → validating → confirmation
✅ **Trip Confirmation via Notification** — Asks user to confirm detected trips
✅ **Auto Odometer Update** — Confirmed trips automatically update vehicle mileage
✅ **Service Schedule** — Built-in service intervals for cars and motorbikes
✅ **Charts & Dashboard** — Mileage history line chart + service health progress chart
✅ **Service History** — Log past services with cost and notes
✅ **State Machine Debug Panel** — Watch state transitions live for assignment demo

---

## Setup Instructions (Android)

### 1. Prerequisites
- **Node.js 18+** ([download](https://nodejs.org/))
- **Android Studio** (for the Android SDK + emulator) OR a real Android phone with USB debugging
- **Java JDK 17** (Android Studio usually installs this for you)

### 2. Install dependencies

```bash
npm install
```

If you hit dependency errors: `npm install --legacy-peer-deps`

### 3. Build a custom dev client (REQUIRED for passive detection)

⚠️ **Important**: The passive detection feature uses background location, which **does not work in Expo Go**. You must build a custom dev client.

```bash
# Generate Android native project
npx expo prebuild --platform android

# Build and install on your device/emulator
npx expo run:android
```

This takes 5–15 minutes the first time. After that, it's much faster.

### 4. Open the app

The custom build will install automatically. Look for the `CarServiceTracker` app icon.

---

## How to Test the Passive Detection Feature

1. **Open the app** → log in or continue as guest
2. **Add a vehicle** with current odometer reading
3. From the home screen, tap **"Auto-detect Trips"**
4. **Select your vehicle**
5. **Toggle "Background Detection" ON**
   - Grant **"Allow all the time"** for location (required for background)
   - Grant **notifications** permission (Android 13+)
6. The app will now start monitoring. State will be `MONITORING`.
7. **Close the app** and **drive somewhere** (or take a long bus/car ride)
8. As you move, the state will transition: `monitoring → moving → driving`
9. When you stop for 5+ minutes, you'll get a **notification asking to confirm the trip**
10. Tap the notification → review the trip → tap **"Yes, save this trip"**
11. The trip distance is added to your vehicle's odometer

### Testing without driving

If you can't actually drive, you can validate the state machine by:
1. Opening the **Passive Detection** screen
2. Toggling **STATE MACHINE LOG** open
3. Walking around for a few minutes — you'll see snapshots logged but no driving trigger (correctly classified as walking)
4. Adjusting `CONFIG.DRIVING_MIN_KMH` in `src/utils/detectionEngine.ts` to a lower value (e.g. 5 km/h) to test driving detection at walking speed

---

## Architecture

### State Machine

The detection engine uses a **state machine** with the following states:

| State | Description |
|---|---|
| `idle` | Detection turned off |
| `monitoring` | Background snapshots running, waiting for movement |
| `moving` | Movement detected, evaluating if it's driving (vs walking) |
| `driving` | Confirmed driving, accumulating distance |
| `stopped` | Speed dropped, may be end of trip (red light? real stop?) |
| `validating` | 5-minute wait window before declaring trip ended |
| `awaiting_confirmation` | User notification sent, waiting for response |

### Event-Driven, Not Polling

The app does **not poll** for location. Instead:
1. We register a `TaskManager.defineTask` callback at module load
2. We call `Location.startLocationUpdatesAsync` to subscribe to GPS events
3. Android wakes our task only when:
   - The user moves 50+ meters, OR
   - 30+ seconds have passed
4. The task runs the state machine, persists context, may send a notification
5. The app goes back to sleep — no continuous loop, no constant battery drain

### Rolling Window Classification

Decisions are not made on single readings (which can be noisy). Instead, a 10-snapshot rolling window is maintained, and metrics are computed:

- **Average speed** over the window
- **Max speed**
- **Speed consistency** (1 - normalized stddev) — driving is smoother than walking
- **Stop frequency** — fraction of readings stationary
- **Consecutive driving readings** — need 2+ in a row to confirm driving
- **Consecutive stopped readings** — need 2+ in a row to suspect end of trip

This is what makes the classifier robust against GPS noise and momentary anomalies.

### Distance Calculation

Distance between consecutive GPS points is calculated with the **Haversine formula** (great-circle distance on a sphere). A **1.15× compensation factor** is applied at trip completion because GPS samples capture straight-line distances between waypoints, while real roads curve. This is a common approximation used in fitness/driving apps.

### Persistence

The detection context is saved to `AsyncStorage` after every snapshot. This means even if the OS kills the app, the next time the task runs we resume from where we left off — no state loss.

---

## Project Structure

```
CarServiceApp/
├── App.tsx                                  # Root - imports background task
├── app.json                                 # Expo config + Android permissions
├── package.json                             # Dependencies
└── src/
    ├── components/                          # Reusable UI
    ├── context/AuthContext.tsx
    ├── navigation/RootNavigator.tsx
    ├── screens/
    │   ├── LoginScreen.tsx
    │   ├── SignupScreen.tsx
    │   ├── HomeScreen.tsx                   # + passive detection card
    │   ├── AddVehicleScreen.tsx
    │   ├── VehicleDetailScreen.tsx
    │   ├── TrackTripScreen.tsx              # Manual trip tracking
    │   ├── AddServiceScreen.tsx
    │   ├── PassiveDetectionScreen.tsx       # 🆕 Passive detection control
    │   └── ConfirmTripScreen.tsx            # 🆕 Confirm/reject pending trip
    ├── theme/
    ├── types/index.ts                       # + DetectionState, PendingTrip, etc.
    └── utils/
        ├── storage.ts                       # + detection context, pending trips
        ├── serviceIntervals.ts
        ├── detectionEngine.ts               # 🆕 State machine + classifier
        ├── passiveDetectionService.ts       # 🆕 Background task + control API
        └── notificationSetup.ts             # 🆕 Notification handling
```

---

## Tunable Parameters

All thresholds live in `src/utils/detectionEngine.ts` under `CONFIG`. You can adjust:

```typescript
DRIVING_MIN_KMH: 15,                  // Minimum speed to be "driving"
CONSECUTIVE_DRIVING_REQUIRED: 2,      // Readings needed to confirm driving
VALIDATION_DURATION_MS: 5 * 60 * 1000, // 5 minutes wait before notification
ROLLING_WINDOW_SIZE: 10,              // Snapshots in rolling window
ROAD_COMPENSATION_FACTOR: 1.15,       // Multiplier for GPS straight-line bias
```

---

## Limitations & Future Work

| Limitation | Why | Workaround |
|---|---|---|
| Won't run in Expo Go | Background location requires native code | Use `npx expo prebuild` + `expo run:android` |
| OS may delay snapshots | Android battery optimization on per-vendor (Samsung, Xiaomi etc) | Disable battery optimization for the app |
| Doesn't work if app is force-killed | Foreground service notification is needed to keep alive | Don't swipe the app away |
| Distance is estimated | GPS samples are sparse to save battery | 1.15× compensation factor improves accuracy |
| No accelerometer-triggered wake | Accelerometer doesn't run in background | OS-driven location updates serve the same purpose more efficiently |

---

## Assignment Mapping

This implements every requirement from the assignment spec:

| Spec Requirement | Implementation |
|---|---|
| Event-driven not polling | TaskManager + Location.startLocationUpdates |
| Idle by default | `state: 'idle'` until user toggles |
| Activate on movement | `monitoring → moving` transition on first speed reading |
| Collect GPS, speed, timestamps | `LocationSnapshot` interface |
| Rolling time window | `recentSnapshots` array, `ROLLING_WINDOW_SIZE` |
| Average speed, consistency, stop frequency | `computeWindowMetrics()` |
| Boolean driving classification | `isDriving(metrics)` |
| Distance only while driving | `applyStateTransitionEffects` only adds km in driving state |
| Detect transition out of driving | `hasStoppedDriving(metrics)` |
| Validation phase with timer | `validating` state with `VALIDATION_DURATION_MS = 5min` |
| User confirmation notification | `sendTripConfirmationNotification()` |
| Persist or discard based on choice | `ConfirmTripScreen` with confirm/reject |
| Defined states with transitions | 7-state machine in `detectionEngine.ts` |
| Battery optimized | distanceInterval=50m + timeInterval=30s, no JS polling |
| Background platform compliance | Android `FOREGROUND_SERVICE_LOCATION`, persistent notification |

---

## Author Notes

The passive detection module is designed to be a faithful implementation of the assignment spec while being honest about React Native + Android constraints. The classifier and state machine logic is fully general — you can swap the snapshot source (GPS vs accelerometer-triggered GPS vs activity recognition) without changing the engine.
