package expo.modules.bluetoothdetection

import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
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

    Events("onBluetoothConnected", "onBluetoothDisconnected")

    Function("startListening") {
      registerReceiver()
    }

    Function("stopListening") {
      unregisterReceiver()
    }

    // Returns the phone's already-paired Bluetooth devices (name + address)
    AsyncFunction("getPairedDevices") {
      getPairedDevices()
    }

    OnDestroy {
      unregisterReceiver()
    }
  }

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is null" }

  private fun getPairedDevices(): List<Map<String, String>> {
    val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
    val adapter = manager?.adapter ?: return emptyList()
    if (!adapter.isEnabled) return emptyList()
    return try {
      adapter.bondedDevices.map { device ->
        mapOf(
          "name" to (device.name ?: "Unknown"),
          "address" to device.address
        )
      }
    } catch (e: SecurityException) {
      emptyList()
    }
  }

  private fun registerReceiver() {
    if (receiver != null) return

    val filter = IntentFilter().apply {
      addAction(BluetoothDevice.ACTION_ACL_CONNECTED)
      addAction(BluetoothDevice.ACTION_ACL_DISCONNECTED)
    }

    receiver = object : BroadcastReceiver() {
      override fun onReceive(ctx: Context?, intent: Intent?) {
        val action = intent?.action ?: return
        val device: BluetoothDevice? =
          intent.getParcelableExtra(BluetoothDevice.EXTRA_DEVICE)

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