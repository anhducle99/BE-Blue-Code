import { server } from "./app";
import { networkInterfaces } from "os";

const PORT = process.env.PORT || 5000;

const getNetworkIP = () => {
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === "IPv4" && !iface.internal) {
        if (iface.address.startsWith("192.165.15.")) {
          return iface.address;
        }
      }
    }
  }
  return "192.165.15.28";
};

const networkIP = getNetworkIP();

server.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`REST API + Socket.IO running on http://localhost:${PORT}`);
  console.log(`Also accessible at http://${networkIP}:${PORT}`);
  console.log(`WebSocket available at ws://${networkIP}:${PORT}/socket.io/`);
});
