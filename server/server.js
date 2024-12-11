import express from "express";
import db from "./db.js";
import { Server } from "socket.io";
import cors from "cors";
import { createServer } from "node:http";

const port = 3000;

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

server.listen(port);

app.post("/webhook", async (req, res) => {
    // const {url} = req.body;
    const body = req.body;
    // const groupId = await insertUrlGroup(url);

    const isGroupReq = !body?.content;

    if(isGroupReq) {
        const unsanitizedUrl = body?.embeds[0]?.author?.fields[0]?.value;
        const groupId = unsanitizedUrl?.match(/e=(\d+)/)?.[1];
        await insertUrlGroup(groupId, "group");

        io.to("extension").emit("group-added", {groupId});

    }else {
        const url = body?.content;
        const groupId = url?.match(/e=(\d+)/)?.[1];
        await addUrlToGroup(groupId, url);

        io.to("extension").emit("url-added", {groupId, url});

    }


    // res.json(groupId);
    console.log(req.body);
});

app.post("/urls", async (req, res) => {

    const {groupId} = req.body;

    const links = await fetchLinksFromGroupInLastMinutes(groupId, 10);

    res.json(links);

});

app.post("/groups", async (req, res) => {
    const groups = await fetchUrlGroups();
    res.json(groups);
});

app.post("/delete-url", async (req, res) => {
    const {url_id} = req.body;
    const deleted = await deleteUrlById(url_id);
    res.json(deleted);
    io.to("extension").emit("url-deleted", {url_id});
});

// add to buffer
io.use((socket, next) => {

  if (true) {
    if (true) {
      //TODO : INSTEAD VALIDATE
      next();
    }
  } else {
    next(new Error("Authentication error"));
  }
}).on("connection", async (socket) => {
  logger("connected");
  //add to admin or normal rooms
  if (socket.handshake.query.type === "extension-request") {
    socket.join("extension");
  }

  //accept request from buffer
  socket.on("worker-buffer-accept", async (data) => {

  });
});

async function fetchUrlGroups() {
  try {
    const [rows] = await db.query("SELECT * FROM url_groups");
    console.log("URL Groups:", rows);
  } catch (error) {
    console.error("Error fetching URL groups:", error);
  }
}


async function deleteUrlById(urlId) {
    try {
      const [result] = await db.execute('DELETE FROM urls WHERE url_id = ?', [urlId]);
      return result.affectedRows > 0; // Returns true if a row was deleted
    } catch (error) {
      console.error('Error deleting URL:', error);
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
      const [rows] = await db.execute(`
        SELECT url, added_time 
        FROM urls 
        WHERE group_id = ? AND added_time >= NOW() - INTERVAL ? MINUTE
      `, [groupId, minutes]);
      return rows; // Returns an array of URLs
    } catch (error) {
      console.error('Error fetching links:', error);
      throw error; // Re-throw error for further handling
    }
  }


  async function addUrlToGroup(groupId, url) {
    try {
      // Insert query to add a new URL to the specified group
      const [result] = await db.execute(`
        INSERT INTO urls (group_id, url, added_time) 
        VALUES (?, ?, NOW())
      `, [groupId, url]);
  
      return {
        success: true,
        urlId: result.insertId, // Return the ID of the newly inserted row
        message: 'URL added successfully'
      };
    } catch (error) {
      console.error('Error adding URL to group:', error);
      throw error; // Re-throw error for further handling
    }
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

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
