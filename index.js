import "expo-router/entry";
import { AppRegistry } from "react-native";
import { tripDetectionTask } from "./src/lib/tripHeadlessTask";

AppRegistry.registerHeadlessTask("TripDetectionTask", () => tripDetectionTask);
