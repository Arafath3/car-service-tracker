package expo.modules.bluetoothdetection

import android.annotation.SuppressLint
import android.companion.AssociationInfo
import android.companion.CompanionDeviceService
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi

@RequiresApi(Build.VERSION_CODES.TIRAMISU) // API 33+
class CompanionDeviceTrackingService : CompanionDeviceService() {

  @SuppressLint("MissingPermission")
  override fun onDeviceAppeared(associationInfo: AssociationInfo) {
    val address = associationInfo.deviceMacAddress?.toString() ?: "unknown"
    Log.d("BT_CDM", "onDeviceAppeared: $address")
  }

  @SuppressLint("MissingPermission")
  override fun onDeviceDisappeared(associationInfo: AssociationInfo) {
    val address = associationInfo.deviceMacAddress?.toString() ?: "unknown"
    Log.d("BT_CDM", "onDeviceDisappeared: $address")
  }
}