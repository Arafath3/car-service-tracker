package expo.modules.bluetoothdetection

import android.annotation.SuppressLint
import android.companion.AssociationInfo
import android.companion.CompanionDeviceService
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi
import android.content.Intent

@RequiresApi(Build.VERSION_CODES.TIRAMISU) // API 33+
class CompanionDeviceTrackingService : CompanionDeviceService() {

override fun onDeviceAppeared(associationInfo: AssociationInfo) {
  val address = associationInfo.deviceMacAddress?.toString() ?: "unknown"
  Log.d("BT_CDM", "onDeviceAppeared: $address")
  val intent = Intent(this, NativeLocationService::class.java)
  intent.putExtra("address", address)
  startForegroundService(intent)
}

override fun onDeviceDisappeared(associationInfo: AssociationInfo) {
  val address = associationInfo.deviceMacAddress?.toString() ?: "unknown"
  Log.d("BT_CDM", "onDeviceDisappeared: $address")
  stopService(Intent(this, NativeLocationService::class.java))
}

private fun startTask(address: String, event: String) {
  val intent = Intent(this, TripHeadlessService::class.java)
  intent.putExtra("address", address)
  intent.putExtra("event", event)
  startForegroundService(intent)
}
}