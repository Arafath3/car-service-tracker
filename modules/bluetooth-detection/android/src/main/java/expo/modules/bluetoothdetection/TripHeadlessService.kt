package expo.modules.bluetoothdetection

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import androidx.core.app.NotificationCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class TripHeadlessService : HeadlessJsTaskService() {

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    promoteToForeground()
    return super.onStartCommand(intent, flags, startId)
  }

  private fun promoteToForeground() {
    val channelId = "trip_boot"
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(channelId, "Trip Detection", NotificationManager.IMPORTANCE_LOW)
      )
    }
    val notification: Notification = NotificationCompat.Builder(this, channelId)
      .setContentTitle("Service Tracker")
      .setContentText("Starting trip detection…")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(4243, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
    } else {
      startForeground(4243, notification)
    }
  }

  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig {
    val extras = intent?.extras ?: Bundle()
    return HeadlessJsTaskConfig(
      "TripDetectionTask",          // must match the JS registration name
      Arguments.fromBundle(extras),
      30000,                        // 30s timeout
      true                          // allowed to run in foreground
    )
  }
}