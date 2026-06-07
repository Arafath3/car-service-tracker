package expo.modules.bluetoothdetection

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.companion.AssociationInfo
import android.companion.CompanionDeviceService
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.io.File
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

@RequiresApi(Build.VERSION_CODES.TIRAMISU)
class CompanionDeviceTrackingService : CompanionDeviceService() {

  private val activeFile get() = File(filesDir, "coldtrip_active.ndjson")

  override fun onDeviceAppeared(associationInfo: AssociationInfo) {
    val address = associationInfo.deviceMacAddress?.toString() ?: "unknown"
    Log.d("BT_CDM", "onDeviceAppeared: $address")
    sealActiveTrip() // rescue an orphan from a missed disconnect before starting fresh

    val intent = Intent(this, NativeLocationService::class.java)
    intent.putExtra("address", address)
    startForegroundService(intent)
  }

  override fun onDeviceDisappeared(associationInfo: AssociationInfo) {
    Log.d("BT_CDM", "onDeviceDisappeared")
    stopService(Intent(this, NativeLocationService::class.java))
    val sealed = sealActiveTrip()
    if (sealed != null && looksLikeRealTrip(sealed)) {
      notifyTripEnded()
    }
  }

  /** Renames the active file to a done file. Returns the done file, or null. */
  private fun sealActiveTrip(): File? {
    return try {
      val active = activeFile
      when {
        active.exists() && active.length() > 0L -> {
          val done = File(filesDir, "coldtrip_done_${System.currentTimeMillis()}.ndjson")
          if (!active.renameTo(done)) {
            active.copyTo(done, overwrite = true)
            active.delete()
          }
          done
        }
        active.exists() -> { active.delete(); null }
        else -> null
      }
    } catch (e: Exception) {
      Log.d("BT_CDM", "sealActiveTrip FAILED: ${e.message}")
      null
    }
  }

  /** Cheap gate so we don't notify for GPS jitter. NOT the authoritative
   *  distance — JS reconcile still computes that when the app opens. */
  private fun looksLikeRealTrip(file: File): Boolean {
    return try {
      val lines = file.readLines().filter { it.isNotBlank() }
      if (lines.size < 4) return false
      var km = 0.0
      var prev: DoubleArray? = null
      for (line in lines) {
        val o = try { JSONObject(line) } catch (e: Exception) { continue }
        val lat = o.optDouble("latitude")
        val lon = o.optDouble("longitude")
        prev?.let { km += haversineKm(it[0], it[1], lat, lon) }
        prev = doubleArrayOf(lat, lon)
      }
      km >= 0.3 // ~300m floor before bothering the user
    } catch (e: Exception) {
      false
    }
  }

  private fun haversineKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val r = 6371.0
    val dLat = Math.toRadians(lat2 - lat1)
    val dLon = Math.toRadians(lon2 - lon1)
    val a = sin(dLat / 2).pow(2) +
            cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dLon / 2).pow(2)
    return r * 2 * atan2(sqrt(a), sqrt(1 - a))
  }

  private fun notifyTripEnded() {
    val channelId = "trip_confirmation"
    val nm = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(channelId, "Trip Confirmation", NotificationManager.IMPORTANCE_HIGH)
      )
    }

    // Deep link to the ROOT with a sentinel. JS resolves the real trip after reconcile.
    val launch = Intent(Intent.ACTION_VIEW).apply {
      data = Uri.parse("servicetracker:///?coldTrip=1")
      `package` = packageName
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val pi = PendingIntent.getActivity(
      this, 7001, launch,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )

    val notification = NotificationCompat.Builder(this, channelId)
      .setContentTitle("Trip ended")
      .setContentText("Tap here to continue and confirm your trip.")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentIntent(pi)
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .build()

    try {
      nm.notify(7001, notification)
    } catch (e: SecurityException) {
      // POST_NOTIFICATIONS not granted. Trip is already safely sealed on disk;
      // it'll appear via the home banner next time the app opens. No data loss.
      Log.d("BT_CDM", "notify blocked (no permission): ${e.message}")
    }
  }
}