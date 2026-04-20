const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const QRCode = require("qrcode");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ["websocket", "polling"]
});

app.use(cors());
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    next();
});

app.use(express.static("public"));

let players = {};

// 👉 récupère ton IP locale ici (à adapter)


const os = require("os");

console.log("MON IP", require("os").networkInterfaces());

function getLocalIP() {
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === "IPv4" && !net.internal) {
                return net.address;
            }
        }
    }
}

const LOCAL_IP = getLocalIP();
const PORT = 8080;
const URL = `http://${LOCAL_IP}:${PORT}`;

io.on("connection", (socket) => {
    console.log("New connection:", socket.id);

    // 🔹 Quand un joueur rejoint avec son nom
    socket.on("joinLobby", (name) => {
        players[socket.id] = {
            id: socket.id,
            name
        };

        io.emit("playersUpdate", Object.values(players));
    });

    // 🔹 Déconnexion
    socket.on("disconnect", () => {
        delete players[socket.id];
        io.emit("playersUpdate", Object.values(players));
    });
});

app.get("/qrcode.png", async (req, res) => {
    const qr = await QRCode.toBuffer(`${URL}/join`);
    res.type("png").send(qr);
});

app.get("/join", (req, res) => {
    res.sendFile(__dirname + "/public/mobile.html");
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on ${URL}`);
});