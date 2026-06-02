package expo.modules.bluetoothdetection

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat

class MonitoringService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val channelId = "trip_monitoring"
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(channelId, "Trip Monitoring", NotificationManager.IMPORTANCE_LOW)
      )
    }

    val notification: Notification = NotificationCompat.Builder(this, channelId)
      .setContentTitle("Service Tracker")
      .setContentText("Ready to detect trips automatically")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .build()

    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(4244, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
      } else {
        startForeground(4244, notification)
      }
      START_STICKY // if the OS kills it, restart it
    } catch (e: Exception) {
      // Couldn't enter foreground (e.g. background-start restriction) — don't leave a zombie
      Log.d("BT_LOC", "MonitoringService startForeground FAILED: ${e.message}")
      stopSelf()
      START_NOT_STICKY
    }
  }
}