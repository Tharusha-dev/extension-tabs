import express from "express";
import db from "./db.js";
import { Server } from "socket.io";
import cors from "cors";
import { createServer } from "node:http";

const port = 3020;

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.raw({ type: "application/json" }));

const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

class SocketQueue {
  constructor() {
    this.sockets = new Map();
    this.socketIds = [];
    this.currentIndex = 0;
  }

  addSocket(socket) {
    if (!this.sockets.has(socket.id)) {
      this.sockets.set(socket.id, socket);
      this.socketIds.push(socket.id);

      // Set up disconnect handlers
      socket.on("disconnect", () => {
        this.removeSocket(socket.id);
      });

      // Handle connection timeout
      socket.on("connect_error", () => {
        this.removeSocket(socket.id);
      });

      // Handle ping timeout
      socket.on("ping_timeout", () => {
        this.removeSocket(socket.id);
      });

      // Handle transport error
      socket.on("error", () => {
        this.removeSocket(socket.id);
      });
    }
  }

  removeSocket(socketId) {
    if (this.sockets.has(socketId)) {
      const socket = this.sockets.get(socketId);

      // Clean up all listeners
      socket.removeAllListeners("disconnect");
      socket.removeAllListeners("connect_error");
      socket.removeAllListeners("ping_timeout");
      socket.removeAllListeners("error");

      this.sockets.delete(socketId);
      this.socketIds = this.socketIds.filter((id) => id !== socketId);

      // Adjust currentIndex if necessary
      if (this.currentIndex >= this.socketIds.length) {
        this.currentIndex = 0;
      }

      console.log(
        `Socket ${socketId} removed from queue. Remaining sockets: ${this.size()}`
      );
    }
  }

  getNextValidSocket() {
    if (this.socketIds.length === 0) return null;

    const startIndex = this.currentIndex;
    let foundValidSocket = false;

    do {
      const socketId = this.socketIds[this.currentIndex];
      const socket = this.sockets.get(socketId);

      // Move to next socket for next iteration
      this.currentIndex = (this.currentIndex + 1) % this.socketIds.length;

      // Check if socket is still valid and connected
      if (socket && socket.connected) {
        foundValidSocket = true;
        return socket;
      } else {
        // Remove invalid socket
        this.removeSocket(socketId);
      }

      // If we've checked all sockets and found none valid
      if (this.currentIndex === startIndex && !foundValidSocket) {
        return null;
      }
    } while (this.socketIds.length > 0);

    return null;
  }

  size() {
    return this.socketIds.length;
  }

  // Helper method to check queue health
  checkQueueHealth() {
    const connectedSockets = Array.from(this.sockets.values()).filter(
      (socket) => socket.connected
    ).length;

    console.log(`Queue health check:
          Total sockets in queue: ${this.size()}
          Connected sockets: ${connectedSockets}
          Current index: ${this.currentIndex}`);

    return connectedSockets;
  }
}

const extensionQueue = new SocketQueue();
// Update the webhook endpoint to use the enhanced queue
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    const isGroupReq = !body?.content;

    console.log("isGroupReq", isGroupReq)


    // Check queue health before processing
    const availableSockets = extensionQueue.checkQueueHealth();



    if (availableSockets === 0) {
      return res.status(503).json({
        error: "No extension clients available",
        queueSize: extensionQueue.size(),
      });
    }

    const targetSocket = extensionQueue.getNextValidSocket();


    if (!targetSocket) {
      return res.status(503).json({
        error: "No valid extension clients available",
      });
    }

    if (isGroupReq) {

      const unsanitizedUrl = body?.embeds[0]?.fields[0]?.value;
      
      const groupId = unsanitizedUrl?.match(/e=(\d+)/)?.[1];
      console.log(groupId)
      await insertUrlGroup(groupId, "group");

      // targetSocket.emit("group-added", groupId);
      io.to("extension").emit("group-added", groupId);
      
    } else {
      const url = body?.content;
      if(isUrlUsed(url)) return 
      const groupId = url?.match(/e=(\d+)/)?.[1];
      console.log(groupId)
      const urlId = await addUrlToGroup(groupId, url);

      targetSocket.emit("url-added", { groupId, urlId, url });
    }

    res.status(200).json({
      success: true,
      queueSize: extensionQueue.size(),
    });
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({
      error: "Internal server error",
      message: error.message,
    });
  }
});

// Update socket connection handlin

app.get("/urls", async (req, res) => {
  console.log("urls");

  const links = await fetchLinksFromLast10Minutes();

  res.json(links);
});

app.get("/groups", async (req, res) => {

  logger("groups");

  const groups = await fetchUrlGroupsFromLast10M();
  res.json(groups);
});

app.post("/delete-url", async (req, res) => {
  console.log("delete-url");
  console.log(req.body);
  const { urlId } = req.body;
  const deleted = await deleteUrlById(urlId);
  res.json(deleted);
  io.to("extension").emit("url-deleted", { urlId });
});

app.delete("/clear-db", async (req, res) => {
  console.log("clear-db");
  console.log(req.body);
  const deleted = await clearDb();
  res.json("deleted");
  io.to("extension").emit("db-cleared");
});

io.use((socket, next) => {
  next();
}).on("connection", async (socket) => {
  if (socket.handshake.query.type === "extension-request") {
    socket.join("extension");
    extensionQueue.addSocket(socket);

    console.log(
      `New extension client connected. Queue size: ${extensionQueue.size()}`
    );

    // Handle explicit leave
    socket.on("leave", () => {
      extensionQueue.removeSocket(socket.id);
      socket.leave("extension");
      console.log(
        `Client explicitly left. Queue size: ${extensionQueue.size()}`
      );
    });
  }
});

async function clearDb(){
  await db.execute(`DELETE FROM urls;`);
  await db.execute(`DELETE FROM url_groups;`);
  await db.execute(`ALTER TABLE urls AUTO_INCREMENT = 1;`);
  await db.execute(`ALTER TABLE url_groups AUTO_INCREMENT = 1;`);
  
}

async function fetchUrlGroupsFromLast10M() {
  try {
    const [rows] = await db.query("SELECT group_id FROM url_groups");
    const groupIds = rows.map(row => row.group_id);
    console.log("URL Groups:", groupIds);
    return groupIds;
  } catch (error) {
    console.error("Error fetching URL groups:", error);
    return [];
  }
}

async function fetchLinksFromLast10Minutes() {
  try {
    // Query to fetch URLs added in the last 10 minutes
    const [rows] = await db.execute(`
      SELECT url, group_id, added_time 
      FROM urls 
      WHERE added_time >= NOW() - INTERVAL 100 MINUTE
    `);

    // Group the results by group_id
    const groupedResults = rows.reduce((acc, row) => {
      if (!acc[row.group_id]) {
        acc[row.group_id] = [];
      }
      acc[row.group_id].push(row);
      return acc;
    }, {});

    console.log(groupedResults);
    return groupedResults; // Returns an object grouped by group_id
  } catch (error) {
    console.error("Error fetching links from the last 10 minutes:", error);
    throw error; // Re-throw error for further handling
  }
}

async function deleteUrlById(urlId) {
  console.log("deleteUrlById");
  console.log(urlId);
  try {
    const [result] = await db.execute(
      "UPDATE urls SET used = 1 WHERE url_id = ?",
      [urlId]
    );
    return result.affectedRows > 0; // Returns true if a row was updated
  } catch (error) {
    console.error("Error updating URL:", error);
    throw error;
  }
}

async function executeQuery(sql, params) {
  try {
    const results = await db.query(sql, params);
    return results;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

async function insertUrlGroup(id, name) {
  try {
    const [result] = await db.execute(
      "INSERT INTO url_groups (group_id, name, added_time) VALUES (?, ?, NOW())",
      [id, name]
    );
    console.log("Inserted Group ID:", id);
    return id;
  } catch (error) {
    console.error("Error inserting URL group:", error);
    throw error;
  }
}

async function fetchUrlsByGroupId(groupId) {
  try {
    const [rows] = await db.execute("SELECT * FROM urls WHERE group_id = ?", [
      groupId,
    ]);
    console.log("URLs for Group ID", groupId, ":", rows);
  } catch (error) {
    console.error("Error fetching URLs:", error);
  }
}

async function fetchLinksFromGroupInLastMinutes(groupId, minutes) {
  try {
    // Query to fetch URLs for the given group ID and time interval
    const [rows] = await db.execute(
      `
        SELECT url, added_time 
        FROM urls 
        WHERE group_id = ? AND added_time >= NOW() - INTERVAL ? MINUTE
      `,
      [groupId, minutes]
    );
    return rows; // Returns an array of URLs
  } catch (error) {
    console.error("Error fetching links:", error);
    throw error; // Re-throw error for further handling
  }
}

async function addUrlToGroup(groupId, url) {
  try {
    // Insert query to add a new URL to the specified group
    const [result] = await db.execute(
      `
        INSERT INTO urls (group_id, url, added_time) 
        VALUES (?, ?, NOW())
      `,
      [groupId, url]
    );

    return result.insertId // Return the ID of the newly inserted row
 
  } catch (error) {
    console.error("Error adding URL to group:", error);
    throw error; // Re-throw error for further handling
  }
}

async function isUrlUsed(url) {
  try {
    const [rows] = await db.execute(
      'SELECT used FROM urls WHERE url = ? LIMIT 1',
      [url]
    );
    
    // If no rows found, return false
    if (rows.length === 0) return false;
    
    // Return true if used is 1, false if 0
    return rows[0].used === 1;
    
  } catch (error) {
    console.error("Error checking URL usage:", error);
    throw error;
  }
}

function logger(msg){
  console.log(`${Date.now()} | ${msg}`);
}
process.on("SIGINT", async () => {
  try {
    await db.end();
    console.log("Database connection pool closed.");
    process.exit(0);
  } catch (error) {
    console.error("Error closing database connection pool:", error);
    process.exit(1);
  }
});

// fetchUrlGroups();

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// fetchLinksFromLast10Minutes()
