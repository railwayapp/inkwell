import { createRequire } from "node:module";
import { getYDoc, setupWSConnection } from "y-websocket/bin/utils";

const require = createRequire(import.meta.url);
const { WebSocketServer } = require("ws");

const port = parseInt(process.env.PORT || "4444");
const CLEAR_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const wss = new WebSocketServer({ port });

wss.on("connection", (ws, req) => {
  setupWSConnection(ws, req);
});

// Clear all docs every 5 minutes
setInterval(() => {
  const doc = getYDoc("inkwell-demo");
  if (doc) {
    const content = doc.getText("content");
    if (content.length > 0) {
      doc.transact(() => {
        content.delete(0, content.length);
      });
    }
  }
}, CLEAR_INTERVAL_MS);
