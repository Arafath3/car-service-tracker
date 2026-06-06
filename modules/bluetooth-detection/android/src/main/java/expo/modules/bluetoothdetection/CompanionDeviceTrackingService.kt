package expo.modules.bluetoothdetection

import android.companion.AssociationInfo
import android.companion.CompanionDeviceService
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import java.io.File

@RequiresApi(Build.VERSION_CODES.TIRAMISU)
class CompanionDeviceTrackingService : CompanionDeviceService() {

  private val activeFile get() = File(filesDir, "coldtrip_active.ndjson")

  override fun onDeviceAppeared(associationInfo: AssociationInfo) {
    val address = associationInfo.deviceMacAddress?.toString() ?: "unknown"
    Log.d("BT_CDM", "onDeviceAppeared: $address")

    // A leftover active file means a previous disconnect was missed.
    // Seal it as its own completed trip BEFORE starting a new one —
    // never append onto it (no merge), never delete it (no loss).
    sealActiveTrip()

    val intent = Intent(this, NativeLocationService::class.java)
    intent.putExtra("address", address)
    startForegroundService(intent)
  }

  override fun onDeviceDisappeared(associationInfo: AssociationInfo) {
    Log.d("BT_CDM", "onDeviceDisappeared")
    stopService(Intent(this, NativeLocationService::class.java))
    sealActiveTrip()
  }

  private fun sealActiveTrip() {
    try {
      val active = activeFile
      when {
        active.exists() && active.length() > 0L -> {
          val done = File(filesDir, "coldtrip_done_${System.currentTimeMillis()}.ndjson")
          if (!active.renameTo(done)) {
            // rename can fail across edge cases; fall back to copy+delete
            active.copyTo(done, overwrite = true)
            active.delete()
          }
        }
        active.exists() -> active.delete() // empty, nothing worth keeping
      }
    } catch (e: Exception) {
      Log.d("BT_CDM", "sealActiveTrip FAILED: ${e.message}")
    }
  }
}