package expo.modules.bluetoothdetection

import android.annotation.SuppressLint
import android.companion.AssociationInfo
import android.companion.CompanionDeviceService
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import android.content.Intent
import java.io.File

@RequiresApi(Build.VERSION_CODES.TIRAMISU) // API 33+
class CompanionDeviceTrackingService : CompanionDeviceService() {

override fun onDeviceAppeared(associationInfo: AssociationInfo) {
  val address = associationInfo.deviceMacAddress?.toString() ?: "unknown"
  Log.d("BT_CDM", "onDeviceAppeared: $address")
  try { File(filesDir, "cold_trip_ended.flag").delete() } catch (_: Exception) {}
  val intent = Intent(this, NativeLocationService::class.java)
  intent.putExtra("address", address)
  startForegroundService(intent)
}

override fun onDeviceDisappeared(associationInfo: AssociationInfo) {
  val address = associationInfo.deviceMacAddress?.toString() ?: "unknown"
  Log.d("BT_CDM", "onDeviceDisappeared: $address")
  stopService(Intent(this, NativeLocationService::class.java))
  // Mark the trip complete so JS knows it's safe to reconcile
  try {
    File(filesDir, "cold_trip_ended.flag").writeText("1")
  } catch (e: Exception) {
    Log.d("BT_CDM", "ended-flag write FAILED: ${e.message}")
  }
}

}