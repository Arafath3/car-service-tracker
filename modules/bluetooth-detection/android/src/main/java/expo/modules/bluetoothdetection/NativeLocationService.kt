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
    startAsForeground()
    startLocationUpdates()
    return START_STICKY
  }

  private fun startAsForeground() {
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
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(4245, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
      } else {
        startForeground(4245, notification)
      }
      Log.d("BT_LOC", "Foreground service started")
    } catch (e: Exception) {
      Log.d("BT_LOC", "startForeground FAILED: ${e.message}")
    }
  }

  private fun startLocationUpdates() {
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
          Log.d("BT_LOC", "lat=${loc.latitude} lng=${loc.longitude} spd=${loc.speed} mock=${loc.isMock}")
          bufferPoint(loc)
        }
      }
    }

    try {
      fusedClient?.requestLocationUpdates(request, callback!!, Looper.getMainLooper())
      Log.d("BT_LOC", "Requested location updates")
    } catch (e: Exception) {
      Log.d("BT_LOC", "requestLocationUpdates FAILED: ${e.message}")
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
}