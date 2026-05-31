import ExpoModulesCore

public class BluetoothDetectionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BluetoothDetection")

    Events("onChange")

    AsyncFunction("setValueAsync") { (value: String) in
      self.sendEvent("onChange", [
        "value": value
      ])
    }
  }
}
