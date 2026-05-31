package expo.modules.bluetoothdetection

import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BluetoothConnectionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    val device: BluetoothDevice? = intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)
    val address = device?.address ?: "unknown"
    Log.d("BT_BOOT", "Manifest receiver fired! action=$action address=$address")
  }
}