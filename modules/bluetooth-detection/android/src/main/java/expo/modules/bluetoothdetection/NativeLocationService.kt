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
import org.json.JSONArray
import org.json.JSONObject

class NativeLocationService : Service() {

  private var fusedClient: FusedLocationProviderClient? = null
  private var callback: LocationCallback? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Permission could have been revoked since the user enabled detection.
    // If so, NEVER call startForeground with a location type — it throws and crashes the app.
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
        != PackageManager.PERMISSION_GRANTED) {
      Log.d("BT_LOC", "Location permission missing; not starting")
      stopSelf()
      return START_NOT_STICKY
    }

    val address = intent?.getStringExtra("address") ?: ""
    try {
      File(filesDir, "cold_trip_vehicle.txt").writeText(address)
    } catch (e: Exception) {
      Log.d("BT_LOC", "vehicle-address write FAILED: ${e.message}")
    }

    if (!startAsForeground()) {
      // Couldn't enter foreground — bail cleanly instead of leaving a zombie service
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
    // onStartCommand already verified permission, but check again defensively
    if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
        != PackageManager.PERMISSION_GRANTED) {
      Log.d("BT_LOC", "No fine-location permission; stopping")
      stopSelf()
      return
    }

    fusedClient = LocationServices.getFusedLocationProviderClient(this)
    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000L)
      .setMinUpdateIntervalMillis(3000L)
      .build()

    callback = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        for (loc: Location in result.locations) {
          bufferPoint(loc)
        }
      }
    }

    try {
      fusedClient?.requestLocationUpdates(request, callback!!, Looper.getMainLooper())
    } catch (e: Exception) {
      Log.d("BT_LOC", "requestLocationUpdates FAILED: ${e.message}")
      stopSelf()
    }
  }

  private fun bufferPoint(loc: Location) {
    try {
      val file = File(filesDir, "cold_trip_points.json")
      val arr = if (file.exists()) JSONArray(file.readText()) else JSONArray()
      val point = JSONObject().apply {
        put("latitude", loc.latitude)
        put("longitude", loc.longitude)
        put("timestamp", loc.time)
        put("speed", loc.speed.toDouble())
      }
      arr.put(point)
      file.writeText(arr.toString())
    } catch (e: Exception) {
      Log.d("BT_LOC", "bufferPoint FAILED: ${e.message}")
    }
  }

  override fun onDestroy() {
    callback?.let { fusedClient?.removeLocationUpdates(it) }
    super.onDestroy()
  }
}