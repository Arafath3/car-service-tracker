import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyDr5D4sFB0bc8Z3Gtmx7FT-gbpLB_Hkjrc",
  authDomain: "smartvehicleservicetracker.firebaseapp.com",
  projectId: "smartvehicleservicetracker",
  storageBucket: "smartvehicleservicetracker.firebasestorage.app",
  messagingSenderId: "587387450433",
  appId: "1:587387450433:web:6ef15784d967ffb7a242c0"
};

const app = initializeApp(firebaseConfig);

export default app;