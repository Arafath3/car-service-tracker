package expo.modules.bluetoothdetection

import android.bluetooth.BluetoothDevice
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BluetoothDetectionModule : Module() {

  private var receiver: BroadcastReceiver? = null

  override fun definition() = ModuleDefinition {
    Name("BluetoothDetection")

    // Events this module can send up to JavaScript
    Events("onBluetoothConnected", "onBluetoothDisconnected")

    // Called from JS to start listening for Bluetooth connect/disconnect
    Function("startListening") {
      registerReceiver()
    }

    // Called from JS to stop listening
    Function("stopListening") {
      unregisterReceiver()
    }

    // Clean up automatically when the module is destroyed
    OnDestroy {
      unregisterReceiver()
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is null" }

  private fun registerReceiver() {
    if (receiver != null) return // already listening

    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
      addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
    }

    receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        android.util.Log.d("BT_NATIVE", "onReceive fired! action=${intent?.action}")
        val action = intent?.action ?: return
        val device: BluetoothDevice? =
          intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)

        // We may not have permission to read the name; guard it.
        val deviceName = try {
          device?.name ?: "Unknown"
        } catch (e: SecurityException) {
          "Unknown"
        }
        val deviceAddress = device?.address ?: "Unknown"

        when (action) {
          BluetoothDevice.ACTION_ACL_CONNECTED ->
            sendEvent("onBluetoothConnected", mapOf(
              "name" to deviceName,
              "address" to deviceAddress
            ))
          BluetoothDevice.ACTION_ACL_DISCONNECTED ->
            sendEvent("onBluetoothDisconnected", mapOf(
              "name" to deviceName,
              "address" to deviceAddress
            ))
        }
      }
    }

    context.registerReceiver(receiver, filter)
    android.util.Log.d("BT_NATIVE", "Receiver registered successfully")
  }

  private fun unregisterReceiver() {
    receiver?.let {
      try {
        context.unregisterReceiver(it)
      } catch (e: IllegalArgumentException) {
        // wasn't registered; ignore
      }
    }
    receiver = null
  }
}