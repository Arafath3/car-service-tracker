# Service Tracker — Car & Motorbike Service Reminder App

A React Native + TypeScript app built with Expo (Android-focused) that tracks vehicle mileage and reminds you when a service is due. Its standout feature is **automatic, Bluetooth-triggered trip detection** that logs your drives with little to no manual input — and, on Android 13+, can detect a trip **even when the app has been fully closed**.

> **Origins:** This started as a university assignment (a basic mileage tracker, since submitted). The automatic and cold-start detection described below were built afterward as a side project and go well beyond the original spec.

---

## Features

- **Login / Signup / Guest Mode** — guests are local-only; registered users sync to the cloud (Firebase)
- **Multiple Vehicles** — add cars and motorbikes to your garage
- **Manual GPS Trip Tracking** — start/stop a trip and watch distance update live
- **Automatic Bluetooth Trip Detection** — link a vehicle's Bluetooth device (car stereo, FM/cigarette-lighter adapter, helmet intercom, etc.); trips start and stop automatically when you connect/disconnect
- **Cold-Start Detection (Android 13+)** — detects and logs trips even when the app is fully swiped away, using Android's CompanionDeviceManager plus a native location service
- **State-Machine Detection Engine** — `idle → monitoring → moving → driving → stopped → validating → awaiting_confirmation`
- **Trip Confirmation via Notification** — you confirm or reject each detected trip
- **Auto Odometer Update** — confirmed trips update the vehicle's mileage
- **Service Schedule** — built-in service intervals for cars and motorbikes, plus custom intervals
- **Charts & Dashboard** — mileage history and service-health visualizations
- **Service History** — log past services with cost and notes

---

## How Detection Works (Two Layers)

Detection is built in two layers so it can react both when the app is alive and when it's been killed.

### Warm path — app alive or backgrounded

1. A native Bluetooth module listens for Bluetooth connect/disconnect events.
2. When a **linked** vehicle's Bluetooth connects, the app starts passive GPS detection (the state machine).
3. GPS feeds the state machine, which classifies movement and accumulates trip distance.
4. When the vehicle's Bluetooth disconnects, the trip is finalized and you get a confirmation notification.

This means GPS only runs **during a drive**, not constantly — the Bluetooth connection is a cheap, high-confidence signal for "a trip is happening," which keeps battery use low.

### Cold path — app fully killed (Android 13+ only)

Android blocks apps from starting a location foreground service from the background, so a normal background listener can't begin GPS tracking from a cold start. The app works around this using the **CompanionDeviceManager (CDM)**, Android's official mechanism for reacting to a companion device:

1. Each vehicle's Bluetooth device is **associated** via CDM (a one-time system consent dialog when you link it).
2. CDM wakes the app when that device appears — **even if the app has been swiped away**.
3. A **native (Kotlin) foreground location service** collects GPS points. Because it's started via the CDM exemption, it's allowed to run and keep location access from the background — something `expo-location` cannot do.
4. GPS points are buffered to disk during the trip.
5. The next time the app opens, JavaScript reads the buffered points and reconciles them into a pending trip using the same distance math as the warm path.

---

## Setup (Android)

### 1. Prerequisites

- **Node.js 18+**
- **Android Studio** (for the Android SDK) or a real Android device with USB debugging
- **Java JDK 17**

### 2. Install dependencies

```bash
npm install
```

If you hit peer-dependency errors: `npm install --legacy-peer-deps`

### 3. Build a custom dev client (required)

Background location **and** the native Bluetooth/CDM module do **not** work in Expo Go. You must build a custom dev client:

```bash
npx expo prebuild --clean --platform android
npx expo run:android
```

The first build takes several minutes; later builds are faster.

> Package name: `com.arafath.servicetracker`. If you reinstall and hit a "signatures do not match" error, run `adb uninstall com.arafath.servicetracker` first.

---

## Using Automatic Detection

1. Add a vehicle with its current odometer reading.
2. Open the **Automatic Detection** screen.
3. **Tap a vehicle row** to link its Bluetooth device, then pick the device from the list.
   - On Android 13+, confirm the system **companion device** dialog — this is what enables cold-start detection.
4. Toggle the **Automatic Detection** master switch on, and grant:
   - Location **"Allow all the time"** (required for background tracking)
   - Notifications (Android 13+)
5. Connect to that vehicle's Bluetooth and drive — the trip starts automatically (the vehicle row shows a **TRACKING** badge).
6. Disconnect (e.g. engine off) — the trip is finalized and you get a confirmation notification.
7. Tap the notification, review the trip, and confirm — the distance is added to the vehicle's odometer.

### Testing without a real car

You can validate the full pipeline using a stand-in Bluetooth device and a mock-location app:

1. Pair any Bluetooth device (e.g. earbuds) and link it to a vehicle.
2. Set **Lockito** as the mock-location app in Developer Options, and play a **moving route** (not a fixed pin).
3. Turn on **Demo Mode** in the app, which lowers the driving threshold so simulated speeds register.
4. Connect the device, let the route play, then disconnect.

> **Important:** Simulator testing validates the _logic_ (state transitions, trip creation, cold-start wake). It does **not** validate real-world distance accuracy, because mock GPS points are clean and evenly spaced. Real distance accuracy and the compensation factor must be checked on an actual drive.

---

## Architecture

### State Machine

| State                   | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `idle`                  | Detection off                                                   |
| `monitoring`            | Watching GPS, waiting for movement                              |
| `moving`                | Movement detected, evaluating whether it's driving (vs walking) |
| `driving`               | Confirmed driving, accumulating distance                        |
| `stopped`               | Speed dropped — possible end of trip                            |
| `validating`            | Wait window before declaring the trip ended                     |
| `awaiting_confirmation` | Notification sent, waiting for the user's response              |

### Event-Driven, Not Polling

The app never polls. It registers a `TaskManager.defineTask` callback and subscribes to GPS via `Location.startLocationUpdatesAsync`. Android wakes the task only when the device moves far enough or enough time passes; the task runs the state machine, persists context, and goes back to sleep.

### Rolling-Window Classification

Decisions use a rolling window of recent snapshots rather than single (noisy) readings — average speed, max speed, speed consistency, stop frequency, and consecutive-driving/stopped counts — making the classifier robust against GPS jitter.

### Distance Calculation

Distance between consecutive GPS points uses the **Haversine formula**. A **compensation factor** (default `1.15`) is applied at trip completion because sparse GPS samples capture straight lines between waypoints while real roads curve. _This factor should be tuned against real-world drives._

### Native Module (`modules/bluetooth-detection`)

A local Expo module written in Kotlin handles everything Android-native:

- Bluetooth connect/disconnect listening
- CompanionDeviceManager association and presence observation
- A `CompanionDeviceService` that the OS wakes on device appearance/disappearance (cold-start)
- A `FusedLocationProvider`-based foreground service for native GPS collection during cold trips
- Buffering GPS points to disk and exposing them to JavaScript

### Storage

Hybrid: **guests** store everything locally in `AsyncStorage`; **registered users** sync vehicles and services to **Firestore** (Firebase modular SDK). Trips and raw GPS are always local. Detection context is persisted after every snapshot, so the state survives the OS killing the app.

---

## Project Structure

```
car-service-tracker/
├── index.js                          # Entry: registers the headless task, then loads expo-router
├── app.json                          # Expo config + Android permissions
├── package.json
├── modules/
│   └── bluetooth-detection/          # Local native (Kotlin) module
│       ├── src/                      # TS interface (BluetoothDetectionModule.ts, types)
│       └── android/.../bluetoothdetection/
│           ├── BluetoothDetectionModule.kt        # Bluetooth listener + CDM functions
│           ├── BluetoothConnectionReceiver.kt     # Manifest broadcast receiver
│           ├── CompanionDeviceTrackingService.kt  # CDM presence service (cold wake)
│           ├── NativeLocationService.kt           # Native GPS collection (cold trips)
│           ├── MonitoringService.kt               # Keep-alive foreground service
│           └── AndroidManifest.xml
└── src/
    ├── app/                          # Expo Router screens
    │   └── (app)/
    │       ├── _layout.tsx           # Wraps the app in BluetoothProvider
    │       └── detection/index.tsx   # Automatic Detection screen
    ├── components/                   # ThemedAlert, BluetoothPickerModal, etc.
    ├── context/
    │   ├── AuthContext.tsx
    │   └── BluetoothProvider.tsx     # App-wide Bluetooth listener (warm path)
    ├── hooks/                        # useVehicles, useServices
    ├── lib/
    │   ├── storage.ts                # Hybrid storage, detection context, pending trips
    │   ├── detectionEngine.ts        # State machine + classifier
    │   ├── passiveDetectionService.ts# Background task, control API, cold-trip reconcile
    │   ├── serviceIntervals.ts
    │   └── notifications.ts
    ├── theme/
    └── types/index.ts
```

---

## Tunable Parameters

Detection thresholds live in `src/lib/detectionEngine.ts` (and the stored detection config). Key values:

```typescript
drivingMinKmh; // Minimum speed to count as "driving" (lowered in Demo Mode)
movementMinKmh; // Floor for "moving" vs stationary
rollingWindowSize; // Snapshots kept in the rolling window
roadCompensationFactor; // Multiplier for GPS straight-line bias (default 1.15)
```

**Demo Mode** lowers the driving threshold and shortens the validation window so the state machine can be exercised at walking speed or with a GPS simulator.

---

## Limitations & Future Work

| Limitation                                  | Why                                                               | Notes / Workaround                                                                    |
| ------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Cold-start needs Android 13+                | CompanionDeviceManager presence API requires API 33+              | On older Android, only the warm path works (app must be alive or backgrounded)        |
| OEM battery managers can interfere          | Samsung, Xiaomi, etc. aggressively kill background apps           | Disable battery optimization for the app for reliable cold-start wakes                |
| Real-world distance not yet validated       | All testing so far used a GPS simulator (clean, synthetic points) | Tune `roadCompensationFactor` against real drives vs. a known odometer/route distance |
| Multiple cold trips merge                   | One cold-trip buffer per app-open cycle                           | Splitting on the disconnect boundary is planned                                       |
| `expo-location` can't start from background | Platform restriction on background location foreground services   | Cold trips use the native `FusedLocationProvider` service instead                     |
| No accelerometer wake                       | Sensors don't run reliably in the background                      | Bluetooth connection + CDM presence serve the same purpose more efficiently           |

---

## Notes

The detection engine is source-agnostic — the state machine and classifier don't care whether snapshots come from `expo-location` (warm path) or the native GPS service (cold path). Bluetooth is used purely as a high-confidence trigger for _when_ a trip is happening, which keeps GPS — and battery — off except during actual drives.
