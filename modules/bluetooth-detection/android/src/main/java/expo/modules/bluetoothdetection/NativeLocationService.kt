package expo.modules.bluetoothdetection

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import java.io.File
import org.json.JSONObject

class NativeLocationService : Service() {

  private var fusedClient: FusedLocationProviderClient? = null
  private var callback: LocationCallback? = null
  private var vehicleAddress: String = "unknown"

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
        != PackageManager.PERMISSION_GRANTED) {
      Log.d("BT_LOC", "Location permission missing; not starting")
      stopSelf()
      return START_NOT_STICKY
    }

    vehicleAddress = intent?.getStringExtra("address") ?: "unknown"

    if (!startAsForeground()) {
      stopSelf()
      return START_NOT_STICKY
    }

    startLocationUpdates()
    return START_STICKY
  }

  private fun startAsForeground(): Boolean {
    val channelId = "native_location"
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(channelId, "Trip Tracking", NotificationManager.IMPORTANCE_LOW)
      )
    }
    val notification: Notification = NotificationCompat.Builder(this, channelId)
      .setContentTitle("Service Tracker")
      .setContentText("Tracking your trip…")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .build()
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(4245, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
      } else {
        startForeground(4245, notification)
      }
      true
    } catch (e: Exception) {
      Log.d("BT_LOC", "startForeground FAILED: ${e.message}")
      false
    }
  }

  private fun startLocationUpdates() {
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
        != PackageManager.PERMISSION_GRANTED) {
      stopSelf()
      return
    }
    fusedClient = LocationServices.getFusedLocationProviderClient(this)
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 10000L)
      .setMinUpdateIntervalMillis(5000L)
      .setMinUpdateDistanceMeters(10f) // OS won't deliver hops < 10m → kills jitter at the source
      .build()
    callback = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        for (loc in result.locations) bufferPoint(loc)
      }
    }
    try {
      fusedClient?.requestLocationUpdates(request, callback!!, Looper.getMainLooper())
    } catch (e: Exception) {
      Log.d("BT_LOC", "requestLocationUpdates FAILED: ${e.message}")
      stopSelf()
    }
  }

  // Append-only NDJSON: O(1) per write, and a kill mid-write damages only the last line.
  private fun bufferPoint(loc: Location) {
    try {
      val line = JSONObject().apply {
        put("latitude", loc.latitude)
        put("longitude", loc.longitude)
        put("timestamp", loc.time)
        put("speed", loc.speed.toDouble())
        put("accuracy", if (loc.hasAccuracy()) loc.accuracy.toDouble() else -1.0)
        put("address", vehicleAddress)
      }.toString()
      File(filesDir, "coldtrip_active.ndjson").appendText(line + "\n")
    } catch (e: Exception) {
      Log.d("BT_LOC", "bufferPoint FAILED: ${e.message}")
    }
  }

  override fun onDestroy() {
    callback?.let { fusedClient?.removeLocationUpdates(it) }
    super.onDestroy()
  }
}