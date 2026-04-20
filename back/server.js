const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

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
let hostSocketId = null;

const allQuestions = JSON.parse(
  fs.readFileSync(path.join(__dirname, "questions.json"), "utf-8")
);

let quiz = []; // session actuelle

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

let currentQuestionIndex = -1;
let quizStarted = false;
let answers = {}; // { socketId: choixIndex }
const QUESTION_TIME = 10000; // 10 secondes
const QUESTIONS_PER_GAME = 50;
let questionTimer = null;



const os = require("os");

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
const PORT = 6969;
const URL = `http://${LOCAL_IP}:${PORT}`;

io.on("connection", (socket) => {
    console.log("New connection:", socket.id);

    socket.on("registerHost", () => {
    hostSocketId = socket.id;
    console.log("Host enregistré :", socket.id);

    socket.emit("playersList", Object.values(players));
  });

  socket.on("registerPlayer", (playerName) => {
    players[socket.id] = {
      id: socket.id,
      name: playerName || `Joueur-${socket.id.slice(0, 4)}`,
      score: 0
    };

    io.to(hostSocketId).emit("playersList", Object.values(players));
    socket.emit("registered", players[socket.id]);

    // si le quiz a déjà commencé, on peut envoyer la question courante
    if (quizStarted && currentQuestionIndex >= 0) {
      socket.emit("newQuestion", quiz[currentQuestionIndex]);
    }
  });

  socket.on("startQuiz", () => {
        if (socket.id !== hostSocketId) return;

        quizStarted = true;

        // 🔥 on mélange et on prend 50 questions
        quiz = shuffle([...allQuestions]).slice(0, QUESTIONS_PER_GAME);

        currentQuestionIndex = 0;

        sendQuestion();
    });

  socket.on("submitAnswer", ({ questionId, choiceIndex }) => {
    if (!players[socket.id]) return;
    if (!quizStarted || currentQuestionIndex < 0) return;

    const currentQuestion = quiz[currentQuestionIndex];
    if (questionId !== currentQuestion.id) return;

    // empêche plusieurs réponses pour une même question
    if (answers[socket.id] !== undefined) return;

    answers[socket.id] = choiceIndex;

    // informer le host en temps réel
    io.to(hostSocketId).emit("answersCount", {
      totalPlayers: Object.keys(players).length,
      totalAnswers: Object.keys(answers).length
    });
  });

  socket.on("nextQuestion", () => {
  if (socket.id !== hostSocketId) return;

  clearTimeout(questionTimer);

  currentQuestionIndex++;

  if (currentQuestionIndex >= quiz.length) {
    io.emit("quizEnded", Object.values(players));
    return;
  }

  sendQuestion();
});

  socket.on("disconnect", () => {
    console.log("Déconnexion :", socket.id);

    const wasPlayer = !!players[socket.id];
    delete players[socket.id];

    if (socket.id === hostSocketId) {
      hostSocketId = null;
    }

    if (wasPlayer && hostSocketId) {
      io.to(hostSocketId).emit("playersList", Object.values(players));
    }
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

function sendQuestion() {
  answers = {};

  const question = quiz[currentQuestionIndex];

  io.emit("newQuestion", {
    ...question,
    duration: QUESTION_TIME
  });

  // timer automatique
  questionTimer = setTimeout(() => {
    revealAnswer();
  }, QUESTION_TIME);
}

function revealAnswer() {
  const currentQuestion = quiz[currentQuestionIndex];

  // calcul scores
  for (const socketId in answers) {
    if (answers[socketId] === currentQuestion.correct) {
      players[socketId].score += 1;
    }
  }

  io.emit("revealAnswer", {
    correctIndex: currentQuestion.correct,
    players: Object.values(players)
  });
}