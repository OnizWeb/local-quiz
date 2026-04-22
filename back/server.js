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
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

app.use(cors());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

app.use(express.static("public"));

let players = {};
let hostSocketId = null;
let mobileHostSocketId = null;

const allQuestions = JSON.parse(
  fs.readFileSync(path.join(__dirname, "quiz_fr_ch.json"), "utf-8"),
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
const QUESTION_TIME = 15000; // 20 secondes
const NEXT_QUESTION_TIME = 4000; // 3 secondes
const QUESTIONS_PER_GAME = 10;
let questionTimer = null;
let nextQuestionTimer = null;

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
  socket.on("registerHost", () => {
    hostSocketId = socket.id;
    console.log("Host enregistré :", socket.id);

    socket.emit("playersList", Object.values(players));
  });

  socket.on("registerPlayer", (playerName) => {
    players[socket.id] = {
      id: socket.id,
      name: playerName || `Joueur-${socket.id.slice(0, 4)}`,
      score: 0,
    };

    if (!mobileHostSocketId) {
      mobileHostSocketId = socket.id;
    }

    io.to(hostSocketId).emit("playersList", Object.values(players));

    socket.emit("registered", {
      ...players[socket.id],
      isHost: socket.id === mobileHostSocketId,
    });
  });

  socket.on("startQuiz", async () => {
    if (!canControlQuiz(socket.id)) return;

    quizStarted = true;

    const res = await fetch(
      `https://opentdb.com/api.php?amount=${QUESTIONS_PER_GAME}`,
    );

    const questions = await res.json();

    const mappedQuestion = await Promise.all(
      questions.results.map(async (question, index) => {
        const {
          correct_answer,
          incorrect_answers,
          question: qText,
          ...rest
        } = question;

        const translatedZh = await translateQuestion(qText, "zh");
        const translatedFr = await translateQuestion(qText, "fr");

        const choices = await shuffleChoices(correct_answer, incorrect_answers);

        return {
          id: index + 1,
          ...rest,
          ...choices,
          question: {
            fr: translatedFr,
            zh: translatedZh,
          },
        };
      }),
    );

    quiz = shuffle([...mappedQuestion]).slice(0, QUESTIONS_PER_GAME);

    currentQuestionIndex = 0;

    sendQuestion(socket.id);
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
      totalAnswers: Object.keys(answers).length,
    });
  });

  socket.on("disconnect", () => {
    console.log("Déconnexion :", socket.id);

    const wasPlayer = !!players[socket.id];
    delete players[socket.id];

    if (socket.id === mobileHostSocketId) {
      const remainingPlayers = Object.keys(players);
      mobileHostSocketId =
        remainingPlayers.length > 0 ? remainingPlayers[0] : null;

      if (mobileHostSocketId) {
        io.to(mobileHostSocketId).emit("hostStatus", { isHost: true });
      }
    }

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
  if (nextQuestionTimer) {
    clearTimeout(nextQuestionTimer);
  }

  answers = {};

  const question = quiz[currentQuestionIndex];

  io.emit("newQuestion", {
    ...question,
    duration: QUESTION_TIME,
    currentQuestionNumber: currentQuestionIndex + 1,
    totalQuestions: quiz.length,
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
    players: Object.values(players),
  });

  io.emit("playersList", Object.values(players));

  // timer automatique
  nextQuestionTimer = setTimeout(() => {
    nextQuestion();
  }, NEXT_QUESTION_TIME);
}

function nextQuestion() {
  clearTimeout(questionTimer);

  currentQuestionIndex++;

  if (currentQuestionIndex >= quiz.length) {
    io.emit("quizEnded", Object.values(players));
    return;
  }

  sendQuestion();
}

function canControlQuiz(socketId) {
  return socketId === hostSocketId || socketId === mobileHostSocketId;
}

async function translateQuestion(q, lang) {
  const res = await fetch("http://192.168.0.234:5000/translate", {
    method: "POST",
    body: JSON.stringify({
      q,
      source: "auto",
      target: lang,
      format: "text",
      alternatives: 3,
      api_key: "",
    }),
    headers: { "Content-Type": "application/json" },
  });

  const response = await res.json();
  return response.translatedText;
}

async function shuffleChoices(correct, incorrect) {
  const translateCorrectFr = await translateQuestion(correct, "fr");
  const translateCorrectZh = await translateQuestion(correct, "zh");
  const translateIncorrects = await Promise.all(
    incorrect.map(async (inc) => ({
      fr: await translateQuestion(inc, "fr"),
      zh: await translateQuestion(inc, "zh"),
    })),
  );
  const choices = [
    { fr: translateCorrectFr, zh: translateCorrectZh },
    ...translateIncorrects,
  ];

  const correctIndex = choices.findIndex(
    (choice) => choice.fr === correct.fr && choice.zh === correct.zh,
  );

  return {
    choices,
    correct: correctIndex,
  };
}
