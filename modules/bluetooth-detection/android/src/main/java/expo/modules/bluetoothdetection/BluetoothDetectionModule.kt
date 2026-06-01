package expo.modules.bluetoothdetection

import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.companion.AssociationInfo
import android.companion.AssociationRequest
import android.companion.BluetoothDeviceFilter
import android.companion.CompanionDeviceManager
import android.content.IntentSender
import android.os.Build
import expo.modules.kotlin.Promise
import java.util.concurrent.Executor

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

    // Associate a vehicle's Bluetooth device with the app via CDM (shows a system dialog)
    AsyncFunction("associateVehicle") { address: String, promise: Promise ->
      if (Build.VERSION.SDK_INT < 33) {
        promise.reject("UNSUPPORTED", "CDM association needs Android 13+", null)
        return@AsyncFunction
      }
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "No current activity to show the dialog", null)
        return@AsyncFunction
      }

      val cdm = context.getSystemService(Context.COMPANION_DEVICE_SERVICE) as CompanionDeviceManager
      val filter = BluetoothDeviceFilter.Builder().setAddress(address).build()
      val request = AssociationRequest.Builder()
        .addDeviceFilter(filter)
        .setSingleDevice(true)
        .build()
      val executor = Executor { it.run() }

      cdm.associate(request, executor, object : CompanionDeviceManager.Callback() {
        override fun onAssociationPending(intentSender: IntentSender) {
          try {
            activity.startIntentSenderForResult(intentSender, 0x4242, null, 0, 0, 0)
          } catch (e: Exception) {
            promise.reject("LAUNCH_FAILED", e.message ?: "Could not launch dialog", e)
          }
        }

        override fun onAssociationCreated(associationInfo: AssociationInfo) {
          promise.resolve(address)
        }

        override fun onFailure(error: CharSequence?) {
          promise.reject("ASSOC_FAILED", error?.toString() ?: "Association failed", null)
        }
      })
    }

    // Tell the system to wake our CompanionDeviceService when this device appears/disappears
    AsyncFunction("observeVehicle") { address: String ->
      if (Build.VERSION.SDK_INT < 33) return@AsyncFunction
      val cdm = context.getSystemService(Context.COMPANION_DEVICE_SERVICE) as CompanionDeviceManager
      cdm.startObservingDevicePresence(address)
    }

    // Remove an association (handy for testing / re-linking)
    AsyncFunction("disassociateVehicle") { address: String ->
      if (Build.VERSION.SDK_INT < 33) return@AsyncFunction
      val cdm = context.getSystemService(Context.COMPANION_DEVICE_SERVICE) as CompanionDeviceManager
      cdm.myAssociations
        .filter { it.deviceMacAddress?.toString()?.equals(address, ignoreCase = true) == true }
        .forEach { cdm.disassociate(it.id) }
    }

    // List the MAC addresses currently associated (to verify it stuck)
    AsyncFunction("getAssociations") {
      if (Build.VERSION.SDK_INT < 33) return@AsyncFunction emptyList<String>()
      val cdm = context.getSystemService(Context.COMPANION_DEVICE_SERVICE) as CompanionDeviceManager
      cdm.myAssociations.mapNotNull { it.deviceMacAddress?.toString() }
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