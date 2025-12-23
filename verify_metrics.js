import * as dbFunctions from "./dbFunctions.js";
import si from "systeminformation";

console.log("Starting verification...");

async function verify() {
    try {
        console.log("Checking systeminformation...");
        const cpu = await si.currentLoad();
        const mem = await si.mem();
        const temp = await si.cpuTemperature();
        console.log("CPU Load:", cpu.currentLoad);
        console.log("Memory:", (mem.active / mem.total) * 100);
        console.log("Temp:", temp.main);

        console.log("Inserting test metrics...");
        dbFunctions.insertSystemMetrics(50, 60, 45); // Fake data

        console.log("Waiting for DB write...");
        // Give sqlite a moment
        await new Promise(r => setTimeout(r, 1000));

        console.log("Retrieving metrics...");
        const metrics = await dbFunctions.getSystemMetrics(5);
        console.log("Retrieved metrics:", metrics);

        if (metrics.length > 0) {
            console.log("✅ Verification SUCCESS: Data inserted and retrieved.");
        } else {
            console.error("❌ Verification FAILED: No data retrieved.");
        }

    } catch (error) {
        console.error("❌ Verification FAILED with error:", error);
    }
}

verify();
